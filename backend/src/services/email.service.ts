import fs from 'fs';
import path from 'path';
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
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid?: string }>;
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
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string; cid?: string }>;
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

  const resolvedAssetsDir = fs.existsSync(path.resolve(process.cwd(), 'backend', 'assets'))
    ? path.resolve(process.cwd(), 'backend', 'assets')
    : fs.existsSync(path.resolve(process.cwd(), 'assets'))
      ? path.resolve(process.cwd(), 'assets')
      : path.resolve(__dirname, '..', '..', 'assets');

  const emailAttachments: Array<{ filename: string; path: string; cid: string }> = [];
  const floxaLogoPath = path.join(resolvedAssetsDir, 'floxa-f-logo.png');
  if (fs.existsSync(floxaLogoPath)) {
    emailAttachments.push({
      filename: 'floxa-f-logo.png',
      path: floxaLogoPath,
      cid: 'floxa_f_logo',
    });
  }
  const floxaBadgePath = path.join(resolvedAssetsDir, 'floxa-badge.png');
  if (fs.existsSync(floxaBadgePath)) {
    emailAttachments.push({
      filename: 'floxa-badge.png',
      path: floxaBadgePath,
      cid: 'floxa_badge',
    });
  }
  const phonePath = path.join(resolvedAssetsDir, 'phone-icon.png');
  if (fs.existsSync(phonePath)) {
    emailAttachments.push({
      filename: 'phone-icon.png',
      path: phonePath,
      cid: 'phone_icon',
    });
  }
  const wavePath = path.join(resolvedAssetsDir, 'header-wave.png');
  if (fs.existsSync(wavePath)) {
    emailAttachments.push({
      filename: 'header-wave.png',
      path: wavePath,
      cid: 'header_wave',
    });
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="x-apple-disable-message-reformatting">
      <style>
        @media only screen and (max-width: 580px) {
          .email-container { width: 100% !important; max-width: 100% !important; border-radius: 16px !important; }
          .header-pad { padding: 18px 18px 12px 18px !important; }
          .header-tagline { display: none !important; }
          .body-pad { padding: 0 16px 24px 16px !important; }
          .main-heading { font-size: 24px !important; }
          .specs-card { width: 100% !important; max-width: 100% !important; padding: 12px 14px !important; }
          .specs-label { width: 32% !important; font-size: 12px !important; }
          .specs-value { width: 68% !important; font-size: 12px !important; }
          .cta-btn { width: 100% !important; padding: 14px 16px !important; font-size: 14px !important; box-sizing: border-box !important; text-align: center !important; }
          .help-card { width: 100% !important; max-width: 100% !important; padding: 14px !important; }
          .footer-col { display: block !important; width: 100% !important; text-align: center !important; padding: 6px 0 !important; }
          .footer-social-wrap { text-align: center !important; margin-top: 8px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <!-- Outer Responsive Wrapper -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; width: 100%; margin: 0; padding: 24px 8px;">
        <tr>
          <td align="center" valign="top">
            
            <!-- Main Card Container (max-width: 580px) -->
            <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 12px 40px rgba(11, 19, 41, 0.08);">
              
              <!-- Header Row -->
              <tr>
                <td style="padding: 0; background-color: #0b1329;">
                  <!-- Dark Midnight Navy Header Bar -->
                  <div class="header-pad" style="padding: 24px 32px 14px 32px; background-color: #0b1329;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" valign="middle">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td valign="middle" style="padding-right: 8px;">
                                <img src="cid:floxa_f_logo" width="22" height="22" alt="FLOXA" style="display: block; border: 0;" />
                              </td>
                              <td valign="middle" style="font-size: 20px; font-weight: 850; letter-spacing: -0.02em; color: #ffffff; line-height: 1;">
                                FLOXA
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right" valign="middle" class="header-tagline">
                          <span style="font-size: 11px; color: #94a3b8; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">CREATE &bull; COLLABORATE &bull; GROW</span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Wave Transition -->
                  <div style="line-height: 0; font-size: 0; background-color: #0b1329;">
                    <img src="cid:header_wave" width="100%" height="auto" alt="" style="display: block; width: 100%; border: 0; outline: none; margin: 0;" />
                  </div>

                  <!-- Centered Floating FLOXA Emblem Badge -->
                  <div align="center" style="text-align: center; margin-top: -32px; margin-bottom: 18px; line-height: 0;">
                    <img src="cid:floxa_badge" width="64" height="64" alt="FLOXA" style="display: inline-block; width: 64px; height: 64px; border-radius: 50%; box-shadow: 0 8px 24px rgba(48, 70, 212, 0.22); border: 0; outline: none;" />
                  </div>
                </td>
              </tr>

              <!-- Body Content Row -->
              <tr>
                <td class="body-pad" style="padding: 0 32px 32px 32px; text-align: center; background-color: #ffffff;">
                  
                  <h1 class="main-heading" style="margin: 0 0 10px 0; font-size: 28px; font-weight: 850; letter-spacing: -0.03em; color: #0b1329; line-height: 1.2;">
                    Welcome to FLOXA!
                  </h1>

                  <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #0b1329;">
                    Hello ${escapeHtml(clientName)},
                  </p>

                  <p style="margin: 0 auto 22px auto; max-width: 440px; font-size: 14px; line-height: 1.6; color: #475569;">
                    ${rawPortalPassword
                      ? `Thank you for joining FLOXA. We're excited to have you on board! Your consultant${consultantName ? `, <strong>${escapeHtml(consultantName)}</strong>,` : ''} has set up your workspace for <strong>${escapeHtml(project.title)}</strong>.`
                      : `Thank you for joining FLOXA. We're excited to have you on board! Your consultant${consultantName ? `, <strong>${escapeHtml(consultantName)}</strong>,` : ''} has prepared your workspace for <strong>${escapeHtml(project.title)}</strong>. Access your portal link below to get started.`
                    }
                  </p>

                  <!-- Project Specification Card (Fluid & Responsive) -->
                  <table role="presentation" class="specs-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 460px; margin: 0 auto 24px auto; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 18px; font-size: 13px; box-sizing: border-box;">
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; width: 30%; text-align: left;">Project</td>
                      <td class="specs-value" style="padding: 7px 0; color: #0b1329; font-weight: 700; text-align: right; width: 70%; word-break: break-word;">${escapeHtml(project.title)}</td>
                    </tr>
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; width: 30%; text-align: left;">Company</td>
                      <td class="specs-value" style="padding: 7px 0; color: #0b1329; font-weight: 600; text-align: right; width: 70%; word-break: break-word;">${escapeHtml(companyName)}</td>
                    </tr>
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; width: 30%; text-align: left;">Email</td>
                      <td class="specs-value" style="padding: 7px 0; color: #0b1329; font-weight: 600; text-align: right; width: 70%; word-break: break-word;">${displayEmailNoBlueLink}</td>
                    </tr>
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; width: 30%; text-align: left;">Value</td>
                      <td class="specs-value" style="padding: 7px 0; color: #2563eb; font-weight: 750; text-align: right; width: 70%; font-size: 14px;">${escapeHtml(formattedValue)}</td>
                    </tr>
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; vertical-align: top; width: 30%; text-align: left;">Payment Split</td>
                      <td class="specs-value" style="padding: 7px 0; color: #0b1329; font-weight: 600; text-align: right; width: 70%; line-height: 1.45; word-break: break-word;">${escapeHtml(paymentSplitDisplay)}</td>
                    </tr>
                    ${rawPortalPassword ? `
                    <tr>
                      <td class="specs-label" style="padding: 7px 0; color: #64748b; font-weight: 500; width: 30%; text-align: left;">Portal Password</td>
                      <td class="specs-value" style="padding: 7px 0; text-align: right; width: 70%;"><code style="background: #e0e7ff; color: #3046d4; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 13px;">${escapeHtml(rawPortalPassword)}</code></td>
                    </tr>` : ''}
                  </table>

                  <!-- Royal Blue CTA Button: Access Client Portal -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px 0;">
                    <tr>
                      <td align="center">
                        <a href="${escapeHtml(portalUrl)}" class="cta-btn" style="background-color: #3046d4; background-image: linear-gradient(135deg, #3858f6 0%, #2540d0 100%); color: #ffffff; padding: 14px 40px; text-decoration: none; border-radius: 999px; font-weight: 750; font-size: 15px; display: inline-block; letter-spacing: -0.01em; box-shadow: 0 8px 24px rgba(48, 70, 212, 0.35);">
                          Access Client Portal &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Need Help? Card (with Centered Table Phone Icon) -->
                  <table role="presentation" class="help-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 460px; margin: 0 auto 18px auto; background-color: #f1f5fe; border-radius: 14px; padding: 14px 18px; text-align: left; box-sizing: border-box;">
                    <tr>
                      <td style="width: 44px; vertical-align: middle; padding-right: 12px;" align="center">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="38" height="38" style="width: 38px; height: 38px; border-radius: 50%; background-color: #e0e7ff;">
                          <tr>
                            <td align="center" valign="middle" style="width: 38px; height: 38px; text-align: center; vertical-align: middle; padding: 0;">
                              <img src="cid:phone_icon" width="20" height="20" alt="📞" style="display: block; margin: 0 auto; border: 0; outline: none;" />
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td style="vertical-align: middle;">
                        <div style="font-size: 14px; font-weight: 750; color: #0b1329; margin-bottom: 2px;">
                          Need Help?
                        </div>
                        <div style="font-size: 13px; line-height: 1.45; color: #475569; margin-bottom: 4px;">
                          Our support team is here for you. Feel free to reach out anytime${consultantEmail ? ` or reply directly to <strong>${escapeHtml(consultantName || 'your consultant')}</strong> (${escapeHtml(consultantEmail)})` : ''}.
                        </div>
                        <div>
                          <a href="${consultantEmail ? `mailto:${escapeHtml(consultantEmail)}` : `${escapeHtml(portalUrl)}`}" style="color: #2563eb; font-size: 13px; font-weight: 700; text-decoration: none;">
                            Contact Support &rarr;
                          </a>
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- Plain Text Fallback Link -->
                  <p style="margin: 14px 0 0 0; font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center;">
                    If the button doesn't work, copy this link into your browser:<br/>
                    <a href="${escapeHtml(portalUrl)}" style="color: #2563eb; font-weight: 500; text-decoration: underline; word-break: break-all;">${escapeHtml(portalUrl)}</a>
                  </p>
                </td>
              </tr>

              <!-- Footer Row -->
              <tr>
                <td style="background-color: #0b1329; padding: 22px 28px 18px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 14px;">
                    <tr>
                      <!-- Brand + Tagline -->
                      <td class="footer-col" style="vertical-align: middle; text-align: left;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align: middle; padding-right: 8px;">
                              <img src="cid:floxa_f_logo" width="16" height="16" alt="FLOXA" style="display: block; border: 0;" />
                            </td>
                            <td style="font-size: 15px; font-weight: 850; letter-spacing: -0.02em; color: #ffffff; line-height: 1;">
                              FLOXA
                            </td>
                          </tr>
                        </table>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">
                          Building better brands together.
                        </div>
                      </td>

                      <!-- Center Links -->
                      <td class="footer-col" style="vertical-align: middle; text-align: center;">
                        <span style="font-size: 12px; color: #cbd5e1; font-weight: 500;">
                          Dashboard &nbsp;|&nbsp; Support &nbsp;|&nbsp; Contact
                        </span>
                      </td>

                      <!-- Social Icons -->
                      <td class="footer-col footer-social-wrap" align="right" style="vertical-align: middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display: inline-block;">
                          <tr>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 10px; font-weight: 800; color: #0b1329; display: inline-block; vertical-align: middle;">in</span>
                              </div>
                            </td>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 10px; font-weight: 800; color: #0b1329; display: inline-block; vertical-align: middle;">&times;</span>
                              </div>
                            </td>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 9px; font-weight: 800; color: #0b1329; display: inline-block; vertical-align: middle;">&#9658;</span>
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Bottom Copyright -->
                  <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 12px; font-size: 11px; color: #64748b; text-align: center;">
                    &copy; 2026 FLOXA. All rights reserved.
                  </div>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>

    </body>
    </html>
  `;

  await sendEmail({
    to: clientEmail,
    subject: `Your Project Portal: ${project.title}`,
    html,
    fromName,
    replyTo,
    attachments: emailAttachments,
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

