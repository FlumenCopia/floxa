import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Project } from '../models/project.model.js';
import { Client } from '../models/client.model.js';
import { ClientProfile } from '../models/clientProfile.model.js';
import { PaymentMilestone } from '../models/paymentMilestone.model.js';
import { ProjectActivity } from '../models/activity.model.js';
import {
  calculateProjectProgress,
  calculateProjectWorkflowStatus,
  logProjectActivity,
  recalculatePaymentMilestones,
} from '../services/project.service.js';
import { sendClientPortalInvite } from '../services/email.service.js';
import { generateProjectAssistantReply } from '../services/gemini.service.js';
import { serializeProject, serializeProjectActivity } from '../utils/serializer.js';
import { hashPassword } from '../utils/crypto.js';
import { getActiveHelpSession, broadcastProjectRead } from '../websocket/socketServer.js';

export async function getProjects(req: any, res: Response, next: NextFunction) {
  try {
    const { search, status, ordering, page, page_size } = req.query;

    const pageNum = parseInt(page as string, 10) || 1;
    const pageSize = parseInt(page_size as string, 10) || 10;
    const skip = (pageNum - 1) * pageSize;

    const filter: any = {
      consultantId: req.user.id,
      isArchived: false,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      const q = String(search).trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      const matchingClients = await Client.find({ name: regex }).select('_id');
      const matchingClientIds = matchingClients.map((c) => c._id);

      filter.$or = [
        { title: regex },
        { companyName: regex },
        { clientId: { $in: matchingClientIds } },
      ];
    }

    let sort: any = { updatedAt: -1 };
    if (ordering === 'created_at') sort = { createdAt: 1 };
    else if (ordering === '-created_at') sort = { createdAt: -1 };
    else if (ordering === 'title') sort = { title: 1 };

    const [totalCount, projects] = await Promise.all([
      Project.countDocuments(filter),
      Project.find(filter)
        .populate([
          'client',
          'clientProfile',
          'discovery',
          'brandDNA',
          'moodboards',
          'concepts',
          'deliverables',
          'projectAgreement',
          'paymentMilestones',
        ])
        .sort(sort)
        .skip(skip)
        .limit(pageSize),
    ]);

    const projectIds = projects.map((p) => p._id);

    const unreadActivities = projectIds.length
      ? await ProjectActivity.find({
        projectId: { $in: projectIds },
        isRead: false,
        actorType: { $ne: 'consultant' },
      }).sort({ createdAt: -1 })
      : [];

    const helpByProjectId = new Map<string, any>();
    const unreadCountByProjectId = new Map<string, number>();
    const latestActivityByProjectId = new Map<string, any>();

    for (const act of unreadActivities) {
      const pId = String(act.projectId);
      unreadCountByProjectId.set(pId, (unreadCountByProjectId.get(pId) || 0) + 1);

      if (!latestActivityByProjectId.has(pId)) {
        latestActivityByProjectId.set(pId, {
          action: act.action,
          description: act.description,
          created_at: act.createdAt,
        });
      }

      if (act.action === 'client_help_requested' && !helpByProjectId.has(pId)) {
        let meta: any = {};
        try {
          meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata || {};
        } catch {
          meta = {};
        }
        helpByProjectId.set(pId, {
          question: meta.question || act.description,
          page_id: meta.page_id || 'Step 1',
          requested_at: act.createdAt,
        });
      }
    }

    const results = projects.map((p) => {
      const progress = calculateProjectProgress(p);
      const workflowStatus = calculateProjectWorkflowStatus(p);
      const pId = String(p._id);
      const activeHelp = getActiveHelpSession(pId) || helpByProjectId.get(pId) || null;
      const unreadCount = unreadCountByProjectId.get(pId) || 0;
      const latestActivity = latestActivityByProjectId.get(pId) || null;

      return serializeProject(
        {
          ...p.toObject(),
          progress,
          has_help_request: Boolean(activeHelp),
          help_request: activeHelp,
          unread_count: unreadCount,
          latest_activity: latestActivity,
        },
        workflowStatus
      );
    });

    const nextUrl =
      skip + pageSize < totalCount ? `?page=${pageNum + 1}&page_size=${pageSize}` : null;
    const prevUrl = pageNum > 1 ? `?page=${pageNum - 1}&page_size=${pageSize}` : null;

    res.json({
      count: totalCount,
      next: nextUrl,
      previous: prevUrl,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: any, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};

    const clientName = (body.client_name || body.client || '').trim();
    const clientEmail = (body.client_email || body.email || '').trim().toLowerCase();
    const companyName = (body.company_name || body.company || '').trim();
    const sector = (body.sector || 'General').trim();
    const projectTitle = (body.title || companyName || clientName || 'New Project').trim();
    const rawValue = body.project_value !== undefined ? body.project_value : body.value;
    const projectValue = parseFloat(rawValue || '0');

    const advancePercentage = parseInt(
      body.advance_percentage !== undefined ? body.advance_percentage : body.advance ?? '50',
      10
    );
    const midPercentage = parseInt(
      body.mid_percentage !== undefined ? body.mid_percentage : body.mid ?? '25',
      10
    );
    const finalPercentage = parseInt(
      body.final_percentage !== undefined ? body.final_percentage : body.final ?? '25',
      10
    );
    const revisionLimit = String(body.revision_limit || body.revisions || '3 revisions').trim();
    const portalPassword = (body.portal_password || '').trim();
    const sendInvite = body.send_invite !== undefined ? Boolean(body.send_invite) : true;

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!clientName || !clientEmail || !companyName) {
      res.status(400).json({ detail: 'Required project details missing.' });
      return;
    }

    const cleanClientEmail = clientEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanClientEmail)) {
      res.status(400).json({ detail: 'Please enter a valid client email address.' });
      return;
    }

    const totalPct = advancePercentage + midPercentage + finalPercentage;
    if (totalPct !== 100) {
      res.status(400).json({ detail: 'Payment percentages must sum to 100%.' });
      return;
    }

    let portalPasswordHash = '';
    if (portalPassword) {
      if (portalPassword.length < 8) {
        res.status(400).json({ detail: 'Portal password must contain at least 8 characters.' });
        return;
      }
      portalPasswordHash = await hashPassword(portalPassword);
    }

    const client = await Client.create({
      name: clientName,
      email: cleanClientEmail,
      companyName: companyName,
      sector: sector,
    });

    const portalToken = crypto.randomUUID();

    const project = await Project.create({
      consultantId: req.user.id,
      clientId: client.id,
      title: projectTitle,
      companyName: companyName,
      sector: sector,
      projectValue: projectValue,
      advancePercentage: advancePercentage,
      midPercentage: midPercentage,
      finalPercentage: finalPercentage,
      revisionLimit: revisionLimit,
      portalToken,
      portalPasswordHash,
      progress: 5,
    });

    // Create default client profile
    await ClientProfile.create({
      projectId: project.id,
      clientName: clientName,
      companyName: companyName,
      email: cleanClientEmail,
      industry: sector,
    });

    // Initialize payment milestones
    const advanceAmount = (projectValue * advancePercentage) / 100;
    const midAmount = (projectValue * midPercentage) / 100;
    const finalAmount = (projectValue * finalPercentage) / 100;

    await PaymentMilestone.insertMany([
      {
        projectId: project.id,
        type: 'advance',
        percentage: advancePercentage,
        amount: advanceAmount,
        status: 'ready',
      },
      {
        projectId: project.id,
        type: 'mid',
        percentage: midPercentage,
        amount: midAmount,
        status: 'locked',
      },
      {
        projectId: project.id,
        type: 'final',
        percentage: finalPercentage,
        amount: finalAmount,
        status: 'locked',
      },
    ]);

    await logProjectActivity({
      projectId: project.id,
      consultantId: req.user.id,
      actorType: 'consultant',
      action: 'project_created',
      description: `Consultant created project: ${project.title}`,
    });

    const populatedProject = await Project.findById(project.id).populate('client');

    let inviteEmailSent = false;
    let inviteEmailStatus = 'not_sent';

    // Default to sending invitation email to the client if client email is provided
    const shouldSendInvite = body.send_invite !== false;
    if (shouldSendInvite && cleanClientEmail) {
      try {
        const inviteTarget = populatedProject || project;
        if (!inviteTarget.client) {
          inviteTarget.client = client;
        }
        await sendClientPortalInvite(inviteTarget, portalPassword);
        inviteEmailSent = true;
        inviteEmailStatus = 'sent';
      } catch (err: any) {
        console.error('Failed to send invite email:', err);
        inviteEmailStatus = 'failed';
      }
    }

    const serialized = serializeProject(populatedProject || project, 'created');
    const responseData = {
      project: serialized,
      invite_email_sent: inviteEmailSent,
      invite_email_status: inviteEmailStatus,
      invite_email_detail: inviteEmailSent
        ? `Invitation email sent to ${clientEmail}.`
        : 'Project created, but the invitation email could not be sent.',
      ...serialized,
    };

    res.status(201).json(responseData);
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findOne({
      _id: id,
      consultantId: req.user.id,
      isArchived: false,
    }).populate([
      'client',
      'clientProfile',
      'discovery',
      'brandDNA',
      'moodboards',
      'concepts',
      'deliverables',
      'projectAgreement',
      'paymentMilestones',
    ]);

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const progress = calculateProjectProgress(project);
    const workflowStatus = calculateProjectWorkflowStatus(project);

    res.json(serializeProject({ ...project.toObject(), progress }, workflowStatus));
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { title, company_name, sector, project_value, is_archived } = req.body;

    const data: any = {};
    if (title !== undefined) data.title = title.trim();
    if (company_name !== undefined) data.companyName = company_name.trim();
    if (sector !== undefined) data.sector = sector.trim();
    if (project_value !== undefined) {
      const parsedValue = parseFloat(project_value);
      if (isNaN(parsedValue) || parsedValue < 0) {
        res.status(400).json({ detail: 'Project value must be a valid non-negative number.' });
        return;
      }
      data.projectValue = parsedValue;
    }
    if (is_archived !== undefined) data.isArchived = Boolean(is_archived);

    const updated = await Project.findOneAndUpdate(
      { _id: id, consultantId: req.user.id },
      { $set: data },
      { new: true }
    ).populate('client');

    if (!updated) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    if (data.projectValue !== undefined) {
      const unpaidMilestones = await PaymentMilestone.find({
        projectId: id,
        status: { $in: ['ready', 'locked'] },
      });
      for (const m of unpaidMilestones) {
        const newAmount = (data.projectValue * (m.percentage || 0)) / 100;
        await PaymentMilestone.findByIdAndUpdate(m._id, { amount: newAmount });
      }
      await recalculatePaymentMilestones(id);
    }

    res.json(serializeProject(updated));
  } catch (err) {
    next(err);
  }
}

