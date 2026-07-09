"use client";

export function SplashScreen({ project, branding, onNext }) {
  return (
    <section className="client-welcome-stage">
      <div className="client-welcome-glass client-design-enter">
        <div className="client-welcome-copy">
          <div className="client-wordmark">FLOXA</div>
          <p className="client-welcome-subtitle">{branding.heading}</p>
          <div className="client-project-label">{project.name}</div>

          {project.meetingSummary ? (
            <p className="client-meeting-summary">{project.meetingSummary}</p>
          ) : null}

          <button
            type="button"
            className="client-gradient-button"
            onClick={() => onNext("login")}
          >
            <span>Let&apos;s Begin</span>
            <span className="client-button-arrow" aria-hidden="true">
              -&gt;
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function LoginScreen({ project, branding, resumeScreen, onNext }) {
  return (
    <section className="client-welcome-stage">
      <div className="client-welcome-glass client-access-glass client-design-enter">
        <div className="client-access-intro">
          <div className="client-wordmark client-wordmark-left">FLOXA</div>
          <p className="client-welcome-subtitle">{branding.heading}</p>
          <p className="client-access-description">
            Your private project space is ready. Continue to complete your
            profile and brand discovery.
          </p>

          <button
            type="button"
            className="client-back-button"
            onClick={() => onNext("splash")}
          >
            <span aria-hidden="true">&lt;-</span> Go Back
          </button>
        </div>

        <div className="client-access-form">
          <div className="client-access-field">
            <span className="client-access-icon" aria-hidden="true">
              o
            </span>
            <div>
              <span className="client-access-label">Client access</span>
              <strong>{project.clientEmail || "Private portal link"}</strong>
            </div>
          </div>

          <div className="client-access-field">
            <span className="client-access-icon" aria-hidden="true">
              &lt;&gt;
            </span>
            <div>
              <span className="client-access-label">Project</span>
              <strong>{project.name}</strong>
            </div>
          </div>

          <button
            type="button"
            className="client-access-submit"
            onClick={() => onNext(resumeScreen || "profile")}
          >
            Get Started <span aria-hidden="true">-&gt;</span>
          </button>

          <div className="client-access-verified">
            <span />
            Secure private link verified
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
