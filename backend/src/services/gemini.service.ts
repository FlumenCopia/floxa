import { GoogleGenAI } from '@google/genai';
import { ENV } from '../config/env.js';
import { Project } from '../models/project.model.js';
import { buildBrandDNAData, calculateCluster } from './discovery.service.js';

let aiClient: GoogleGenAI | null = null;

export const PREFERRED_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
];

export function getActiveModels(): string[] {
  let list = (ENV.GEMINI_MODELS && ENV.GEMINI_MODELS.length > 0)
    ? [...ENV.GEMINI_MODELS]
    : [...PREFERRED_MODELS];

  // Exclude deprecated models that return 404
  list = list.filter((m) => {
    const lower = m.toLowerCase();
    return !lower.includes('1.5') && !lower.includes('2.0') && !lower.includes('2.5') && !lower.includes('latest');
  });

  // Ensure all preferred models are in the pool
  for (const m of PREFERRED_MODELS) {
    if (!list.includes(m)) {
      list.push(m);
    }
  }

  // Sort by PREFERRED_MODELS index so fastest models (e.g. gemini-3.1-flash-lite ~1.4s) are tried first
  list.sort((a, b) => {
    const idxA = PREFERRED_MODELS.indexOf(a);
    const idxB = PREFERRED_MODELS.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  return list;
}

export function getAiClient(customApiKey?: string): GoogleGenAI {
  const key = (customApiKey || ENV.GEMINI_API_KEY || '').trim();

  if (!key) {
    throw new Error('Gemini API is not configured. Please configure your Gemini API Key in Settings > Integrations & API Keys.');
  }

  return new GoogleGenAI({ apiKey: key });
}

async function callModelWithTimeout<T>(
  actionPromise: Promise<T>,
  modelName: string,
  timeoutMs: number
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Model ${modelName} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    actionPromise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function generateContextualProjectFallback(project: any, userMessage: string): string {
  const title = project?.title || 'Brand Project';
  const clientName = project?.client?.name || project?.companyName || 'Client';
  const sector = project?.sector || 'Brand';
  const d = project?.discovery;
  const b = project?.brandDNA;
  const moodboards = project?.moodboards || [];
  const concepts = project?.concepts || [];
  const progress = project?.progress ?? 0;
  const lower = (userMessage || '').toLowerCase();

  const isMoodboardReq = lower.includes('moodboard') || lower.includes('aesthetic') || lower.includes('visual');
  const isConceptReq = lower.includes('concept') || lower.includes('poster') || lower.includes('direction');

  if (isMoodboardReq && moodboards.length > 0) {
    let res = `**Moodboard Direction & Client Feedback**\n\n`;
    res += `* **Project:** ${title} (${sector})\n`;
    res += `* **Total Moodboards:** ${moodboards.length}\n`;
    moodboards.forEach((m: any, idx: number) => {
      const statusStr = m.isSelected ? 'Approved by Client' : m.isShared ? 'Shared with Client' : 'Internal Draft';
      res += `* **${idx + 1}. ${m.title}:** ${statusStr}${m.clientFeedback ? ` — Note: "${m.clientFeedback}"` : ''}\n`;
    });
    res += `\n**Strategic Recommendation:** Incorporate client feedback into the concept development phase and maintain visual continuity with approved direction.`;
    return res;
  }

  if (isConceptReq && concepts.length > 0) {
    let res = `**Concept Status & Visual Execution**\n\n`;
    res += `* **Project:** ${title} (${sector})\n`;
    res += `* **Total Concepts:** ${concepts.length}\n`;
    concepts.forEach((c: any, idx: number) => {
      res += `* **${idx + 1}. ${c.title} (v${c.version || 1}):** Status: ${String(c.status).toUpperCase()}${c.clientFeedback ? ` — Feedback: "${c.clientFeedback}"` : ''}\n`;
    });
    res += `\n**Next Milestone:** Refine selected concept based on review feedback prior to final deliverable rollout.`;
    return res;
  }

  // Primary Discovery / Project Summary
  let summary = `**Project Overview & Discovery Synthesis**\n\n`;
  summary += `* **Client & Project:** ${title} (${clientName}) — **Sector:** ${sector}\n`;
  summary += `* **Current Stage:** ${String(project?.status || 'Discovery').toUpperCase()} (${progress}% Complete)\n`;

  if (!d) {
    summary += `* **Discovery Status:** NOT STARTED. The client has not begun the questionnaire yet.\n\n`;
    summary += `**Recommended Advisory:**\n`;
    summary += `* Invite the client to complete their discovery intake questionnaire before generating Brand DNA or locked concepts.\n`;
    return summary;
  }

  const isSubmitted = Boolean(d.submittedAt);
  summary += `* **Discovery Intake:** ${isSubmitted ? `Officially Submitted on ${new Date(d.submittedAt).toLocaleDateString()}` : 'Draft In Progress (Client has unsubmitted answers)'}\n\n`;

  summary += `**Core Discovery Insights**\n`;
  if (d.whatBusinessDoes) summary += `* **What the Business Does:** ${d.whatBusinessDoes}\n`;
  if (d.targetCustomer) summary += `* **Target Audience:** ${d.targetCustomer}\n`;
  if (d.whyChooseUs) summary += `* **Core Value Proposition (UVP):** ${d.whyChooseUs}\n`;
  if (d.brandFeeling) summary += `* **Desired Brand Feeling:** ${d.brandFeeling}\n`;
  if (d.emotions?.length) summary += `* **Selected Emotions:** ${d.emotions.join(', ')}\n`;
  if (d.visualStyles?.length) summary += `* **Visual Aesthetics:** ${d.visualStyles.join(', ')}\n`;
  if (d.competitors?.length) {
    const compStr = d.competitors.map((c: any) => `${c.name} (${c.rating || 'neutral'})`).join(', ');
    summary += `* **Competitors:** ${compStr}\n`;
  }

  summary += `\n**Strategic Advisory & Next Steps**\n`;
  if (!b) {
    summary += `* **Generate Brand DNA:** Go to the Brand DNA tab to generate strategic positioning and poster concepts based on these answers.\n`;
  } else {
    summary += `* **Brand DNA Archetype:** **${b.brandPersonalityCluster || 'Defined'}** — Ready for visual translation.\n`;
  }
  summary += `* **Moodboards:** ${moodboards.length > 0 ? `${moodboards.length} active board(s).` : 'Create visual moodboards reflecting the selected styles.'}\n`;
  summary += `* **Execution Roadmap:** Ensure all stakeholders align with the UVP and emotional cues before proceeding to final design delivery.`;

  return summary;
}

export async function buildProjectContext(projectId: string): Promise<string> {
  const project: any = await Project.findById(projectId)
    .populate('client')
    .populate('clientProfile')
    .populate('discovery')
    .populate('brandDNA')
    .populate('moodboards')
    .populate('concepts')
    .populate('deliverables')
    .populate('paymentMilestones')
    .lean();

  if (!project) return 'No project context available.';

  let context = `PROJECT OVERVIEW:\n`;
  context += `- Title: ${project.title}\n`;
  context += `- Client Name: ${project.client?.name || project.companyName}\n`;
  context += `- Sector / Industry: ${project.sector}\n`;
  context += `- Project Value: Rs ${project.projectValue}\n`;
  context += `- Overall Progress: ${project.progress}%\n`;
  context += `- Lifecycle Stage: ${String(project.status || 'discovery').toUpperCase()}\n`;

  if (project.clientProfile) {
    const cp = project.clientProfile;
    context += `\nCLIENT PROFILE:\n`;
    if (cp.industry) context += `- Industry: ${cp.industry}\n`;
    if (cp.location) context += `- Location: ${cp.location}\n`;
    if (cp.website) context += `- Website: ${cp.website}\n`;
  }

  // 1. DISCOVERY STATUS & ANSWERS
  context += `\nDISCOVERY STAGE:\n`;
  if (!project.discovery) {
    context += `- Status: NOT STARTED (Client has not begun the discovery questionnaire)\n`;
  } else {
    const d = project.discovery;
    const isSubmitted = Boolean(d.submittedAt);
    context += `- Status: ${isSubmitted ? `SUBMITTED (Client submitted on ${new Date(d.submittedAt).toLocaleDateString()})` : 'PENDING / NOT SUBMITTED YET (Client only has unsubmitted draft data in progress)'}\n`;
    if (d.whatBusinessDoes) context += `- What business does: ${d.whatBusinessDoes}\n`;
    if (d.targetCustomer) context += `- Target customer: ${d.targetCustomer}\n`;
    if (d.whyChooseUs) context += `- Why choose us: ${d.whyChooseUs}\n`;
    if (d.brandFeeling) context += `- Desired brand feeling: ${d.brandFeeling}\n`;
    if (d.emotions?.length) context += `- Selected emotions: ${d.emotions.join(', ')}\n`;
    if (d.visualStyles?.length) context += `- Selected visual styles: ${d.visualStyles.join(', ')}\n`;
    if (d.competitors?.length) {
      const compStr = d.competitors.map((c: any) => `${c.name} (${c.rating || 'neutral'})`).join(', ');
      context += `- Competitor references: ${compStr}\n`;
    }
  }

  // 2. BRAND DNA STATUS
  context += `\nBRAND DNA STAGE:\n`;
  if (!project.brandDNA) {
    context += `- Status: NOT GENERATED YET (Brand DNA has not been created by consultant)\n`;
  } else {
    const b = project.brandDNA;
    context += `- Status: GENERATED\n`;
    if (b.brandPersonalityCluster) context += `- Personality Archetype: ${b.brandPersonalityCluster}\n`;
    if (b.businessSummary) context += `- Business Summary: ${b.businessSummary}\n`;
    if (b.targetAudienceSummary) context += `- Target Audience: ${b.targetAudienceSummary}\n`;
    if (b.positioningSummary) context += `- Positioning: ${b.positioningSummary}\n`;
    if (b.visualDirectionSummary) context += `- Visual Direction: ${b.visualDirectionSummary}\n`;
  }

  // 3. MOODBOARDS STAGE
  context += `\nMOODBOARDS STAGE:\n`;
  const moodboards = project.moodboards || [];
  if (moodboards.length === 0) {
    context += `- Status: None created yet\n`;
  } else {
    context += `- Total Moodboards: ${moodboards.length}\n`;
    moodboards.forEach((m: any, idx: number) => {
      context += `  ${idx + 1}. "${m.title}" | Approved: ${m.isSelected ? 'YES' : 'No'} | Shared: ${m.isShared ? 'Yes' : 'Draft'}${m.clientFeedback ? ` | Feedback: "${m.clientFeedback}"` : ''}\n`;
    });
  }

  // 4. CONCEPTS STAGE
  context += `\nCONCEPTS STAGE:\n`;
  const concepts = project.concepts || [];
  if (concepts.length === 0) {
    context += `- Status: None created yet\n`;
  } else {
    context += `- Total Concepts: ${concepts.length}\n`;
    concepts.forEach((c: any, idx: number) => {
      context += `  ${idx + 1}. "${c.title}" (v${c.version}) | Status: ${String(c.status).toUpperCase()}${c.clientFeedback ? ` | Feedback: "${c.clientFeedback}"` : ''}\n`;
    });
  }

  // 5. DELIVERABLES STAGE
  context += `\nFINAL DELIVERABLES & HANDOVER:\n`;
  const deliverables = project.deliverables || [];
  if (deliverables.length === 0) {
    context += `- Status: None uploaded yet\n`;
  } else {
    context += `- Total Deliverables: ${deliverables.length}\n`;
    deliverables.forEach((d: any, idx: number) => {
      context += `  ${idx + 1}. "${d.title}" | Status: ${d.status}\n`;
    });
  }

  // 6. PAYMENTS & MILESTONES
  context += `\nPAYMENTS & MILESTONES:\n`;
  const milestones = project.paymentMilestones || [];
  if (milestones.length === 0) {
    context += `- Status: None configured\n`;
  } else {
    milestones.forEach((pm: any, idx: number) => {
      context += `  ${idx + 1}. ${String(pm.type).toUpperCase()} Milestone: Rs ${pm.amount} (${pm.percentage}%) | Status: ${String(pm.status).toUpperCase()}${pm.paidAt ? ` (Paid on ${new Date(pm.paidAt).toLocaleDateString()})` : ''}\n`;
    });
  }

  return context;
}

export async function generateProjectAssistantReply(
  projectId: string,
  userMessage: string,
  customApiKey?: string
): Promise<string> {
  const project: any = await Project.findById(projectId)
    .populate('client')
    .populate('consultant')
    .populate('clientProfile')
    .populate('discovery')
    .populate('brandDNA')
    .populate('moodboards')
    .populate('concepts')
    .populate('deliverables')
    .populate('paymentMilestones')
    .lean();

  if (!project) {
    return 'Project context is unavailable. Please verify the project ID.';
  }

  const effectiveKey = (customApiKey || project?.consultant?.integrations?.geminiApiKey || '').trim();

  if (!effectiveKey) {
    return '⚠️ Google Gemini API Key is not configured. Please open Settings > "Integrations & API Keys" and paste your Google Gemini API Key to activate the AI Assistant.';
  }

  let client: GoogleGenAI;
  try {
    client = getAiClient(effectiveKey);
  } catch (err: any) {
    return `⚠️ Google Gemini API Key error: ${err?.message || 'Invalid key'}. Please check your key in Settings > Integrations & API Keys.`;
  }

  const projectContext = await buildProjectContext(projectId);
  const systemInstruction = `You are FLOXA's senior Brand Strategy & Project Director Assistant.
You advise the creative consultant on brand strategy, client communication, design direction, discovery analysis, and project lifecycle milestones.

LIVE PROJECT CONTEXT:
${projectContext}

AGENCY WORKFLOW & STAGE-AWARE RULES:
1. Discovery Submission Awareness:
   - If the user asks for moodboard directions, concepts, or Brand DNA, BUT Discovery Status is "PENDING / NOT SUBMITTED YET" or "NOT STARTED":
     You MUST alert the consultant that the client has NOT officially submitted their discovery questionnaire yet.
     Explain that creating or finalizing visual directions before official client submission risks misalignment.
     If unsubmitted draft data is present, you may provide preliminary creative inspiration based on the draft notes, but advise the consultant to have the client submit discovery first.
2. Lifecycle State Awareness:
   - Acknowledge existing assets (Brand DNA, Moodboards, Concepts, Deliverables, Invoices) accurately.
   - If a project progress is 100% or all deliverables are complete, address it as a completed handover.
3. Formatting Rules:
   - Provide a complete, beautifully structured response with bold section titles (e.g. **Discovery Status & Advisory**, **Moodboard Explorations**, **Next Steps**).
   - Do NOT use markdown hashtags like "###" or divider lines like "---". Use bold titles.
   - Do NOT output internal thoughts, preambles, or constraint checks. Start directly with your response.
   - Use clean bullet points with bold keywords at the beginning of each point.
`;

  const models = getActiveModels();
  const timeoutMs = (ENV.GEMINI_TIMEOUT_SECONDS || 12) * 1000;
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const startTime = Date.now();
    try {
      console.log(`[FLOXA AI Assistant] Trying model [${i + 1}/${models.length}]: ${model}...`);
      const response: any = await callModelWithTimeout(
        client.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: `${systemInstruction}\n\nUser Question: ${userMessage}` }] }
          ],
          config: {
            maxOutputTokens: ENV.GEMINI_MAX_OUTPUT_TOKENS,
          }
        }),
        model,
        timeoutMs
      );

      const reply = response.text?.trim();
      if (reply) {
        console.log(`[FLOXA AI Assistant] Model ${model} succeeded in ${Date.now() - startTime}ms`);
        return reply;
      }
    } catch (err: any) {
      lastError = err;
      const elapsed = Date.now() - startTime;
      const nextModel = models[i + 1];
      console.warn(
        `[FLOXA AI Assistant] Model ${model} failed after ${elapsed}ms (${err.message || err}). ${
          nextModel ? `Falling back to ${nextModel}...` : 'All Gemini models exhausted.'
        }`
      );
    }
  }

  console.warn('[FLOXA AI Assistant] All Gemini models exhausted.');
  return `⚠️ Unable to get a response from Google Gemini AI (${lastError?.message || 'Request failed'}). Please verify your Gemini API Key in Settings > Integrations & API Keys.`;
}

