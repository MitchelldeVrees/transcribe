// app/transcripts/layout.tsx
"use client";

import React from "react";
import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";
import { useTranscriptsData } from "../transcriptsProvider";

export default function TranscriptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";
  const { transcripts } = useTranscriptsData();

  return (
    <div className="flex h-screen">
      <Sidebar transcripts={isSignedIn ? transcripts : []} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
