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
  context += `- Client: ${project.client?.name || project.companyName}\n`;
  context += `- Sector: ${project.sector}\n`;
  context += `- Value: Rs ${project.projectValue}\n`;
  context += `- Progress: ${project.progress}%\n`;

  if (project.clientProfile) {
    const cp = project.clientProfile;
    context += `\nCLIENT PROFILE:\n`;
    if (cp.industry) context += `- Industry: ${cp.industry}\n`;
    if (cp.location) context += `- Location: ${cp.location}\n`;
    if (cp.website) context += `- Website: ${cp.website}\n`;
  }

  if (project.discovery) {
    const d = project.discovery;
    context += `\nDISCOVERY QUESTIONNAIRE:\n`;
    if (d.whatBusinessDoes) context += `- What business does: ${d.whatBusinessDoes}\n`;
    if (d.targetCustomer) context += `- Target customer: ${d.targetCustomer}\n`;
    if (d.whyChooseUs) context += `- Why choose us: ${d.whyChooseUs}\n`;
    if (d.brandFeeling) context += `- Brand feeling: ${d.brandFeeling}\n`;
    if (d.emotions?.length) context += `- Emotions: ${d.emotions.join(', ')}\n`;
    if (d.visualStyles?.length) context += `- Visual styles: ${d.visualStyles.join(', ')}\n`;
  }

  if (project.brandDNA) {
    const b = project.brandDNA;
    context += `\nBRAND DNA:\n`;
    if (b.brandPersonalityCluster) context += `- Personality: ${b.brandPersonalityCluster}\n`;
    if (b.positioningSummary) context += `- Positioning: ${b.positioningSummary}\n`;
    if (b.visualDirectionSummary) context += `- Visual Direction: ${b.visualDirectionSummary}\n`;
  }

  return context;
}

export async function generateProjectAssistantReply(projectId: string, userMessage: string): Promise<string> {
  const projectContext = await buildProjectContext(projectId);
  const client = getAiClient();

  const systemInstruction = `You are FLOXA's intelligent Brand Strategy & Project Assistant. 
You advise the consultant on brand strategy, design direction, discovery analysis, and client management for this specific project.
Use the following project context to give specific, highly contextual, and creative advice:

${projectContext}
`;

  const models = ENV.GEMINI_MODELS.length > 0 ? ENV.GEMINI_MODELS : ['gemini-2.5-flash', 'gemini-1.5-flash'];
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