export async function generateAiBrandDNA(project: any, discovery: any, customApiKey?: string): Promise<any> {
  const fallback = buildBrandDNAData(project, discovery);
  const effectiveKey = (customApiKey || project?.consultant?.integrations?.geminiApiKey || ENV.GEMINI_API_KEY || '').trim();

  if (!effectiveKey) {
    console.warn('[FLOXA Brand DNA] Google Gemini API Key is not configured. Falling back to deterministic Brand DNA generation.');
    return fallback;
  }

  let client: GoogleGenAI;
  try {
    client = getAiClient(effectiveKey);
  } catch (err: any) {
    console.warn(`[FLOXA Brand DNA] Google Gemini API client initialization failed: ${err?.message || 'Invalid key'}. Using fallback.`);
    return fallback;
  }

  const profile = project.clientProfile;
  const companyName = profile?.companyName || project.companyName || project.title || 'The Brand';
  const industry = profile?.industry || project.sector || 'Creative Industry';

  const whatBusinessDoes = discovery.whatBusinessDoes || discovery.what_business_does || 'Distinctive professional services.';
  const targetCustomer = discovery.targetCustomer || discovery.target_customer || 'Quality-conscious clients';
  const whyChooseUs = discovery.whyChooseUs || discovery.why_choose_us || 'Uncompromising craftsmanship';
  const brandFeeling = discovery.brandFeeling || discovery.brand_feeling || 'Bold and authoritative';

  const rawEmotions = discovery.emotions || [];
  const emotions = rawEmotions.map((e: any) => (typeof e === 'string' ? e : e?.emotion)).filter(Boolean).join(', ') || 'Trust, Bold, Refined';

  const rawStyles = discovery.visualStyles || discovery.visual_styles || [];
  const visualStyles = rawStyles.map((s: any) => (typeof s === 'string' ? s : s?.style)).filter(Boolean).join(', ') || 'Bold & Loud, Minimal & Clean';

  const rawComps = discovery.competitors || [];
  const competitors = rawComps.slice(0, 5).map((c: any) => `${c.name || 'Competitor'} (${c.rating || 'neutral'})`).join(', ') || 'None submitted';

  const cluster = calculateCluster(discovery.sliders);

  const prompt = `You are FLOXA's Chief Creative Strategist & Brand Director.
Transform the following client discovery questionnaire into a comprehensive, world-class Brand DNA and Designer Creative Brief.
Your output must be strictly valid JSON matching the schema below without any markdown code fences.

CLIENT DISCOVERY INTAKE:
- Company Name: ${companyName}
- Industry / Sector: ${industry}
- What Business Does: ${whatBusinessDoes}
- Target Customer: ${targetCustomer}
- Core Reason to Choose Them (UVP): ${whyChooseUs}
- Desired Brand Feeling: ${brandFeeling}
- Selected Emotional Cues: ${emotions}
- Preferred Visual Direction: ${visualStyles}
- Calculated Personality Cluster: ${cluster}
- Competitor References: ${competitors}

JSON STRUCTURE REQUIRED:
{
  "brandPersonalityCluster": "${cluster}",
  "businessSummary": "2-sentence strategic synthesis of what the business does and its elevated market purpose.",
  "targetAudienceSummary": "Deep psychological breakdown of the target audience and what drives their decision-making.",
  "positioningSummary": "Sharp, defensible value proposition and competitive market stance based on '${whyChooseUs}'.",
  "brandFeelingSummary": "Rich description of the brand's sensory mood, emotional resonance, and tone of voice.",
  "visualDirectionSummary": "Overall creative art direction, aesthetic mood, and visual storytelling foundation.",
  "competitorSummary": "Specific strategic differentiation notes highlighting how ${companyName} stands distinct from competitors.",
  "posterConcepts": [
    {
      "angle": "Concept 1: Primary Hero Theme",
      "conceptName": "Punchy 2-3 word concept name",
      "description": "Clear 2-sentence creative description of what this poster represents and communicates.",
      "visualHook": "The specific visual metaphor, focal element, or dramatic contrast to design."
    },
    {
      "angle": "Concept 2: Typographic & Narrative Theme",
      "conceptName": "Punchy 2-3 word concept name",
      "description": "Clear 2-sentence creative description of what this poster represents and communicates.",
      "visualHook": "The specific visual metaphor, focal element, or dramatic contrast to design."
    },
    {
      "angle": "Concept 3: Dynamic Atmosphere & Emotion Theme",
      "conceptName": "Punchy 2-3 word concept name",
      "description": "Clear 2-sentence creative description of what this poster represents and communicates.",
      "visualHook": "The specific visual metaphor, focal element, or dramatic contrast to design."
    }
  ],
  "copywritingHooks": [
    {
      "headline": "Arresting, punchy poster headline 1",
      "subline": "Compelling supporting subtext 1",
      "cta": "Decisive call to action 1"
    },
    {
      "headline": "Arresting, punchy poster headline 2",
      "subline": "Compelling supporting subtext 2",
      "cta": "Decisive call to action 2"
    },
    {
      "headline": "Arresting, punchy poster headline 3",
      "subline": "Compelling supporting subtext 3",
      "cta": "Decisive call to action 3"
    }
  ],
  "colorPalette": [
    {
      "role": "Dominant (60%)",
      "name": "Evocative color name",
      "hex": "#HEX",
      "usage": "Primary backdrop and negative space"
    },
    {
      "role": "Secondary (30%)",
      "name": "Evocative color name",
      "hex": "#HEX",
      "usage": "Structural containers, panels, and secondary layers"
    },
    {
      "role": "Accent (10%)",
      "name": "Evocative color name",
      "hex": "#HEX",
      "usage": "High-impact visual hooks, key badges, and CTAs"
    },
    {
      "role": "Canvas Contrast",
      "name": "Evocative color name",
      "hex": "#HEX",
      "usage": "Crisp headline typography and luminous accents"
    }
  ],
  "typographyDirectives": {
    "headlineStyle": "Specific headline font genre and casing (e.g., Ultra-bold geometric grotesque in tight uppercase)",
    "bodyStyle": "Specific body font genre (e.g., Clean neutral grotesque or technical mono in regular weight)",
    "pairingRationale": "Why this typography pairing reinforces the brand personality"
  },
  "artDirection": {
    "composition": "Layout rules (e.g., Swiss asymmetrical grid with 65% focal weight and generous breathing room)",
    "lightingAndTexture": "Lighting, material textures, and depth (e.g., Cinematic dark-mode shadows with neon chromatic edge lighting)",
    "focalPoint": "What the viewer's eye should lock onto first"
  },
  "designRules": {
    "dos": [
      "Strict creative rule 1",
      "Strict creative rule 2",
      "Strict creative rule 3"
    ],
    "donts": [
      "What the designer must strictly avoid 1",
      "What the designer must strictly avoid 2",
      "What the designer must strictly avoid 3"
    ]
  }
}
`;

  const models = getActiveModels();
  const timeoutMs = (ENV.GEMINI_TIMEOUT_SECONDS || 12) * 1000;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const startTime = Date.now();
    try {
      console.log(`[FLOXA Brand DNA] Trying model [${i + 1}/${models.length}]: ${model}...`);
      const response: any = await callModelWithTimeout(
        client.models.generateContent({
          model,
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          config: {
            maxOutputTokens: 2500,
            responseMimeType: 'application/json',
          }
        }),
        model,
        timeoutMs
      );

      const reply = response.text?.trim();
      if (reply) {
        const cleaned = reply.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.businessSummary && Array.isArray(parsed.posterConcepts) && parsed.posterConcepts.length > 0) {
          console.log(`[FLOXA Brand DNA] Model ${model} succeeded in ${Date.now() - startTime}ms`);
          return {
            ...fallback,
            ...parsed,
            brandPersonalityCluster: parsed.brandPersonalityCluster || cluster,
            generatedFromDiscovery: true,
          };
        }
      }
    } catch (err: any) {
      console.warn(`[FLOXA Brand DNA] Model ${model} failed (${err.message || err}), trying next fallback...`);
    }
  }

  console.warn('[FLOXA Brand DNA] Gemini generation exhausted fallbacks. Returning deterministic Brand DNA fallback.');
  return fallback;
}

