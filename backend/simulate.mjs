import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/floxa_db';

async function simulate(stage) {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const consultantsColl = db.collection('consultants');
  const projectsColl = db.collection('projects');
  const activitiesColl = db.collection('project_activities');

  // Find consultant new@gmail.com
  const consultant = await consultantsColl.findOne({ email: 'new@gmail.com' });
  if (!consultant) {
    console.error('Consultant new@gmail.com not found!');
    process.exit(1);
  }

  // Find their latest project
  const project = await projectsColl.findOne({ consultantId: consultant._id }, { sort: { createdAt: -1 } });
  if (!project) {
    console.error('No project found for new@gmail.com!');
    process.exit(1);
  }

  console.log(`Target Project: '${project.title}' (${project._id.toString()})`);
  const now = Date.now();

  async function logActivity(action, description, metadata) {
    await activitiesColl.insertOne({
      projectId: project._id,
      consultantId: consultant._id,
      actorType: 'system',
      action,
      description,
      metadata: JSON.stringify(metadata || {}),
      isRead: false,
      readAt: null,
      visibleToClient: false,
      clientIsRead: false,
      clientReadAt: null,
      createdAt: new Date(),
    });
  }

  if (stage === '1') {
    // 25h overdue -> Warning 1
    const deadline = new Date(now - 25 * 60 * 60 * 1000);
    await projectsColl.updateOne(
      { _id: project._id },
      {
        $set: {
          deliveryDeadline: deadline,
          deadlineFlagsCount: 1,
        },
      }
    );

    await logActivity(
      'deadline_flag_1',
      `⚠️ Warning 1 (24h Overdue): Project '${project.title}' passed its committed delivery deadline yesterday. Please deliver Brand DNA promptly to avoid warning escalation and automatic account suspension.`,
      { flagLevel: 1, hoursOverdue: 25, deadline: deadline.toISOString() }
    );

    console.log(`\n✓ SIMULATED WARNING 1: Project '${project.title}' is 25h overdue. Flags = 1`);
    console.log(`👉 Refresh consultant: http://localhost:3000/discovery?projectId=${project._id.toString()}`);
    console.log(`👉 Refresh client:     http://localhost:3000/client/${project.portalToken}\n`);
  } else if (stage === '2') {
    // 49h overdue -> Warning 2
    const deadline = new Date(now - 49 * 60 * 60 * 1000);
    await projectsColl.updateOne(
      { _id: project._id },
      {
        $set: {
          deliveryDeadline: deadline,
          deadlineFlagsCount: 2,
        },
      }
    );

    await logActivity(
      'deadline_flag_2',
      `🚨 Warning 2 (48h Overdue - Urgent): Project '${project.title}' is now 48 hours past its committed delivery deadline. Please deliver Brand DNA immediately to avoid final warning and automatic consultant suspension.`,
      { flagLevel: 2, hoursOverdue: 49, deadline: deadline.toISOString() }
    );

    console.log(`\n✓ SIMULATED WARNING 2: Project '${project.title}' is 49h overdue. Flags = 2`);
    console.log(`👉 Refresh consultant: http://localhost:3000/discovery?projectId=${project._id.toString()}`);
    console.log(`👉 Refresh client:     http://localhost:3000/client/${project.portalToken}\n`);
  } else if (stage === '3') {
    // 73h overdue -> Warning 3 (Final Notice)
    const deadline = new Date(now - 73 * 60 * 60 * 1000);
    await projectsColl.updateOne(
      { _id: project._id },
      {
        $set: {
          deliveryDeadline: deadline,
          deadlineFlagsCount: 3,
        },
      }
    );

    await logActivity(
      'deadline_flag_3',
      `🛑 Warning 3 (72h Overdue - Final Notice): Project '${project.title}' is 72 hours overdue. Your consultant account will be automatically suspended in 24 hours if Brand DNA is not completed.`,
      { flagLevel: 3, hoursOverdue: 73, deadline: deadline.toISOString() }
    );

    console.log(`\n✓ SIMULATED WARNING 3: Project '${project.title}' is 73h overdue. Flags = 3`);
    console.log(`👉 Refresh consultant: http://localhost:3000/discovery?projectId=${project._id.toString()}`);
    console.log(`👉 Refresh client:     http://localhost:3000/client/${project.portalToken}\n`);
  } else if (stage === '4') {
    // 97h overdue -> Automatic Suspension
    const deadline = new Date(now - 97 * 60 * 60 * 1000);
    await projectsColl.updateOne(
      { _id: project._id },
      {
        $set: {
          deliveryDeadline: deadline,
          deadlineFlagsCount: 4,
        },
      }
    );

    await consultantsColl.updateOne(
      { _id: consultant._id },
      {
        $set: {
          isActive: false,
          isSuspended: true,
          suspendedAt: new Date(),
          suspensionReason: `Milestone Deadline Breach (Automatic suspension at 96h overdue, following 3 warnings) for project '${project.title}'`,
          suspendedDueToProjectId: project._id,
        },
        $inc: { tokenVersion: 1 },
      }
    );

    await logActivity(
      'account_suspended_deadline_breach',
      `⛔ Account Suspended (96h Overdue): Consultant account automatically suspended for failing to deliver Brand DNA for '${project.title}' (96 hours overdue, following 3 warnings). Please contact SuperAdmin.`,
      { flagLevel: 4, hoursOverdue: 97, suspendedAt: new Date().toISOString() }
    );

    console.log(`\n✓ SIMULATED AUTOMATIC SUSPENSION: Project '${project.title}' is 97h overdue.`);
    console.log(`Consultant new@gmail.com is now SUSPENDED (isActive: false, isSuspended: true).`);
    console.log(`👉 Consultant UI:  http://localhost:3000/discovery - locked out / suspended error!`);
    console.log(`👉 Login Hotline:  http://localhost:3000/login - reveals Call Admin + Direct Notify!`);
    console.log(`👉 SuperAdmin:     http://localhost:3002/consultants - shows Suspended & Reactivate action!\n`);
  } else if (stage === 'reset') {
    const fiveDaysAhead = new Date(now + 5 * 24 * 60 * 60 * 1000);
    await consultantsColl.updateOne(
      { _id: consultant._id },
      {
        $set: {
          isActive: true,
          isSuspended: false,
          suspendedAt: null,
          suspensionReason: '',
          suspendedDueToProjectId: null,
        },
        $inc: { tokenVersion: 1 },
      }
    );

    await projectsColl.updateOne(
      { _id: project._id },
      {
        $set: {
          deliveryDeadline: fiveDaysAhead,
          deadlineFlagsCount: 0,
        },
      }
    );

    // Clean up simulated warning activities so Timeline starts completely fresh
    await activitiesColl.deleteMany({
      projectId: project._id,
      action: {
        $in: [
          'deadline_flag_1',
          'deadline_flag_2',
          'deadline_flag_3',
          'account_suspended_deadline_breach',
          'reactivation_requested',
        ],
      },
    });

    console.log(`\n✓ RESTORED: Consultant 'new@gmail.com' reactivated, project deadline set to 5 days ahead, and simulated timeline warnings cleared.`);
    console.log(`👉 Refresh http://localhost:3000/discovery?projectId=${project._id.toString()} - Timeline is now completely clean!`);
    console.log(`👉 Log in at http://localhost:3000/login (new@gmail.com / nidhin123)\n`);
  } else {
    console.log('Usage: node simulate.mjs [1 | 2 | 3 | 4 | reset]');
  }

  await mongoose.disconnect();
}

const stageArg = process.argv[2] || 'reset';
simulate(stageArg).catch((err) => {
  console.error(err);
  process.exit(1);
});