export async function retryInvite(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findOne({ _id: id, consultantId: req.user.id }).populate('client');

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    await sendClientPortalInvite(project);
    res.json({ success: true, message: 'Invite email resent.' });
  } catch (err) {
    next(err);
  }
}

export async function getAnalytics(req: any, res: Response, next: NextFunction) {
  try {
    const projects = await Project.find({
      consultantId: req.user.id,
      isArchived: false,
    }).populate('paymentMilestones');

    const totalProjects = projects.length;
    const completedProjects = projects.filter(
      (p) => p.status === 'delivered' || Boolean(p.clientSignedOff)
    ).length;
    const activeProjects = totalProjects - completedProjects;

    let totalPaidRevenue = 0;
    let paymentPendingAmount = 0;
    let totalProjectValues = 0;

    // 4 Canonical status counts for dashboard
    const statusCounts: Record<string, number> = {
      created: 0,
      in_progress: 0,
      payment_pending: 0,
      delivered: 0,
    };

    // Revenue by last 6 calendar months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyBuckets: Array<{ label: string; amount: number; year: number; month: number }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyBuckets.push({
        label: monthNames[d.getMonth()],
        amount: 0,
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }

    // Projects progress list for sectors chart
    const projectProgress = projects.map((p) => {
      const sectorStr = p.sector ? ` (${p.sector})` : '';
      const label = `${p.companyName || p.title || 'Untitled'}${sectorStr}`;
      const progress = Math.max(0, Math.min(100, Math.round(Number(p.progress || 0))));
      return {
        id: p.id,
        name: label,
        label,
        progress,
        width: progress,
      };
    });

    projects.forEach((p) => {
      const isDelivered = p.status === 'delivered' || Boolean(p.clientSignedOff);
      const isCreated = p.status === 'created';
      const milestones = p.paymentMilestones || [];
      const hasPendingPayment =
        !isDelivered &&
        !isCreated &&
        ((p.status as string) === 'advance_payment' ||
          milestones.some(
            (m: any) =>
              m.status === 'requested' ||
              (m.type === 'advance' && m.status === 'pending')
          ));

      if (isDelivered) {
        statusCounts.delivered++;
      } else if (isCreated) {
        statusCounts.created++;
      } else if (hasPendingPayment) {
        statusCounts.payment_pending++;
      } else {
        statusCounts.in_progress++;
      }

      // Aggregate project value
      totalProjectValues += Number(p.projectValue || 0);

      // Aggregate milestones
      milestones.forEach((m: any) => {
        const amt = Number(m.amount || 0);
        if (m.status === 'paid') {
          totalPaidRevenue += amt;

          const paidDate = new Date(m.paidAt || m.updatedAt || m.createdAt || now);
          const bucket = monthlyBuckets.find(
            (b) => b.year === paidDate.getFullYear() && b.month === paidDate.getMonth()
          );
          if (bucket) {
            bucket.amount += amt;
          }
        } else {
          paymentPendingAmount += amt;
        }
      });
    });

    const averageProjectValue = totalProjects > 0 ? Math.round(totalProjectValues / totalProjects) : 0;
    const revenueLast6Months = monthlyBuckets.map((b) => ({
      label: b.label,
      amount: b.amount,
    }));

    res.json({
      active_projects: activeProjects,
      completed_projects: completedProjects,
      total_projects: totalProjects,
      total_paid_revenue: totalPaidRevenue,
      payment_pending_amount: paymentPendingAmount,
      total_revenue: totalPaidRevenue, // Backward compatibility
      pending_revenue: paymentPendingAmount, // Backward compatibility
      average_project_value: averageProjectValue,
      project_status_counts: statusCounts,
      revenue_last_6_months: revenueLast6Months,
      project_progress: projectProgress,
    });
  } catch (err) {
    next(err);
  }
}

