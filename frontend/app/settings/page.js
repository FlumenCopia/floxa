"use client";

import Floxaheader from "../../commone/Floxaheader";
import Settingssection from "../../components/settings/Settingssection";
export default function page() {
  return (
    <div className="shell">
      <Floxaheader>

        <Settingssection />
        
      </Floxaheader>
    </div>
  );
}
