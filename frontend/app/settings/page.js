"use client";

import { Suspense } from "react";
import Floxaheader from "../../commone/Floxaheader";
import Settingssection from "../../components/settings/Settingssection";

function SettingsPageContent() {
  return (
    <div className="shell">
      <Floxaheader title="Settings" activeNav="Settings">
        <Settingssection />
      </Floxaheader>
    </div>
  );
}

export default function page() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  );
}