// ---------------------------------------------------------------------------
// AI SUITE POWER GENERATORS (Moodboard Directions, Brand DNA, Proposal)
// ---------------------------------------------------------------------------

export interface AiSuiteGenResult {
  text: string;
  isInsufficient: boolean;
}

export function isDummyOrGibberish(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const cleaned = text.trim().toLowerCase();
  if (cleaned.length < 5) return true;

  const placeholders = [
    'test', 'dummy', 'asdf', 'qwerty', 'sample', 'fake', 'placeholder',
    'none', 'n/a', 'nothing', 'bla', 'blah', 'xxx', 'abc', 'temp', 'random',
    'shdfksjfd', 'asdfgh', 'zxcvbn', 'foobar'
  ];
  if (placeholders.some((p) => cleaned === p || (cleaned.includes(p) && cleaned.length < 18))) {
    return true;
  }

  const lettersOnly = cleaned.replace(/[^a-z]/g, '');
  if (/^(.)\1+$/.test(lettersOnly)) return true;

  if (lettersOnly.length >= 6) {
    const vowels = lettersOnly.match(/[aeiou]/g);
    const vowelCount = vowels ? vowels.length : 0;
    const vowelRatio = vowelCount / lettersOnly.length;
    if (vowelRatio < 0.15) {
      return true; // No or almost no vowels in a long sequence (keyboard smash)
    }
  }

  return false;
}

