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
    const doc = new PDFDocument({ margin: 40, autoFirstPage: true, compress: false, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand';
    const sector = project.clientProfile?.industry || project.sector || 'Creative Industry';
    const clientName = project.client?.name || project.clientProfile?.clientName || 'Client';
    const cluster = brandDNA.brandPersonalityCluster || 'Bold Challenger';

    const renderHeader = (pageTitle: string, pageNumber: number) => {

      doc.x = 40;
      // Dark emerald banner
      doc.rect(40, 30, 515, 46).fill('#081610');
      doc.fillColor('#4dffa0').fontSize(14).font('Helvetica-Bold').text('FLOXA BRAND DNA & CREATIVE BRIEF', 55, 41);

      // Clean de-duplicated subtitle
      const isDuplicateSector = sector.toLowerCase().trim() === companyName.toLowerCase().trim();
      const subText = isDuplicateSector || !sector
        ? `${companyName.toUpperCase()} • ARCHETYPE: ${cluster.toUpperCase()} | PAGE ${pageNumber} OF 2`
        : `${companyName.toUpperCase()} • ${sector.toUpperCase()} • ARCHETYPE: ${cluster.toUpperCase()} | PAGE ${pageNumber} OF 2`;

      doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica').text(subText, 55, 59);
      doc.y = 90;
      doc.x = 40;
    };

    const renderSectionTitle = (title: string) => {
      doc.x = 40;
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(title.toUpperCase(), 40, doc.y, { width: 515 });
      const lineY = doc.y + 2;
      doc.strokeColor('#cbd5e1').lineWidth(0.75).moveTo(40, lineY).lineTo(555, lineY).stroke();
      doc.y = lineY + 6;
      doc.x = 40;
    };

    const renderField = (label: string, value: string) => {
      doc.x = 40;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b').text(`${label}: `, 40, doc.y, { continued: true });
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(value || 'Not specified.', { width: 515, lineGap: 1 });
      doc.y += 3;
      doc.x = 40;
    };

    // ==========================================
    // PAGE 1: STRATEGY & VISUAL FOUNDATION
    // ==========================================
    renderHeader('STRATEGY & VISUAL FOUNDATION', 1);

    // Project metadata pill
    doc.rect(40, doc.y, 515, 24).fill('#f1f5f9');
    doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(40, doc.y, 515, 24).stroke();
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold')
      .text(`PROJECT: ${project.title || companyName}   |   CLIENT: ${clientName}   |   DATE: ${new Date().toLocaleDateString('en-US')}`, 50, doc.y + 7, { width: 495 });
    doc.y += 28;
    doc.x = 40;

    // Section 1: STRATEGIC IDENTITY
    renderSectionTitle('1. Strategic Identity & Market Stance');
    renderField('Business Essence', brandDNA.businessSummary);
    renderField('Target Customer Psychology', brandDNA.targetAudienceSummary);
    renderField('Core UVP / Positioning Anchor', brandDNA.positioningSummary);
    renderField('Emotional Resonance & Tone', brandDNA.brandFeelingSummary);
    renderField('Competitive Differentiation', brandDNA.competitorSummary);

    // Section 2: COLOR SYSTEM DIRECTIVES
    renderSectionTitle('2. Recommended Color Palette (60-30-10 Rule)');
    const palette = Array.isArray(brandDNA.colorPalette) && brandDNA.colorPalette.length > 0
      ? brandDNA.colorPalette
      : [
        { role: 'Dominant (60%)', name: 'Deep Void', hex: '#0a0d12', usage: 'Primary background canvas' },
        { role: 'Secondary (30%)', name: 'Forest Slate', hex: '#163325', usage: 'Structural containers and panels' },
        { role: 'Accent (10%)', name: 'Neon Emerald', hex: '#4dffa0', usage: 'High-impact focal hooks and CTAs' },
        { role: 'Canvas Contrast', name: 'Ghost White', hex: '#f8fafc', usage: 'High-visibility typography' },
      ];

    const startY = doc.y + 4;
    const swatchWidth = 122;
    const swatchGap = 9;
    const cardHeight = 48;
    palette.slice(0, 4).forEach((color: any, idx: number) => {
      const cardX = 40 + idx * (swatchWidth + swatchGap);
      const hexColor = (color.hex && /^#[0-9A-Fa-f]{6}$/.test(color.hex)) ? color.hex : '#22c55e';

      // Card Background & border
      doc.rect(cardX, startY, swatchWidth, cardHeight).fill('#f8fafc');
      doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(cardX, startY, swatchWidth, cardHeight).stroke();

      // Swatch color block
      doc.rect(cardX + 7, startY + 7, 20, 20).fill(hexColor);
      doc.strokeColor('#94a3b8').lineWidth(0.5).rect(cardX + 7, startY + 7, 20, 20).stroke();

      // Color name & hex
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text(color.name || 'Color', cardX + 32, startY + 7, { width: swatchWidth - 36, lineBreak: false, ellipsis: true });
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(color.hex || '', cardX + 32, startY + 17, { width: swatchWidth - 36 });
      // Role
      doc.fillColor('#047857').fontSize(7).font('Helvetica-Bold').text(color.role || '', cardX + 7, startY + 33, { width: swatchWidth - 14, lineBreak: false, ellipsis: true });
    });
    // Critical: advance y and explicitly reset x to margin 40!
    doc.y = startY + cardHeight + 8;
    doc.x = 40;

    // Section 3: TYPOGRAPHY DIRECTIVES
    renderSectionTitle('3. Typography & Hierarchy Directives');
    const typo = brandDNA.typographyDirectives || {};
    renderField('Headline Typography', typo.headlineStyle || 'Bold modern geometric grotesque in impactful casing');
    renderField('Body & Subtitle Typography', typo.bodyStyle || 'Clean neutral sans-serif in regular/medium weight');
    renderField('Pairing Rationale', typo.pairingRationale || 'Balances commanding visual authority with effortless readability across all formats.');

    // Section 4: OVERALL VISUAL DIRECTION
    renderSectionTitle('4. Overall Aesthetic Foundation');
    doc.x = 40;
    const aestheticText = brandDNA.visualDirectionSummary || 'Editorial & Typographic, Playful & Vibrant, Dark & Luxurious visual style foundation.';
    doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(aestheticText, 40, doc.y, { width: 515, lineGap: 1.5 });
    doc.x = 40;

    const renderFooter = () => {
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(
        'CONFIDENTIAL CREATIVE BRIEF • GENERATED BY FLOXA STUDIO • FOR PRODUCTION & DESIGN USE ONLY',
        40,
        786,
        { align: 'center', width: 515, lineBreak: false }
      );
    };

    renderFooter();

    // ==========================================
    // PAGE 2: POSTER CONCEPTS & CREATIVE DIRECTIVES
    // ==========================================
    doc.addPage();
    renderHeader('POSTER CONCEPTS & EXECUTION DIRECTIVES', 2);

    // Section 5: POSTER CONCEPTS (3 Distinct Angles)
    renderSectionTitle('5. Poster Campaign Themes (3 Creative Angles for Designers)');
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

    concepts.slice(0, 3).forEach((c: any, i: number) => {
      const boxY = doc.y;
      const desc = c.description || '';
      const hook = c.visualHook || '';

      // Measure text heights dynamically so content never clips or overlaps
      doc.font('Helvetica').fontSize(7.5);
      const descH = doc.heightOfString(desc, { width: 330 });
      doc.font('Helvetica').fontSize(7);
      const hookH = doc.heightOfString(hook, { width: 143 });
      const boxHeight = Math.max(32 + descH, 20 + hookH, 48);

      // Card background and border
      doc.rect(40, boxY, 515, boxHeight).fill('#f8fafc');
      doc.strokeColor('#e2e8f0').lineWidth(0.5).rect(40, boxY, 515, boxHeight).stroke();

      // Left column: Angle, Concept Name, Description
      doc.fillColor('#047857').fontSize(7.5).font('Helvetica-Bold').text((c.angle || `Concept ${i + 1}`).toUpperCase(), 50, boxY + 6, { width: 330 });
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(`"${c.conceptName || 'Theme'}"`, 50, boxY + 16, { width: 330 });
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(desc, 50, boxY + 28, { width: 330, lineGap: 1 });

      // Right column: Visual hook callout box
      const hookBoxH = boxHeight - 8;
      doc.rect(390, boxY + 4, 155, hookBoxH).fill('#ecfdf5');
      doc.strokeColor('#a7f3d0').lineWidth(0.5).rect(390, boxY + 4, 155, hookBoxH).stroke();
      doc.fillColor('#065f46').fontSize(7).font('Helvetica-Bold').text('VISUAL HOOK:', 396, boxY + 7, { width: 143 });
      doc.fillColor('#047857').fontSize(7).font('Helvetica').text(hook, 396, boxY + 17, { width: 143, lineGap: 1 });

      doc.y = boxY + boxHeight + 6;
      doc.x = 40;
    });

    // Section 6: COPYWRITING & HEADLINE HOOKS
    renderSectionTitle('6. Poster Headlines & Copywriting Hooks');
    const copyHooks = Array.isArray(brandDNA.copywritingHooks) && brandDNA.copywritingHooks.length > 0
      ? brandDNA.copywritingHooks
      : [
        { headline: `${companyName}: Built for those who demand more.`, subline: 'Uncompromising craftsmanship in every detail.', cta: 'Experience the standard.' },
        { headline: 'The standard has shifted.', subline: 'Precision execution designed for modern leaders.', cta: 'Discover the difference.' },
        { headline: 'Decisive clarity. Zero compromise.', subline: 'Why settle for ordinary when excellence is within reach?', cta: 'Start with Floxa.' },
      ];

    copyHooks.slice(0, 3).forEach((h: any, i: number) => {
      doc.x = 40;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(`${i + 1}. "${h.headline}"`, 40, doc.y, { width: 515 });
      const sublineText = `Subline: "${h.subline}"   |   CTA: [${h.cta}]`;
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(sublineText, 52, doc.y + 1, { width: 503, lineGap: 1 });
      doc.y += 3;
      doc.x = 40;
    });

    // Section 7: ART DIRECTION & COMPOSITION
    renderSectionTitle('7. Composition, Lighting & Focal Weight');
    const art = brandDNA.artDirection || {};
    renderField('Layout & Grid', art.composition || 'Asymmetrical Swiss grid with 60-70% focal weight and generous negative space.');
    renderField('Lighting & Texture', art.lightingAndTexture || 'Deep dark-mode shadows with neon chromatic edge lighting and subtle film grain.');
    renderField('Primary Focal Point', art.focalPoint || 'The central visual metaphor and dominant headline lockup.');

    // Section 8: CREATIVE GUARDRAILS (DOS & DON'TS)
    renderSectionTitle('8. Creative Guardrails (Design Dos & Don\'ts)');
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

    const ruleStartY = doc.y + 3;
    const leftWidth = 250;
    const rightWidth = 255;
    const leftX = 40;
    const rightX = 300;

    // Dynamically calculate the height of each item so they NEVER overlap
    doc.font('Helvetica').fontSize(7.5);
    const dosHeights = dos.slice(0, 3).map((d: string) => doc.heightOfString(d, { width: leftWidth - 28 }));
    const dontsHeights = donts.slice(0, 3).map((d: string) => doc.heightOfString(d, { width: rightWidth - 28 }));

    const totalDosHeight = dosHeights.reduce((sum: number, h: number) => sum + h + 6, 24);
    const totalDontsHeight = dontsHeights.reduce((sum: number, h: number) => sum + h + 6, 24);
    const guardrailBoxHeight = Math.max(totalDosHeight, totalDontsHeight, 64);

    // Left card: DOs
    doc.rect(leftX, ruleStartY, leftWidth, guardrailBoxHeight).fill('#f0fdf4');
    doc.strokeColor('#bbf7d0').lineWidth(0.5).rect(leftX, ruleStartY, leftWidth, guardrailBoxHeight).stroke();
    doc.fillColor('#15803d').fontSize(8).font('Helvetica-Bold').text('STRICT VISUAL DOS (MUST FOLLOW):', leftX + 10, ruleStartY + 8, { width: leftWidth - 20 });

    let currentDoY = ruleStartY + 22;
    dos.slice(0, 3).forEach((d: string, idx: number) => {
      doc.fillColor('#15803d').fontSize(7.5).font('Helvetica-Bold').text('•', leftX + 10, currentDoY);
      doc.fillColor('#166534').fontSize(7.5).font('Helvetica').text(d, leftX + 18, currentDoY, { width: leftWidth - 28, lineGap: 1 });
      currentDoY += dosHeights[idx] + 6;
    });

    // Right card: DON'Ts
    doc.rect(rightX, ruleStartY, rightWidth, guardrailBoxHeight).fill('#fef2f2');
    doc.strokeColor('#fecaca').lineWidth(0.5).rect(rightX, ruleStartY, rightWidth, guardrailBoxHeight).stroke();
    doc.fillColor('#b91c1c').fontSize(8).font('Helvetica-Bold').text('STRICT VISUAL DON\'TS (AVOID):', rightX + 10, ruleStartY + 8, { width: rightWidth - 20 });

    let currentDontY = ruleStartY + 22;
    donts.slice(0, 3).forEach((d: string, idx: number) => {
      doc.fillColor('#b91c1c').fontSize(7.5).font('Helvetica-Bold').text('•', rightX + 10, currentDontY);
      doc.fillColor('#991b1b').fontSize(7.5).font('Helvetica').text(d, rightX + 18, currentDontY, { width: rightWidth - 28, lineGap: 1 });
      currentDontY += dontsHeights[idx] + 6;
    });

    doc.y = ruleStartY + guardrailBoxHeight + 10;
    doc.x = 40;

    // Footer on Page 2
    renderFooter();

    doc.end();
  });
}
