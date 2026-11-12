import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import { resolveSafeMediaPath } from './storage.service.js';

export async function generateBasicAgreementPdf(project: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    // Document Title
    doc.fontSize(22).font('Helvetica-Bold').text('PROJECT SERVICES AGREEMENT', { align: 'center' });
    doc.moveDown(1.5);

    // Metadata
    doc.fontSize(12).font('Helvetica');
    doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
    doc.text(`Project: ${project.title}`);
    doc.text(`Client Company: ${project.companyName || project.client?.companyName}`);
    doc.text(`Sector: ${project.sector}`);
    doc.moveDown(1.5);

    // Section 1: Scope of Work
    doc.fontSize(14).font('Helvetica-Bold').text('1. SCOPE OF SERVICES');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(
      `The Consultant agrees to provide brand clarity, identity design, and creative consulting services for ${project.title}. ` +
      `Services include discovery analysis, brand positioning, moodboards, identity concepts, and agreed deliverables.`
    );
    doc.moveDown(1);

    // Section 2: Compensation & Payment Terms
    doc.fontSize(14).font('Helvetica-Bold').text('2. INVESTMENT & PAYMENT TERMS');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Project Value: Rs ${project.projectValue?.toLocaleString('en-IN') || 0}`);
    doc.text(`- Advance Milestone: ${project.advancePercentage}% upon signing of this agreement.`);
    doc.text(`- Mid Milestone: ${project.midPercentage}% upon concept approval.`);
    doc.text(`- Final Milestone: ${project.finalPercentage}% upon delivery of final assets.`);
    doc.moveDown(1);

    // Section 3: Revisions & Sign-off
    doc.fontSize(14).font('Helvetica-Bold').text('3. REVISIONS & COMPLETION');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(
      `Deliverables include up to ${project.revisionLimit || '3 revisions'}. ` +
      `Upon final payment and client sign-off, all intellectual property rights in approved final assets are transferred to the Client.`
    );
    doc.moveDown(2);

    // Signatures placeholder
    doc.fontSize(12).font('Helvetica-Bold').text('CONFIRMED AND AGREED:');
    doc.moveDown(2);

    const startY = doc.y;
    doc.fontSize(10).font('Helvetica');
    doc.text('_____________________________', 50, startY);
    doc.text('For the Consultant', 50, startY + 15);
    doc.text(project.consultant?.name || 'Consultant', 50, startY + 30);

    doc.text('_____________________________', 350, startY);
    doc.text('For the Client', 350, startY + 15);
    doc.text(project.client?.name || project.companyName || 'Client Representative', 350, startY + 30);

    doc.end();
  });
}

export async function generateSignedAgreementPdf(
  project: any,
  agreement: any,
  signatureData: {
    signerName: string;
    signatureMethod: string;
    signatureImageBuffer?: Buffer;
    signedAt: Date;
    ipAddress?: string;
  }
): Promise<{ pdfBuffer: Buffer; sha256Hash: string }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const fullBuffer = Buffer.concat(buffers);
      const hash = crypto.createHash('sha256').update(fullBuffer).digest('hex');
      resolve({ pdfBuffer: fullBuffer, sha256Hash: hash });
    });
    doc.on('error', (err) => reject(err));

    // Page 1: Agreement Content
    doc.fontSize(20).font('Helvetica-Bold').text('EXECUTED SERVICES AGREEMENT', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11).font('Helvetica');
    doc.text(`Agreement Reference: ${project.portalToken}`);
    doc.text(`Project Title: ${project.title}`);
    doc.text(`Client Company: ${project.companyName}`);
    doc.text(`Execution Date: ${signatureData.signedAt.toUTCString()}`);
    doc.moveDown(1.5);

    doc.fontSize(13).font('Helvetica-Bold').text('Terms & Compensation');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Agreed Value: Rs ${project.projectValue?.toLocaleString('en-IN') || 0}`);
    doc.text(`Milestone Schedule: ${project.advancePercentage}% Advance / ${project.midPercentage}% Mid / ${project.finalPercentage}% Final`);
    doc.text(`Revision Allowance: ${project.revisionLimit || '3 revisions'}`);
    doc.moveDown(2);

    // Digital Signature Certificate Block
    doc.rect(50, doc.y, 500, 150).stroke('#10b981');
    const boxY = doc.y + 15;

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#065f46').text('DIGITAL SIGNATURE CERTIFICATE', 70, boxY);
    doc.fillColor('#000000').fontSize(10).font('Helvetica');
    doc.text(`Signer Name: ${signatureData.signerName}`, 70, boxY + 25);
    doc.text(`Signature Method: ${signatureData.signatureMethod.toUpperCase()}`, 70, boxY + 40);
    doc.text(`Timestamp: ${signatureData.signedAt.toISOString()}`, 70, boxY + 55);
    if (signatureData.ipAddress) {
      doc.text(`Signer IP: ${signatureData.ipAddress}`, 70, boxY + 70);
    }

    if (signatureData.signatureImageBuffer) {
      try {
        doc.image(signatureData.signatureImageBuffer, 350, boxY + 15, { width: 150, height: 60, fit: [150, 60] });
      } catch (imgErr) {
        doc.text(`[Digital Signature: ${signatureData.signerName}]`, 350, boxY + 30);
      }
    } else {
      doc.fontSize(16).font('Helvetica-Oblique').fillColor('#1e40af').text(signatureData.signerName, 350, boxY + 30);
      doc.fillColor('#000000');
    }

    // Page 2: Evidence and Appendices Audit Trail (if any)
    if (agreement.appendices && agreement.appendices.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('APPENDIX: PROJECT AUDIT TRAIL', { align: 'center' });
      doc.moveDown(1.5);

      agreement.appendices.forEach((app: any, index: number) => {
        doc.fontSize(11).font('Helvetica-Bold').text(`${index + 1}. ${app.title} (${app.eventType})`);
        doc.fontSize(9).font('Helvetica').text(`Recorded: ${new Date(app.createdAt).toUTCString()}`);
        if (app.content) {
          doc.fontSize(8).font('Courier').text(typeof app.content === 'string' ? app.content : JSON.stringify(app.content));
        }
        doc.moveDown(1);
      });
    }

    doc.end();
  });
}

