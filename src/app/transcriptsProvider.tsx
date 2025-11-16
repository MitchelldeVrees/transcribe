"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Transcript } from "@/components/Sidebar";

type TranscriptsContextValue = {
  transcripts: Transcript[];
  setTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const TranscriptsContext = createContext<TranscriptsContextValue | null>(null);

export function TranscriptsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !session?.accessToken) {
      if (status === "unauthenticated") {
        setTranscripts([]);
        setError(null);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/transcripts", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch transcripts");
      }
      const data = await res.json();
      setTranscripts(Array.isArray(data?.transcripts) ? data.transcripts : []);
    } catch (err) {
      console.error("[TranscriptsProvider] fetch failed", err);
      setError("Kon notulen niet laden. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, status]);

  useEffect(() => {
    if (status === "authenticated" && session?.accessToken) {
      refresh();
    } else if (status === "unauthenticated") {
      setTranscripts([]);
      setError(null);
    }
  }, [status, session?.accessToken, refresh]);

  const value: TranscriptsContextValue = {
    transcripts,
    setTranscripts,
    loading,
    error,
    refresh,
  };

  return <TranscriptsContext.Provider value={value}>{children}</TranscriptsContext.Provider>;
}

export function useTranscriptsData() {
  const ctx = useContext(TranscriptsContext);
  if (!ctx) {
    throw new Error("useTranscriptsData must be used within TranscriptsProvider");
  }
  return ctx;
}