function getDiscoveryValidationAdvisory(companyName: string, flaggedText: string, toolName: string): string {
  const displayFlag = flaggedText && flaggedText.trim() ? `"${flaggedText.trim()}"` : '(Empty / Not filled yet)';
  return [
    `⚠️ INSUFFICIENT DISCOVERY INPUT — AUTHENTIC STRATEGY LOCKED`,
    `Project: ${companyName.toUpperCase()}`,
    `Tool: ${toolName}`,
    '',
    `DETECTED ISSUE:`,
    `• The client's business description was flagged as placeholder or dummy text: ${displayFlag}.`,
    '',
    `STRICT SAAS ANTI-HALLUCINATION POLICY:`,
    `FLOXA is a commercial brand operating platform built for real agencies. FLOXA AI will NOT fabricate fictional business capabilities or make up claims when placeholder text is submitted.`,
    '',
    `HOW TO UNLOCK FULL AI GENERATION:`,
    `1. Ask your client to open their private Client Portal link.`,
    `2. In the Discovery questionnaire, submit real company details:`,
    `   • What the business actually creates, provides, or sells.`,
    `   • Who their real target customers/audience are.`,
    `   • Why customers choose them over alternatives (UVP).`,
    `3. Save or submit the discovery form.`,
    `4. Return to the AI Suite and click "${toolName}" again.`,
    '',
    `* Note: Because your input was incomplete, this run was NOT counted against your free trial limit.`,
  ].join('\n');
}

