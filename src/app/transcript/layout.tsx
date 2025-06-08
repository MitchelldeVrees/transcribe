// app/transcripts/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession }              from "next-auth/react";
import Sidebar, { Transcript }     from "@/components/Sidebar";

export default function TranscriptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  // fetch list of transcripts once
  useEffect(() => {
    if (session) {
      fetch("/api/transcipts")
        .then((res) => {
          if (!res.ok) throw new Error("Kon transcripties niet laden");
          return res.json();
        })
        .then((data) => setTranscripts(data.transcripts))
        .catch((err) => console.error(err));
    }
  }, [session]);

  return (
    <div className="flex h-screen">
      <Sidebar transcripts={session ? transcripts : []} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
