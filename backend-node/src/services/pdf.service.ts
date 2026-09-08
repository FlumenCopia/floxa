import PDFDocument from 'pdfkit';
import crypto from 'crypto';

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

