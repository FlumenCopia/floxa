"use client";

import Floxaheader from "../../commone/Floxaheader";
import Analytics from "../../components/analytics/Analytics";

export default function page() {
  return (
    <div className="shell">
      <Floxaheader title="Analytics" activeNav="Analytics">
        <Analytics />
      </Floxaheader>
    </div>
  );
}