export async function generateGeneratedAgreementPdf(snapshot: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, autoFirstPage: true, compress: false });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const renderSectionHeader = (title: string) => {
      doc.moveDown(0.8);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827').text(title.toUpperCase());
      doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(9).fillColor('#374151');
    };

    const renderKeyValue = (label: string, value: any) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1f2937').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(value ? String(value) : '-');
    };

    // Header banner
    const isAccepted = snapshot.status === 'accepted';
    doc.rect(50, 45, 500, 40).fill(isAccepted ? '#ecfdf5' : '#f3f4f6');
    doc.fillColor(isAccepted ? '#065f46' : '#1f2937').fontSize(15).font('Helvetica-Bold')
      .text('FLOXA GENERATED AGREEMENT', 65, 55);
    doc.fontSize(10).font('Helvetica')
      .text(`Status: ${(snapshot.status || 'draft').toUpperCase()} | Version: ${snapshot.version || 1}`, 360, 58, { align: 'right', width: 175 });

    doc.y = 95;
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica');
    doc.text(`Generated at: ${snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleString('en-US') : '-'}`);
    if (snapshot.pdf_generated_at) {
      doc.text(`PDF Generated at: ${new Date(snapshot.pdf_generated_at).toLocaleString('en-US')}`);
    }
    if (snapshot.accepted_at) {
      doc.fillColor('#059669').font('Helvetica-Bold')
        .text(`Accepted at: ${new Date(snapshot.accepted_at).toLocaleString('en-US')}`);
    }

    // Section: Project and Client
    const project = snapshot.project || {};
    const client = snapshot.client || {};
    renderSectionHeader('Project and Client');
    renderKeyValue('Project', project.title || project.company_name);
    renderKeyValue('Company', project.company_name || client.company_name);
    renderKeyValue('Sector / Industry', project.sector || client.industry);
    renderKeyValue('Project Value', project.project_value ? `Rs ${project.project_value}` : '-');
    renderKeyValue('Client Name', client.name);
    renderKeyValue('Client Email', client.email);
    if (client.phone) renderKeyValue('Client Phone', client.phone);
    if (client.website) renderKeyValue('Client Website', client.website);

    // Section: Consultant
    const consultant = snapshot.consultant || {};
    renderSectionHeader('Consultant');
    renderKeyValue('Name', consultant.name);
    renderKeyValue('Email', consultant.email);
    if (consultant.company) renderKeyValue('Company', consultant.company);

    // Section: Discovery Summary
    const discovery = snapshot.discovery || {};
    renderSectionHeader('Discovery Summary');
    renderKeyValue('What the business does', discovery.what_business_does);
    renderKeyValue('Target customer', discovery.target_customer);
    renderKeyValue('Why choose us', discovery.why_choose_us);
    renderKeyValue('Brand feeling', discovery.brand_feeling);
    renderKeyValue('Audience archetype', discovery.audience_archetype);
    if (Array.isArray(discovery.emotions) && discovery.emotions.length > 0) {
      renderKeyValue('Emotions', discovery.emotions.join(', '));
    }
    if (Array.isArray(discovery.visual_styles) && discovery.visual_styles.length > 0) {
      renderKeyValue('Visual Styles', discovery.visual_styles.join(', '));
    }

    // Section: Brand DNA Summary
    const brandDna = snapshot.brand_dna || {};
    renderSectionHeader('Brand DNA Summary');
    renderKeyValue('Personality Cluster', brandDna.personality_cluster);
    renderKeyValue('Business Summary', brandDna.business_summary);
    renderKeyValue('Target Audience', brandDna.target_audience_summary);
    renderKeyValue('Positioning', brandDna.positioning_summary);
    renderKeyValue('Brand Feeling', brandDna.brand_feeling_summary);
    renderKeyValue('Visual Direction', brandDna.visual_direction_summary);
    renderKeyValue('Competitors', brandDna.competitor_summary);

    // Section: Selected Moodboard
    const moodboard = snapshot.selected_moodboard || {};
    renderSectionHeader('Selected Moodboard');
    renderKeyValue('Title', moodboard.title);
    renderKeyValue('Description', moodboard.description);
    renderKeyValue('Selected at', moodboard.selected_at ? new Date(moodboard.selected_at).toLocaleString('en-US') : '-');

    // Section: Approved Concepts
    const approvedConcepts = snapshot.approved_concepts || [];
    renderSectionHeader('Approved Concepts');
    if (approvedConcepts.length === 0) {
      doc.text('No approved concepts recorded.');
    } else {
      approvedConcepts.forEach((c: any, i: number) => {
        doc.font('Helvetica-Bold').text(`${i + 1}. ${c.title || 'Concept'} (v${c.version || 1}) - ${c.status || 'approved'}`);
        if (c.approved_at) renderKeyValue('   Approved at', new Date(c.approved_at).toLocaleString('en-US'));
        if (c.feedback) renderKeyValue('   Client feedback', c.feedback);
        if (c.description) renderKeyValue('   Description', c.description);
        doc.moveDown(0.2);
      });
    }

    // Section: Requested Concept Revisions
    const requestedRevisions = snapshot.requested_concept_revisions || [];
    if (requestedRevisions.length > 0) {
      renderSectionHeader('Requested Concept Revisions');
      requestedRevisions.forEach((c: any, i: number) => {
        doc.font('Helvetica-Bold').text(`${i + 1}. ${c.title || 'Concept'} (v${c.version || 1})`);
        if (c.feedback) renderKeyValue('   Requested Changes', c.feedback);
        doc.moveDown(0.2);
      });
    }

    // Section: Approval Evidence Timeline
    const timeline = snapshot.approval_evidence_timeline || [];
    renderSectionHeader('Approval Evidence Timeline');
    if (timeline.length === 0) {
      doc.text('No activity evidence recorded.');
    } else {
      timeline.forEach((item: any) => {
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('en-US') : '-';
        doc.font('Helvetica-Bold').fontSize(8).text(`${dateStr} | ${item.action || '-'}`, { continued: true });
        doc.font('Helvetica').fontSize(8).text(` - ${item.description || ''}`);
      });
    }

    // Section: Payment Schedule
    const payments = snapshot.payment_milestones || [];
    renderSectionHeader('Payment Schedule');
    if (payments.length === 0) {
      doc.text('No payment schedule defined.');
    } else {
      payments.forEach((p: any) => {
        const typeLabel = (p.type || '').toUpperCase();
        renderKeyValue(`${typeLabel} Milestone`, `${p.percentage}% | Amount: Rs ${p.amount || 0} | Status: ${(p.status || 'pending').toUpperCase()}`);
      });
    }

    // Section: Expected Deliverables
    const deliverables = snapshot.expected_deliverables || [];
    renderSectionHeader('Expected Deliverables');
    if (deliverables.length === 0) {
      doc.text('No deliverables listed.');
    } else {
      deliverables.forEach((d: any, i: number) => {
        doc.font('Helvetica-Bold').text(`${i + 1}. ${d.title || 'Deliverable'} [${(d.status || 'pending').toUpperCase()}]`);
        if (d.description) renderKeyValue('   Details', d.description);
      });
    }

    doc.end();
  });
}

interface BrandThemeToken {
  role: string;
  name: string;
  hex: string;
}

interface ProjectBrandTheme {
  dominant60: BrandThemeToken;
  secondary30: BrandThemeToken;
  accent10: BrandThemeToken;
  cluster: string;
  isDark: boolean;
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  tableHeaderBg: string;
  textHeading: string;
  textBody: string;
  textMuted: string;
  divider: string;
}

function sanitizeHex(hex: string | undefined, fallback: string): string {
  if (!hex || typeof hex !== 'string') return fallback;
  const clean = hex.trim();
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(clean)) return clean;
  return fallback;
}

function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6 && clean.length !== 3) return true;
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 140;
}

function buildBrandThemeTokens(
  dominant: BrandThemeToken,
  secondary: BrandThemeToken,
  accent: BrandThemeToken,
  cluster: string
): ProjectBrandTheme {
  const isDark = isColorDark(dominant.hex);
  if (isDark) {
    return {
      dominant60: dominant,
      secondary30: secondary,
      accent10: accent,
      cluster,
      isDark: true,
      pageBg: dominant.hex,
      cardBg: secondary.hex,
      cardBorder: secondary.hex,
      tableHeaderBg: secondary.hex,
      textHeading: '#FFFFFF',
      textBody: '#E2E8F0',
      textMuted: '#94A3B8',
      divider: secondary.hex,
    };
  } else {
    return {
      dominant60: dominant,
      secondary30: secondary,
      accent10: accent,
      cluster,
      isDark: false,
      pageBg: dominant.hex,
      cardBg: '#FFFFFF',
      cardBorder: secondary.hex,
      tableHeaderBg: secondary.hex,
      textHeading: '#0F172A',
      textBody: '#334155',
      textMuted: '#64748B',
      divider: secondary.hex,
    };
  }
}

