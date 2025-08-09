// app/transcripts/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Sidebar, { Transcript } from "@/components/Sidebar";

export default function TranscriptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  // Fetch transcripts after login
  useEffect(() => {
    if (isSignedIn && session?.accessToken) {
      fetch("/api/transcripts", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Kon notulen niet laden");
          return res.json();
        })
        .then((data) => setTranscripts(data.transcripts))
        .catch((err) => console.error(err));
    }
  }, [isSignedIn, session]);

  return (
    <div className="flex h-screen">
      <Sidebar transcripts={isSignedIn ? transcripts : []} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
