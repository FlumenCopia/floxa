"use client";

import { Suspense } from "react";
import Floxaheader from "@/components/common/FloxaHeader";
import AiSuite from "@/components/ai-suite/AiSuite";

function AiSuitePageContent() {
  return (
    <div className="shell">
      <Floxaheader title="AI Suite" activeNav="AI Suite">
        <AiSuite />
      </Floxaheader>
    </div>
  );
}

export default function page() {
  return (
    <Suspense fallback={null}>
      <AiSuitePageContent />
    </Suspense>
  );
}
