import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { Consultant } from '../models/consultant.model.js';
import { Project } from '../models/project.model.js';
import {
  generateAiMoodboardDirections,
  generateAiBrandDNAOverview,
  generateAiProposal,
} from '../services/gemini.service.js';
import { ENV } from '../config/env.js';
import { decryptSecret } from '../utils/crypto.js';

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

    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      res.status(400).json({ detail: 'Valid Project ID is required.' });
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

    const consultantApiKey = decryptSecret(consultant.integrations?.geminiApiKey);
    const hasOwnKey = Boolean(consultantApiKey && consultantApiKey.trim().length > 0);
    const hasPlatformKey = Boolean(ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.trim().length > 0);

    if (!hasOwnKey && !hasPlatformKey) {
      res.status(400).json({
        code: 'API_KEY_REQUIRED',
        detail: 'Please configure your Google Gemini API Key in Settings > Integrations & API Keys to run AI tools.',
      });
      return;
    }

    const plan = consultant.aiUsage?.plan || 'free';
    const isPro = plan === 'pro' || hasOwnKey;
    const runsField = `aiUsage.toolRuns.${toolId}`;

    let reservedType: 'none' | 'trial' | 'bonus' = 'none';
    let updatedConsultant: any = consultant.toObject();

    if (!isPro) {
      // Atomic slot reservation prevents TOCTOU race conditions on concurrent requests
      const reservedTrial = await Consultant.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { [runsField]: { $exists: false } },
            { [runsField]: { $lt: FREE_TRIAL_LIMIT_PER_TOOL } },
          ],
        },
        { $inc: { [runsField]: 1 } },
        { new: true }
      ).lean();

      if (reservedTrial) {
        reservedType = 'trial';
        updatedConsultant = reservedTrial;
      } else {
        const reservedBonus = await Consultant.findOneAndUpdate(
          {
            _id: user._id,
            'aiUsage.bonusCredits': { $gt: 0 },
          },
          { $inc: { 'aiUsage.bonusCredits': -1, [runsField]: 1 } },
          { new: true }
        ).lean();

        if (reservedBonus) {
          reservedType = 'bonus';
          updatedConsultant = reservedBonus;
        } else {
          const currentRuns = Number(((consultant.aiUsage?.toolRuns || {}) as Record<string, number>)[toolId] || 0);
          res.status(403).json({
            code: 'TRIAL_LIMIT_REACHED',
            detail: `You have completed your ${FREE_TRIAL_LIMIT_PER_TOOL} free runs for this suite. Configure your own Gemini API Key in Settings or upgrade to Floxa Pro to unlock unlimited AI generations.`,
            toolId,
            runsUsed: currentRuns,
            freeLimit: FREE_TRIAL_LIMIT_PER_TOOL,
          });
          return;
        }
      }
    }

    let output = '';
    let isInsufficient = false;

    try {
      if (toolId === 'moodboard-directions') {
        const result = await generateAiMoodboardDirections(projectId, consultantApiKey);
        output = result.text;
        isInsufficient = result.isInsufficient;
      } else if (toolId === 'enhance-brand-dna') {
        const result = await generateAiBrandDNAOverview(projectId, consultantApiKey);
        output = result.text;
        isInsufficient = result.isInsufficient;
      } else if (toolId === 'proposal-generator') {
        const result = await generateAiProposal(projectId, consultantApiKey);
        output = result.text;
        isInsufficient = result.isInsufficient;
      }
    } catch (genErr) {
      if (reservedType === 'trial') {
        await Consultant.updateOne({ _id: user._id }, { $inc: { [runsField]: -1 } });
      } else if (reservedType === 'bonus') {
        await Consultant.updateOne({ _id: user._id }, { $inc: { 'aiUsage.bonusCredits': 1, [runsField]: -1 } });
      }
      throw genErr;
    }

    if (isInsufficient && reservedType !== 'none') {
      // Do not charge quota if generation could not run due to insufficient project input
      const rollbackInc: Record<string, number> = { [runsField]: -1 };
      if (reservedType === 'bonus') rollbackInc['aiUsage.bonusCredits'] = 1;
      updatedConsultant = await Consultant.findByIdAndUpdate(
        user._id,
        { $inc: rollbackInc },
        { new: true }
      ).lean();
    } else if (isPro && !isInsufficient) {
      updatedConsultant = await Consultant.findByIdAndUpdate(
        user._id,
        { $inc: { [runsField]: 1 } },
        { new: true }
      ).lean();
    }

    const updatedRuns = (updatedConsultant?.aiUsage?.toolRuns || {}) as Record<string, number>;
    const newRuns = Math.max(0, Number(updatedRuns[toolId] || 0));
    const bonusRemaining = Number(updatedConsultant?.aiUsage?.bonusCredits || 0);
    const runsRemaining = isPro ? 'unlimited' : Math.max(0, FREE_TRIAL_LIMIT_PER_TOOL - newRuns) + bonusRemaining;
    const isLocked = !isPro && newRuns >= FREE_TRIAL_LIMIT_PER_TOOL && bonusRemaining <= 0;

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
