import fs from 'fs';
import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';
import { resolveSafeMediaPath } from './storage.service.js';

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
  secure: false, // TLS on port 587
  auth: {
    user: ENV.EMAIL_HOST_USER,
    pass: ENV.EMAIL_HOST_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
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

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string }>;
}) {
  if (testEmailDispatcher) {
    await testEmailDispatcher(params);
    return;
  }

  if (!ENV.EMAIL_HOST_USER || !ENV.EMAIL_HOST_PASSWORD) {
    throw new Error('Email service is not configured.');
  }

  try {
    await transporter.sendMail({
      from: `"${ENV.DEFAULT_FROM_EMAIL}" <${ENV.EMAIL_HOST_USER}>`,
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

export async function sendClientPortalInvite(project: any, rawPortalPassword?: string, baseUrlOverride?: string) {
  const clientEmail = project.client?.email || project.clientEmail || (typeof project.client === 'object' ? project.client?.email : null);
  if (!clientEmail) {
    console.warn('[email.service] sendClientPortalInvite aborted: no recipient email found on project payload');
    return;
  }

  const clientName = project.client?.name || project.companyName || 'Client';
  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const portalUrl = `${effectiveBase}/client/${project.portalToken}`;

  const html = `
    <div style=" max-width: 600px; margin: auto; padding: 20px;">
      <h2>Welcome to your FLOXA Project Portal</h2>
      <p>Hello ${clientName},</p>
      <p>Your consultant has invited you to collaborate on <strong>${project.title}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Access Client Portal
        </a>
      </p>
      ${rawPortalPassword
      ? `<p><strong>Portal Password:</strong> <code>${rawPortalPassword}</code></p>`
      : ''
    }
      <p>If the button doesn't work, copy this link into your browser:<br/><a href="${portalUrl}">${portalUrl}</a></p>
    </div>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Your Project Portal: ${project.title}`,
    html,
  });
}

export async function sendAgreementSignatureRequestEmail(project: any, agreement: any, baseUrlOverride?: string) {
  const clientEmail = project.client?.email;
  if (!clientEmail) return;

  const effectiveBase = (baseUrlOverride || ENV.FRONTEND_BASE_URL || 'https://floxa.flumenx.in').replace(/\/+$/, '');
  const signingUrl = `${effectiveBase}/client/${project.portalToken}?agreement=1`;

  const html = `
    <div style=" max-width: 600px; margin: auto; padding: 20px;">
      <h2>Action Required: Sign Your Project Agreement</h2>
      <p>Hello,</p>
      <p>Your project agreement for <strong>${project.title}</strong> is ready for signature.</p>
      <p style="margin: 24px 0;">
        <a href="${signingUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Review and Sign Agreement
        </a>
      </p>
    </div>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Signature Request: Project Agreement for ${project.title}`,
    html,
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
        Hello <strong>${consultantName}</strong>,
      </p>
      <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        We received a request to reset your password. Click the button below to choose a new password:
      </p>
      <div style="margin-bottom: 28px;">
        <a href="${resetUrl}" style="background-color: #4dffa0; color: #001a0e; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;">
          Reset My Password
        </a>
      </div>
      <p style="margin: 0 0 16px 0; font-size: 12px; line-height: 1.5; color: #89aca0;">
        Or copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color: #4dffa0; word-break: break-all;">${resetUrl}</a>
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

