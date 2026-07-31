import Floxaheader from "../commone/Floxaheader";
import Dashboardsection from "../components/dashboard/Dashboardsection.jsx";

export default function Home() {
  return (
    <div className="shell">
      <Floxaheader>
        <Dashboardsection />
      </Floxaheader>
    </div>
  );
}