function getSectorHexPalette(sector = ''): string[] {
  const value = sector.toLowerCase();
  if (value.includes('tech') || value.includes('saas') || value.includes('software')) {
    return ['#0B192C', '#1E3E62', '#00ADB5', '#EEEEEE'];
  }
  if (value.includes('beauty') || value.includes('wellness') || value.includes('health')) {
    return ['#1F2937', '#9370DB', '#FBCFE8', '#FFF1F2'];
  }
  if (value.includes('food') || value.includes('beverage') || value.includes('restaurant')) {
    return ['#2C1810', '#C85A17', '#E5A93C', '#FFF8EB'];
  }
  if (value.includes('finance') || value.includes('legal') || value.includes('consult')) {
    return ['#0F172A', '#1E293B', '#38BDF8', '#F8FAFC'];
  }
  return ['#111827', '#059669', '#34D399', '#F0FDF4'];
}

export async function generateAiMoodboardDirections(projectId: string, customApiKey?: string): Promise<AiSuiteGenResult> {
  const project: any = await Project.findById(projectId)
    .populate('client')
    .populate('clientProfile')
    .populate('discovery')
    .populate('brandDNA')
    .lean();

  if (!project) return { text: 'Selected project was not found.', isInsufficient: true };

  const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand';
  const sector = project.clientProfile?.industry || project.sector || 'Design';
  const d = project.discovery || {};
  const b = project.brandDNA || {};

  const whatBusinessDoes = d.whatBusinessDoes || '';
  if (isDummyOrGibberish(whatBusinessDoes)) {
    return {
      text: getDiscoveryValidationAdvisory(companyName, whatBusinessDoes, 'Moodboard Directions'),
      isInsufficient: true,
    };
  }

  const targetCustomer = d.targetCustomer || b.targetAudienceSummary || 'Discerning clients';
  const brandFeeling = d.brandFeeling || b.brandFeelingSummary || 'Professional, modern and memorable';
  const whyChooseUs = d.whyChooseUs || b.positioningSummary || 'Exceptional craftsmanship and precision';
  const emotions = (d.emotions || []).map((e: any) => (typeof e === 'string' ? e : e?.emotion)).filter(Boolean).join(', ') || 'Clarity, Confidence, Refinement';
  const visualStyles = (d.visualStyles || []).map((s: any) => (typeof s === 'string' ? s : s?.style)).filter(Boolean).join(', ') || 'Clean, Minimal, Authoritative';
  const palette = getSectorHexPalette(sector);

  const fallbackOutput = [
    `MOODBOARD DIRECTIONS — ${companyName.toUpperCase()}`,
    `Strategic Context: Sector: ${sector} | Activity: ${whatBusinessDoes} | Audience: ${targetCustomer}`,
    '',
    `DIRECTION 1: MINIMAL PRECISION & CREDIBILITY`,
    `• Visual Theme: A high-trust, structured aesthetic grounded in ${whatBusinessDoes}.`,
    `• Color Palette: ${palette[0]} (Anchor Dark), ${palette[1]} (Primary Surface), ${palette[2]} (Electric Contrast), ${palette[3]} (Warm Tint).`,
    `• Typography System: Sharp Geometric Sans headline paired with open Humanist body typography.`,
    `• Photography Style: High-definition product details, natural architectural light, clean un-distracted negative space.`,
    `• Materials & Texture: Subtle technical gridlines, frosted glass layering, matte smooth surfaces.`,
    `• What To Avoid: Cluttered compositions, generic stock handshakes, over-saturated gradient washes.`,
    `• Strategic Rationale: Validates ${whyChooseUs} by making the company feel dependable and clear.`,
    '',
    `DIRECTION 2: WARM EDITORIAL & HUMAN CONNECTION`,
    `• Visual Theme: Relational, tactile aesthetic focused on emotional resonance (${emotions}).`,
    `• Color Palette: ${palette[3]}, #D97706 (Warm Clay), #78350F (Deep Umber), #F8FAFC (Soft Pearl).`,
    `• Typography System: Modern Editorial Serif headlines paired with refined Swiss Sans for body copy.`,
    `• Photography Style: Candid documentary portraits, authentic process moments, warm sidelight, warm shadows.`,
    `• Materials & Texture: Tactile paper texture, soft drop shadows, natural organic crops.`,
    `• What To Avoid: Cold corporate blue gradients, artificial stock smiles, clinical grey-outs.`,
    `• Strategic Rationale: Engages ${targetCustomer} on a personal, trusting level while preserving prestige.`,
    '',
    `DIRECTION 3: BOLD CONTEMPORAGE EDGE`,
    `• Visual Theme: A high-contrast, modern visual route built to dominate category recall in ${sector}.`,
    `• Color Palette: #09090B (Onyx Black), ${palette[2]} (Hyper Accent), #FAFAFA (Pure Signal), #27272A (Carbon).`,
    `• Typography System: Condensed Heavy Headline type paired with clean Monospace metadata details.`,
    `• Photography Style: Dynamic angles, dramatic selective lighting, high contrast crops.`,
    `• Materials & Texture: Deep panel layering, sharp dividing lines, high-gloss accents against matte charcoal.`,
    `• What To Avoid: Timid spacing, dated serif tropes, muddy low-contrast palettes.`,
    `• Strategic Rationale: Elevates ${companyName} directly above traditional competitors into category leadership.`,
  ].join('\n');

  let client: GoogleGenAI;
  try {
    client = getAiClient(customApiKey);
  } catch (err: any) {
    return {
      text: '⚠️ Google Gemini API Key is not configured. Please open Settings > "Integrations & API Keys" and paste your Google Gemini API Key before generating Moodboard Directions.',
      isInsufficient: true,
    };
  }

  const prompt = `You are FLOXA's Executive Creative Director & Visual Identity Lead.
Using this verified project context:
- Company Name: ${companyName}
- Industry / Sector: ${sector}
- What the Business Actually Does: ${whatBusinessDoes}
- Target Audience: ${targetCustomer}
- Core UVP: ${whyChooseUs}
- Desired Brand Feeling: ${brandFeeling}
- Emotional Cues: ${emotions}
- Visual Aesthetics: ${visualStyles}

ANTI-HALLUCINATION INSTRUCTIONS:
All visual directions, color palettes, and typography pairings MUST be directly grounded in the real business ("${whatBusinessDoes}"). Do not invent unrelated industries.

Generate 3 complete, distinct Visual Moodboard Directions for the designer.
Format with clean uppercase section headers:
MOODBOARD DIRECTIONS — ${companyName.toUpperCase()}
Followed by DIRECTION 1, DIRECTION 2, DIRECTION 3 with bullet points for:
• Visual Theme
• Color Palette (include 4 exact HEX codes with descriptive roles)
• Typography System (Headline font pairing + body font style)
• Photography Style
• Materials & Texture
• What To Avoid
• Strategic Rationale

Return only clean formatted plain text with bullet points, no conversational preamble.`;

  const models = getActiveModels();
  const timeoutMs = (ENV.GEMINI_TIMEOUT_SECONDS || 12) * 1000;

  for (const model of models) {
    try {
      const response: any = await callModelWithTimeout(
        client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 2500 },
        }),
        model,
        timeoutMs
      );
      const text = response.text?.trim();
      if (text) return { text, isInsufficient: false };
    } catch {
      // Continue to next model fallback
    }
  }

  return {
    text: '⚠️ Google Gemini generation failed across available models. Please verify your Gemini API Key in Settings > Integrations & API Keys.',
    isInsufficient: true,
  };
}

