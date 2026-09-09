"use client";

import { Suspense, useState } from "react";
import Floxaheader from "@/components/common/FloxaHeader";
import ProjectSection from "@/components/all-projects/ProjectSection";

function ProjectPageContent() {
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  return (
    <div className="shell">
      <Floxaheader title={isWizardOpen ? "New Project" : "All Projects"} activeNav="Projects">
        <ProjectSection isWizardOpen={isWizardOpen} setIsWizardOpen={setIsWizardOpen} />
      </Floxaheader>
    </div>
  );
}

export default function ProjectPage() {
  return (
    <Suspense fallback={null}>
      <ProjectPageContent />
    </Suspense>
  );
}
