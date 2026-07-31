import { Suspense } from "react";
import Floxaheader from "../commone/Floxaheader";
import Dashboardsection from "../components/dashboard/Dashboardsection.jsx";

function HomePageContent() {
  return (
    <div className="shell">
      <Floxaheader>
        <Dashboardsection />
      </Floxaheader>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
