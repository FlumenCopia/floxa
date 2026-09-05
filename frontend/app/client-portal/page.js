import { Suspense } from "react";
import Clientportal from "../../components/client-portal/Clientportal";
import "../../components/client-portal/ClientPortal.css";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Clientportal />
    </Suspense>
  );
}
