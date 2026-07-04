import Floxaheader from "../../commone/Floxaheader";
import ProjectSection from "../../components/Allproject/ProjectSection";

export default function page() {
  return (
    <div className="shell">
      <Floxaheader title="All Projects" activeNav="Projects">
        <ProjectSection />
      </Floxaheader>
    </div>
  );
}
