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

export async function sendClientPortalInvite(project: any, rawPortalPassword?: string) {
  const clientEmail = project.client?.email;
  if (!clientEmail) return;

  const clientName = project.client?.name || project.companyName || 'Client';
  const portalUrl = `${ENV.FRONTEND_BASE_URL.replace(/\/+$/, '')}/client/${project.portalToken}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
      <h2>Welcome to your FLOXA Project Portal</h2>
      <p>Hello ${clientName},</p>
      <p>Your consultant has invited you to collaborate on <strong>${project.title}</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${portalUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Access Client Portal
        </a>
      </p>
      ${
        rawPortalPassword
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

export async function sendAgreementSignatureRequestEmail(project: any, agreement: any) {
  const clientEmail = project.client?.email;
  if (!clientEmail) return;

  const signingUrl = `${ENV.FRONTEND_BASE_URL.replace(/\/+$/, '')}/client/${project.portalToken}?agreement=1`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
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