function calculateDiscoveryCluster(sliders: any[] = []): string {
  if (!sliders || sliders.length === 0) return 'Balanced Clarity';
  const scores = sliders.map((s: any) => (((s.value || 50) / 100) * 6 - 3));
  const avg = scores.reduce((sum: number, v: number) => sum + v, 0) / scores.length;
  if (avg < -1.5) return 'Soft Minimalist';
  if (avg < -0.4) return 'Quiet Specialist';
  if (avg < 0.8) return 'Balanced Clarity';
  if (avg < 2.1) return 'Bold Challenger';
  return 'Electric Leader';
}

function extractProjectBrandTheme(project: any): ProjectBrandTheme {
  const dna = project.brandDNA || {};
  const discovery = project.discovery || {};

  const palette = Array.isArray(dna.colorPalette) && dna.colorPalette.length > 0 ? dna.colorPalette : null;

  if (palette) {
    const dominantItem =
      palette.find((p: any) => p.role && (p.role.includes('60') || p.role.toLowerCase().includes('dominant'))) ||
      palette[0];
    const secondaryItem =
      palette.find((p: any) => p.role && (p.role.includes('30') || p.role.toLowerCase().includes('secondary'))) ||
      palette[1] ||
      palette[0];
    const accentItem =
      palette.find((p: any) => p.role && (p.role.includes('10') || p.role.toLowerCase().includes('accent'))) ||
      palette[2] ||
      palette[palette.length - 1];

    const cluster = dna.brandPersonalityCluster || 'Defensible Identity';
    const domToken = {
      role: 'Dominant (60%)',
      name: dominantItem?.name || 'Primary Brand Tone',
      hex: sanitizeHex(dominantItem?.hex, '#0A1912'),
    };
    const secToken = {
      role: 'Secondary (30%)',
      name: secondaryItem?.name || 'Structural Depth Tone',
      hex: sanitizeHex(secondaryItem?.hex, '#163325'),
    };
    const accToken = {
      role: 'Accent (10%)',
      name: accentItem?.name || 'Kinetic Focal Accent',
      hex: sanitizeHex(accentItem?.hex, '#34D399'),
    };
    return buildBrandThemeTokens(domToken, secToken, accToken, cluster);
  }

  const cluster = dna.brandPersonalityCluster || (discovery.sliders ? calculateDiscoveryCluster(discovery.sliders) : 'Balanced Clarity');

  switch (cluster) {
    case 'Electric Leader':
      return buildBrandThemeTokens(
        { role: 'Dominant (60%)', name: 'Deep Void Obsidian', hex: '#060E0A' },
        { role: 'Secondary (30%)', name: 'Emerald Slate', hex: '#132A1E' },
        { role: 'Accent (10%)', name: 'Neon Hypergreen', hex: '#10B981' },
        cluster
      );
    case 'Soft Minimalist':
      return buildBrandThemeTokens(
        { role: 'Dominant (60%)', name: 'Warm Alabaster', hex: '#F7F5F0' },
        { role: 'Secondary (30%)', name: 'Muted Sage Slate', hex: '#89ACA0' },
        { role: 'Accent (10%)', name: 'Forest Deep', hex: '#0A1912' },
        cluster
      );
    case 'Quiet Specialist':
      return buildBrandThemeTokens(
        { role: 'Dominant (60%)', name: 'Deep Navy Charcoal', hex: '#0B1320' },
        { role: 'Secondary (30%)', name: 'Slate Quartz', hex: '#1E293B' },
        { role: 'Accent (10%)', name: 'Precision Cyan', hex: '#0284C7' },
        cluster
      );
    case 'Bold Challenger':
      return buildBrandThemeTokens(
        { role: 'Dominant (60%)', name: 'Carbon Black', hex: '#0A0D12' },
        { role: 'Secondary (30%)', name: 'Deep Slate Forest', hex: '#1C2E24' },
        { role: 'Accent (10%)', name: 'Kinetic Emerald', hex: '#059669' },
        cluster
      );
    case 'Balanced Clarity':
    default:
      return buildBrandThemeTokens(
        { role: 'Dominant (60%)', name: 'Emerald Obsidian', hex: '#0A1912' },
        { role: 'Secondary (30%)', name: 'Mineral Forest', hex: '#163325' },
        { role: 'Accent (10%)', name: 'Vibrant Mint', hex: '#34D399' },
        cluster || 'Balanced Clarity'
      );
  }
}

