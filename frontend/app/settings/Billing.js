"use client";

const planFeatures = ["Plan details unavailable"];

export default function Billing() {
  return (
    <div className="card settings-card settings-plan-card">
      <div className="row-sb settings-card-title-row">
        <div className="font-6 settings-card-title">Current plan</div>
        <span className="badge badge-blue">Unavailable</span>
      </div>

      <div className="settings-feature-list">
        {planFeatures.map((feature) => (
          <div className="settings-feature-item" key={feature}>
            <svg aria-hidden="true" className="settings-check-icon" viewBox="0 0 24 24">
              <path d="m5 12 4 4L19 6" />
            </svg>
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <div className="text-sm text-muted">Billing data unavailable</div>
    </div>
  );
}
