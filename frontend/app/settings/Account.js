"use client";

export default function Account() {
  return (
    <>
      <div className="card settings-card mb-3">
        <div className="font-6 settings-card-title">Account details</div>
        <div className="settings-form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="account-name">
              Full name
            </label>
            <input className="form-input settings-input" id="account-name" defaultValue="Anoop Krishna V A" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-email">
              Email
            </label>
            <input
              className="form-input settings-input"
              id="account-email"
              defaultValue="anoop@flumenx.com"
              readOnly
            />
            <div className="form-hint">Change via Firebase</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-company">
              Company
            </label>
            <input className="form-input settings-input" id="account-company" defaultValue="FlumenX" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="account-phone">
              Phone
            </label>
            <input className="form-input settings-input" id="account-phone" defaultValue="+91 98765 43210" />
          </div>
        </div>
        <button className="btn btn-primary settings-save-btn" type="button">
          Save changes
        </button>
      </div>

      <div className="card settings-card settings-danger-card">
        <div className="font-6 settings-card-title text-danger">Danger zone</div>
        <div className="text-sm text-muted mb-3">
          Permanently delete your account and all associated data. This action cannot be undone.
        </div>
        <button className="btn btn-danger" type="button">
          Delete account
        </button>
      </div>
    </>
  );
}
