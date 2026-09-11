import { GoogleGenAI } from '@google/genai';
import { ENV } from '../config/env.js';
import { Project } from '../models/project.model.js';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!ENV.GEMINI_API_KEY) {
    throw new Error('Gemini API is not configured.');
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: ENV.GEMINI_API_KEY });
  }

  return aiClient;
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
  const projectContext = await buildProjectContext(projectId);
  const client = getAiClient();

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

  const models = ENV.GEMINI_MODELS.length > 0 ? ENV.GEMINI_MODELS : ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nUser Question: ${userMessage}` }] }
        ],
        config: {
          maxOutputTokens: ENV.GEMINI_MAX_OUTPUT_TOKENS,
        }
      });

      const reply = response.text?.trim();
      if (reply) return reply;
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} failed, trying next fallback:`, err);
    }
  }

  throw lastError || new Error('Gemini service is temporarily unavailable.');
}