export async function generateAiBrandDNAOverview(projectId: string, customApiKey?: string): Promise<AiSuiteGenResult> {
  const project: any = await Project.findById(projectId)
    .populate('client')
    .populate('clientProfile')
    .populate('discovery')
    .populate('brandDNA')
    .lean();

  if (!project) return { text: 'Selected project was not found.', isInsufficient: true };

  const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand';
  const sector = project.clientProfile?.industry || project.sector || 'Design';
  const d = project.discovery || {};
  const b = project.brandDNA || {};

  const whatBusinessDoes = d.whatBusinessDoes || '';
  if (isDummyOrGibberish(whatBusinessDoes)) {
    return {
      text: getDiscoveryValidationAdvisory(companyName, whatBusinessDoes, 'Enhance Brand DNA'),
      isInsufficient: true,
    };
  }

  const targetCustomer = d.targetCustomer || b.targetAudienceSummary || 'Discerning clients';
  const whyChooseUs = d.whyChooseUs || b.positioningSummary || 'Exceptional craftsmanship and precision';
  const brandFeeling = d.brandFeeling || b.brandFeelingSummary || 'Empowered, confident, visionary';
  const cluster = b.brandPersonalityCluster || 'The Creator / The Craftsperson';

  const fallbackOutput = [
    `ENHANCE BRAND DNA — ${companyName.toUpperCase()}`,
    `Strategic Foundation & Grounded Market Architecture`,
    '',
    `1. BRAND ARCHETYPE & ESSENCE`,
    `• Primary Archetype: ${cluster}`,
    `• Archetype Essence: Grounded in deliberate craftsmanship and clear value delivery.`,
    `• Personality Traits: Visionary, Methodical, Authoritative, Dependable, Authentic.`,
    '',
    `2. ELEVATED BUSINESS PURPOSE`,
    `• Core Purpose: Delivering distinguished excellence in ${sector} by focusing on what truly matters: ${whatBusinessDoes}.`,
    `• Operational Focus: ${whatBusinessDoes}`,
    '',
    `3. TARGET AUDIENCE PSYCHOLOGICAL PROFILE`,
    `• Primary Persona: ${targetCustomer}`,
    `• Psychological Drivers: Desires clarity, seamless execution, and partners who uphold uncompromising standards.`,
    `• Core Pain Point: Frustration with hollow promises, vague deliverables, and inconsistent results.`,
    '',
    `4. MARKET POSITIONING & CORE UVP`,
    `• Value Proposition: ${whyChooseUs}`,
    `• Competitive Stance: Positioned directly around authentic execution in ${sector}, outperforming generic alternatives.`,
    '',
    `5. TAGLINE & SLOGAN CONCEPTS`,
    `• Concept 1 (Direct): "${companyName}: Deliberate Excellence."`,
    `• Concept 2 (Visionary): "${companyName}: Crafting the Future."`,
    `• Concept 3 (Clarity): "${companyName}: Precision Where It Counts."`,
    `• Concept 4 (Minimal): "${companyName}: Built with Purpose."`,
    `• Concept 5 (Impact): "${companyName}: Define Your Standard."`,
    '',
    `6. BRAND VOICE & COMMUNICATION PRINCIPLES`,
    `• Tone: Direct, grounded, confident, and free of artificial jargon.`,
    `• Language Dos: Emphasize genuine substance, speak clearly about real outcomes, highlight specific craftsmanship.`,
    `• Language Don'ts: Never use inflated buzzwords or claim capabilities outside ${whatBusinessDoes}.`,
  ].join('\n');

  let client: GoogleGenAI;
  try {
    client = getAiClient(customApiKey);
  } catch (err: any) {
    return {
      text: '⚠️ Google Gemini API Key is not configured. Please open Settings > "Integrations & API Keys" and paste your Google Gemini API Key before running Enhance Brand DNA.',
      isInsufficient: true,
    };
  }

  const prompt = `You are FLOXA's Chief Brand Strategist.
Transform this verified client project into an executive Brand DNA strategy brief:
- Company Name: ${companyName}
- Industry: ${sector}
- What the Business Actually Does: ${whatBusinessDoes}
- Target Audience: ${targetCustomer}
- Core UVP: ${whyChooseUs}
- Desired Feeling: ${brandFeeling}

CRITICAL ANTI-HALLUCINATION & FACTUAL GROUNDING RULES:
1. PURE GROUNDING: You MUST strictly ground all insights, archetypes, mission, and taglines on the REAL business description provided above: "${whatBusinessDoes}".
2. ZERO FABRICATION: Under NO circumstances should you fabricate unrelated industries or technologies. (For example, NEVER invent "digital analytics", "software intelligence", or "big data" unless the client specifically described doing analytics/software).
3. ELEVATED STRATEGY: Elevate their authentic trade, craftsmanship, and audience into executive strategy without changing what they actually do.

Generate a complete, structured Brand DNA document with these 6 sections:
1. BRAND ARCHETYPE & ESSENCE (identify primary archetype grounded in ${sector})
2. ELEVATED BUSINESS PURPOSE
3. TARGET AUDIENCE PSYCHOLOGICAL PROFILE (drivers & pain points of ${targetCustomer})
4. MARKET POSITIONING & CORE UVP (defensible value based on ${whyChooseUs})
5. TAGLINE & SLOGAN CONCEPTS (5 distinct, creative tagline options tailored to ${companyName})
6. BRAND VOICE & COMMUNICATION PRINCIPLES (tone, language dos & don'ts)

Return only clean formatted plain text with bullet points, no conversational preamble.`;

  const models = getActiveModels();
  const timeoutMs = (ENV.GEMINI_TIMEOUT_SECONDS || 12) * 1000;

  for (const model of models) {
    try {
      const response: any = await callModelWithTimeout(
        client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 2500 },
        }),
        model,
        timeoutMs
      );
      const text = response.text?.trim();
      if (text) return { text, isInsufficient: false };
    } catch {
      // Continue to next model fallback
    }
  }

  return {
    text: '⚠️ Google Gemini generation failed across available models. Please verify your Gemini API Key in Settings > Integrations & API Keys.',
    isInsufficient: true,
  };
}

