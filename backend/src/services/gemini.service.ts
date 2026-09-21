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

function getAiClient(): GoogleGenAI {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error('Gemini API is not configured.');
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });
  }

  return aiClient;
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

export async function generateProjectAssistantReply(projectId: string, userMessage: string): Promise<string> {
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

  if (!project) {
    return 'Project context is unavailable. Please verify the project ID.';
  }

  let client: GoogleGenAI | null = null;
  try {
    client = getAiClient();
  } catch (err: any) {
    console.warn('[FLOXA AI Assistant] Google Gemini API client unavailable:', err?.message);
  }

  // If no Gemini API key is configured, instantly use the intelligent contextual fallback
  if (!client) {
    console.log('[FLOXA AI Assistant] Serving intelligent project-aware contextual summary (No API Key configured).');
    return generateContextualProjectFallback(project, userMessage);
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

  // Graceful fallback: If all models in the fallback chain fail (or rate-limit / outage occurs),
  // provide the studio consultant with a high-fidelity contextual synthesis instead of a 502 crash!
  console.warn('[FLOXA AI Assistant] All Gemini models exhausted. Delivering high-fidelity project fallback.');
  return generateContextualProjectFallback(project, userMessage);
}

export async function generateAiBrandDNA(project: any, discovery: any): Promise<any> {
  const fallback = buildBrandDNAData(project, discovery);

  if (!ENV.GEMINI_API_KEY) {
    console.warn('[Gemini Brand DNA] No GEMINI_API_KEY configured; using strategic fallback generator.');
    return fallback;
  }

  let client: GoogleGenAI;
  try {
    client = getAiClient();
  } catch (err) {
    console.warn('[Gemini Brand DNA] Failed to initialize client, using fallback:', err);
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

  console.warn('[FLOXA Brand DNA] Gemini generation exhausted fallbacks. Using strategic fallback generator.');
  return fallback;
}
