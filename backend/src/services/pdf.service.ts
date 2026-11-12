import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import { resolveSafeMediaPath } from './storage.service.js';

const FLOXA_UI = {
  bg: '#04110B',
  card: '#0A2117',
  cardAlt: '#071911',
  cardElevated: '#0E2D1F',
  border: '#1A402E',
  borderStrong: '#255B41',
  mint: '#4DFFA0',
  emerald: '#34D399',
  text: '#F3F8F4',
  textBody: '#B4C8BE',
  textMuted: '#8CA89B',
  dangerBg: '#140B0C',
  dangerBorder: '#3D1C20',
  dangerText: '#F87171',
};

function attachDarkPageBackground(doc: PDFKit.PDFDocument, bgColor: string = FLOXA_UI.bg) {
  const fillBg = () => {
    const curX = doc.x;
    const curY = doc.y;
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgColor);
    doc.restore();
    doc.x = curX;
    doc.y = curY;
  };
  fillBg();
  doc.on('pageAdded', fillBg);
}

function stampDarkFootersAndHeaders(
  doc: PDFKit.PDFDocument,
  options: {
    mx?: number;
    label: string;
    runningHeader?: string;
    rightHeader?: string;
  }
) {
  const mx = options.mx ?? 42;
  const range = doc.bufferedPageRange();
  const cw = doc.page.width - mx * 2;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const prevBottom = doc.page.margins.bottom;
    const prevTop = doc.page.margins.top;
    doc.page.margins.bottom = 0;
    doc.page.margins.top = 0;

    if (options.runningHeader && i > range.start) {
      doc.rect(mx, 16, cw, 20).fill(FLOXA_UI.card);
      doc.strokeColor(FLOXA_UI.border).lineWidth(0.6).rect(mx, 16, cw, 20).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(FLOXA_UI.text)
        .text(options.runningHeader.toUpperCase(), mx + 10, 22, { width: cw - 150, lineBreak: false, ellipsis: true });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(FLOXA_UI.mint)
        .text((options.rightHeader || 'FLOXA STUDIO').toUpperCase(), mx, 22, { width: cw - 10, align: 'right', lineBreak: false });
    }

    const footerLineY = doc.page.height - 44;
    const footerTextY = doc.page.height - 35;
    doc.strokeColor(FLOXA_UI.border).lineWidth(0.6).moveTo(mx, footerLineY).lineTo(mx + cw, footerLineY).stroke();
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(FLOXA_UI.mint)
      .text('FLOXA STUDIO', mx, footerTextY, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.2).fillColor(FLOXA_UI.textMuted)
      .text(options.label, mx + 72, footerTextY, { width: cw - 132, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(FLOXA_UI.text)
      .text(`Page ${i + 1} of ${range.count}`, mx, footerTextY, { width: cw, align: 'right', lineBreak: false });

    doc.page.margins.bottom = prevBottom;
    doc.page.margins.top = prevTop;
  }
}

function drawFloxaBanner(
  doc: PDFKit.PDFDocument,
  opts: {
    mx: number;
    cw: number;
    eyebrow: string;
    title: string;
    subtitle?: string;
    badgeText?: string;
    badgeBg?: string;
    badgeTextColor?: string;
  }
) {
  const bannerY = 28;
  const bannerH = opts.subtitle ? 60 : 50;
  doc.roundedRect(opts.mx, bannerY, opts.cw, bannerH, 6)
    .fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
  doc.rect(opts.mx, bannerY + 6, 3, bannerH - 12).fill(FLOXA_UI.mint);

  const badgeW = opts.badgeText ? 128 : 0;
  const textW = opts.cw - 32 - (badgeW ? badgeW + 12 : 0);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(FLOXA_UI.mint)
    .text(opts.eyebrow.toUpperCase(), opts.mx + 14, bannerY + 11, { width: textW, characterSpacing: 1.0, lineBreak: false, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(13.5).fillColor(FLOXA_UI.text)
    .text(opts.title.toUpperCase(), opts.mx + 14, bannerY + 23, { width: textW, lineBreak: false, ellipsis: true });
  if (opts.subtitle) {
    doc.font('Helvetica').fontSize(8).fillColor(FLOXA_UI.textMuted)
      .text(opts.subtitle, opts.mx + 14, bannerY + 42, { width: textW, lineBreak: false, ellipsis: true });
  }

  if (opts.badgeText) {
    const bx = opts.mx + opts.cw - badgeW - 12;
    const by = bannerY + Math.round((bannerH - 22) / 2);
    doc.roundedRect(bx, by, badgeW, 22, 4)
      .fillAndStroke(opts.badgeBg || FLOXA_UI.cardElevated, FLOXA_UI.borderStrong);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(opts.badgeTextColor || FLOXA_UI.mint)
      .text(opts.badgeText.toUpperCase(), bx, by + 7, { width: badgeW, align: 'center', lineBreak: false });
  }

  doc.y = bannerY + bannerH + 10;
  doc.x = opts.mx;
}

function drawMetaStrip(
  doc: PDFKit.PDFDocument,
  mx: number,
  cw: number,
  items: Array<{ label: string; value: string; highlight?: boolean }>
) {
  const y = doc.y;
  const h = 36;
  doc.roundedRect(mx, y, cw, h, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
  const colW = cw / items.length;
  items.forEach((m, idx) => {
    const x = mx + idx * colW;
    if (idx > 0) {
      doc.strokeColor(FLOXA_UI.border).lineWidth(0.6).moveTo(x, y + 6).lineTo(x, y + h - 6).stroke();
    }
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(FLOXA_UI.mint)
      .text(m.label.toUpperCase(), x + 10, y + 7, { width: colW - 20, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(m.highlight ? FLOXA_UI.mint : FLOXA_UI.text)
      .text(m.value || '-', x + 10, y + 18, { width: colW - 20, lineBreak: false, ellipsis: true });
  });
  doc.y = y + h + 8;
  doc.x = mx;
}

function drawSectionHeading(
  doc: PDFKit.PDFDocument,
  mx: number,
  cw: number,
  title: string,
  num?: string,
  minSpaceNeeded: number = 125
) {
  if (doc.y > doc.page.height - minSpaceNeeded) {
    doc.addPage();
    doc.y = 48;
  } else {
    doc.y += 8;
  }
  const y = doc.y;
  if (num) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(FLOXA_UI.mint)
      .text(num, mx, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(FLOXA_UI.text)
      .text(title.toUpperCase(), mx + 22, y, { width: cw - 22, characterSpacing: 0.4 });
  } else {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(FLOXA_UI.text)
      .text(title.toUpperCase(), mx, y, { width: cw, characterSpacing: 0.4 });
  }
  const lineY = doc.y + 4;
  doc.strokeColor(FLOXA_UI.border).lineWidth(0.75).moveTo(mx, lineY).lineTo(mx + cw, lineY).stroke();
  doc.strokeColor(FLOXA_UI.mint).lineWidth(1.5).moveTo(mx, lineY).lineTo(mx + 34, lineY).stroke();
  doc.y = lineY + 8;
  doc.x = mx;
}

function drawKeyValueList(
  doc: PDFKit.PDFDocument,
  mx: number,
  cw: number,
  rows: Array<{ label: string; value: any }>,
  labelW: number = 148
) {
  const valW = cw - labelW - 20;
  rows.forEach((row, idx) => {
    const valText = row.value !== undefined && row.value !== null && String(row.value).trim() !== ''
      ? String(row.value)
      : '-';
    doc.font('Helvetica-Bold').fontSize(8.2);
    const lh = doc.heightOfString(row.label, { width: labelW });
    doc.font('Helvetica').fontSize(8.3);
    const vh = doc.heightOfString(valText, { width: valW, lineGap: 1.6 });
    const rowH = Math.max(lh, vh) + 10;

    if (doc.y + rowH > doc.page.height - 58) {
      doc.addPage();
      doc.y = 48;
    }

    const y = doc.y;
    doc.rect(mx, y, cw, rowH).fill(idx % 2 === 0 ? FLOXA_UI.card : FLOXA_UI.cardAlt);
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.text)
      .text(row.label, mx + 10, y + 5, { width: labelW });
    doc.font('Helvetica').fontSize(8.3).fillColor(FLOXA_UI.textBody)
      .text(valText, mx + labelW + 14, y + 5, { width: valW, lineGap: 1.6 });
    doc.strokeColor(FLOXA_UI.border).lineWidth(0.5).moveTo(mx, y + rowH).lineTo(mx + cw, y + rowH).stroke();
    doc.y = y + rowH;
  });
  doc.x = mx;
}

export async function generateBasicAgreementPdf(project: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 42, bottom: 56, left: 42, right: 42 },
      autoFirstPage: true,
      bufferPages: true,
      size: 'A4',
    });
    const buffers: Buffer[] = [];
    const mx = 42;
    const cw = 511.28;

    attachDarkPageBackground(doc);
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const clientCompany = project.companyName || project.client?.companyName || 'Client';

    drawFloxaBanner(doc, {
      mx,
      cw,
      eyebrow: 'FLOXA STUDIO  •  CLIENT ENGAGEMENT',
      title: 'PROJECT SERVICES AGREEMENT',
      subtitle: `${project.title || clientCompany}  •  ${project.sector || 'Brand Identity & Design'}`,
      badgeText: 'SERVICES AGREEMENT',
    });

    drawMetaStrip(doc, mx, cw, [
      { label: 'DATE', value: dateStr },
      { label: 'PROJECT', value: project.title || '-' },
      { label: 'CLIENT COMPANY', value: clientCompany },
      { label: 'SECTOR', value: project.sector || '-' },
    ]);

    // Section 1: Scope of Work
    drawSectionHeading(doc, mx, cw, 'Scope of Services', '01');
    const scopeText =
      `The Consultant agrees to provide brand clarity, identity design, and creative consulting services for ${project.title}. ` +
      `Services include discovery analysis, brand positioning, moodboards, identity concepts, and agreed deliverables.`;
    doc.font('Helvetica').fontSize(8.8);
    const scopeH = doc.heightOfString(scopeText, { width: cw - 24, lineGap: 2 });
    const scopeBoxY = doc.y;
    const scopeBoxH = Math.max(44, scopeH + 18);
    doc.roundedRect(mx, scopeBoxY, cw, scopeBoxH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.rect(mx, scopeBoxY, 3, scopeBoxH).fill(FLOXA_UI.mint);
    doc.font('Helvetica').fontSize(8.8).fillColor(FLOXA_UI.textBody)
      .text(scopeText, mx + 14, scopeBoxY + 9, { width: cw - 24, lineGap: 2 });
    doc.y = scopeBoxY + scopeBoxH + 8;

    // Section 2: Compensation & Payment Terms
    drawSectionHeading(doc, mx, cw, 'Investment & Payment Terms', '02', 140);
    const valStr = `Rs ${project.projectValue?.toLocaleString('en-IN') || 0}`;
    drawKeyValueList(doc, mx, cw, [
      { label: 'Total Project Value', value: valStr },
      { label: 'Advance Milestone', value: `${project.advancePercentage}% upon signing of this agreement.` },
      { label: 'Mid Milestone', value: `${project.midPercentage}% upon concept approval.` },
      { label: 'Final Milestone', value: `${project.finalPercentage}% upon delivery of final assets.` },
    ], 150);
    doc.y += 8;

    // Section 3: Revisions & Sign-off
    drawSectionHeading(doc, mx, cw, 'Revisions & Completion', '03', 110);
    const revText =
      `Deliverables include up to ${project.revisionLimit || '3 revisions'}. ` +
      `Upon final payment and client sign-off, all intellectual property rights in approved final assets are transferred to the Client.`;
    doc.font('Helvetica').fontSize(8.8);
    const revH = doc.heightOfString(revText, { width: cw - 24, lineGap: 2 });
    const revBoxY = doc.y;
    const revBoxH = Math.max(44, revH + 18);
    doc.roundedRect(mx, revBoxY, cw, revBoxH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.rect(mx, revBoxY, 3, revBoxH).fill(FLOXA_UI.mint);
    doc.font('Helvetica').fontSize(8.8).fillColor(FLOXA_UI.textBody)
      .text(revText, mx + 14, revBoxY + 9, { width: cw - 24, lineGap: 2 });
    doc.y = revBoxY + revBoxH + 14;

    // Signatures placeholder
    drawSectionHeading(doc, mx, cw, 'Confirmed and Agreed', '04', 125);
    const sigY = doc.y + 2;
    const sigGap = 14;
    const sigW = (cw - sigGap) / 2;
    const sigH = 74;

    doc.roundedRect(mx, sigY, sigW, sigH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(FLOXA_UI.mint).text('FOR THE CONSULTANT', mx + 14, sigY + 12, { lineBreak: false });
    doc.strokeColor(FLOXA_UI.borderStrong).lineWidth(0.8).moveTo(mx + 14, sigY + 44).lineTo(mx + sigW - 14, sigY + 44).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(FLOXA_UI.text)
      .text(project.consultant?.name || 'Consultant', mx + 14, sigY + 51, { width: sigW - 28, lineBreak: false, ellipsis: true });

    const rightSigX = mx + sigW + sigGap;
    doc.roundedRect(rightSigX, sigY, sigW, sigH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor(FLOXA_UI.mint).text('FOR THE CLIENT', rightSigX + 14, sigY + 12, { lineBreak: false });
    doc.strokeColor(FLOXA_UI.borderStrong).lineWidth(0.8).moveTo(rightSigX + 14, sigY + 44).lineTo(rightSigX + sigW - 14, sigY + 44).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(FLOXA_UI.text)
      .text(project.client?.name || project.companyName || 'Client Representative', rightSigX + 14, sigY + 51, { width: sigW - 28, lineBreak: false, ellipsis: true });

    stampDarkFootersAndHeaders(doc, {
      mx,
      label: 'CONFIDENTIAL SERVICES AGREEMENT  •  FLOXA STUDIO',
      runningHeader: 'PROJECT SERVICES AGREEMENT',
    });

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
    const doc = new PDFDocument({
      margins: { top: 42, bottom: 56, left: 42, right: 42 },
      autoFirstPage: true,
      bufferPages: true,
      size: 'A4',
    });
    const buffers: Buffer[] = [];
    const mx = 42;
    const cw = 511.28;

    attachDarkPageBackground(doc);
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const fullBuffer = Buffer.concat(buffers);
      const hash = crypto.createHash('sha256').update(fullBuffer).digest('hex');
      resolve({ pdfBuffer: fullBuffer, sha256Hash: hash });
    });
    doc.on('error', (err) => reject(err));

    drawFloxaBanner(doc, {
      mx,
      cw,
      eyebrow: 'FLOXA STUDIO  •  EXECUTED LEGAL RECORD',
      title: 'EXECUTED SERVICES AGREEMENT',
      subtitle: `${project.title || project.companyName}  •  Ref: ${project.portalToken || '-'}`,
      badgeText: 'EXECUTED & SIGNED',
      badgeBg: FLOXA_UI.cardElevated,
      badgeTextColor: FLOXA_UI.mint,
    });

    drawMetaStrip(doc, mx, cw, [
      { label: 'AGREEMENT REFERENCE', value: project.portalToken || '-' },
      { label: 'PROJECT TITLE', value: project.title || '-' },
      { label: 'CLIENT COMPANY', value: project.companyName || '-' },
      { label: 'EXECUTION DATE', value: signatureData.signedAt.toUTCString(), highlight: true },
    ]);

    drawSectionHeading(doc, mx, cw, 'Terms & Compensation', '01');
    drawKeyValueList(doc, mx, cw, [
      { label: 'Total Agreed Value', value: `Rs ${project.projectValue?.toLocaleString('en-IN') || 0}` },
      { label: 'Milestone Schedule', value: `${project.advancePercentage}% Advance / ${project.midPercentage}% Mid / ${project.finalPercentage}% Final` },
      { label: 'Revision Allowance', value: project.revisionLimit || '3 revisions' },
    ], 150);
    doc.y += 10;

    // Digital Signature Certificate Block
    drawSectionHeading(doc, mx, cw, 'Digital Signature Certificate', '02', 175);
    const certY = doc.y;
    const certH = 128;
    doc.roundedRect(mx, certY, cw, certH, 6).fillAndStroke(FLOXA_UI.card, FLOXA_UI.borderStrong);
    doc.rect(mx, certY + 8, 3, certH - 16).fill(FLOXA_UI.mint);

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(FLOXA_UI.mint)
      .text('VERIFIED DIGITAL SIGNATURE CERTIFICATE', mx + 16, certY + 14, { lineBreak: false });

    const leftMetaX = mx + 16;
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.textMuted).text('Signer Name:', leftMetaX, certY + 36, { continued: true });
    doc.font('Helvetica-Bold').fillColor(FLOXA_UI.text).text(` ${signatureData.signerName}`);

    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.textMuted).text('Signature Method:', leftMetaX, certY + 53, { continued: true });
    doc.font('Helvetica').fillColor(FLOXA_UI.textBody).text(` ${signatureData.signatureMethod.toUpperCase()}`);

    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.textMuted).text('Timestamp:', leftMetaX, certY + 70, { continued: true });
    doc.font('Helvetica').fillColor(FLOXA_UI.textBody).text(` ${signatureData.signedAt.toISOString()}`);

    if (signatureData.ipAddress) {
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.textMuted).text('Signer IP:', leftMetaX, certY + 87, { continued: true });
      doc.font('Helvetica').fillColor(FLOXA_UI.textBody).text(` ${signatureData.ipAddress}`);
    }

    // Signature capture pad on right
    const padX = mx + cw - 196;
    const padY = certY + 26;
    const padW = 180;
    const padH = 76;
    if (signatureData.signatureImageBuffer) {
      // Crisp light signature pad so dark-ink signatures remain clearly legible
      doc.roundedRect(padX, padY, padW, padH, 4).fillAndStroke('#F3F8F4', FLOXA_UI.borderStrong);
      try {
        doc.image(signatureData.signatureImageBuffer, padX + 12, padY + 8, { width: padW - 24, height: padH - 16, fit: [padW - 24, padH - 16] });
      } catch {
        doc.font('Helvetica-Oblique').fontSize(11).fillColor('#04110B')
          .text(`[Digital Signature: ${signatureData.signerName}]`, padX + 10, padY + 30, { width: padW - 20, align: 'center' });
      }
    } else {
      doc.roundedRect(padX, padY, padW, padH, 4).fillAndStroke(FLOXA_UI.cardAlt, FLOXA_UI.borderStrong);
      doc.font('Helvetica-Oblique').fontSize(15).fillColor(FLOXA_UI.mint)
        .text(signatureData.signerName, padX + 10, padY + 26, { width: padW - 20, align: 'center' });
    }
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(FLOXA_UI.textMuted)
      .text('AUTHORIZED SIGNATORY', padX, padY + padH + 5, { width: padW, align: 'center', lineBreak: false });

    doc.y = certY + certH + 12;

    // Page 2: Evidence and Appendices Audit Trail (if any)
    if (agreement.appendices && agreement.appendices.length > 0) {
      doc.addPage();
      doc.y = 48;
      drawSectionHeading(doc, mx, cw, 'Appendix: Project Audit Trail', '03');

      agreement.appendices.forEach((app: any, index: number) => {
        const contentStr = app.content
          ? (typeof app.content === 'string' ? app.content : JSON.stringify(app.content))
          : '';
        doc.font('Courier').fontSize(7.8);
        const contentH = contentStr ? doc.heightOfString(contentStr, { width: cw - 28 }) : 0;
        const cardH = 38 + (contentH > 0 ? contentH + 8 : 0);

        if (doc.y + cardH > doc.page.height - 58) {
          doc.addPage();
          doc.y = 48;
        }
        const ay = doc.y;
        doc.roundedRect(mx, ay, cw, cardH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(FLOXA_UI.text)
          .text(`${index + 1}. ${app.title} (${app.eventType})`, mx + 12, ay + 9, { width: cw - 24 });
        doc.font('Helvetica').fontSize(7.8).fillColor(FLOXA_UI.mint)
          .text(`Recorded: ${new Date(app.createdAt).toUTCString()}`, mx + 12, ay + 23, { width: cw - 24 });
        if (contentStr) {
          doc.font('Courier').fontSize(7.8).fillColor(FLOXA_UI.textBody)
            .text(contentStr, mx + 12, ay + 36, { width: cw - 24 });
        }
        doc.y = ay + cardH + 8;
      });
    }

    stampDarkFootersAndHeaders(doc, {
      mx,
      label: 'VERIFIED DIGITAL SIGNATURE RECORD  •  FLOXA STUDIO',
      runningHeader: 'EXECUTED SERVICES AGREEMENT',
      rightHeader: 'AUDIT TRAIL',
    });

    doc.end();
  });
}

