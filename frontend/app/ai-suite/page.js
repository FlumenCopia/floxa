"use client";

import { Suspense } from "react";
import Floxaheader from "../../commone/Floxaheader";
import Aisute from "../../components/ai-suite/Aisute";

function AiSuitePageContent() {
  return (
    <div className="shell">
      <Floxaheader title="AI Suite" activeNav="AI Suite">
        <Aisute />
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