export async function getConsultantActivities(req: any, res: Response, next: NextFunction) {
  try {
    const activeProjects = await Project.find({
      consultantId: req.user.id,
      isArchived: false,
    }).select('_id');
    const activeProjectIds = activeProjects.map((p) => p._id);

    const activities = await ProjectActivity.find({
      consultantId: req.user.id,
      projectId: { $in: activeProjectIds },
    })
      .populate('project')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(activities.map(serializeProjectActivity));
  } catch (err) {
    next(err);
  }
}

export async function markConsultantActivitiesRead(req: any, res: Response, next: NextFunction) {
  try {
    const result = await ProjectActivity.updateMany(
      {
        consultantId: req.user.id,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    res.json({ detail: 'Activities marked as read.', updated_count: result.modifiedCount });
  } catch (err) {
    next(err);
  }
}

export async function getProjectActivities(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findOne({
      _id: id,
      consultantId: req.user.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const activities = await ProjectActivity.find({ projectId: id })
      .populate('project')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(activities.map(serializeProjectActivity));
  } catch (err) {
    next(err);
  }
}

export async function markProjectActivitiesRead(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const project = await Project.findOne({
      _id: id,
      consultantId: req.user.id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const filter: any = {
      projectId: id,
      isRead: false,
    };

    const actions = req.body?.actions;
    if (actions !== undefined) {
      if (!Array.isArray(actions)) {
        res.status(400).json({ detail: 'Invalid actions filter. Expected an array of action names.' });
        return;
      }
      if (actions.length > 0) {
        const cleanedActions = actions.map((a: any) => String(a).trim()).filter(Boolean);
        filter.action = { $in: cleanedActions };
      }
    }

    const result = await ProjectActivity.updateMany(filter, {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const activeHelp = getActiveHelpSession(id);
    if (activeHelp) {
      activeHelp.is_active = false;
    }

    broadcastProjectRead(id, req.user?.id);

    res.json({
      detail: 'Activities marked as read.',
      updated_count: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
}

export async function chatAssistant(req: any, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ detail: 'Enter a valid prompt.' });
      return;
    }

    const project = await Project.findOne({
      _id: id,
      consultantId: req.user?.id || req.user?._id,
      isArchived: false,
    });

    if (!project) {
      res.status(404).json({ detail: 'Project not found.' });
      return;
    }

    const reply = await generateProjectAssistantReply(id, message);
    res.json({ response: reply });
  } catch (err: any) {
    const statusCode = err.status && err.status !== 401 ? err.status : 502;
    res.status(statusCode).json({ detail: err.message || 'AI Assistant service unavailable.' });
  }
}
