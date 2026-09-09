"use client";

import { Suspense } from "react";
import Floxaheader from "@/components/common/FloxaHeader";
import Analytics from "../../components/analytics/Analytics";

function AnalyticsPageContent() {
  return (
    <div className="shell">
      <Floxaheader title="Analytics" activeNav="Analytics">
        <Analytics />
      </Floxaheader>
    </div>
  );
}

export default function page() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPageContent />
    </Suspense>
  );
}
