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
  const assetFiles = [
    { filename: 'floxa-mint-f.png', cid: 'floxa_mint_f' },
    { filename: 'header-wave-green.png', cid: 'header_wave_green' },
    { filename: 'workspace-badge.png', cid: 'workspace_badge' },
    { filename: 'icon-folder.png', cid: 'icon_folder' },
    { filename: 'icon-building.png', cid: 'icon_building' },
    { filename: 'icon-rupee.png', cid: 'icon_rupee' },
    { filename: 'icon-split.png', cid: 'icon_split' },
    { filename: 'icon-headset.png', cid: 'icon_headset' },
  ];

  for (const item of assetFiles) {
    const fullPath = path.join(resolvedAssetsDir, item.filename);
    if (fs.existsSync(fullPath)) {
      emailAttachments.push({
        filename: item.filename,
        path: fullPath,
        cid: item.cid,
      });
    }
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
          .header-pad { padding: 18px 16px 12px 16px !important; }
          .header-tagline { display: none !important; }
          .body-pad { padding: 0 16px 24px 16px !important; }
          .main-heading { font-size: 24px !important; }
          .specs-card { width: 100% !important; max-width: 100% !important; padding: 12px 14px !important; }
          .specs-val-text { font-size: 13px !important; }
          .specs-val-large { font-size: 16px !important; }
          .cta-btn { width: 100% !important; padding: 14px 16px !important; font-size: 14px !important; box-sizing: border-box !important; text-align: center !important; }
          .help-card { width: 100% !important; max-width: 100% !important; padding: 12px 14px !important; }
          .help-col { display: block !important; width: 100% !important; text-align: center !important; padding: 4px 0 !important; }
          .help-col-icon { display: none !important; }
          .footer-col { display: block !important; width: 100% !important; text-align: center !important; padding: 6px 0 !important; }
          .footer-social-wrap { text-align: center !important; margin-top: 8px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #030705; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <!-- Outer Responsive Wrapper -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #030705; width: 100%; margin: 0; padding: 28px 8px;">
        <tr>
          <td align="center" valign="top">
            
            <!-- Main Card Container (max-width: 580px) -->
            <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #050b07; border-radius: 24px; overflow: hidden; border: 1px solid rgba(77, 255, 160, 0.22); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);">
              
              <!-- Header Row -->
              <tr>
                <td style="padding: 0; background-color: #040906;">
                  <!-- Dark Emerald Header Bar -->
                  <div class="header-pad" style="padding: 24px 32px 14px 32px; background-color: #040906;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="left" valign="middle">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td valign="middle" style="padding-right: 10px;">
                                <img src="cid:floxa_mint_f" width="22" height="22" alt="FLOXA" style="display: block; border: 0;" />
                              </td>
                              <td valign="middle" style="font-size: 20px; font-weight: 850; letter-spacing: -0.02em; color: #ffffff; line-height: 1;">
                                FLOXA
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="right" valign="middle" class="header-tagline">
                          <span style="font-size: 10px; color: #89aca0; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;">BRAND DISCOVERY PLATFORM</span>
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Wave Transition -->
                  <div style="line-height: 0; font-size: 0; background-color: #040906;">
                    <img src="cid:header_wave_green" width="100%" height="auto" alt="" style="display: block; width: 100%; border: 0; outline: none; margin: 0;" />
                  </div>

                  <!-- Centered Floating Workspace Badge -->
                  <div align="center" style="text-align: center; margin-top: -34px; margin-bottom: 22px; line-height: 0;">
                    <img src="cid:workspace_badge" width="68" height="68" alt="FLOXA" style="display: inline-block; width: 68px; height: 68px; border-radius: 50%; box-shadow: 0 0 24px rgba(77, 255, 160, 0.35); border: 0; outline: none;" />
                  </div>
                </td>
              </tr>

              <!-- Body Content Row -->
              <tr>
                <td class="body-pad" style="padding: 0 32px 32px 32px; text-align: center; background-color: #050b07;">
                  
                  <h1 class="main-heading" style="margin: 0 0 10px 0; font-size: 28px; font-weight: 850; letter-spacing: -0.03em; color: #ffffff; line-height: 1.2;">
                    Welcome to FLOXA!
                  </h1>

                  <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #ffffff;">
                    Hello ${escapeHtml(clientName)},
                  </p>

                  <p style="margin: 0 auto 24px auto; max-width: 440px; font-size: 14px; line-height: 1.6; color: #89aca0;">
                    Your workspace has been prepared. Review your project specifications below to get started.
                  </p>

                  <!-- Project Specification Card (Matching Exact Dark Emerald Container) -->
                  <table role="presentation" class="specs-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 470px; margin: 0 auto 26px auto; background-color: #07150e; border: 1px solid rgba(77, 255, 160, 0.35); border-radius: 16px; padding: 14px 18px; font-size: 13px; box-sizing: border-box;">
                    
                    <!-- Project Row -->
                    <tr>
                      <td style="width: 24px; padding: 10px 8px 10px 0; vertical-align: middle;">
                        <img src="cid:icon_folder" width="18" height="18" alt="" style="display: block; border: 0;" />
                      </td>
                      <td style="color: #89aca0; font-weight: 500; width: 100px; text-align: left; vertical-align: middle;">Project</td>
                      <td style="color: #89aca0; width: 12px; text-align: center; vertical-align: middle;">:</td>
                      <td class="specs-val-text" style="color: #ffffff; font-weight: 700; text-align: left; padding-left: 8px; vertical-align: middle; word-break: break-word;">${escapeHtml(project.title)}</td>
                    </tr>
                    <tr><td colspan="4" style="border-bottom: 1px solid rgba(77, 255, 160, 0.1); padding: 0; height: 1px;"></td></tr>

                    <!-- Company Row -->
                    <tr>
                      <td style="width: 24px; padding: 10px 8px 10px 0; vertical-align: middle;">
                        <img src="cid:icon_building" width="18" height="18" alt="" style="display: block; border: 0;" />
                      </td>
                      <td style="color: #89aca0; font-weight: 500; width: 100px; text-align: left; vertical-align: middle;">Company</td>
                      <td style="color: #89aca0; width: 12px; text-align: center; vertical-align: middle;">:</td>
                      <td class="specs-val-text" style="color: #ffffff; font-weight: 600; text-align: left; padding-left: 8px; vertical-align: middle; word-break: break-word;">${escapeHtml(companyName)}</td>
                    </tr>
                    <tr><td colspan="4" style="border-bottom: 1px solid rgba(77, 255, 160, 0.1); padding: 0; height: 1px;"></td></tr>

                    <!-- Value Row -->
                    <tr>
                      <td style="width: 24px; padding: 10px 8px 10px 0; vertical-align: middle;">
                        <img src="cid:icon_rupee" width="18" height="18" alt="" style="display: block; border: 0;" />
                      </td>
                      <td style="color: #89aca0; font-weight: 500; width: 100px; text-align: left; vertical-align: middle;">Value</td>
                      <td style="color: #89aca0; width: 12px; text-align: center; vertical-align: middle;">:</td>
                      <td class="specs-val-large" style="color: #4dffa0; font-weight: 850; font-size: 18px; text-align: left; padding-left: 8px; vertical-align: middle;">${escapeHtml(formattedValue)}</td>
                    </tr>
                    <tr><td colspan="4" style="border-bottom: 1px solid rgba(77, 255, 160, 0.1); padding: 0; height: 1px;"></td></tr>

                    <!-- Payment Split Row -->
                    <tr>
                      <td style="width: 24px; padding: 10px 8px 10px 0; vertical-align: middle;">
                        <img src="cid:icon_split" width="18" height="18" alt="" style="display: block; border: 0;" />
                      </td>
                      <td style="color: #89aca0; font-weight: 500; width: 100px; text-align: left; vertical-align: middle;">Payment Split</td>
                      <td style="color: #89aca0; width: 12px; text-align: center; vertical-align: middle;">:</td>
                      <td class="specs-val-text" style="color: #ffffff; font-weight: 600; text-align: left; padding-left: 8px; vertical-align: middle; line-height: 1.45; word-break: break-word;">${escapeHtml(paymentSplitDisplay)}</td>
                    </tr>

                    ${rawPortalPassword ? `
                    <tr><td colspan="4" style="border-bottom: 1px solid rgba(77, 255, 160, 0.1); padding: 0; height: 1px;"></td></tr>
                    <tr>
                      <td style="width: 24px; padding: 10px 8px 10px 0; vertical-align: middle;">
                        <span style="color: #4dffa0; font-size: 14px;">&#128274;</span>
                      </td>
                      <td style="color: #89aca0; font-weight: 500; width: 100px; text-align: left; vertical-align: middle;">Password</td>
                      <td style="color: #89aca0; width: 12px; text-align: center; vertical-align: middle;">:</td>
                      <td style="padding-left: 8px; text-align: left; vertical-align: middle;">
                        <code style="background: rgba(77, 255, 160, 0.15); color: #4dffa0; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 13px;">${escapeHtml(rawPortalPassword)}</code>
                      </td>
                    </tr>` : ''}

                  </table>

                  <!-- Electric Mint Glow Pill Button: Access Client Portal -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 26px 0;">
                    <tr>
                      <td align="center">
                        <a href="${escapeHtml(portalUrl)}" class="cta-btn" style="background-color: #4dffa0; background-image: linear-gradient(135deg, #4dffa0 0%, #00e575 100%); color: #030c06; padding: 15px 44px; text-decoration: none; border-radius: 999px; font-weight: 850; font-size: 15px; display: inline-block; letter-spacing: -0.01em; box-shadow: 0 0 24px rgba(77, 255, 160, 0.45);">
                          Access Client Portal &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Need Help? Card (Matching Headset Pill Style) -->
                  <table role="presentation" class="help-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 470px; margin: 0 auto 18px auto; background-color: #07150e; border: 1px solid rgba(77, 255, 160, 0.22); border-radius: 14px; padding: 12px 18px; text-align: left; box-sizing: border-box;">
                    <tr>
                      <td class="help-col-icon" style="width: 32px; vertical-align: middle; padding-right: 12px;">
                        <img src="cid:icon_headset" width="24" height="24" alt="" style="display: block; border: 0;" />
                      </td>
                      <td class="help-col" style="vertical-align: middle; border-left: 1px solid rgba(77, 255, 160, 0.18); padding-left: 14px;">
                        <div style="font-size: 13px; font-weight: 750; color: #ffffff; margin-bottom: 2px;">
                          Need Help?
                        </div>
                        <div style="font-size: 12px; color: #89aca0;">
                          Our support team is here for you anytime${consultantEmail ? ` or reply to <strong>${escapeHtml(consultantName || 'your consultant')}</strong>` : ''}.
                        </div>
                      </td>
                      <td class="help-col" align="right" style="vertical-align: middle; padding-left: 10px;">
                        <a href="${consultantEmail ? `mailto:${escapeHtml(consultantEmail)}` : `${escapeHtml(portalUrl)}`}" style="color: #4dffa0; font-size: 12px; font-weight: 750; text-decoration: none; white-space: nowrap;">
                          Contact Support &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Plain Text Fallback Link -->
                  <p style="margin: 14px 0 0 0; font-size: 12px; line-height: 1.5; color: #4a6b5e; text-align: center;">
                    If the button doesn't work, copy this link into your browser:<br/>
                    <a href="${escapeHtml(portalUrl)}" style="color: #4dffa0; font-weight: 500; text-decoration: underline; word-break: break-all;">${escapeHtml(portalUrl)}</a>
                  </p>
                </td>
              </tr>

              <!-- Footer Row -->
              <tr>
                <td style="background-color: #040906; padding: 22px 28px 18px 28px; border-top: 1px solid rgba(77, 255, 160, 0.12);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 14px;">
                    <tr>
                      <!-- Brand + Tagline -->
                      <td class="footer-col" style="vertical-align: middle; text-align: left;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="vertical-align: middle; padding-right: 8px;">
                              <img src="cid:floxa_mint_f" width="16" height="16" alt="FLOXA" style="display: block; border: 0;" />
                            </td>
                            <td style="font-size: 15px; font-weight: 850; letter-spacing: -0.02em; color: #ffffff; line-height: 1; padding-right: 8px;">
                              FLOXA
                            </td>
                            <td style="border-left: 1px solid rgba(255, 255, 255, 0.2); padding-left: 8px; font-size: 11px; color: #89aca0; vertical-align: middle;">
                              Building better brands together
                            </td>
                          </tr>
                        </table>
                      </td>

                      <!-- Social Icons -->
                      <td class="footer-col footer-social-wrap" align="right" style="vertical-align: middle;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display: inline-block;">
                          <tr>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 10px; font-weight: 800; color: #040906; display: inline-block; vertical-align: middle;">in</span>
                              </div>
                            </td>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 10px; font-weight: 800; color: #040906; display: inline-block; vertical-align: middle;">&times;</span>
                              </div>
                            </td>
                            <td style="padding-left: 6px;">
                              <div style="width: 22px; height: 22px; border-radius: 50%; background-color: #ffffff; text-align: center; line-height: 22px;">
                                <span style="font-size: 9px; font-weight: 800; color: #040906; display: inline-block; vertical-align: middle;">&#9658;</span>
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Navigation Links -->
                  <div style="text-align: left; margin-bottom: 12px;">
                    <span style="font-size: 11px; color: #89aca0; font-weight: 500;">
                      Dashboard &nbsp;|&nbsp; Support &nbsp;|&nbsp; Contact
                    </span>
                  </div>

                  <!-- Bottom Copyright -->
                  <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px; font-size: 11px; color: #4a6b5e; text-align: center;">
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

