import { Suspense } from "react";
import ConsultantClientPortal from "@/components/client-portal/ConsultantClientPortal";
import "../../components/client-portal/ClientPortal.css";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConsultantClientPortal />
    </Suspense>
  );
}
