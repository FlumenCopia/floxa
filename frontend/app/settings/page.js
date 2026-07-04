"use client";

import Floxaheader from "../../commone/Floxaheader";
import Settingssection from "../../components/settings/Settingssection";
export default function page() {
  return (
    <div className="shell">
      <Floxaheader title="Settings" activeNav="Settings">
        <Settingssection />
      </Floxaheader>
    </div>
  );
}