export async function generateBrandDeliverablesPdf(project: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      autoFirstPage: true,
      bufferPages: true,
      size: 'A4',
    });
    const buffers: Buffer[] = [];

    // Extract dynamic 60-30-10 brand theme from client Discovery & Brand DNA
    const theme = extractProjectBrandTheme(project);

    // Full-bleed page background renderer
    const drawPageBg = () => {
      const curX = doc.x;
      const curY = doc.y;
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.pageBg);
      doc.restore();
      doc.x = curX;
      doc.y = curY;
    };

    drawPageBg();
    doc.on('pageAdded', drawPageBg);

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      try {
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);

          // Running header on page 2 and later
          if (i > range.start) {
            doc.rect(40, 16, 515, 18).fill(theme.cardBg);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(theme.textHeading)
              .text(`${companyName.toUpperCase()}   |   OFFICIAL BRAND DELIVERABLES`, 50, 21);
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(theme.accent10.hex)
              .text('CONFIDENTIAL SPECIFICATION', 50, 21, { align: 'right', width: 495 });
            doc.strokeColor(theme.divider).lineWidth(1).moveTo(40, 34).lineTo(555, 34).stroke();
          }

          // Bottom footer on all pages
          doc.font('Helvetica').fontSize(8).fillColor(theme.textMuted);
          doc.text(
            `Page ${i + 1} of ${range.count}   •   FLOXA Brand Delivery & Strategy Package   •   Confidential`,
            40,
            doc.page.height - 28,
            { align: 'center', width: doc.page.width - 80 }
          );
        }
      } catch (pageErr) {
        // ignore
      }
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', (err) => reject(err));

    const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand Project';
    const clientName = project.client?.name || project.clientProfile?.clientName || project.companyName || 'Client';
    const sector = project.clientProfile?.industry || project.sector || 'Brand Identity & Design';
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const contentWidth = 515;

    // 1. Modern Luxury Header Banner (Dynamically Themed to Brand Tone)
    doc.roundedRect(40, 30, contentWidth, 54, 6)
      .fillAndStroke(theme.cardBg, theme.isDark ? theme.accent10.hex : theme.secondary30.hex);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.accent10.hex).text('FLOXA STUDIO   •   OFFICIAL BRAND DELIVERABLES & ASSET HANDOVER', 56, 42);
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(theme.textHeading).text(`${companyName.toUpperCase()} — BRAND IDENTITY SPECIFICATION`, 56, 56, { width: 365, ellipsis: true });

    // Status Pill
    doc.roundedRect(436, 44, 104, 24, 4).fillAndStroke(theme.accent10.hex, theme.accent10.hex);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.isDark ? '#060E0A' : '#FFFFFF').text('FINAL RELEASE', 436, 51.5, { align: 'center', width: 104 });

    // 2. Project Metadata Card
    const infoY = 92;
    doc.roundedRect(40, infoY, contentWidth, 50, 6).fillAndStroke(theme.cardBg, theme.cardBorder);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textMuted).text('PREPARED FOR:', 54, infoY + 11);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(theme.textHeading).text(`${clientName} (${companyName})`, 54, infoY + 25, { width: 230, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textMuted).text('SECTOR / DOMAIN:', 300, infoY + 11);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(theme.textHeading).text(sector, 300, infoY + 25, { width: 140, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textMuted).text('HANDOVER DATE:', 446, infoY + 11);
    doc.font('Helvetica').fontSize(9).fillColor(theme.textHeading).text(dateStr, 446, infoY + 25, { width: 95 });

    doc.y = infoY + 62;
    doc.x = 40;

    const renderSectionHeader = (title: string, minSpaceNeeded: number = 90) => {
      if (doc.y > doc.page.height - minSpaceNeeded) {
        doc.addPage();
        doc.y = 42;
      } else {
        doc.moveDown(0.65);
      }
      const curY = doc.y;
      // 10% Accent marker ribbon
      doc.rect(40, curY, 4, 14).fill(theme.accent10.hex);
      // Section title
      doc.fontSize(10).font('Helvetica-Bold').fillColor(theme.textHeading).text(title.toUpperCase(), 50, curY + 2);
      doc.moveDown(0.25);
      doc.strokeColor(theme.divider).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(9).fillColor(theme.textBody);
      doc.x = 40;
    };

    const renderBullet = (text: string, boldPrefix?: string) => {
      if (doc.y > doc.page.height - 45) {
        doc.addPage();
        doc.y = 42;
      }
      doc.circle(45, doc.y + 4.5, 2.2).fill(theme.accent10.hex);
      doc.font('Helvetica').fontSize(8.5).fillColor(theme.textBody);
      if (boldPrefix) {
        doc.font('Helvetica-Bold').fillColor(theme.accent10.hex).text(`    ${boldPrefix}: `, 52, doc.y, { continued: true });
        doc.font('Helvetica').fillColor(theme.textBody).text(text);
      } else {
        doc.text(`    ${text}`, 52, doc.y);
      }
      doc.moveDown(0.18);
    };

    // Bounded Card Renderer for Images (100% Anti-Overlap with Themed Containers)
    const renderAssetCard = (
      imagePath: string | null | undefined,
      title: string,
      badgeText: string,
      description?: string,
      clientFeedback?: string
    ) => {
      let safePath: string | null = null;
      let openedImg: any = null;
      let imgWidth = 0;
      let imgHeight = 0;

      if (imagePath) {
        safePath = resolveSafeMediaPath(imagePath);
        if (safePath && fs.existsSync(safePath)) {
          try {
            openedImg = (doc as any).openImage(safePath);
            imgWidth = openedImg?.width || 0;
            imgHeight = openedImg?.height || 0;
          } catch {
            safePath = null;
            openedImg = null;
          }
        } else {
          safePath = null;
        }
      }

      const maxCardW = 515;
      const maxImgW = 485;
      const maxImgH = 150;

      let renderImgW = 0;
      let renderImgH = 0;
      if (safePath && imgWidth > 0 && imgHeight > 0) {
        const scale = Math.min(maxImgW / imgWidth, maxImgH / imgHeight, 1);
        renderImgW = Math.round(imgWidth * scale);
        renderImgH = Math.round(imgHeight * scale);
      }

      let extraTextH = 24;
      if (description) extraTextH += 14;
      if (clientFeedback) extraTextH += 15;

      const totalCardH = extraTextH + (renderImgH > 0 ? renderImgH + 16 : 8);

      if (doc.y + totalCardH > doc.page.height - 50) {
        doc.addPage();
        doc.y = 42;
      }

      const cardX = 40;
      const cardY = doc.y + 4;

      // Card container outline & fill
      doc.roundedRect(cardX, cardY, maxCardW, totalCardH, 6)
        .fillAndStroke(theme.cardBg, theme.cardBorder);

      // Title
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(theme.textHeading)
        .text(title, cardX + 14, cardY + 8, { width: 340, ellipsis: true });

      if (badgeText) {
        const isApproved = badgeText.toLowerCase().includes('approved') || badgeText.toLowerCase().includes('selected');
        const badgeBg = isApproved ? theme.accent10.hex : theme.secondary30.hex;
        const badgeBorder = theme.accent10.hex;
        const badgeColor = isApproved && theme.isDark ? '#060E0A' : '#FFFFFF';

        doc.roundedRect(cardX + 360, cardY + 6, 140, 16, 3).fillAndStroke(badgeBg, badgeBorder);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(badgeColor)
          .text(badgeText.toUpperCase(), cardX + 360, cardY + 9.5, { align: 'center', width: 140 });
      }

      let currentTextY = cardY + 24;
      if (description) {
        doc.font('Helvetica').fontSize(8.5).fillColor(theme.textBody)
          .text(description, cardX + 14, currentTextY, { width: 485, ellipsis: true });
        currentTextY += 14;
      }

      if (clientFeedback) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(theme.accent10.hex)
          .text(`Client Feedback: "${clientFeedback}"`, cardX + 14, currentTextY, { width: 485, ellipsis: true });
        currentTextY += 15;
      }

      if (openedImg && renderImgH > 0) {
        const imgX = cardX + (maxCardW - renderImgW) / 2;
        const imgY = currentTextY + 4;

        // Image container background frame
        doc.roundedRect(imgX - 1, imgY - 1, renderImgW + 2, renderImgH + 2, 4)
          .fillAndStroke(theme.isDark ? '#060E0A' : '#FFFFFF', theme.accent10.hex);

        doc.image(openedImg, imgX, imgY, { width: renderImgW, height: renderImgH });
      }

      // Explicitly advance doc.y well beyond the bottom of the card
      doc.y = cardY + totalCardH + 12;
      doc.x = 40;
    };

    // 1. PROJECT SUMMARY
    renderSectionHeader('1. EXECUTIVE SUMMARY & ENGAGEMENT SCOPE', 90);
    doc.font('Helvetica').fontSize(8.5).fillColor(theme.textBody).text(
      `This document certifies the successful design execution, identity engineering, and final deliverable package ` +
      `prepared for ${companyName}. The brand identity framework codified within this delivery provides an authoritative, ` +
      `coherent visual language engineered for high market distinction and sustainable commercial scale.`
    );
    doc.moveDown(0.3);

    // 2. PROJECT OBJECTIVES
    renderSectionHeader('2. DELIVERABLE STANDARDS & OBJECTIVES MET', 90);
    const objectives = [
      `Established a defensible, premium market positioning and visual authority for ${companyName}.`,
      'Engineered scalable vector logo marks, typography hierarchies, and color tokens for digital and physical deployment.',
      'Completed client-approved visual direction and concept iterations through collaborative sign-offs.',
      'Full, irrevocable transfer of intellectual property and commercial copyright upon milestone completion.',
    ];
    objectives.forEach((obj) => renderBullet(obj));
    doc.moveDown(0.3);

    // 3. BRAND STRATEGY ARCHITECTURE
    renderSectionHeader('3. BRAND STRATEGY & IDENTITY ARCHITECTURE', 100);
    const dna = project.brandDNA || {};
    if (dna && (dna.brandPersonalityCluster || dna.positioningSummary || dna.businessSummary)) {
      renderBullet(dna.brandPersonalityCluster || theme.cluster, 'Personality Archetype');
      renderBullet(dna.positioningSummary || 'Defensible identity tailored for market leadership.', 'Positioning Statement');
      renderBullet(dna.businessSummary || 'Purpose-driven execution designed for discerning customers.', 'Elevated Mission');
      renderBullet(dna.targetAudienceSummary || 'Target discerning consumers and institutional partners.', 'Target Audience');
      renderBullet(dna.brandFeelingSummary || 'Authoritative, clear, sophisticated, and trusted.', 'Voice & Emotional Tone');
    } else {
      renderBullet(`${theme.cluster} identity engineered for defensible market leadership.`, 'Personality Archetype');
      renderBullet('Full brand identity design, logo package, and visual direction system.', 'Strategic Scope');
    }
    doc.moveDown(0.4);

    // 4. SELECTED VISUAL MOODBOARDS
    renderSectionHeader('4. SELECTED VISUAL MOODBOARDS & ART DIRECTION', 230);
    const allMoodboards = project.moodboards || [];
    const selectedMoodboards = allMoodboards.filter((m: any) => m.isSelected === true);
    const moodboardsToShow = selectedMoodboards.length > 0 ? selectedMoodboards : allMoodboards;

    if (moodboardsToShow.length > 0) {
      moodboardsToShow.forEach((mb: any) => {
        const isSel = Boolean(mb.isSelected);
        renderAssetCard(
          mb.image,
          mb.title || 'Moodboard Direction',
          isSel ? 'Client Selected Direction' : 'Visual Exploration',
          mb.description || 'Color palettes, typography pairings, and imagery language.'
        );
      });
    } else {
      doc.font('Helvetica').fontSize(8.5).fillColor(theme.textMuted).text('Visual moodboard directions recorded in project workspace.');
      doc.moveDown(0.3);
    }

    // 5. APPROVED BRAND CONCEPTS & IDENTITY
    renderSectionHeader('5. APPROVED BRAND CONCEPTS & IDENTITY ASSETS', 230);
    const allConcepts = project.concepts || [];
    const approvedConcepts = allConcepts.filter((c: any) => c.status === 'approved');
    const conceptsToShow = approvedConcepts.length > 0 ? approvedConcepts : allConcepts;

    if (conceptsToShow.length > 0) {
      conceptsToShow.forEach((c: any) => {
        const isApp = c.status === 'approved';
        renderAssetCard(
          c.image,
          `${c.title || 'Brand Concept'} (v${c.version || 1})`,
          isApp ? 'Approved by Client' : String(c.status || 'Draft').toUpperCase(),
          c.description ? `Design Notes: ${c.description}` : undefined,
          c.clientFeedback || undefined
        );
      });
    } else {
      doc.font('Helvetica').fontSize(8.5).fillColor(theme.textMuted).text('Final concept specifications recorded in project workspace.');
      doc.moveDown(0.3);
    }

    // 6. PROJECT BUDGET & PAYMENT SETTLEMENT
    renderSectionHeader('6. PROJECT BUDGET & PAYMENT SETTLEMENT AUDIT', 140);
    const milestones = project.paymentMilestones || [];
    const totalVal = project.projectValue || milestones.reduce((sum: number, m: any) => sum + (m.amount || 0), 0) || 0;
    let totalPaid = 0;

    // Render Clean Payment Summary Card
    const budgetCardH = 34 + (milestones.length > 0 ? milestones.length * 18 : 20);
    if (doc.y + budgetCardH > doc.page.height - 50) {
      doc.addPage();
      doc.y = 42;
    }

    const budgetY = doc.y + 2;
    doc.roundedRect(40, budgetY, contentWidth, budgetCardH, 6)
      .fillAndStroke(theme.cardBg, theme.cardBorder);

    // Table Header Bar: Solid Secondary color fill with crisp white text
    doc.roundedRect(40, budgetY, contentWidth, 20, 4)
      .fill(theme.tableHeaderBg);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      .text('MILESTONE STAGE', 54, budgetY + 6)
      .text('PERCENT', 260, budgetY + 6)
      .text('AMOUNT (INR)', 340, budgetY + 6)
      .text('STATUS', 445, budgetY + 6);

    let rowY = budgetY + 25;
    if (milestones.length > 0) {
      milestones.forEach((m: any) => {
        const amt = m.amount || 0;
        const isPaid = m.status === 'paid';
        if (isPaid) totalPaid += amt;
        const statusLabel = isPaid ? 'PAID (Settled)' : (m.status || 'pending').toUpperCase();

        doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textHeading).text((m.type || 'Milestone').toUpperCase(), 54, rowY, { width: 190 });
        doc.font('Helvetica').fontSize(8).fillColor(theme.textBody).text(`${m.percentage}%`, 260, rowY);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textHeading).text(`INR ${amt.toLocaleString('en-IN')}`, 340, rowY);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(isPaid ? theme.accent10.hex : theme.textMuted).text(statusLabel, 445, rowY);
        rowY += 17;
      });
    } else {
      totalPaid = totalVal;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textHeading).text('FULL BRAND ENGAGEMENT', 54, rowY);
      doc.font('Helvetica').fontSize(8).fillColor(theme.textBody).text('100%', 260, rowY);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.textHeading).text(`INR ${totalVal.toLocaleString('en-IN')}`, 340, rowY);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(theme.accent10.hex).text('PAID (Settled)', 445, rowY);
      rowY += 17;
    }

    doc.y = budgetY + budgetCardH + 8;
    doc.x = 40;

    const isFullyPaid = totalPaid >= totalVal && totalVal > 0;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(theme.textHeading)
      .text(`Total Investment: INR ${totalVal.toLocaleString('en-IN')}   |   `, 40, doc.y, { continued: true });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isFullyPaid ? theme.accent10.hex : theme.textMuted)
      .text(`Total Settled: INR ${totalPaid.toLocaleString('en-IN')} ${isFullyPaid ? '(100% Cleared)' : ''}`);
    doc.moveDown(0.35);

    // 7. PLATFORM & BRAND DELIVERABLES
    renderSectionHeader('7. DELIVERABLE ASSET PACKAGE CHECKLIST', 150);
    const platformDeliverables = [
      'Master Vector Logo Suite (Scalable .SVG, .AI, .EPS formats)',
      'Digital Screen & Web PNG Suite (Transparent, Dark & Light Mode assets)',
      'Brand Style Guide & Design Tokens Specification Document',
      'Typography Hierarchy & Google / Web Font Standardization',
      'Color Palette System with Verified HEX, RGB & CMYK Codes',
      'Client Approved Moodboard Deck & Aesthetic Guidelines',
      'Complete Project Master Source Archive (.ZIP)',
      'Verified Settlement Audit & Certificate of Delivery',
    ];
    platformDeliverables.forEach((deliv) => renderBullet(deliv));
    doc.moveDown(0.3);

    // 8. IP TRANSFER & LEGAL HANDOVER
    renderSectionHeader('8. INTELLECTUAL PROPERTY ASSIGNMENT & TRANSFER', 140);
    doc.font('Helvetica').fontSize(8.5).fillColor(theme.textBody).text(
      `Upon receipt of settled project fees, the Consultant hereby irrevocably assigns and transfers to ${clientName} ` +
      `(${companyName}) all right, title, and interest in and to the approved final design deliverables and identity marks. ` +
      `The Client holds full commercial, digital, and print reproduction rights worldwide.`
    );
    doc.moveDown(0.5);

    // Signature Block
    if (doc.y > doc.page.height - 95) {
      doc.addPage();
      doc.y = 42;
    }

    const signY = doc.y;
    doc.strokeColor(theme.divider).lineWidth(1).moveTo(40, signY).lineTo(250, signY).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(theme.textHeading).text('For the Creative Consultant / FLOXA Studio', 40, signY + 5);
    doc.font('Helvetica').fontSize(8).fillColor(theme.textMuted).text('Authorized Design Lead', 40, signY + 17);

    doc.strokeColor(theme.divider).lineWidth(1).moveTo(345, signY).lineTo(555, signY).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(theme.textHeading).text(`For the Client: ${clientName}`, 345, signY + 5);
    doc.font('Helvetica').fontSize(8).fillColor(theme.textMuted).text(`${companyName} — Authorized Representative`, 345, signY + 17);

    doc.end();
  });
}