export async function generateGeneratedAgreementPdf(snapshot: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margins: { top: 42, bottom: 56, left: 42, right: 42 },
      autoFirstPage: true,
      bufferPages: true,
      compress: false,
      size: 'A4',
    });
    const buffers: Buffer[] = [];
    const mx = 42;
    const cw = 511.28;

    attachDarkPageBackground(doc);
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const isAccepted = snapshot.status === 'accepted';
    const project = snapshot.project || {};
    const client = snapshot.client || {};
    const consultant = snapshot.consultant || {};
    const discovery = snapshot.discovery || {};
    const brandDna = snapshot.brand_dna || {};
    const moodboard = snapshot.selected_moodboard || {};

    drawFloxaBanner(doc, {
      mx,
      cw,
      eyebrow: 'FLOXA STUDIO  •  PROJECT AGREEMENT SNAPSHOT',
      title: 'FLOXA GENERATED AGREEMENT',
      subtitle: `${project.title || project.company_name || 'Brand Engagement'}  •  Version ${snapshot.version || 1}`,
      badgeText: `${(snapshot.status || 'draft').toUpperCase()}  •  V${snapshot.version || 1}`,
      badgeBg: isAccepted ? FLOXA_UI.cardElevated : FLOXA_UI.cardAlt,
      badgeTextColor: isAccepted ? FLOXA_UI.mint : FLOXA_UI.textBody,
    });

    const metaItems: Array<{ label: string; value: string; highlight?: boolean }> = [
      { label: 'GENERATED AT', value: snapshot.generated_at ? new Date(snapshot.generated_at).toLocaleString('en-US') : '-' },
      { label: 'PDF GENERATED AT', value: snapshot.pdf_generated_at ? new Date(snapshot.pdf_generated_at).toLocaleString('en-US') : '-' },
    ];
    if (snapshot.accepted_at) {
      metaItems.push({ label: 'ACCEPTED AT', value: new Date(snapshot.accepted_at).toLocaleString('en-US'), highlight: true });
    }
    drawMetaStrip(doc, mx, cw, metaItems);

    // Section 1: Project and Client
    drawSectionHeading(doc, mx, cw, 'Project and Client', '01');
    const projectRows: Array<{ label: string; value: any }> = [
      { label: 'Project', value: project.title || project.company_name },
      { label: 'Company', value: project.company_name || client.company_name },
      { label: 'Sector / Industry', value: project.sector || client.industry },
      { label: 'Project Value', value: project.project_value ? `Rs ${project.project_value}` : '-' },
      { label: 'Client Name', value: client.name },
      { label: 'Client Email', value: client.email },
    ];
    if (client.phone) projectRows.push({ label: 'Client Phone', value: client.phone });
    if (client.website) projectRows.push({ label: 'Client Website', value: client.website });
    drawKeyValueList(doc, mx, cw, projectRows);

    // Section 2: Consultant
    drawSectionHeading(doc, mx, cw, 'Consultant', '02');
    const consultantRows: Array<{ label: string; value: any }> = [
      { label: 'Name', value: consultant.name },
      { label: 'Email', value: consultant.email },
    ];
    if (consultant.company) consultantRows.push({ label: 'Company', value: consultant.company });
    drawKeyValueList(doc, mx, cw, consultantRows);

    // Section 3: Discovery Summary
    drawSectionHeading(doc, mx, cw, 'Discovery Summary', '03');
    const discoveryRows: Array<{ label: string; value: any }> = [
      { label: 'What the business does', value: discovery.what_business_does },
      { label: 'Target customer', value: discovery.target_customer },
      { label: 'Why choose us', value: discovery.why_choose_us },
      { label: 'Brand feeling', value: discovery.brand_feeling },
      { label: 'Audience archetype', value: discovery.audience_archetype },
    ];
    if (Array.isArray(discovery.emotions) && discovery.emotions.length > 0) {
      discoveryRows.push({ label: 'Emotions', value: discovery.emotions.join(', ') });
    }
    if (Array.isArray(discovery.visual_styles) && discovery.visual_styles.length > 0) {
      discoveryRows.push({ label: 'Visual Styles', value: discovery.visual_styles.join(', ') });
    }
    drawKeyValueList(doc, mx, cw, discoveryRows);

    // Section 4: Brand DNA Summary
    drawSectionHeading(doc, mx, cw, 'Brand DNA Summary', '04');
    drawKeyValueList(doc, mx, cw, [
      { label: 'Personality Cluster', value: brandDna.personality_cluster },
      { label: 'Business Summary', value: brandDna.business_summary },
      { label: 'Target Audience', value: brandDna.target_audience_summary },
      { label: 'Positioning', value: brandDna.positioning_summary },
      { label: 'Brand Feeling', value: brandDna.brand_feeling_summary },
      { label: 'Visual Direction', value: brandDna.visual_direction_summary },
      { label: 'Competitors', value: brandDna.competitor_summary },
    ]);

    // Section 5: Selected Moodboard
    drawSectionHeading(doc, mx, cw, 'Selected Moodboard', '05');
    drawKeyValueList(doc, mx, cw, [
      { label: 'Title', value: moodboard.title },
      { label: 'Description', value: moodboard.description },
      { label: 'Selected at', value: moodboard.selected_at ? new Date(moodboard.selected_at).toLocaleString('en-US') : '-' },
    ]);

    // Section 6: Approved Concepts
    const approvedConcepts = snapshot.approved_concepts || [];
    drawSectionHeading(doc, mx, cw, 'Approved Concepts', '06');
    if (approvedConcepts.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('No approved concepts recorded.', mx, doc.y);
      doc.y += 14;
    } else {
      approvedConcepts.forEach((c: any, i: number) => {
        const lines: string[] = [];
        if (c.approved_at) lines.push(`Approved at: ${new Date(c.approved_at).toLocaleString('en-US')}`);
        if (c.feedback) lines.push(`Client feedback: ${c.feedback}`);
        if (c.description) lines.push(`Description: ${c.description}`);
        const detailText = lines.join('\n');
        doc.font('Helvetica').fontSize(8.2);
        const detailH = detailText ? doc.heightOfString(detailText, { width: cw - 24, lineGap: 1.5 }) : 0;
        const cardH = 26 + (detailH > 0 ? detailH + 8 : 0);

        if (doc.y + cardH > doc.page.height - 58) {
          doc.addPage();
          doc.y = 48;
        }
        const cy = doc.y;
        doc.roundedRect(mx, cy, cw, cardH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
        doc.rect(mx, cy + 4, 2.5, cardH - 8).fill(FLOXA_UI.mint);
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor(FLOXA_UI.text)
          .text(`${i + 1}. ${c.title || 'Concept'} (v${c.version || 1}) — ${(c.status || 'approved').toUpperCase()}`, mx + 12, cy + 7, { width: cw - 24 });
        if (detailText) {
          doc.font('Helvetica').fontSize(8.2).fillColor(FLOXA_UI.textBody)
            .text(detailText, mx + 12, cy + 22, { width: cw - 24, lineGap: 1.5 });
        }
        doc.y = cy + cardH + 6;
      });
    }

    // Section 7: Requested Concept Revisions
    const requestedRevisions = snapshot.requested_concept_revisions || [];
    if (requestedRevisions.length > 0) {
      drawSectionHeading(doc, mx, cw, 'Requested Concept Revisions', '07');
      requestedRevisions.forEach((c: any, i: number) => {
        const fb = c.feedback ? `Requested Changes: ${c.feedback}` : '';
        doc.font('Helvetica').fontSize(8.2);
        const fbH = fb ? doc.heightOfString(fb, { width: cw - 24, lineGap: 1.5 }) : 0;
        const cardH = 26 + (fbH > 0 ? fbH + 8 : 0);

        if (doc.y + cardH > doc.page.height - 58) {
          doc.addPage();
          doc.y = 48;
        }
        const cy = doc.y;
        doc.roundedRect(mx, cy, cw, cardH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor(FLOXA_UI.text)
          .text(`${i + 1}. ${c.title || 'Concept'} (v${c.version || 1})`, mx + 12, cy + 7, { width: cw - 24 });
        if (fb) {
          doc.font('Helvetica').fontSize(8.2).fillColor(FLOXA_UI.textBody)
            .text(fb, mx + 12, cy + 22, { width: cw - 24, lineGap: 1.5 });
        }
        doc.y = cy + cardH + 6;
      });
    }

    // Section 8: Approval Evidence Timeline
    const timeline = snapshot.approval_evidence_timeline || [];
    drawSectionHeading(doc, mx, cw, 'Approval Evidence Timeline', requestedRevisions.length > 0 ? '08' : '07');
    if (timeline.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('No activity evidence recorded.', mx, doc.y);
      doc.y += 14;
    } else {
      const timelineRows = timeline.map((item: any) => ({
        label: item.created_at ? new Date(item.created_at).toLocaleString('en-US') : '-',
        value: `${item.action || '-'}${item.description ? ` — ${item.description}` : ''}`,
      }));
      drawKeyValueList(doc, mx, cw, timelineRows, 130);
    }

    // Section 9: Payment Schedule
    const payments = snapshot.payment_milestones || [];
    drawSectionHeading(doc, mx, cw, 'Payment Schedule', requestedRevisions.length > 0 ? '09' : '08');
    if (payments.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('No payment schedule defined.', mx, doc.y);
      doc.y += 14;
    } else {
      drawKeyValueList(
        doc,
        mx,
        cw,
        payments.map((p: any) => ({
          label: `${(p.type || '').toUpperCase()} Milestone`,
          value: `${p.percentage}% | Amount: Rs ${p.amount || 0} | Status: ${(p.status || 'pending').toUpperCase()}`,
        }))
      );
    }

    // Section 10: Expected Deliverables
    const deliverables = snapshot.expected_deliverables || [];
    drawSectionHeading(doc, mx, cw, 'Expected Deliverables', requestedRevisions.length > 0 ? '10' : '09');
    if (deliverables.length === 0) {
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('No deliverables listed.', mx, doc.y);
      doc.y += 14;
    } else {
      drawKeyValueList(
        doc,
        mx,
        cw,
        deliverables.map((d: any, i: number) => ({
          label: `${i + 1}. ${d.title || 'Deliverable'} [${(d.status || 'pending').toUpperCase()}]`,
          value: d.description || '-',
        })),
        200
      );
    }

    stampDarkFootersAndHeaders(doc, {
      mx,
      label: 'CONFIDENTIAL AGREEMENT SNAPSHOT  •  FLOXA STUDIO',
      runningHeader: 'FLOXA GENERATED AGREEMENT',
    });

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
      margins: { top: 42, bottom: 56, left: 42, right: 42 },
      autoFirstPage: true,
      bufferPages: true,
      size: 'A4',
    });
    const buffers: Buffer[] = [];
    const mx = 42;
    const cw = 511.28;

    const theme = extractProjectBrandTheme(project);
    attachDarkPageBackground(doc);

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand Project';
    const clientName = project.client?.name || project.clientProfile?.clientName || project.companyName || 'Client';
    const sector = project.clientProfile?.industry || project.sector || 'Brand Identity & Design';
    const dateStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    drawFloxaBanner(doc, {
      mx,
      cw,
      eyebrow: 'FLOXA STUDIO  •  BRAND DELIVERABLES HANDOVER',
      title: `${companyName.toUpperCase()} — BRAND IDENTITY SPECIFICATION`,
      subtitle: `${sector}  •  Archetype: ${theme.cluster}`,
      badgeText: 'FINAL RELEASE',
      badgeBg: FLOXA_UI.mint,
      badgeTextColor: FLOXA_UI.bg,
    });

    drawMetaStrip(doc, mx, cw, [
      { label: 'PREPARED FOR', value: `${clientName} (${companyName})` },
      { label: 'SECTOR / DOMAIN', value: sector },
      { label: 'HANDOVER DATE', value: dateStr, highlight: true },
    ]);

    const renderBullet = (text: string, boldPrefix?: string) => {
      if (doc.y > doc.page.height - 62) {
        doc.addPage();
        doc.y = 48;
      }
      doc.circle(mx + 6, doc.y + 4.5, 2.2).fill(FLOXA_UI.mint);
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textBody);
      if (boldPrefix) {
        doc.font('Helvetica-Bold').fillColor(FLOXA_UI.mint).text(`${boldPrefix}: `, mx + 16, doc.y, { continued: true, width: cw - 18 });
        doc.font('Helvetica').fillColor(FLOXA_UI.textBody).text(text);
      } else {
        doc.text(text, mx + 16, doc.y, { width: cw - 18 });
      }
      doc.moveDown(0.22);
    };

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

      const maxImgW = cw - 30;
      const maxImgH = 150;

      let renderImgW = 0;
      let renderImgH = 0;
      if (safePath && imgWidth > 0 && imgHeight > 0) {
        const scale = Math.min(maxImgW / imgWidth, maxImgH / imgHeight, 1);
        renderImgW = Math.round(imgWidth * scale);
        renderImgH = Math.round(imgHeight * scale);
      }

      let extraTextH = 26;
      if (description) extraTextH += 14;
      if (clientFeedback) extraTextH += 15;

      const totalCardH = extraTextH + (renderImgH > 0 ? renderImgH + 16 : 8);

      if (doc.y + totalCardH > doc.page.height - 62) {
        doc.addPage();
        doc.y = 48;
      }

      const cardY = doc.y + 4;
      doc.roundedRect(mx, cardY, cw, totalCardH, 6).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
      doc.rect(mx, cardY + 6, 2.5, totalCardH - 12).fill(FLOXA_UI.mint);

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(FLOXA_UI.text)
        .text(title, mx + 14, cardY + 9, { width: cw - 170, ellipsis: true, lineBreak: false });

      if (badgeText) {
        const isApproved = badgeText.toLowerCase().includes('approved') || badgeText.toLowerCase().includes('selected');
        const badgeBg = isApproved ? FLOXA_UI.mint : FLOXA_UI.cardElevated;
        const badgeColor = isApproved ? FLOXA_UI.bg : FLOXA_UI.mint;
        const badgeW = 136;
        const bx = mx + cw - badgeW - 12;

        doc.roundedRect(bx, cardY + 7, badgeW, 16, 3).fillAndStroke(badgeBg, FLOXA_UI.borderStrong);
        doc.font('Helvetica-Bold').fontSize(7.2).fillColor(badgeColor)
          .text(badgeText.toUpperCase(), bx, cardY + 11, { align: 'center', width: badgeW, lineBreak: false });
      }

      let currentTextY = cardY + 26;
      if (description) {
        doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textBody)
          .text(description, mx + 14, currentTextY, { width: cw - 28, ellipsis: true });
        currentTextY += 14;
      }

      if (clientFeedback) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(FLOXA_UI.mint)
          .text(`Client Feedback: "${clientFeedback}"`, mx + 14, currentTextY, { width: cw - 28, ellipsis: true });
        currentTextY += 15;
      }

      if (openedImg && renderImgH > 0) {
        const imgX = mx + (cw - renderImgW) / 2;
        const imgY = currentTextY + 4;
        doc.roundedRect(imgX - 1, imgY - 1, renderImgW + 2, renderImgH + 2, 4)
          .fillAndStroke(FLOXA_UI.bg, FLOXA_UI.borderStrong);
        doc.image(openedImg, imgX, imgY, { width: renderImgW, height: renderImgH });
      }

      doc.y = cardY + totalCardH + 10;
      doc.x = mx;
    };

    // 1. PROJECT SUMMARY
    drawSectionHeading(doc, mx, cw, 'Executive Summary & Engagement Scope', '01', 90);
    doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textBody).text(
      `This document certifies the successful design execution, identity engineering, and final deliverable package ` +
      `prepared for ${companyName}. The brand identity framework codified within this delivery provides an authoritative, ` +
      `coherent visual language engineered for high market distinction and sustainable commercial scale.`,
      mx,
      doc.y,
      { width: cw, lineGap: 1.8 }
    );
    doc.moveDown(0.35);

    // 2. PROJECT OBJECTIVES
    drawSectionHeading(doc, mx, cw, 'Deliverable Standards & Objectives Met', '02', 90);
    const objectives = [
      `Established a defensible, premium market positioning and visual authority for ${companyName}.`,
      'Engineered scalable vector logo marks, typography hierarchies, and color tokens for digital and physical deployment.',
      'Completed client-approved visual direction and concept iterations through collaborative sign-offs.',
      'Full, irrevocable transfer of intellectual property and commercial copyright upon milestone completion.',
    ];
    objectives.forEach((obj) => renderBullet(obj));
    doc.moveDown(0.3);

    // 3. BRAND STRATEGY ARCHITECTURE
    drawSectionHeading(doc, mx, cw, 'Brand Strategy & Identity Architecture', '03', 100);
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
    doc.moveDown(0.3);

    // 4. SELECTED VISUAL MOODBOARDS
    drawSectionHeading(doc, mx, cw, 'Selected Visual Moodboards & Art Direction', '04', 220);
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
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('Visual moodboard directions recorded in project workspace.', mx, doc.y);
      doc.moveDown(0.3);
    }

    // 5. APPROVED BRAND CONCEPTS & IDENTITY
    drawSectionHeading(doc, mx, cw, 'Approved Brand Concepts & Identity Assets', '05', 220);
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
      doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textMuted).text('Final concept specifications recorded in project workspace.', mx, doc.y);
      doc.moveDown(0.3);
    }

    // 6. PROJECT BUDGET & PAYMENT SETTLEMENT
    drawSectionHeading(doc, mx, cw, 'Project Budget & Payment Settlement Audit', '06', 140);
    const milestones = project.paymentMilestones || [];
    const totalVal = project.projectValue || milestones.reduce((sum: number, m: any) => sum + (m.amount || 0), 0) || 0;
    let totalPaid = 0;

    const budgetCardH = 34 + (milestones.length > 0 ? milestones.length * 18 : 20);
    if (doc.y + budgetCardH > doc.page.height - 62) {
      doc.addPage();
      doc.y = 48;
    }

    const budgetY = doc.y + 2;
    doc.roundedRect(mx, budgetY, cw, budgetCardH, 6).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.roundedRect(mx, budgetY, cw, 22, 4).fillAndStroke(FLOXA_UI.cardElevated, FLOXA_UI.border);

    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(FLOXA_UI.mint)
      .text('MILESTONE STAGE', mx + 14, budgetY + 7, { lineBreak: false })
      .text('PERCENT', mx + 220, budgetY + 7, { lineBreak: false })
      .text('AMOUNT (INR)', mx + 300, budgetY + 7, { lineBreak: false })
      .text('STATUS', mx + 405, budgetY + 7, { lineBreak: false });

    let rowY = budgetY + 27;
    if (milestones.length > 0) {
      milestones.forEach((m: any) => {
        const amt = m.amount || 0;
        const isPaid = m.status === 'paid';
        if (isPaid) totalPaid += amt;
        const statusLabel = isPaid ? 'PAID (Settled)' : (m.status || 'pending').toUpperCase();

        doc.font('Helvetica-Bold').fontSize(8).fillColor(FLOXA_UI.text).text((m.type || 'Milestone').toUpperCase(), mx + 14, rowY, { width: 190, lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(FLOXA_UI.textBody).text(`${m.percentage}%`, mx + 220, rowY, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(FLOXA_UI.text).text(`INR ${amt.toLocaleString('en-IN')}`, mx + 300, rowY, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(isPaid ? FLOXA_UI.mint : FLOXA_UI.textMuted).text(statusLabel, mx + 405, rowY, { lineBreak: false });
        rowY += 17;
      });
    } else {
      totalPaid = totalVal;
      doc.font('Helvetica-Bold').fontSize(8).fillColor(FLOXA_UI.text).text('FULL BRAND ENGAGEMENT', mx + 14, rowY, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(FLOXA_UI.textBody).text('100%', mx + 220, rowY, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(FLOXA_UI.text).text(`INR ${totalVal.toLocaleString('en-IN')}`, mx + 300, rowY, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(FLOXA_UI.mint).text('PAID (Settled)', mx + 405, rowY, { lineBreak: false });
      rowY += 17;
    }

    doc.y = budgetY + budgetCardH + 10;
    doc.x = mx;

    const isFullyPaid = totalPaid >= totalVal && totalVal > 0;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(FLOXA_UI.text)
      .text(`Total Investment: INR ${totalVal.toLocaleString('en-IN')}   |   `, mx, doc.y, { continued: true });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isFullyPaid ? FLOXA_UI.mint : FLOXA_UI.textMuted)
      .text(`Total Settled: INR ${totalPaid.toLocaleString('en-IN')} ${isFullyPaid ? '(100% Cleared)' : ''}`);
    doc.moveDown(0.35);

    // 7. PLATFORM & BRAND DELIVERABLES
    drawSectionHeading(doc, mx, cw, 'Deliverable Asset Package Checklist', '07', 150);
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
    drawSectionHeading(doc, mx, cw, 'Intellectual Property Assignment & Transfer', '08', 140);
    doc.font('Helvetica').fontSize(8.5).fillColor(FLOXA_UI.textBody).text(
      `Upon receipt of settled project fees, the Consultant hereby irrevocably assigns and transfers to ${clientName} ` +
      `(${companyName}) all right, title, and interest in and to the approved final design deliverables and identity marks. ` +
      `The Client holds full commercial, digital, and print reproduction rights worldwide.`,
      mx,
      doc.y,
      { width: cw, lineGap: 1.8 }
    );
    doc.moveDown(0.6);

    // Signature Block
    if (doc.y > doc.page.height - 105) {
      doc.addPage();
      doc.y = 48;
    }

    const signY = doc.y + 4;
    const signGap = 14;
    const signW = (cw - signGap) / 2;
    const signH = 56;
    doc.roundedRect(mx, signY, signW, signH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.strokeColor(FLOXA_UI.borderStrong).lineWidth(0.8).moveTo(mx + 14, signY + 26).lineTo(mx + signW - 14, signY + 26).stroke();
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.text).text('For the Creative Consultant / FLOXA Studio', mx + 14, signY + 31, { width: signW - 28, lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor(FLOXA_UI.mint).text('Authorized Design Lead', mx + 14, signY + 42, { width: signW - 28, lineBreak: false });

    const rSignX = mx + signW + signGap;
    doc.roundedRect(rSignX, signY, signW, signH, 5).fillAndStroke(FLOXA_UI.card, FLOXA_UI.border);
    doc.strokeColor(FLOXA_UI.borderStrong).lineWidth(0.8).moveTo(rSignX + 14, signY + 26).lineTo(rSignX + signW - 14, signY + 26).stroke();
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(FLOXA_UI.text).text(`For the Client: ${clientName}`, rSignX + 14, signY + 31, { width: signW - 28, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(7.5).fillColor(FLOXA_UI.textMuted).text(`${companyName} — Authorized Representative`, rSignX + 14, signY + 42, { width: signW - 28, lineBreak: false, ellipsis: true });

    stampDarkFootersAndHeaders(doc, {
      mx,
      label: 'FLOXA Brand Delivery & Strategy Package  •  Confidential',
      runningHeader: `${companyName.toUpperCase()}  |  OFFICIAL BRAND DELIVERABLES`,
      rightHeader: 'CONFIDENTIAL SPECIFICATION',
    });

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
    const C = FLOXA_UI;

    const companyName = project.clientProfile?.companyName || project.companyName || project.title || 'Brand';
    const sector = project.clientProfile?.industry || project.sector || 'Creative Industry';
    const clientName = project.client?.name || project.clientProfile?.clientName || 'Client';
    const cluster = brandDNA.brandPersonalityCluster || 'Bold Challenger';

    const isDuplicateSector = sector.toLowerCase().trim() === companyName.toLowerCase().trim();
    const subText = isDuplicateSector || !sector
      ? `${companyName.toUpperCase()}  •  ARCHETYPE: ${cluster.toUpperCase()}`
      : `${companyName.toUpperCase()}  •  ${sector.toUpperCase()}  •  ARCHETYPE: ${cluster.toUpperCase()}`;

    const renderHeader = (pageNumber: number) => {
      // Full-bleed FLOXA Dark Forest Emerald canvas
      doc.rect(0, 0, 595.28, 841.89).fill(C.bg);

      // Elevated dark glass header card
      doc.roundedRect(MX, 24, CW, 56, 6).fillAndStroke(C.card, C.border);
      doc.rect(MX, 30, 3, 44).fill(C.mint);

      // Left: FLOXA wordmark + Document Title
      doc.fillColor(C.mint).font('Helvetica-Bold').fontSize(8.2).text('FLOXA', MX + 14, 33, { characterSpacing: 3.5, lineBreak: false });
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(14).text('FLOXA BRAND DNA & CREATIVE BRIEF', MX + 14, 45, { width: 390, lineBreak: false });
      doc.fillColor(C.textMuted).font('Helvetica').fontSize(7.6).text(subText, MX + 14, 64, { width: 400, lineBreak: false });

      // Right: Mint pill page indicator
      const pillW = 78;
      const pillX = MX + CW - pillW - 12;
      doc.roundedRect(pillX, 41, pillW, 20, 4).fillAndStroke(C.cardElevated, C.borderStrong);
      doc.fillColor(C.mint).font('Helvetica-Bold').fontSize(7.5).text(`PAGE ${pageNumber} OF 2`, pillX, 47.5, {
        width: pillW,
        align: 'center',
        lineBreak: false,
      });

      doc.y = 88;
      doc.x = MX;
    };

    const renderSectionTitle = (num: string, title: string) => {
      doc.x = MX;
      doc.y += 8;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.mint).text(num, MX, y, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(title.toUpperCase(), MX + 20, y, {
        width: CW - 20,
        characterSpacing: 0.4,
      });
      const lineY = doc.y + 3;
      doc.strokeColor(C.border).lineWidth(0.75).moveTo(MX, lineY).lineTo(MX + CW, lineY).stroke();
      doc.strokeColor(C.mint).lineWidth(1.5).moveTo(MX, lineY).lineTo(MX + 34, lineY).stroke();
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
        doc.rect(MX, y, CW, rowH).fill(idx % 2 === 0 ? C.card : C.cardAlt);
        doc.font('Helvetica-Bold').fontSize(8.2).fillColor(C.text).text(row.label, MX + 10, y + 5, { width: labelW });
        doc.font('Helvetica').fontSize(8.3).fillColor(C.textBody).text(valText, MX + labelW + 14, y + 5, {
          width: valW,
          lineGap: 1.8,
        });
        doc.strokeColor(C.border).lineWidth(0.5).moveTo(MX, y + rowH).lineTo(MX + CW, y + rowH).stroke();
        doc.y = y + rowH;
      });
      doc.x = MX;
    };

    const renderFooter = (pageNumber: number) => {
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.strokeColor(C.border).lineWidth(0.6).moveTo(MX, 788).lineTo(MX + CW, 788).stroke();
      doc.fillColor(C.mint).font('Helvetica-Bold').fontSize(7.2).text('FLOXA STUDIO', MX, 796, { lineBreak: false });
      doc.fillColor(C.textMuted).font('Helvetica').fontSize(7.2).text(
        'CONFIDENTIAL CREATIVE BRIEF  •  GENERATED BY FLOXA STUDIO  •  FOR PRODUCTION & DESIGN USE ONLY',
        MX + 70,
        796,
        { width: CW - 120, align: 'center', lineBreak: false }
      );
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(7.2).text(`${pageNumber} / 2`, MX, 796, {
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
    doc.roundedRect(MX, metaY, CW, metaH, 5).fillAndStroke(C.card, C.border);

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
      doc.fillColor(C.mint).font('Helvetica-Bold').fontSize(6.8).text(m.k, x + 10, metaY + 6, { width: colW - 20, lineBreak: false });
      doc.fillColor(C.text).font('Helvetica-Bold').fontSize(8.5).text(m.v, x + 10, metaY + 16, {
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
      const hexColor = (color.hex && /^#[0-9A-Fa-f]{6}$/.test(color.hex)) ? color.hex : '#4DFFA0';

      doc.roundedRect(cardX, startY, swatchWidth, cardHeight, 5).fillAndStroke(C.card, C.border);

      // Top color swatch
      doc.rect(cardX + 0.5, startY + 0.5, swatchWidth - 1, 28).fill(hexColor);
      doc.strokeColor(C.border).lineWidth(0.6).moveTo(cardX, startY + 29).lineTo(cardX + swatchWidth, startY + 29).stroke();

      doc.fillColor(C.text).fontSize(8.2).font('Helvetica-Bold').text(color.name || 'Color', cardX + 8, startY + 35, {
        width: swatchWidth - 16,
        lineBreak: false,
        ellipsis: true,
      });
      doc.fillColor(C.textBody).fontSize(7.5).font('Helvetica').text((color.hex || '').toUpperCase(), cardX + 8, startY + 47, {
        width: swatchWidth - 16,
        lineBreak: false,
      });
      doc.fillColor(C.mint).fontSize(7.2).font('Helvetica-Bold').text(color.role || '', cardX + 8, startY + 60, {
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
    doc.roundedRect(MX, aesY, CW, aesBoxH, 5).fillAndStroke(C.card, C.border);
    doc.rect(MX, aesY + 4, 3, aesBoxH - 8).fill(C.mint);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.textBody).text(aestheticText, MX + 14, aesY + 8, {
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

      doc.roundedRect(MX, boxY, CW, boxHeight, 5).fill(C.card);
      doc.rect(MX + leftColW, boxY, rightColW, boxHeight).fill(C.cardAlt);
      doc.strokeColor(C.border).lineWidth(0.6).roundedRect(MX, boxY, CW, boxHeight, 5).stroke();
      doc.strokeColor(C.border).lineWidth(0.6).moveTo(MX + leftColW, boxY).lineTo(MX + leftColW, boxY + boxHeight).stroke();
      doc.rect(MX, boxY + 4, 2.5, boxHeight - 8).fill(C.mint);

      // Left column: Angle, Concept Name, Description
      doc.fillColor(C.mint).fontSize(7.2).font('Helvetica-Bold').text((c.angle || `Concept ${i + 1}`).toUpperCase(), MX + 12, boxY + 8, { width: leftColW - 22 });
      doc.fillColor(C.text).fontSize(9.5).font('Helvetica-Bold').text(`"${c.conceptName || 'Theme'}"`, MX + 12, boxY + 18, { width: leftColW - 22 });
      doc.fillColor(C.textBody).fontSize(8).font('Helvetica').text(desc, MX + 12, boxY + 31, { width: leftColW - 22, lineGap: 1.5 });

      // Right column: Visual hook separated by subtle vertical border
      doc.fillColor(C.mint).fontSize(7).font('Helvetica-Bold').text('VISUAL HOOK', MX + leftColW + 10, boxY + 8, { width: rightColW - 20 });
      doc.fillColor(C.textBody).fontSize(7.8).font('Helvetica').text(hook, MX + leftColW + 10, boxY + 20, { width: rightColW - 20, lineGap: 1.5 });

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

      doc.rect(MX, y, CW, rowH).fill(i % 2 === 0 ? C.card : C.cardAlt);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.mint).text(`0${i + 1}`, MX + 8, y + 6, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text).text(headlineStr, MX + 26, y + 6, { width: textW });
      doc.font('Helvetica').fontSize(7.8).fillColor(C.textBody).text(sublineStr, MX + 26, y + 6 + hh + 2, { width: textW, lineGap: 1.2 });

      // Aligned CTA column
      const ctaX = MX + CW - ctaW;
      doc.strokeColor(C.border).lineWidth(0.5).moveTo(ctaX, y + 5).lineTo(ctaX, y + rowH - 5).stroke();
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor(C.textMuted).text('CTA', ctaX + 10, y + 6, { width: ctaW - 14, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor(C.mint).text(h.cta || '', ctaX + 10, y + 15, { width: ctaW - 14 });

      doc.strokeColor(C.border).lineWidth(0.5).moveTo(MX, y + rowH).lineTo(MX + CW, y + rowH).stroke();
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

    // Left Panel: CREATIVE DOS (ENCOURAGED) matching FLOXA UI
    doc.roundedRect(leftX, ruleStartY, panelWidth, guardrailBoxHeight, 5).fillAndStroke(C.card, C.border);
    doc.rect(leftX, ruleStartY + 4, 2.5, guardrailBoxHeight - 8).fill(C.mint);
    doc.fillColor(C.mint).fontSize(7.6).font('Helvetica-Bold').text('STRICT VISUAL DOS (MUST FOLLOW)', leftX + 12, ruleStartY + 9, { width: panelWidth - 24 });

    let currentDoY = ruleStartY + 24;
    dos.slice(0, 3).forEach((d: string, idx: number) => {
      doc.circle(leftX + 14, currentDoY + 4, 2).fill(C.mint);
      doc.fillColor(C.textBody).fontSize(7.8).font('Helvetica').text(d, leftX + 22, currentDoY, { width: panelWidth - 34, lineGap: 1.4 });
      currentDoY += dosHeights[idx] + 6;
    });

    // Right Panel: CREATIVE DON'TS (PROHIBITED) matching FLOXA UI
    doc.roundedRect(rightX, ruleStartY, panelWidth, guardrailBoxHeight, 5).fillAndStroke(C.dangerBg, C.dangerBorder);
    doc.rect(rightX, ruleStartY + 4, 2.5, guardrailBoxHeight - 8).fill(C.dangerText);
    doc.fillColor(C.dangerText).fontSize(7.6).font('Helvetica-Bold').text('STRICT VISUAL DON\'TS (AVOID)', rightX + 12, ruleStartY + 9, { width: panelWidth - 24 });

    let currentDontY = ruleStartY + 24;
    donts.slice(0, 3).forEach((d: string, idx: number) => {
      doc.circle(rightX + 14, currentDontY + 4, 2).fill(C.dangerText);
      doc.fillColor(C.textBody).fontSize(7.8).font('Helvetica').text(d, rightX + 22, currentDontY, { width: panelWidth - 34, lineGap: 1.4 });
      currentDontY += dontsHeights[idx] + 6;
    });

    doc.y = ruleStartY + guardrailBoxHeight + 8;
    doc.x = MX;

    renderFooter(2);

    doc.end();
  });
}
