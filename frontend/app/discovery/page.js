"use client";

import { Suspense } from "react";
import Discovery from "../../components/discovery/Discovery";

export default function page() {
  return (
    <Suspense fallback={null}>
      <Discovery />
    </Suspense>
  );
}
