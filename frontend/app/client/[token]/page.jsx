"use client";

import { use } from "react";
import { ClientPortal } from "../../../components/client-portal/ClientPortal";

export default function ClientPortalPage({ params }) {
  const { token } = use(params);

  return <ClientPortal token={token} />;
}
