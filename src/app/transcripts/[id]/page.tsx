// app/transcripts/[id]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams }       from "next/navigation";
import { useSession }      from "next-auth/react";
import Sidebar, { Transcript } from "@/components/Sidebar";
import ResultsSection      from "@/components/ResultsSection";
import { stopwords } from "../../stopwords"; // adjust path as needed

interface TranscriptDetail {
  id: string;
  title: string;
  content: string;
  summary?: string;
  actionPoints?: string;
  qna?: { question: string; answer: string }[];
  created: string;
  timeLength: string; 
  audioLength: string;
}

export default function TranscriptPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const [transcript, setTranscript] = useState<TranscriptDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [wordFrequencies, setWordFrequencies] = useState<{ word: string; count: number }[]>([]);

  const [transcripts, setTranscripts] = useState<Transcript[]>([])

  // Fetch the transcript
  useEffect(() => {
    if (session && id) {
      setLoading(true);
      fetch(`/api/transcipts/${id}`)               // ← fixed spelling
        .then((res) => {
          if (!res.ok) throw new Error("Kon transcript niet laden");
          return res.json();
        })
        .then((data) => setTranscript(data.transcript))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [session, id]);



  useEffect(() => {
    if (session) {
      fetch("/api/transcipts")
        .then((res) => {
          if (!res.ok) throw new Error("transcrive");
          return res.json();
        })
        .then((data) => setTranscripts(data.transcripts))
        .catch((err) => setError(err.message));
    }
  }, [session]);

// after fetching sets `transcript`
useEffect(() => {
  if (!transcript) return;

  // 1) split into words
  const matches = transcript.content
    .toLowerCase()
    .match(/\b[^\d\W]+\b/g) || [];

  // 2) filter out stopwords (import your stopwords array!)
  import("@/app/stopwords").then(({ stopwords }) => {
    const filtered = matches.filter(w => !stopwords.includes(w));

    // 3) build a frequency map
    const freqMap: Record<string, number> = {};
    filtered.forEach(w => {
      freqMap[w] = (freqMap[w] || 0) + 1;
    });

    // 4) convert to sorted array
    const freqArray = Object.entries(freqMap)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    setWordFrequencies(freqArray);
  });
}, [transcript]);


  // Static placeholders for read-only detail page
  const audioDuration     = transcript?.audioLength || "0:00"; // Default to "0:00" if not available
  const wordCount         = transcript?.content.split(/\s+/).length || 0;
  const processingTime    = transcript?.timeLength || "0:00"; // Convert to number
  const speakersTranscript = "";
  const actionItems       = transcript?.actionPoints ?? "";
  const summary           = transcript?.summary      ?? "";
  // No-ops—detail page doesn’t actually save
  const saving              = false;
  const handleSave          = () => {};
  const exportToWord        = () => {};
  const handleNewTranscription = () => {};

  // Guards…
  if (!session) {
    return (
      <div className="flex h-screen">
        <Sidebar transcripts={[]} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-gray-700">
            Log in om dit transcript te bekijken.
          </p>
        </main>
      </div>
    );
  }
  if (loading || (!transcript && !error)) {
    return (
      <div className="flex h-screen">
{<Sidebar transcripts={transcripts} />}
<main className="flex-1 flex items-center justify-center">
          <p>Loading…</p>
        </main>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-screen">
{<Sidebar transcripts={transcripts} />}
e<main className="flex-1 flex items-center justify-center">
          <p className="text-red-600">{error}</p>
        </main>
      </div>
    );
  }

  // Render
  return (
    <div className="flex h-screen">
{<Sidebar transcripts={transcripts} />}

      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <h1 className="text-2xl font-bold mb-1">{transcript!.title}</h1>
        <p className="text-xs text-gray-500 mb-4">
          {new Date(transcript!.created).toLocaleString("nl-NL", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>

        <ResultsSection
          audioDuration={audioDuration}
          wordCount={wordCount}
          processingTime={processingTime}
          transcript={transcript!.content}     // ← content string only
          summary={summary}
          speakersTranscript={speakersTranscript}
          actionItems={actionItems}
          wordFrequencies={wordFrequencies}     // ← correct type
          saving={saving}
          session={session}
          handleSave={handleSave}
          exportToWord={exportToWord}
          handleNewTranscription={handleNewTranscription}
        />
      </main>
    </div>
  );
}
