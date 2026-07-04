"use client";

export default function Security() {
  return (
    <div className="card settings-card settings-security-card">
      <div className="font-6 settings-card-title">Security</div>

      <div className="settings-security-row">
        <div>
          <div className="text-sm font-5">Two-factor authentication</div>
          <div className="text-xs text-muted">Add extra security to your account</div>
        </div>
        <button className="btn btn-secondary btn-sm" type="button">
          Enable 2FA
        </button>
      </div>

      <div className="divider" />

      <div className="settings-security-row">
        <div>
          <div className="text-sm font-5">Active sessions</div>
          <div className="text-xs text-muted">2 active sessions across devices</div>
        </div>
        <button className="btn btn-danger btn-sm" type="button">
          Revoke all
        </button>
      </div>
    </div>
  );
}
