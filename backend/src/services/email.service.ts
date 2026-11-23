import fs from 'fs';
import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';
import { resolveSafeMediaPath } from './storage.service.js';
import { Consultant } from '../models/consultant.model.js';
import { escapeHtml } from '../utils/crypto.js';

let testEmailDispatcher: ((params: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string }>;
}) => Promise<void>) | null = null;

export function setTestEmailDispatcher(
  dispatcher: ((params: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string }>;
  }) => Promise<void>) | null
) {
  testEmailDispatcher = dispatcher;
}

const transporter = nodemailer.createTransport({
  host: ENV.EMAIL_HOST,
  port: ENV.EMAIL_PORT,
  secure: Number(ENV.EMAIL_PORT) === 465, // Must be true on port 465 (SSL/TLS)
  auth: {
    user: ENV.EMAIL_HOST_USER,
    pass: ENV.EMAIL_HOST_PASSWORD,
  },
  tls: {
    rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
});

export function sanitizeEmailError(error: any): string {
  if (!error) return 'Unknown email transmission error';
  const rawMsg = typeof error === 'string' ? error : (error.message || String(error));

  if (rawMsg.includes('not configured')) return 'Email service is not configured.';
  if (
    rawMsg.includes('not be accessed') ||
    rawMsg.includes('not available') ||
    rawMsg.includes('ENOENT') ||
    rawMsg.includes('PDF file')
  ) {
    return 'Signed agreement PDF file could not be accessed.';
  }
  if (rawMsg.includes('recipient') || rawMsg.includes('No valid recipient')) {
    return 'No valid recipient email address available.';
  }
  if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('timeout') || rawMsg.includes('ECONNREFUSED')) {
    return 'Connection to email gateway failed or timed out.';
  }
  if (rawMsg.includes('auth') || rawMsg.includes('credential') || rawMsg.includes('535') || rawMsg.includes('Invalid login')) {
    return 'Email provider authentication failed.';
  }
  if (rawMsg.includes('quota') || rawMsg.includes('rate limit') || rawMsg.includes('421') || rawMsg.includes('451')) {
    return 'Email provider rate limit exceeded.';
  }

  // Strip filesystem paths and passwords/credentials
  let sanitized = rawMsg
    .replace(/[A-Za-z]:\\[^\s"'\\]+(?:\\[^\s"'\\]+)*/g, '[path]')
    .replace(/\/(?:[^\s"'\/]+\/)+[^\s"'\/]+/g, '[path]')
    .replace(/pass(?:word)?\s*[:=]\s*[^\s]+/gi, 'password=[redacted]')
    .replace(/user(?:name)?\s*[:=]\s*[^\s]+/gi, 'user=[redacted]');

  if (sanitized.length > 200 || /token|secret|key|bearer/i.test(sanitized)) {
    return 'Email transmission failed due to provider error.';
  }

  return sanitized;
}

async function resolveConsultantInfo(project: any): Promise<{ name: string; email: string }> {
  let consultant = project?.consultant && typeof project.consultant === 'object' && project.consultant.email ? project.consultant : null;
  const consultantId = consultant?._id || consultant?.id || project?.consultantId || project?.consultant;
  if (!consultant && consultantId) {
    try {
      consultant = await Consultant.findById(consultantId).lean();
    } catch (err) {
      console.warn('[email.service] Failed to resolve consultant for email branding:', err);
    }
  }
  const name = String(consultant?.name || consultant?.agencyName || '').trim();
  const email = String(consultant?.email || '').trim();
  return { name, email };
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string }>;
  fromName?: string;
  replyTo?: string;
}) {
  if (testEmailDispatcher) {
    await testEmailDispatcher(params);
    return;
  }

  if (!ENV.EMAIL_HOST_USER || !ENV.EMAIL_HOST_PASSWORD) {
    throw new Error('Email service is not configured.');
  }

  const senderDisplayName = (params.fromName || ENV.DEFAULT_FROM_EMAIL || 'FLOXA').trim();

  try {
    await transporter.sendMail({
      from: `"${senderDisplayName}" <${ENV.EMAIL_HOST_USER}>`,
      replyTo: params.replyTo || undefined,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments,
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

export async function sendClientPortalInvite(
  project: any,
  rawPortalPassword?: string,
  baseUrlOverride?: string,
  rawSetupToken?: string
) {
  const clientEmail = project.client?.email || project.clientEmail || (typeof project.client === 'object' ? project.client?.email : null);
  if (!clientEmail) {
    console.warn('[email.service] sendClientPortalInvite aborted: no recipient email found on project payload');
    return;
  }

  const { name: consultantName, email: consultantEmail } = await resolveConsultantInfo(project);
  const fromName = consultantName ? `${consultantName} via FLOXA` : ENV.DEFAULT_FROM_EMAIL;
  const replyTo = consultantEmail || undefined;

  const clientName = project.client?.name || project.companyName || 'Client';
  const companyName = project.companyName || project.client?.companyName || project.title || '—';
  const rawProjectValue = Number(project.projectValue || 0);
  const formattedValue = rawProjectValue > 0 ? `Rs ${rawProjectValue.toLocaleString('en-IN')}` : '—';

  const advancePct = Number(project.advancePercentage ?? 0);
  const midPct = Number(project.midPercentage ?? 0);
  const finalPct = Number(project.finalPercentage ?? 0);
  const hasSplit = advancePct + midPct + finalPct > 0;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const advanceAmt = rawProjectValue > 0 ? round2((rawProjectValue * advancePct) / 100) : 0;
  const midAmt = rawProjectValue > 0 ? round2((rawProjectValue * midPct) / 100) : 0;
  const finalAmt = rawProjectValue > 0 ? round2(rawProjectValue - advanceAmt - midAmt) : 0;

  const paymentSplitDisplay = hasSplit
    ? rawProjectValue > 0
      ? `${advancePct}% Advance (Rs ${advanceAmt.toLocaleString('en-IN')}) / ${midPct}% Mid (Rs ${midAmt.toLocaleString('en-IN')}) / ${finalPct}% Final (Rs ${finalAmt.toLocaleString('en-IN')})`
      : `${advancePct}% Advance / ${midPct}% Mid / ${finalPct}% Final`
    : '—';

  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const portalUrl = rawSetupToken && !rawPortalPassword
    ? `${effectiveBase}/client/${project.portalToken}?setup_token=${encodeURIComponent(rawSetupToken)}`
    : `${effectiveBase}/client/${project.portalToken}`;

  const displayEmailNoBlueLink = escapeHtml(clientEmail)
    .replace(/@/g, '&#8203;@')
    .replace(/\./g, '&#8203;.');

  const html = `
    <div style="max-width: 600px; margin: auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <h2 style="color: #0f172a; margin-top: 0;">Welcome to your FLOXA Project Portal</h2>
      <p>Hello ${escapeHtml(clientName)},</p>
      <p>Your consultant${consultantName ? `, <strong>${escapeHtml(consultantName)}</strong>` : ''}, has invited you to collaborate on <strong>${escapeHtml(project.title)}</strong>.</p>

      <div style="background-color: #091e17; background-image: linear-gradient(145deg, #0e2e22 0%, #071913 100%); border: 1px solid #1d4536; border-radius: 14px; padding: 22px; margin: 22px 0;">
        <p style="margin: 0 0 16px 0; font-size: 13px; color: #8cb0a1;">
          ${rawPortalPassword
      ? 'Review your project details below and use your portal password to sign in.'
      : 'Review your project details below — open your portal link to set your secure password and get started.'
    }
        </p>

        <div style="background-color: #0c261d; border: 1px solid #1c4234; border-radius: 10px; overflow: hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 13px 18px; color: #7ea394; border-bottom: 1px solid #16362a; width: 34%;">Client</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right; border-bottom: 1px solid #16362a;">${escapeHtml(clientName)}</td>
            </tr>
            <tr>
              <td style="padding: 13px 18px; color: #7ea394; border-bottom: 1px solid #16362a;">Email</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right; border-bottom: 1px solid #16362a;">${displayEmailNoBlueLink}</td>
            </tr>
            <tr>
              <td style="padding: 13px 18px; color: #7ea394; border-bottom: 1px solid #16362a;">Company</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right; border-bottom: 1px solid #16362a;">${escapeHtml(companyName)}</td>
            </tr>
            <tr>
              <td style="padding: 13px 18px; color: #7ea394; border-bottom: 1px solid #16362a;">Value</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right; border-bottom: 1px solid #16362a;">${escapeHtml(formattedValue)}</td>
            </tr>
            <tr>
              <td style="padding: 13px 18px; color: #7ea394; ${rawPortalPassword ? 'border-bottom: 1px solid #16362a;' : ''} vertical-align: top;">Payment Split</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right; ${rawPortalPassword ? 'border-bottom: 1px solid #16362a;' : ''} line-height: 1.5;">${escapeHtml(paymentSplitDisplay)}</td>
            </tr>
            ${rawPortalPassword
      ? `<tr>
              <td style="padding: 13px 18px; color: #7ea394;">Portal Password</td>
              <td style="padding: 13px 18px; color: #f3f8f2; font-weight: 600; text-align: right;"><code style="background: #143629; padding: 3px 8px; border-radius: 4px; color: #f3f8f2;">${escapeHtml(rawPortalPassword)}</code></td>
            </tr>`
      : ''
    }
          </table>
        </div>

        <div style="margin-top: 20px; text-align: right;">
          <a href="${escapeHtml(portalUrl)}" style="background-color: #183d2f; border: 1px solid #2e6b54; color: #f3f8f2; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">
            Access Client Portal &rarr;
          </a>
        </div>
      </div>

      <p style="color: #64748b; font-size: 13px;">If the button doesn't work, copy this link into your browser:<br/><a href="${escapeHtml(portalUrl)}" style="color: #10b981;">${escapeHtml(portalUrl)}</a></p>
      ${consultantEmail ? `<p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">You can reply directly to this email to contact <strong>${escapeHtml(consultantName || 'your consultant')}</strong> (${escapeHtml(consultantEmail)}).</p>` : ''}
    </div>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Your Project Portal: ${project.title}`,
    html,
    fromName,
    replyTo,
  });
}

export async function sendClientPortalPasswordResetEmail(
  project: any,
  clientEmail: string,
  rawResetToken: string,
  baseUrlOverride?: string
) {
  if (!clientEmail || !rawResetToken) {
    console.warn('[email.service] sendClientPortalPasswordResetEmail aborted: missing recipient email or reset token');
    return;
  }

  const { name: consultantName, email: consultantEmail } = await resolveConsultantInfo(project);
  const fromName = consultantName ? `${consultantName} via FLOXA` : ENV.DEFAULT_FROM_EMAIL;
  const replyTo = consultantEmail || undefined;

  const clientName = project.client?.name || (project.clientId as any)?.name || project.companyName || 'Client';
  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const resetUrl = `${effectiveBase}/client/${project.portalToken}?reset_token=${encodeURIComponent(rawResetToken)}`;

  const html = `
    <div style="max-width: 600px; margin: auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <h2 style="color: #0f172a; margin-top: 0;">Reset Your FLOXA Portal Password</h2>
      <p>Hello ${escapeHtml(clientName)},</p>
      <p>We received a request to reset your password for the project portal <strong>${escapeHtml(project.title)}</strong>.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Password Reset</p>
        <p style="margin: 6px 0; font-size: 14px; color: #1e293b;">
          <strong>Your Portal Email:</strong> <code style="background: #e2e8f0; padding: 3px 8px; border-radius: 4px; font-weight: 600; color: #0f172a; font-size: 13px;">${escapeHtml(clientEmail)}</code>
        </p>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">This reset link expires in 30 minutes and can only be used once.</p>
      </div>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(resetUrl)}" style="background-color: #10b981; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Your Password &rarr;
        </a>
      </p>
      <p style="color: #64748b; font-size: 13px;">If you did not request this, you can safely ignore this email.<br/>If the button doesn't work, copy this link into your browser:<br/><a href="${escapeHtml(resetUrl)}" style="color: #10b981;">${escapeHtml(resetUrl)}</a></p>
    </div>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Password Reset: ${project.title} Client Portal`,
    html,
    fromName,
    replyTo,
  });
}

export async function sendAgreementSignatureRequestEmail(project: any, agreement: any, baseUrlOverride?: string) {
  const clientEmail = project.client?.email;
  if (!clientEmail) return;

  const { name: consultantName, email: consultantEmail } = await resolveConsultantInfo(project);
  const fromName = consultantName ? `${consultantName} via FLOXA` : ENV.DEFAULT_FROM_EMAIL;
  const replyTo = consultantEmail || undefined;

  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const signingUrl = `${effectiveBase}/client/${project.portalToken}?agreement=1`;

  const html = `
    <div style="max-width: 600px; margin: auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <h2 style="color: #0f172a; margin-top: 0;">Action Required: Sign Your Project Agreement</h2>
      <p>Hello,</p>
      <p>Your consultant${consultantName ? `, <strong>${escapeHtml(consultantName)}</strong>` : ''}, has prepared the project agreement for <strong>${escapeHtml(project.title)}</strong> ready for signature.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
        <span style="font-size: 13px; color: #475569;">Registered Client Email:</span>
        <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #0f172a; font-size: 13px;">${escapeHtml(clientEmail)}</code>
      </div>
      <p style="margin: 24px 0;">
        <a href="${escapeHtml(signingUrl)}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Review and Sign Agreement
        </a>
      </p>
      ${consultantEmail ? `<p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">You can reply directly to this email to contact <strong>${escapeHtml(consultantName || 'your consultant')}</strong> (${escapeHtml(consultantEmail)}).</p>` : ''}
    </div>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Signature Request: Project Agreement for ${project.title}`,
    html,
    fromName,
    replyTo,
  });
}

export async function sendSignedProjectAgreementEmail(project: any, agreement: any) {
  const profile = project.clientProfile;
  const clientName = profile?.clientName || project.client?.name || 'Client';
  const clientEmail = profile?.email || project.client?.email;
  const consultantEmail = project.consultant?.email;

  const recipients = [clientEmail, consultantEmail].filter(Boolean) as string[];
  if (recipients.length === 0) {
    throw new Error('No valid recipient email address available.');
  }

  const companyName = project.companyName || project.title || 'FLOXA Project';
  const subject = `Signed agreement - ${companyName}`;

  let signedAtFormatted = '-';
  if (agreement.signedAt) {
    signedAtFormatted = new Date(agreement.signedAt).toISOString().replace('T', ' ');
  }

  const message = [
    'Hello,',
    '',
    `The agreement for ${companyName} has been signed by ${clientName}.`,
    '',
    `Signed at: ${signedAtFormatted}`,
    '',
    'The signed PDF is attached for your records.',
    '',
    'FLOXA',
  ].join('\n');

  if (!agreement.signedPdfFile) {
    throw new Error('Signed agreement PDF file is not available.');
  }

  const safePath = resolveSafeMediaPath(agreement.signedPdfFile);
  if (!safePath || !fs.existsSync(safePath)) {
    throw new Error('Signed agreement PDF file could not be accessed.');
  }

  const fileBytes = await fs.promises.readFile(safePath);

  await sendEmail({
    to: recipients,
    subject,
    text: message,
    attachments: [
      {
        filename: 'signed-agreement.pdf',
        content: fileBytes,
        contentType: 'application/pdf',
      },
    ],
  });
}

export async function sendPasswordResetEmail(consultant: any, rawToken: string, baseUrlOverride?: string) {
  const recipientEmail = consultant.email;
  if (!recipientEmail) return;

  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const resetUrl = `${effectiveBase}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const consultantName = consultant.name || 'there';

  const subject = 'Reset Your FLOXA Account Password';
  const text = `Hello ${consultantName},

We received a request to reset your password for your FLOXA account.

Click the link below to set a new password:
${resetUrl}

This link will expire in 30 minutes.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The FLOXA Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #06160f; color: #e8f5ef; border-radius: 12px; border: 1px solid rgba(77, 255, 160, 0.2);">
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0; color: #4dffa0; font-size: 20px; font-weight: 700;">FLOXA</h2>
      </div>
      <h3 style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px;">Password Reset Request</h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        Hello <strong>${escapeHtml(consultantName)}</strong>,
      </p>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        We received a request to reset your password. Click the button below to choose a new password:
      </p>
      <div style="margin-bottom: 28px;">
        <a href="${escapeHtml(resetUrl)}" style="background-color: #4dffa0; color: #001a0e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;">
          Reset My Password
        </a>
      </div>
      <p style="margin: 0 0 16px 0; font-size: 12px; line-height: 1.5; color: #89aca0;">
        Or copy and paste this link into your browser:<br/>
        <a href="${escapeHtml(resetUrl)}" style="color: #4dffa0; word-break: break-all;">${escapeHtml(resetUrl)}</a>
      </p>
      <p style="margin: 0 0 0 0; font-size: 12px; line-height: 1.5; color: #6b8f80; border-top: 1px solid rgba(77, 255, 160, 0.1); padding-top: 16px;">
        This link expires in 30 minutes. If you did not request this reset, no action is needed.
      </p>
    </div>
  `;

  await sendEmail({
    to: recipientEmail,
    subject,
    text,
    html,
  });
}

