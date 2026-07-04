"use client";

import Floxaheader from "../../commone/Floxaheader";
import Aisute from "../../components/ai-suite/Aisute";

export default function page() {
  return (
    <div className="shell">
      <Floxaheader title="AI Suite" activeNav="AI Suite">
        <Aisute />
      </Floxaheader>
    </div>
  );
}
