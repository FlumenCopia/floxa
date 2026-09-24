import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import {
  generateAiMoodboardDirections,
  generateAiBrandDNAOverview,
  generateAiProposal,
} from '../services/gemini.service.js';

export const ACTIVE_SUITE_TOOLS = [
  'proposal-generator',
  'enhance-brand-dna',
  'moodboard-directions',
];

export const FREE_TRIAL_LIMIT_PER_TOOL = 3;

export async function getAiSuiteUsage(req: AuthenticatedRequest, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const consultant = await Consultant.findById(user._id).lean();
    const plan = consultant?.aiUsage?.plan || 'free';
    const toolRuns = consultant?.aiUsage?.toolRuns || {};

    res.json({
      plan,
      freeLimit: FREE_TRIAL_LIMIT_PER_TOOL,
      activeTools: ACTIVE_SUITE_TOOLS,
      toolRuns,
    });
  } catch (error: any) {
    console.error('Error fetching AI Suite usage:', error);
    res.status(500).json({ detail: 'Failed to retrieve AI Suite usage.' });
  }
}

export async function runAiSuiteTool(req: AuthenticatedRequest, res: Response) {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }

    const projectId = String(req.body?.projectId || '').trim();
    const toolId = String(req.body?.toolId || '').trim();

    if (!projectId) {
      res.status(400).json({ detail: 'Project ID is required.' });
      return;
    }

    if (!toolId || !ACTIVE_SUITE_TOOLS.includes(toolId)) {
      res.status(400).json({
        detail: `Tool "${toolId}" is not one of the active AI Suites. Active suites: ${ACTIVE_SUITE_TOOLS.join(', ')}`,
      });
      return;
    }

    // Verify project exists and belongs to consultant
    const project = await Project.findById(projectId).lean();
    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    if (String(project.consultantId) !== String(user._id)) {
      res.status(403).json({ detail: 'You do not have access to this project.' });
      return;
    }

    // Check usage limits on consultant record
    const consultant = await Consultant.findById(user._id);
    if (!consultant) {
      res.status(404).json({ detail: 'Consultant record not found.' });
      return;
    }

    const consultantApiKey = consultant.integrations?.geminiApiKey;
    const hasOwnKey = Boolean(consultantApiKey && consultantApiKey.trim().length > 0);
    const plan = consultant.aiUsage?.plan || 'free';
    const isPro = plan === 'pro' || hasOwnKey;
    const toolRuns = (consultant.aiUsage?.toolRuns || {}) as Record<string, number>;
    const currentRuns = Number(toolRuns[toolId] || 0);

    if (!isPro && currentRuns >= FREE_TRIAL_LIMIT_PER_TOOL) {
      res.status(403).json({
        code: 'TRIAL_LIMIT_REACHED',
        detail: `You have completed your ${FREE_TRIAL_LIMIT_PER_TOOL} free runs for this suite. Configure your own Gemini API Key in Settings or upgrade to Floxa Pro to unlock unlimited AI generations.`,
        toolId,
        runsUsed: currentRuns,
        freeLimit: FREE_TRIAL_LIMIT_PER_TOOL,
      });
      return;
    }

    // Run the corresponding AI generator with customApiKey if configured
    let output = '';
    let isInsufficient = false;

    if (toolId === 'moodboard-directions') {
      const res = await generateAiMoodboardDirections(projectId, consultantApiKey);
      output = res.text;
      isInsufficient = res.isInsufficient;
    } else if (toolId === 'enhance-brand-dna') {
      const res = await generateAiBrandDNAOverview(projectId, consultantApiKey);
      output = res.text;
      isInsufficient = res.isInsufficient;
    } else if (toolId === 'proposal-generator') {
      const res = await generateAiProposal(projectId, consultantApiKey);
      output = res.text;
      isInsufficient = res.isInsufficient;
    }

    // Only increment usage count if real, valid generation occurred (don't penalize user for incomplete input)
    let newRuns = currentRuns;
    if (!isInsufficient) {
      const updatedConsultant = await Consultant.findByIdAndUpdate(
        user._id,
        { $inc: { [`aiUsage.toolRuns.${toolId}`]: 1 } },
        { new: true }
      ).lean();

      const updatedRuns = (updatedConsultant?.aiUsage?.toolRuns || {}) as Record<string, number>;
      newRuns = Number(updatedRuns[toolId] || currentRuns + 1);
    }

    const runsRemaining = isPro ? 'unlimited' : Math.max(0, FREE_TRIAL_LIMIT_PER_TOOL - newRuns);
    const isLocked = !isPro && newRuns >= FREE_TRIAL_LIMIT_PER_TOOL;

    res.json({
      success: true,
      toolId,
      output,
      isInsufficient,
      runsUsed: newRuns,
      freeLimit: FREE_TRIAL_LIMIT_PER_TOOL,
      runsRemaining,
      isLocked,
    });
  } catch (error: any) {
    console.error('Error running AI Suite tool:', error);
    res.status(500).json({ detail: error?.message || 'Failed to run AI tool.' });
  }
}
