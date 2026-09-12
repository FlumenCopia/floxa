"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Floxaheader from "@/components/common/FloxaHeader";
import WhatsAppChatView from "@/components/chat/WhatsAppChatView";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || null;

  return (
    <div className="shell">
      <Floxaheader title="Client Messages" activeNav="Chat">
        <WhatsAppChatView initialProjectId={projectId} />
      </Floxaheader>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageContent />
    </Suspense>
  );
}