export async function generateBrandDnaBriefPdf(project: any, brandDNA: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 36, bottom: 36, left: 42, right: 42 },
      autoFirstPage: true,
      compress: false,
      size: 'A4',
    });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const MX = 42;
    const CW = 511.28; // 595.28 - 84
    const C = {
      emerald: '#006B3C',
      white: '#FFFFFF',
      ink: '#111111',
      charcoal: '#454545',
      muted: '#6E7370',
      surface: '#F4F6F5',
      border: '#D8DFDB',
      borderLight: '#E6ECE8',
    };

    const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand';
    const sector = project.clientProfile?.industry || project.sector || 'Creative Industry';
    const clientName = project.client?.name || project.clientProfile?.clientName || 'Client';
    const cluster = brandDNA.brandPersonalityCluster || 'Bold Challenger';

    const isDuplicateSector = sector.toLowerCase().trim() === companyName.toLowerCase().trim();
    const subText = isDuplicateSector || !sector
      ? `${companyName.toUpperCase()}  •  ARCHETYPE: ${cluster.toUpperCase()}`
      : `${companyName.toUpperCase()}  •  ${sector.toUpperCase()}  •  ARCHETYPE: ${cluster.toUpperCase()}`;

    const renderHeader = (pageNumber: number) => {
      // Pure white minimal studio header with clean FLOXA wordmark & emerald rule
      doc.rect(0, 0, 595.28, 841.89).fill(C.white);

      // Left: FLOXA wordmark + Document Title
      doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(9).text('FLOXA', MX, 32, { characterSpacing: 3.5, lineBreak: false });
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(15).text('FLOXA BRAND DNA & CREATIVE BRIEF', MX, 45, { width: 390, lineBreak: false });
      doc.fillColor(C.charcoal).font('Helvetica').fontSize(7.8).text(subText, MX, 64, { width: 410, lineBreak: false });

      // Right: Minimal page indicator
      doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(8).text(`PAGE ${pageNumber} OF 2`, MX, 48, {
        width: CW,
        align: 'right',
        lineBreak: false,
      });

      // Crisp emerald accent rule
      doc.strokeColor(C.emerald).lineWidth(1.5).moveTo(MX, 79).lineTo(MX + CW, 79).stroke();
      doc.y = 90;
      doc.x = MX;
    };

    const renderSectionTitle = (num: string, title: string) => {
      doc.x = MX;
      doc.y += 8;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.emerald).text(num, MX, y, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(title.toUpperCase(), MX + 20, y, {
        width: CW - 20,
        characterSpacing: 0.4,
      });
      const lineY = doc.y + 3;
      doc.strokeColor(C.emerald).lineWidth(0.75).moveTo(MX, lineY).lineTo(MX + CW, lineY).stroke();
      doc.y = lineY + 8;
      doc.x = MX;
    };

    const renderStructuredRows = (rows: Array<{ label: string; value: string }>) => {
      const labelW = 148;
      const valW = CW - labelW - 18;
      rows.forEach((row, idx) => {
        const valText = row.value || 'Not specified.';
        doc.font('Helvetica-Bold').fontSize(8.2);
        const lh = doc.heightOfString(row.label, { width: labelW });
        doc.font('Helvetica').fontSize(8.3);
        const vh = doc.heightOfString(valText, { width: valW, lineGap: 1.8 });
        const rowH = Math.max(lh, vh) + 10;

        const y = doc.y;
        if (idx % 2 === 0) {
          doc.rect(MX, y, CW, rowH).fill(C.surface);
        }
        doc.font('Helvetica-Bold').fontSize(8.2).fillColor(C.ink).text(row.label, MX + 8, y + 5, { width: labelW });
        doc.font('Helvetica').fontSize(8.3).fillColor(C.charcoal).text(valText, MX + labelW + 14, y + 5, {
          width: valW,
          lineGap: 1.8,
        });
        doc.strokeColor(C.borderLight).lineWidth(0.5).moveTo(MX, y + rowH).lineTo(MX + CW, y + rowH).stroke();
        doc.y = y + rowH;
      });
      doc.x = MX;
    };

    const renderFooter = (pageNumber: number) => {
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.strokeColor(C.border).lineWidth(0.6).moveTo(MX, 788).lineTo(MX + CW, 788).stroke();
      doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(7.2).text('FLOXA STUDIO', MX, 796, { lineBreak: false });
      doc.fillColor(C.muted).font('Helvetica').fontSize(7.2).text(
        'CONFIDENTIAL CREATIVE BRIEF  •  GENERATED BY FLOXA STUDIO  •  FOR PRODUCTION & DESIGN USE ONLY',
        MX + 70,
        796,
        { width: CW - 120, align: 'center', lineBreak: false }
      );
      doc.fillColor(C.charcoal).font('Helvetica-Bold').fontSize(7.2).text(`${pageNumber} / 2`, MX, 796, {
        width: CW,
        align: 'right',
        lineBreak: false,
      });

      doc.page.margins.bottom = prevBottom;
    };

    // ==========================================
    // PAGE 1: STRATEGY & VISUAL FOUNDATION
    // ==========================================
    renderHeader(1);

    // Structured 3-Column Information Bar
    const metaY = doc.y;
    const metaH = 34;
    doc.rect(MX, metaY, CW, metaH).fill(C.surface);
    doc.strokeColor(C.border).lineWidth(0.6).rect(MX, metaY, CW, metaH).stroke();

    const colW = CW / 3;
    const metaItems = [
      { k: 'PROJECT', v: String(project.title || companyName) },
      { k: 'CLIENT', v: String(clientName) },
      { k: 'DATE', v: new Date().toLocaleDateString('en-US') },
    ];
    metaItems.forEach((m, idx) => {
      const x = MX + idx * colW;
      if (idx > 0) {
        doc.strokeColor(C.border).lineWidth(0.5).moveTo(x, metaY + 6).lineTo(x, metaY + metaH - 6).stroke();
      }
      doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(6.8).text(m.k, x + 10, metaY + 6, { width: colW - 20, lineBreak: false });
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5).text(m.v, x + 10, metaY + 16, {
        width: colW - 20,
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = metaY + metaH + 4;

    // Section 1: STRATEGIC IDENTITY
    renderSectionTitle('01', 'Strategic Identity & Market Stance');
    renderStructuredRows([
      { label: 'Business Essence', value: brandDNA.businessSummary },
      { label: 'Target Customer Psychology', value: brandDNA.targetAudienceSummary },
      { label: 'Core UVP / Positioning Anchor', value: brandDNA.positioningSummary },
      { label: 'Emotional Resonance & Tone', value: brandDNA.brandFeelingSummary },
      { label: 'Competitive Differentiation', value: brandDNA.competitorSummary },
    ]);

    // Section 2: COLOR SYSTEM DIRECTIVES
    renderSectionTitle('02', 'Recommended Color Palette (60-30-10 Rule)');
    const palette = Array.isArray(brandDNA.colorPalette) && brandDNA.colorPalette.length > 0
      ? brandDNA.colorPalette
      : [
        { role: 'Dominant (60%)', name: 'Deep Void', hex: '#0a0d12', usage: 'Primary background canvas' },
        { role: 'Secondary (30%)', name: 'Forest Slate', hex: '#163325', usage: 'Structural containers and panels' },
        { role: 'Accent (10%)', name: 'Neon Emerald', hex: '#4dffa0', usage: 'High-impact focal hooks and CTAs' },
        { role: 'Canvas Contrast', name: 'Ghost White', hex: '#f8fafc', usage: 'High-visibility typography' },
      ];

    const startY = doc.y + 2;
    const swatchGap = 10;
    const swatchWidth = (CW - swatchGap * 3) / 4;
    const cardHeight = 76;
    palette.slice(0, 4).forEach((color: any, idx: number) => {
      const cardX = MX + idx * (swatchWidth + swatchGap);
      const hexColor = (color.hex && /^#[0-9A-Fa-f]{6}$/.test(color.hex)) ? color.hex : '#006B3C';

      doc.rect(cardX, startY, swatchWidth, cardHeight).fill(C.white);
      doc.strokeColor(C.border).lineWidth(0.6).rect(cardX, startY, swatchWidth, cardHeight).stroke();

      // Full-bleed top color swatch
      doc.rect(cardX + 0.5, startY + 0.5, swatchWidth - 1, 28).fill(hexColor);
      doc.strokeColor(C.border).lineWidth(0.5).moveTo(cardX, startY + 29).lineTo(cardX + swatchWidth, startY + 29).stroke();

      doc.fillColor(C.ink).fontSize(8.2).font('Helvetica-Bold').text(color.name || 'Color', cardX + 8, startY + 35, {
        width: swatchWidth - 16,
        lineBreak: false,
        ellipsis: true,
      });
      doc.fillColor(C.charcoal).fontSize(7.5).font('Helvetica').text((color.hex || '').toUpperCase(), cardX + 8, startY + 47, {
        width: swatchWidth - 16,
        lineBreak: false,
      });
      doc.fillColor(C.emerald).fontSize(7.2).font('Helvetica-Bold').text(color.role || '', cardX + 8, startY + 60, {
        width: swatchWidth - 16,
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = startY + cardHeight + 4;
    doc.x = MX;

    // Section 3: TYPOGRAPHY DIRECTIVES
    renderSectionTitle('03', 'Typography & Hierarchy Directives');
    const typo = brandDNA.typographyDirectives || {};
    renderStructuredRows([
      { label: 'Headline Typography', value: typo.headlineStyle || 'Bold modern geometric grotesque in impactful casing' },
      { label: 'Body & Subtitle Typography', value: typo.bodyStyle || 'Clean neutral sans-serif in regular/medium weight' },
      { label: 'Pairing Rationale', value: typo.pairingRationale || 'Balances commanding visual authority with effortless readability across all formats.' },
    ]);

    // Section 4: OVERALL VISUAL DIRECTION
    renderSectionTitle('04', 'Overall Aesthetic Foundation');
    const aestheticText = brandDNA.visualDirectionSummary || 'Editorial & Typographic, Playful & Vibrant, Dark & Luxurious visual style foundation.';
    doc.font('Helvetica').fontSize(8.5);
    const aesH = doc.heightOfString(aestheticText, { width: CW - 24, lineGap: 2 });
    const aesBoxH = Math.max(36, aesH + 16);
    const aesY = doc.y;
    doc.rect(MX, aesY, CW, aesBoxH).fill(C.surface);
    doc.rect(MX, aesY, 3, aesBoxH).fill(C.emerald);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.charcoal).text(aestheticText, MX + 14, aesY + 8, {
      width: CW - 24,
      lineGap: 2,
    });
    doc.y = aesY + aesBoxH + 8;
    doc.x = MX;

    renderFooter(1);

    // ==========================================
    // PAGE 2: POSTER CONCEPTS & CREATIVE DIRECTIVES
    // ==========================================
    doc.addPage();
    renderHeader(2);

    // Section 5: POSTER CONCEPTS (3 Distinct Angles)
    renderSectionTitle('05', 'Poster Campaign Themes (3 Creative Angles for Designers)');
    const concepts = Array.isArray(brandDNA.posterConcepts) && brandDNA.posterConcepts.length > 0
      ? brandDNA.posterConcepts
      : [
        {
          angle: 'Concept 1: Primary Hero Theme',
          conceptName: 'The Definitive Standard',
          description: `A bold, iconic statement showcasing ${companyName}'s core value proposition with high-contrast focal weight.`,
          visualHook: 'Arresting central subject bathed in emerald neon rim lighting over a dark canvas.',
        },
        {
          angle: 'Concept 2: Typographic & Narrative Theme',
          conceptName: 'Zero Compromise',
          description: 'Puts the core positioning promise front and center through scale-shifted typographic storytelling.',
          visualHook: 'Massive tight-tracked headline occupying 50% of the canvas with dimensional shadows.',
        },
        {
          angle: 'Concept 3: Atmospheric & Emotion Theme',
          conceptName: 'Quiet Resonance',
          description: 'Evokes deep confidence and prestige through cinematic depth and generous negative space.',
          visualHook: 'Asymmetrical composition with 70% dark breathing room leading the eye to the refined badge.',
        },
      ];

    const leftColW = 326;
    const rightColW = CW - leftColW;

    concepts.slice(0, 3).forEach((c: any, i: number) => {
      const boxY = doc.y;
      const desc = c.description || '';
      const hook = c.visualHook || '';

      doc.font('Helvetica').fontSize(8);
      const descH = doc.heightOfString(desc, { width: leftColW - 22, lineGap: 1.5 });
      doc.font('Helvetica').fontSize(7.8);
      const hookH = doc.heightOfString(hook, { width: rightColW - 20, lineGap: 1.5 });
      const boxHeight = Math.max(36 + descH, 26 + hookH, 54);

      doc.rect(MX, boxY, CW, boxHeight).fill(C.white);
      doc.rect(MX + leftColW, boxY, rightColW, boxHeight).fill(C.surface);
      doc.strokeColor(C.border).lineWidth(0.6).rect(MX, boxY, CW, boxHeight).stroke();
      doc.strokeColor(C.border).lineWidth(0.6).moveTo(MX + leftColW, boxY).lineTo(MX + leftColW, boxY + boxHeight).stroke();
      doc.rect(MX, boxY, 2.5, boxHeight).fill(C.emerald);

      // Left column: Angle, Concept Name, Description
      doc.fillColor(C.emerald).fontSize(7.2).font('Helvetica-Bold').text((c.angle || `Concept ${i + 1}`).toUpperCase(), MX + 12, boxY + 8, { width: leftColW - 22 });
      doc.fillColor(C.ink).fontSize(9.5).font('Helvetica-Bold').text(`"${c.conceptName || 'Theme'}"`, MX + 12, boxY + 18, { width: leftColW - 22 });
      doc.fillColor(C.charcoal).fontSize(8).font('Helvetica').text(desc, MX + 12, boxY + 31, { width: leftColW - 22, lineGap: 1.5 });

      // Right column: Visual hook separated by subtle vertical border
      doc.fillColor(C.emerald).fontSize(7).font('Helvetica-Bold').text('VISUAL HOOK', MX + leftColW + 10, boxY + 8, { width: rightColW - 20 });
      doc.fillColor(C.charcoal).fontSize(7.8).font('Helvetica').text(hook, MX + leftColW + 10, boxY + 20, { width: rightColW - 20, lineGap: 1.5 });

      doc.y = boxY + boxHeight + 7;
      doc.x = MX;
    });

    // Section 6: COPYWRITING & HEADLINE HOOKS
    renderSectionTitle('06', 'Poster Headlines & Copywriting Hooks');
    const copyHooks = Array.isArray(brandDNA.copywritingHooks) && brandDNA.copywritingHooks.length > 0
      ? brandDNA.copywritingHooks
      : [
        { headline: `${companyName}: Built for those who demand more.`, subline: 'Uncompromising craftsmanship in every detail.', cta: 'Experience the standard.' },
        { headline: 'The standard has shifted.', subline: 'Precision execution designed for modern leaders.', cta: 'Discover the difference.' },
        { headline: 'Decisive clarity. Zero compromise.', subline: 'Why settle for ordinary when excellence is within reach?', cta: 'Start with Floxa.' },
      ];

    copyHooks.slice(0, 3).forEach((h: any, i: number) => {
      const y = doc.y;
      const ctaW = 148;
      const textW = CW - ctaW - 28;
      const headlineStr = `"${h.headline}"`;
      const sublineStr = `Subline: "${h.subline}"`;

      doc.font('Helvetica-Bold').fontSize(8.5);
      const hh = doc.heightOfString(headlineStr, { width: textW });
      doc.font('Helvetica').fontSize(7.8);
      const sh = doc.heightOfString(sublineStr, { width: textW, lineGap: 1.2 });
      const rowH = Math.max(hh + sh + 12, 32);

      if (i % 2 === 0) {
        doc.rect(MX, y, CW, rowH).fill(C.surface);
      }
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.emerald).text(`0${i + 1}`, MX + 8, y + 6, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(headlineStr, MX + 26, y + 6, { width: textW });
      doc.font('Helvetica').fontSize(7.8).fillColor(C.charcoal).text(sublineStr, MX + 26, y + 6 + hh + 2, { width: textW, lineGap: 1.2 });

      // Aligned CTA column
      const ctaX = MX + CW - ctaW;
      doc.strokeColor(C.border).lineWidth(0.5).moveTo(ctaX, y + 5).lineTo(ctaX, y + rowH - 5).stroke();
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor(C.muted).text('CTA', ctaX + 10, y + 6, { width: ctaW - 14, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.emerald).text(h.cta || '', ctaX + 10, y + 15, { width: ctaW - 14 });

      doc.strokeColor(C.borderLight).lineWidth(0.5).moveTo(MX, y + rowH).lineTo(MX + CW, y + rowH).stroke();
      doc.y = y + rowH;
      doc.x = MX;
    });

    // Section 7: ART DIRECTION & COMPOSITION
    renderSectionTitle('07', 'Composition, Lighting & Focal Weight');
    const art = brandDNA.artDirection || {};
    renderStructuredRows([
      { label: 'Layout & Grid', value: art.composition || 'Asymmetrical Swiss grid with 60-70% focal weight and generous negative space.' },
      { label: 'Lighting & Texture', value: art.lightingAndTexture || 'Deep dark-mode shadows with neon chromatic edge lighting and subtle film grain.' },
      { label: 'Primary Focal Point', value: art.focalPoint || 'The central visual metaphor and dominant headline lockup.' },
    ]);

    // Section 8: CREATIVE GUARDRAILS (DOS & DON'TS)
    renderSectionTitle('08', 'Creative Guardrails (Design Dos & Don\'ts)');
    const rules = brandDNA.designRules || {};
    const dos = rules.dos || [
      `Anchor every poster with ${companyName}'s core positioning.`,
      'Maintain clean hierarchy with generous breathing room and tight typography tracking.',
      'Strictly respect the 60-30-10 color palette ratios.',
    ];
    const donts = rules.donts || [
      'Do NOT use generic corporate stock photography or sterile business clichés.',
      'Do NOT clutter the canvas with multiple competing headlines or multi-column paragraphs.',
      'Do NOT dilute the color system with unauthorized pastel or gradient hues.',
    ];

    const ruleStartY = doc.y + 2;
    const panelGap = 12;
    const panelWidth = (CW - panelGap) / 2;
    const leftX = MX;
    const rightX = MX + panelWidth + panelGap;

    doc.font('Helvetica').fontSize(7.8);
    const dosHeights = dos.slice(0, 3).map((d: string) => doc.heightOfString(d, { width: panelWidth - 28, lineGap: 1.4 }));
    const dontsHeights = donts.slice(0, 3).map((d: string) => doc.heightOfString(d, { width: panelWidth - 28, lineGap: 1.4 }));

    const totalDosHeight = dosHeights.reduce((sum: number, h: number) => sum + h + 6, 26);
    const totalDontsHeight = dontsHeights.reduce((sum: number, h: number) => sum + h + 6, 26);
    const guardrailBoxHeight = Math.max(totalDosHeight, totalDontsHeight, 72);

    // Left Panel: STRICT VISUAL DOS (Emerald top rule, neutral light grey surface)
    doc.rect(leftX, ruleStartY, panelWidth, guardrailBoxHeight).fill(C.surface);
    doc.strokeColor(C.border).lineWidth(0.6).rect(leftX, ruleStartY, panelWidth, guardrailBoxHeight).stroke();
    doc.rect(leftX, ruleStartY, panelWidth, 2).fill(C.emerald);
    doc.fillColor(C.emerald).fontSize(7.6).font('Helvetica-Bold').text('STRICT VISUAL DOS (MUST FOLLOW)', leftX + 12, ruleStartY + 9, { width: panelWidth - 24 });

    let currentDoY = ruleStartY + 24;
    dos.slice(0, 3).forEach((d: string, idx: number) => {
      doc.rect(leftX + 12, currentDoY + 3, 4, 4).fill(C.emerald);
      doc.fillColor(C.ink).fontSize(7.8).font('Helvetica').text(d, leftX + 22, currentDoY, { width: panelWidth - 34, lineGap: 1.4 });
      currentDoY += dosHeights[idx] + 6;
    });

    // Right Panel: STRICT VISUAL DON'TS (Charcoal top rule, neutral white surface)
    doc.rect(rightX, ruleStartY, panelWidth, guardrailBoxHeight).fill(C.white);
    doc.strokeColor(C.border).lineWidth(0.6).rect(rightX, ruleStartY, panelWidth, guardrailBoxHeight).stroke();
    doc.rect(rightX, ruleStartY, panelWidth, 2).fill(C.charcoal);
    doc.fillColor(C.ink).fontSize(7.6).font('Helvetica-Bold').text('STRICT VISUAL DON\'TS (AVOID)', rightX + 12, ruleStartY + 9, { width: panelWidth - 24 });

    let currentDontY = ruleStartY + 24;
    donts.slice(0, 3).forEach((d: string, idx: number) => {
      doc.strokeColor(C.charcoal).lineWidth(1.2).moveTo(rightX + 12, currentDontY + 5).lineTo(rightX + 16, currentDontY + 5).stroke();
      doc.fillColor(C.charcoal).fontSize(7.8).font('Helvetica').text(d, rightX + 22, currentDontY, { width: panelWidth - 34, lineGap: 1.4 });
      currentDontY += dontsHeights[idx] + 6;
    });

    doc.y = ruleStartY + guardrailBoxHeight + 8;
    doc.x = MX;

    renderFooter(2);

    doc.end();
  });
}
