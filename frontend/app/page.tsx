import { cookies } from "next/headers";
import Floxaheader from "../commone/Floxaheader";
import Dashboardsection from "../components/dashboard/Dashboardsection";
import Login from "../login/Login";

export default async function Home() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("floxa_auth")?.value === "1";

  if (isAuthenticated) {
    return (
      <div className="shell">
        <Floxaheader>
          <Dashboardsection />
        </Floxaheader>
      </div>
    );
  }

  return (
    <Login />
  );
}
