"use client";

import { useState } from "react";
import Account from "../../app/settings/Account";
import Billing from "../../app/settings/Billing";
import Branding from "../../app/settings/Branding";
import Security from "../../app/settings/Security";

const tabs = [
  { id: "account", label: "Account", component: Account },
  { id: "branding", label: "Branding", component: Branding },
  { id: "billing", label: "Plan & Billing", component: Billing },
  { id: "security", label: "Security", component: Security },
];

export default function Settingssection() {
  const [activeTab, setActiveTab] = useState("account");
  const ActivePanel = tabs.find((tab) => tab.id === activeTab)?.component || Account;

  return (
    <div className="content">
      <div className="screen active" id="screen-settings">
        <h1 className="settings-page-title">Settings</h1>
        <div className="settings-layout">
          <div className="settings-nav" aria-label="Settings sections" role="tablist">
            {tabs.map((tab) => (
              <button
                aria-selected={activeTab === tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? "active" : ""}`.trim()}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="settings-panel" role="tabpanel">
            <ActivePanel />
          </div>
        </div>
      </div>
    </div>
  );
}
