import mongoose from 'mongoose';
import crypto from 'crypto';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/floxa_db';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', MONGO_URI);

  const db = mongoose.connection.db;
  const consultantsColl = db.collection('consultants');
  const projectsColl = db.collection('projects');
  const clientsColl = db.collection('clients');
  const clientProfilesColl = db.collection('client_profiles');
  const discoveriesColl = db.collection('project_discoveries');
  const milestonesColl = db.collection('payment_milestones');
  const activitiesColl = db.collection('project_activities');

  // 1. Ensure consultant new@gmail.com exists and is active
  let consultant = await consultantsColl.findOne({ email: 'new@gmail.com' });
  if (!consultant) {
    console.error('Consultant new@gmail.com not found!');
    process.exit(1);
  }

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
  console.log(`✓ Consultant '${consultant.name}' (${consultant.email}) restored to ACTIVE.`);

  // 2. Create Client
  const clientEmail = `client_${Date.now()}@aurawellness.com`;
  const clientInsert = await clientsColl.insertOne({
    name: 'Sarah Jenkins',
    email: clientEmail,
    companyName: 'Aura Wellness Studio',
    sector: 'Health & Wellness',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const clientId = clientInsert.insertedId;

  // 3. Create Project
  const portalToken = crypto.randomUUID();
  const projectId = new mongoose.Types.ObjectId();
  const now = new Date();
  const fiveDaysAhead = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  await projectsColl.insertOne({
    _id: projectId,
    consultantId: consultant._id,
    clientId: clientId,
    title: 'Aura Brand Identity',
    companyName: 'Aura Wellness Studio',
    sector: 'Health & Wellness',
    projectValue: 3500,
    advancePercentage: 50,
    midPercentage: 25,
    finalPercentage: 25,
    revisionLimit: '3 revisions',
    portalToken,
    portalPasswordHash: '',
    status: 'discovery',
    progress: 25,
    clientSignedOff: false,
    signedOffAt: null,
    clientSubmittedAt: now,
    deliveryDeadline: fiveDaysAhead,
    deadlineSetAt: now,
    deadlineFlagsCount: 0,
    deadlineNote: 'Initial committed delivery deadline for Phase 1 Brand DNA.',
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Create Client Profile
  await clientProfilesColl.insertOne({
    projectId: projectId,
    clientName: 'Sarah Jenkins',
    companyName: 'Aura Wellness Studio',
    email: clientEmail,
    industry: 'Health & Wellness',
    createdAt: now,
    updatedAt: now,
  });

  // 5. Create Payment Milestones
  await milestonesColl.insertMany([
    {
      projectId: projectId,
      type: 'advance',
      percentage: 50,
      amount: 1750,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    },
    {
      projectId: projectId,
      type: 'mid',
      percentage: 25,
      amount: 875,
      status: 'locked',
      createdAt: now,
      updatedAt: now,
    },
    {
      projectId: projectId,
      type: 'final',
      percentage: 25,
      amount: 875,
      status: 'locked',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // 6. Create & Submit Discovery Questionnaire (Client-side submitted)
  const discoveryInsert = await discoveriesColl.insertOne({
    projectId: projectId,
    what_business_does: 'Holistic wellness studio offering sensory therapy, mindful movement, and personalized botanical care.',
    target_customer: 'Urban professionals aged 25-45 seeking grounded mindfulness and rejuvenating sensory experiences.',
    why_choose_us: 'Organic integration of clinical aromatics with bespoke movement spaces and certified therapists.',
    brand_feeling: 'Calm, organic, grounded, premium, minimalist.',
    audience_archetype: 'The Caregiver / The Sage',
    emotions: ['Serenity', 'Clarity', 'Renewal', 'Vitality'],
    competitors: [
      { name: 'Equinox Spa', rating: 'High', reason: 'High-end but corporate and cold.' },
      { name: 'Aesop Wellness', rating: 'Medium', reason: 'Great retail aesthetic, but no physical treatments.' },
    ],
    visual_styles: ['Minimalist Organic', 'Earthy Modern', 'Botanical Neutral'],
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // 7. Log Activity
  await activitiesColl.insertMany([
    {
      projectId: projectId,
      consultantId: consultant._id,
      actorType: 'client',
      action: 'discovery_submitted',
      description: 'Client submitted the discovery questionnaire for Aura Brand Identity.',
      metadata: JSON.stringify({
        discovery_id: discoveryInsert.insertedId.toString(),
        discovery_status: 'complete',
      }),
      isRead: false,
      readAt: null,
      visibleToClient: true,
      clientIsRead: true,
      clientReadAt: now,
      createdAt: now,
    },
    {
      projectId: projectId,
      consultantId: consultant._id,
      actorType: 'consultant',
      action: 'delivery_deadline_set',
      description: "Consultant committed delivery deadline for 'Aura Brand Identity' on 5 days ahead.",
      metadata: JSON.stringify({
        delivery_deadline: fiveDaysAhead.toISOString(),
        note: 'Initial committed delivery deadline for Phase 1 Brand DNA.',
      }),
      isRead: false,
      readAt: null,
      visibleToClient: true,
      clientIsRead: true,
      clientReadAt: now,
      createdAt: now,
    },
  ]);

  console.log('\n======================================================');
  console.log('✅ FRESH TEST PROJECT SUCCESSFULLY CREATED & SUBMITTED!');
  console.log('======================================================');
  console.log(`Project ID:        ${projectId.toString()}`);
  console.log(`Project Title:     Aura Brand Identity`);
  console.log(`Client Submitted:  ${now.toISOString()}`);
  console.log(`Committed Deadline:${fiveDaysAhead.toISOString()} (Active, On-Track)`);
  console.log(`Portal Token:      ${portalToken}`);
  console.log('------------------------------------------------------');
  console.log('🌐 LOCAL ACCESS URLS:');
  console.log(`👉 Consultant Discovery: http://localhost:3000/discovery?projectId=${projectId.toString()}`);
  console.log(`👉 Client Portal:        http://localhost:3000/client/${portalToken}`);
  console.log(`👉 Consultant All-Proj:  http://localhost:3000/projects`);
  console.log(`👉 SuperAdmin Panel:     http://localhost:3002/consultants`);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error creating test project:', err);
  process.exit(1);
});
