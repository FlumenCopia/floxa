import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

let testEmailDispatcher: ((params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<void>) | null = null;

export function setTestEmailDispatcher(
  dispatcher: ((params: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<void>) | null
) {
  testEmailDispatcher = dispatcher;
}

function getTransporter() {
  dotenv.config();
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const user = process.env.EMAIL_HOST_USER !== undefined
    ? process.env.EMAIL_HOST_USER.trim()
    : 'contactmiscarchive@gmail.com';
  const pass = process.env.EMAIL_HOST_PASSWORD !== undefined
    ? process.env.EMAIL_HOST_PASSWORD.replace(/\s+/g, '')
    : 'onorlcovemxsxtwd';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function sendCustomerWelcomeEmail(params: {
  name: string;
  email: string;
  rawPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const { name, email, rawPassword } = params;
  const rawBase = process.env.FRONTEND_BASE_URL;
  const baseUrl = (rawBase && rawBase !== 'http://localhost:3000'
    ? rawBase
    : (process.env.NODE_ENV === 'production' || process.env.HOSTINGER_ENV === 'production' ? 'https://floxa.flumenx.in' : (rawBase || 'https://floxa.flumenx.in'))
  ).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/login?mode=login`;
  const fromName = process.env.DEFAULT_FROM_EMAIL || 'FLOXA';
  const fromAddress = (process.env.EMAIL_HOST_USER || 'contactmiscarchive@gmail.com').trim();

  const subject = `Welcome to FLOXA — Your Account Credentials`;

  const text = `Hello ${name || 'Customer'},

Your FLOXA B2B Customer account has been provisioned by the administrator.

Here are your account credentials:
- Login URL: ${loginUrl}
- Email: ${email}
- Temporary Password: ${rawPassword}

For security purposes, please log in and change your temporary password immediately in Settings > Security.

Best regards,
The FLOXA Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #06160f; color: #e8f5ef; border-radius: 12px; border: 1px solid rgba(77, 255, 160, 0.2);">
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0; color: #4dffa0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">FLOXA</h2>
      </div>

      <h3 style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px; font-weight: 600;">
        Welcome to FLOXA!
      </h3>

      <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        Hello <strong>${name || 'there'}</strong>,
      </p>

      <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        Your FLOXA B2B Customer account has been created by the administrator. You can now access your projects, brand workspaces, and client management tools.
      </p>

      <!-- Credentials Card -->
      <div style="background: rgba(2, 14, 9, 0.75); border: 1px solid rgba(77, 255, 160, 0.25); border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #4dffa0; font-weight: 700; margin-bottom: 12px;">
          Your Login Credentials
        </div>

        <div style="margin-bottom: 10px; font-size: 13px;">
          <span style="color: #89aca0;">Login Portal: </span>
          <a href="${loginUrl}" style="color: #4dffa0; text-decoration: underline; word-break: break-all;">${loginUrl}</a>
        </div>

        <div style="margin-bottom: 10px; font-size: 13px;">
          <span style="color: #89aca0;">Email Address: </span>
          <strong style="color: #ffffff;">${email}</strong>
        </div>

        <div style="font-size: 13px;">
          <span style="color: #89aca0;">Temporary Password: </span>
          <code style="background: rgba(77, 255, 160, 0.12); color: #4dffa0; padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 14px; font-weight: 700;">${rawPassword}</code>
        </div>
      </div>

      <!-- Action Button -->
      <div style="margin-bottom: 24px;">
        <a href="${loginUrl}" style="background-color: #4dffa0; color: #001a0e; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;">
          Sign In to Your Account
        </a>
      </div>

      <!-- Security Notice -->
      <div style="border-top: 1px solid rgba(77, 255, 160, 0.12); padding-top: 16px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; line-height: 1.5; color: #89aca0;">
          🔒 <strong>Security Recommendation:</strong> For your security, please sign in and change your temporary password immediately in <strong>Settings &rarr; Security</strong>.
        </p>
        <p style="margin: 0; font-size: 11px; color: #5a7b6e;">
          If you did not expect this invitation, please contact your organization administrator.
        </p>
      </div>
    </div>
  `;

  if (testEmailDispatcher) {
    await testEmailDispatcher({ to: email, subject, text, html });
    return { success: true };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[superadmin-api] Email sending skipped: EMAIL_HOST_USER or EMAIL_HOST_PASSWORD not configured.`);
    return { success: false, error: 'Email service credentials not configured.' };
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: email,
      subject,
      text,
      html,
    });
    console.log(`[superadmin-api] Welcome email successfully dispatched to ${email}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[superadmin-api] Failed to send welcome email to ${email}:`, err?.message || err);
    return { success: false, error: err?.message || 'SMTP transmission error.' };
  }
}

export async function sendPasswordResetNoticeEmail(params: {
  name: string;
  email: string;
  rawPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const { name, email, rawPassword } = params;
  const rawBase = process.env.FRONTEND_BASE_URL;
  const baseUrl = (rawBase && rawBase !== 'http://localhost:3000'
    ? rawBase
    : (process.env.NODE_ENV === 'production' || process.env.HOSTINGER_ENV === 'production' ? 'https://floxa.flumenx.in' : (rawBase || 'https://floxa.flumenx.in'))
  ).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/login?mode=login`;
  const fromName = process.env.DEFAULT_FROM_EMAIL || 'FLOXA';
  const fromAddress = (process.env.EMAIL_HOST_USER || 'contactmiscarchive@gmail.com').trim();

  const subject = `FLOXA Account — Password Updated by Administrator`;

  const text = `Hello ${name || 'Customer'},

The administrator has updated the password for your FLOXA account.

Here are your new login credentials:
- Login URL: ${loginUrl}
- Email: ${email}
- New Password: ${rawPassword}

You can log in now using this new password.

Best regards,
The FLOXA Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #06160f; color: #e8f5ef; border-radius: 12px; border: 1px solid rgba(77, 255, 160, 0.2);">
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0; color: #4dffa0; font-size: 22px; font-weight: 700;">FLOXA</h2>
      </div>

      <h3 style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px; font-weight: 600;">
        Password Updated
      </h3>

      <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        Hello <strong>${name || 'there'}</strong>,
      </p>

      <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #b4cfc4;">
        Your password has been updated by the administrator. Use the new credentials below to sign in:
      </p>

      <div style="background: rgba(2, 14, 9, 0.75); border: 1px solid rgba(77, 255, 160, 0.25); border-radius: 8px; padding: 18px 20px; margin-bottom: 24px;">
        <div style="margin-bottom: 10px; font-size: 13px;">
          <span style="color: #89aca0;">Login Portal: </span>
          <a href="${loginUrl}" style="color: #4dffa0; text-decoration: underline;">${loginUrl}</a>
        </div>

        <div style="margin-bottom: 10px; font-size: 13px;">
          <span style="color: #89aca0;">Email Address: </span>
          <strong style="color: #ffffff;">${email}</strong>
        </div>

        <div style="font-size: 13px;">
          <span style="color: #89aca0;">New Password: </span>
          <code style="background: rgba(77, 255, 160, 0.12); color: #4dffa0; padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 14px; font-weight: 700;">${rawPassword}</code>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <a href="${loginUrl}" style="background-color: #4dffa0; color: #001a0e; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;">
          Sign In Now
        </a>
      </div>
    </div>
  `;

  if (testEmailDispatcher) {
    await testEmailDispatcher({ to: email, subject, text, html });
    return { success: true };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: 'Email service credentials not configured.' };
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: email,
      subject,
      text,
      html,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'SMTP transmission error.' };
  }
}
