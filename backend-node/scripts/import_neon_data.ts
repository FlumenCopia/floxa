import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client.js';

interface NeonExport {
  consultants: any[];
  projects_client: any[];
  projects_project: any[];
  projects_clientprofile: any[];
  projects_projectdiscovery: any[];
  projects_discoverysliderresponse: any[];
  projects_discoveryemotion: any[];
  projects_discoverycompetitor: any[];
  projects_discoveryvisualstyle: any[];
  projects_branddna: any[];
  projects_moodboard: any[];
  projects_concept: any[];
  projects_deliverable: any[];
  projects_projectagreement: any[];
  projects_projectagreementappendix: any[];
  projects_generatedagreementsnapshot: any[];
  projects_paymentmilestone: any[];
  projects_paymenttransaction: any[];
  projects_razorpaywebhookevent: any[];
  projects_projectactivity: any[];
}

function safeDate(val: any): Date {
  if (!val) return new Date();
  const d = new Date(val);
  if (isNaN(d.getTime())) return new Date();
  if (d.getFullYear() < 1970 || d.getFullYear() > 2100) return new Date();
  return d;
}

function safeDateOrNull(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() < 1970 || d.getFullYear() > 2100) return null;
  return d;
}

async function importData() {
  const filePath = path.resolve(process.cwd(), 'data/neon_export.json');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const data: NeonExport = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log('Loaded neon_export.json successfully');

  // ID Maps (Postgres int ID -> MongoDB ObjectId)
  const consultantMap = new Map<number, string>();
  const clientMap = new Map<number, string>();
  const projectMap = new Map<number, string>();
  const milestoneMap = new Map<number, string>();

  // 1. Consultants
  console.log(`Importing ${data.consultants.length} consultants...`);
  let importedConsultants = 0;
  for (const c of data.consultants) {
    try {
      const email = (c.email || '').toLowerCase().trim();
      if (!email) continue;

      const existing = await prisma.consultant.findUnique({ where: { email } });
      if (existing) {
        consultantMap.set(c.id, existing.id);
      } else {
        const created = await prisma.consultant.create({
          data: {
            email,
            password: c.password || '',
            name: c.name || '',
            company: c.company || '',
            phone: c.phone || '',
            avatar: c.avatar || null,
            isActive: c.is_active ?? true,
            isStaff: c.is_staff ?? false,
            createdAt: safeDate(c.created_at),
            updatedAt: safeDate(c.updated_at),
          },
        });
        consultantMap.set(c.id, created.id);
        importedConsultants++;
      }
    } catch (err) {
      console.error(`Error importing consultant ${c.email}:`, err);
    }
  }
  console.log(`Imported ${importedConsultants} new consultants (total mapped: ${consultantMap.size})`);

  // 2. Clients
  console.log(`Importing ${data.projects_client.length} clients...`);
  let importedClients = 0;
  for (const cl of data.projects_client) {
    try {
      const created = await prisma.client.create({
        data: {
          name: cl.name || '',
          email: cl.email || '',
          companyName: cl.company_name || '',
          sector: cl.sector || '',
          createdAt: safeDate(cl.created_at),
          updatedAt: safeDate(cl.updated_at),
        },
      });
      clientMap.set(cl.id, created.id);
      importedClients++;
    } catch (err) {
      console.error(`Error importing client ${cl.id}:`, err);
    }
  }
  console.log(`Imported ${importedClients} clients (total mapped: ${clientMap.size})`);

  // 3. Projects
  console.log(`Importing ${data.projects_project.length} projects...`);
  let importedProjects = 0;
  for (const p of data.projects_project) {
    try {
      const consultantId = consultantMap.get(p.consultant_id);
      const clientId = clientMap.get(p.client_id);
      if (!consultantId || !clientId) {
        continue;
      }

      const validStatuses = ['created', 'discovery', 'advance_paid', 'concepts', 'delivered', 'archived'];
      const status = validStatuses.includes(p.status) ? p.status : 'created';

      const existing = await prisma.project.findUnique({ where: { portalToken: p.portal_token } });
      if (existing) {
        projectMap.set(p.id, existing.id);
      } else {
        const created = await prisma.project.create({
          data: {
            consultantId,
            clientId,
            title: p.title || 'Untitled Project',
            companyName: p.company_name || '',
            sector: p.sector || '',
            status: status as any,
            projectValue: parseFloat(p.project_value) || 0,
            advancePercentage: p.advance_percentage || 50,
            midPercentage: p.mid_percentage || 25,
            finalPercentage: p.final_percentage || 25,
            revisionLimit: p.revision_limit || '3 revisions',
            portalToken: p.portal_token,
            portalPasswordHash: p.portal_password_hash || '',
            progress: p.progress || 0,
            clientSignedOff: p.client_signed_off || false,
            signedOffAt: safeDateOrNull(p.signed_off_at),
            isArchived: p.is_archived || false,
            createdAt: safeDate(p.created_at),
            updatedAt: safeDate(p.updated_at),
          },
        });
        projectMap.set(p.id, created.id);
        importedProjects++;
      }
    } catch (err) {
      console.error(`Error importing project ${p.id}:`, err);
    }
  }
  console.log(`Imported ${importedProjects} projects (total mapped: ${projectMap.size})`);

  // 4. Client Profiles
  console.log(`Importing ${data.projects_clientprofile.length} client profiles...`);
  for (const cp of data.projects_clientprofile) {
    try {
      const projectId = projectMap.get(cp.project_id);
      if (!projectId) continue;

      await prisma.clientProfile.upsert({
        where: { projectId },
        update: {},
        create: {
          projectId,
          clientName: cp.client_name || '',
          companyName: cp.company_name || '',
          industry: cp.industry || '',
          yearStarted: cp.year_started || null,
          location: cp.location || '',
          phone: cp.phone || '',
          email: cp.email || '',
          website: cp.website || '',
          createdAt: safeDate(cp.created_at),
          updatedAt: safeDate(cp.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing client profile for project ${cp.project_id}:`, err);
    }
  }

  // 5. Discoveries with embedded Sliders, Emotions, Competitors, Visual Styles
  console.log(`Importing ${data.projects_projectdiscovery.length} discoveries with embedded subdocuments...`);
  for (const d of data.projects_projectdiscovery) {
    try {
      const projectId = projectMap.get(d.project_id);
      if (!projectId) continue;

      const sliders = data.projects_discoverysliderresponse
        .filter((s) => s.discovery_id === d.id)
        .map((s) => ({
          sliderKey: s.slider_key || '',
          leftLabel: s.left_label || '',
          rightLabel: s.right_label || '',
          value: s.value || 50,
        }));

      const emotions = data.projects_discoveryemotion
        .filter((e) => e.discovery_id === d.id)
        .map((e) => e.emotion)
        .filter(Boolean);

      const competitors = data.projects_discoverycompetitor
        .filter((c) => c.discovery_id === d.id)
        .map((c) => ({
          name: c.name || '',
          rating: c.rating || 'neutral',
          reason: c.reason || '',
        }));

      const visualStyles = data.projects_discoveryvisualstyle
        .filter((v) => v.discovery_id === d.id)
        .map((v) => v.style)
        .filter(Boolean);

      await prisma.projectDiscovery.upsert({
        where: { projectId },
        update: {},
        create: {
          projectId,
          whatBusinessDoes: d.what_business_does || '',
          targetCustomer: d.target_customer || '',
          whyChooseUs: d.why_choose_us || '',
          brandFeeling: d.brand_feeling || '',
          audienceArchetype: d.audience_archetype || '',
          submittedAt: safeDateOrNull(d.submitted_at),
          sliders,
          emotions,
          competitors,
          visualStyles,
          createdAt: safeDate(d.created_at),
          updatedAt: safeDate(d.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing discovery for project ${d.project_id}:`, err);
    }
  }

  // 6. Brand DNA
  console.log(`Importing ${data.projects_branddna.length} Brand DNAs...`);
  for (const b of data.projects_branddna) {
    try {
      const projectId = projectMap.get(b.project_id);
      if (!projectId) continue;

      await prisma.brandDNA.upsert({
        where: { projectId },
        update: {},
        create: {
          projectId,
          brandPersonalityCluster: b.brand_personality_cluster || '',
          businessSummary: b.business_summary || '',
          targetAudienceSummary: b.target_audience_summary || '',
          positioningSummary: b.positioning_summary || '',
          brandFeelingSummary: b.brand_feeling_summary || '',
          visualDirectionSummary: b.visual_direction_summary || '',
          competitorSummary: b.competitor_summary || '',
          generatedFromDiscovery: b.generated_from_discovery ?? true,
          createdAt: safeDate(b.created_at),
          updatedAt: safeDate(b.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing brand DNA for project ${b.project_id}:`, err);
    }
  }

  // 7. Moodboards
  console.log(`Importing ${data.projects_moodboard.length} moodboards...`);
  for (const m of data.projects_moodboard) {
    try {
      const projectId = projectMap.get(m.project_id);
      if (!projectId) continue;

      await prisma.moodboard.create({
        data: {
          projectId,
          title: m.title || 'Moodboard',
          description: m.description || '',
          image: m.image || '',
          isSelected: m.is_selected ?? false,
          isShared: m.is_shared ?? true,
          createdAt: safeDate(m.created_at),
          updatedAt: safeDate(m.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing moodboard for project ${m.project_id}:`, err);
    }
  }

  // 8. Concepts
  console.log(`Importing ${data.projects_concept.length} concepts...`);
  for (const c of data.projects_concept) {
    try {
      const projectId = projectMap.get(c.project_id);
      if (!projectId) continue;

      const validStatuses = ['draft', 'shared', 'approved', 'changes_requested'];
      const status = validStatuses.includes(c.status) ? c.status : 'draft';

      await prisma.concept.create({
        data: {
          projectId,
          title: c.title || 'Concept',
          description: c.description || '',
          image: c.image || null,
          file: c.file || null,
          version: c.version || 1,
          status: status as any,
          clientFeedback: c.client_feedback || '',
          createdAt: safeDate(c.created_at),
          updatedAt: safeDate(c.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing concept for project ${c.project_id}:`, err);
    }
  }

  // 9. Deliverables
  console.log(`Importing ${data.projects_deliverable.length} deliverables...`);
  for (const d of data.projects_deliverable) {
    try {
      const projectId = projectMap.get(d.project_id);
      if (!projectId) continue;

      const status = d.status === 'shared' ? 'shared' : 'draft';

      await prisma.deliverable.create({
        data: {
          projectId,
          title: d.title || 'Deliverable',
          description: d.description || '',
          file: d.file || '',
          status: status as any,
          createdAt: safeDate(d.created_at),
          updatedAt: safeDate(d.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing deliverable for project ${d.project_id}:`, err);
    }
  }

  // 10. Project Agreements with embedded Appendices
  console.log(`Importing ${data.projects_projectagreement.length} project agreements...`);
  for (const a of data.projects_projectagreement) {
    try {
      const projectId = projectMap.get(a.project_id);
      if (!projectId) continue;

      const appendices = data.projects_projectagreementappendix
        .filter((app) => app.agreement_id === a.id)
        .map((app) => ({
          eventType: app.event_type || '',
          eventKey: app.event_key || '',
          title: app.title || '',
          content: typeof app.content === 'string' ? app.content : JSON.stringify(app.content || {}),
          sourceActivityId: null,
          pdfPageNumber: app.pdf_page_number || null,
          createdAt: safeDate(app.created_at),
        }));

      const validStatuses = ['draft', 'shared', 'signature_requested', 'signed', 'active', 'completed'];
      const status = validStatuses.includes(a.status) ? a.status : 'draft';

      await prisma.projectAgreement.upsert({
        where: { projectId },
        update: {},
        create: {
          projectId,
          status: status as any,
          basicPdfFile: a.basic_pdf_file || '',
          originalSignedPdfFile: a.original_signed_pdf_file || '',
          signedPdfFile: a.signed_pdf_file || '',
          generatedAt: safeDateOrNull(a.generated_at),
          sharedAt: safeDateOrNull(a.shared_at),
          signatureRequestedAt: safeDateOrNull(a.signature_requested_at),
          signatureRequestEmailFailedAt: safeDateOrNull(a.signature_request_email_failed_at),
          signatureRequestEmailError: a.signature_request_email_error || '',
          signedAt: safeDateOrNull(a.signed_at),
          signedEmailFailedAt: safeDateOrNull(a.signed_email_failed_at),
          signedEmailError: a.signed_email_error || '',
          signerName: a.signer_name || '',
          signatureMethod: ['typed', 'drawn', 'uploaded'].includes(a.signature_method) ? a.signature_method : null,
          signatureImage: a.signature_image || null,
          signatureMetadata: typeof a.signature_metadata === 'string' ? a.signature_metadata : JSON.stringify(a.signature_metadata || {}),
          appendices,
          createdAt: safeDate(a.created_at),
          updatedAt: safeDate(a.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing agreement for project ${a.project_id}:`, err);
    }
  }

  // 11. Payment Milestones
  console.log(`Importing ${data.projects_paymentmilestone.length} payment milestones...`);
  for (const m of data.projects_paymentmilestone) {
    try {
      const projectId = projectMap.get(m.project_id);
      if (!projectId) continue;

      const validTypes = ['advance', 'mid', 'final'];
      const type = validTypes.includes(m.type) ? m.type : 'advance';

      const validStatuses = ['locked', 'ready', 'requested', 'paid'];
      const status = validStatuses.includes(m.status) ? m.status : 'locked';

      const existing = await prisma.paymentMilestone.findUnique({
        where: { projectId_type: { projectId, type: type as any } },
      });

      if (existing) {
        milestoneMap.set(m.id, existing.id);
      } else {
        const created = await prisma.paymentMilestone.create({
          data: {
            projectId,
            type: type as any,
            percentage: m.percentage || 0,
            amount: parseFloat(m.amount) || 0,
            status: status as any,
            requestedAt: safeDateOrNull(m.requested_at),
            paidAt: safeDateOrNull(m.paid_at),
            createdAt: safeDate(m.created_at),
            updatedAt: safeDate(m.updated_at),
          },
        });
        milestoneMap.set(m.id, created.id);
      }
    } catch (err) {
      console.error(`Error importing milestone ${m.id}:`, err);
    }
  }

  // 12. Payment Transactions
  console.log(`Importing ${data.projects_paymenttransaction.length} payment transactions...`);
  for (const t of data.projects_paymenttransaction) {
    try {
      const projectId = projectMap.get(t.project_id);
      const milestoneId = milestoneMap.get(t.milestone_id);
      if (!projectId || !milestoneId) continue;

      const validStatuses = ['created', 'verified', 'failed', 'cancelled'];
      const status = validStatuses.includes(t.status) ? t.status : 'created';

      await prisma.paymentTransaction.upsert({
        where: { razorpayOrderId: t.razorpay_order_id },
        update: {},
        create: {
          projectId,
          milestoneId,
          razorpayOrderId: t.razorpay_order_id,
          razorpayPaymentId: t.razorpay_payment_id || null,
          amount: parseFloat(t.amount) || 0,
          currency: t.currency || 'INR',
          status: status as any,
          failureReason: t.failure_reason || '',
          verifiedAt: safeDateOrNull(t.verified_at),
          createdAt: safeDate(t.created_at),
          updatedAt: safeDate(t.updated_at),
        },
      });
    } catch (err) {
      console.error(`Error importing payment transaction ${t.id}:`, err);
    }
  }

  // 13. Project Activities
  console.log(`Importing ${data.projects_projectactivity.length} project activities...`);
  for (const act of data.projects_projectactivity) {
    try {
      const projectId = projectMap.get(act.project_id);
      const consultantId = consultantMap.get(act.consultant_id);
      if (!projectId || !consultantId) continue;

      const validActors = ['client', 'consultant', 'system'];
      const actorType = validActors.includes(act.actor_type) ? act.actor_type : 'system';

      await prisma.projectActivity.create({
        data: {
          projectId,
          consultantId,
          actorType: actorType as any,
          action: act.action || '',
          description: act.description || '',
          metadata: typeof act.metadata === 'string' ? act.metadata : JSON.stringify(act.metadata || {}),
          isRead: act.is_read ?? false,
          readAt: safeDateOrNull(act.read_at),
          visibleToClient: act.visible_to_client ?? false,
          clientIsRead: act.client_is_read ?? false,
          clientReadAt: safeDateOrNull(act.client_read_at),
          createdAt: safeDate(act.created_at),
        },
      });
    } catch (err) {
      console.error(`Error importing activity ${act.id}:`, err);
    }
  }

  console.log('✅ ALL PRODUCTION DATA SUCCESSFULLY IMPORTED INTO MONGODB!');
}

importData()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
