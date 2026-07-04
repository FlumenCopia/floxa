"use client";

import { useState } from "react";
import Floxaheader from "../../commone/Floxaheader";
import ProjectSection from "../../components/Allproject/ProjectSection";

export default function page() {
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  return (
    <div className="shell">
      <Floxaheader title={isWizardOpen ? "New Project" : "All Projects"} activeNav="Projects">
        <ProjectSection isWizardOpen={isWizardOpen} setIsWizardOpen={setIsWizardOpen} />
      </Floxaheader>
    </div>
  );
}