export async function generateAiProposal(projectId: string, customApiKey?: string): Promise<AiSuiteGenResult> {
  const project: any = await Project.findById(projectId)
    .populate('client')
    .populate('clientProfile')
    .populate('discovery')
    .populate('paymentMilestones')
    .lean();

  if (!project) return { text: 'Selected project was not found.', isInsufficient: true };

  const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Client Partner';
  const clientName = project.client?.name || project.clientName || 'Valued Client';
  const sector = project.clientProfile?.industry || project.sector || 'Branding & Identity';
  const projectValue = Number(project.projectValue || 85000).toLocaleString('en-IN');
  const d = project.discovery || {};

  const whatBusinessDoes = d.whatBusinessDoes || '';
  if (isDummyOrGibberish(whatBusinessDoes)) {
    return {
      text: getDiscoveryValidationAdvisory(companyName, whatBusinessDoes, 'Proposal Generator'),
      isInsufficient: true,
    };
  }

  const targetCustomer = d.targetCustomer || 'discerning clients in the modern marketplace';
  const whyChooseUs = d.whyChooseUs || 'market-leading positioning and creative excellence';

  const fallbackOutput = [
    `CLIENT PROPOSAL & STATEMENT OF WORK — ${companyName.toUpperCase()}`,
    `Prepared by FLOXA Studio | Confidential & Bespoke`,
    '',
    `SECTION 1: EXECUTIVE SUMMARY & PROJECT VISION`,
    `• Client: ${clientName} (${companyName}) | Sector: ${sector}`,
    `• Scope Basis: Tailored identity strategy for ${whatBusinessDoes}.`,
    `• Vision: Partnering with ${companyName} to craft a commanding brand identity that communicates ${whyChooseUs} and drives engagement with ${targetCustomer}.`,
    `• Core Objective: Transitioning ${companyName} into a category-defining brand with high perceived market equity.`,
    '',
    `SECTION 2: STRATEGIC APPROACH & METHODOLOGY`,
    `• Discovery Synthesis: Analyzing company goals, customer psychology, and competitive landscape.`,
    `• Brand Positioning: Codifying the unique market positioning, brand archetypes, and tone of voice based on real business operations.`,
    `• Visual Art Direction: Developing moodboards, color palettes, and typography frameworks tailored to high-trust customer decisions.`,
    '',
    `SECTION 3: SCOPE OF WORK & KEY DELIVERABLES`,
    `• 1. Brand Strategy Blueprint: Archetype definition, mission, audience persona, and positioning statement.`,
    `• 2. Primary & Secondary Logo System: Vector master files (.SVG, .PNG, .PDF, .AI) in full-color, mono, and inverted configurations.`,
    `• 3. Color & Typography Identity: Curated HEX/RGB/CMYK palettes and responsive web/print font pairings.`,
    `• 4. Visual Identity Guidelines: Brand style manual documenting logo clear-space, improper usage, and aesthetic rules.`,
    `• 5. Launch Collateral Assets: Social media kit, brand presentation template, and digital stationery.`,
    '',
    `SECTION 4: TIMELINE & IMPLEMENTATION PHASES`,
    `• Phase 1 (Week 1): Discovery Intake, Strategic Analysis & Brand DNA Blueprint.`,
    `• Phase 2 (Week 2): Visual Directions, Moodboard Exploration & Client Feedback Alignment.`,
    `• Phase 3 (Weeks 3-4): Logo Concept Exploration, Iteration, and Final Client Selection.`,
    `• Phase 4 (Week 5): Brand Manual Documentation, Asset Package Generation & Final Handover.`,
    '',
    `SECTION 5: COMMERCIAL INVESTMENT & MILESTONES`,
    `• Total Investment: Rs ${projectValue} (Exclusive of applicable taxes)`,
    `• Milestone 1: 40% Advance Deposit — Project initiation and Discovery kickoff.`,
    `• Milestone 2: 30% Progress Payment — Upon approved Moodboard and Concept Selection.`,
    `• Milestone 3: 30% Final Settlement — Upon final asset packaging, source file delivery, and sign-off.`,
    `• Payment Mode: Secure instant settlement via FLOXA Client Portal (Razorpay).`,
    '',
    `SECTION 6: WHY CHOOSE FLOXA & NEXT STEPS`,
    `• Dedicated Creative Collaboration: Live portal transparency, real-time feedback loops, and milestone sign-offs.`,
    `• Complete IP Ownership: Full copyright and commercial source file transfer upon final settlement.`,
    `• Next Step: Review this proposal in your Client Portal, approve agreement terms, and settle kickoff deposit to lock your studio schedule.`,
  ].join('\n');

  let client: GoogleGenAI;
  try {
    client = getAiClient(customApiKey);
  } catch (err: any) {
    return {
      text: '⚠️ Google Gemini API Key is not configured. Please open Settings > "Integrations & API Keys" and paste your Google Gemini API Key before generating Client Proposals.',
      isInsufficient: true,
    };
  }

  const prompt = `You are FLOXA's Agency Commercial Director.
Create a comprehensive, persuasive 6-section Client Proposal based on:
- Company Name: ${companyName}
- Client Name: ${clientName}
- Industry / Sector: ${sector}
- Project Value: Rs ${projectValue}
- What the Business Actually Does: ${whatBusinessDoes}
- Target Audience: ${targetCustomer}
- Core UVP: ${whyChooseUs}

ANTI-HALLUCINATION INSTRUCTION:
All scope, methodology, and positioning must be strictly grounded in the client's actual operations: "${whatBusinessDoes}". Do not invent unrelated services.

The proposal must contain 6 distinct sections:
SECTION 1: EXECUTIVE SUMMARY & PROJECT VISION
SECTION 2: STRATEGIC APPROACH & METHODOLOGY
SECTION 3: SCOPE OF WORK & KEY DELIVERABLES
SECTION 4: TIMELINE & IMPLEMENTATION PHASES (week by week)
SECTION 5: COMMERCIAL INVESTMENT & MILESTONES (Rs ${projectValue} with advance deposit & milestone terms)
SECTION 6: WHY CHOOSE FLOXA & NEXT STEPS

Return only clean formatted plain text with bullet points, no conversational preamble.`;

  const models = getActiveModels();
  const timeoutMs = (ENV.GEMINI_TIMEOUT_SECONDS || 12) * 1000;

  for (const model of models) {
    try {
      const response: any = await callModelWithTimeout(
        client.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 2500 },
        }),
        model,
        timeoutMs
      );
      const text = response.text?.trim();
      if (text) return { text, isInsufficient: false };
    } catch {
      // Continue to next model fallback
    }
  }

  return {
    text: '⚠️ Google Gemini generation failed across available models. Please verify your Gemini API Key in Settings > Integrations & API Keys.',
    isInsufficient: true,
  };
}
