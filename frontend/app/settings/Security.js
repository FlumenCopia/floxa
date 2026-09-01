"use client";

import { showInfo } from "../../src/lib/toast";

export default function Security() {
  const handleEnable2FA = () => {
    showInfo("Two-factor authentication will be supported in a future release.");
  };

  const handleRevokeSessions = () => {
    showInfo("Remote session revocation will be supported in a future release.");
  };

  return (
    <div className="card settings-card settings-security-card">
      <div className="font-6 settings-card-title">Security</div>

      <div className="settings-security-row">
        <div>
          <div className="text-sm font-5">Two-factor authentication</div>
          <div className="text-xs text-muted">Add extra security to your account</div>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={handleEnable2FA}>
          Enable 2FA
        </button>
      </div>

      <div className="divider" />

      <div className="settings-security-row">
        <div>
          <div className="text-sm font-5">Active sessions</div>
          <div className="text-xs text-muted">Current session active</div>
        </div>
        <button className="btn btn-danger btn-sm" type="button" onClick={handleRevokeSessions}>
          Revoke all
        </button>
      </div>
    </div>
  );
}
