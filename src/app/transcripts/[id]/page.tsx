// app/transcripts/[id]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams }                    from "next/navigation";
import { useSession }                   from "next-auth/react";
import useSWR                            from "swr";
import Sidebar, { Transcript }          from "@/components/Sidebar";
import ResultsSection                   from "@/components/ResultsSection";
import { stopwords }                    from "../../stopwords";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Fetch error ${r.status}`);
  return r.json();
});

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
  const MAX_TITLE_LENGTH = 50;

  // --- 1) SWR for sidebar list ---
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
    mutate: mutateList
  } = useSWR(session ? "/api/transcripts" : null, fetcher, {
    revalidateOnFocus: false,
  });

  // --- 2) SWR for detail ---
  const {
    data: detailData,
    isLoading: detailLoading,
    error: detailError,
    mutate: mutateDetail
  } = useSWR(
    session && id ? `/api/transcripts/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Local UI state for inline editing
  const [isEditing, setIsEditing]   = useState(false);
  const [titleInput, setTitleInput] = useState("");

  // When the detail finishes loading, seed the input
  useEffect(() => {
    if (detailData?.transcript.title) {
      setTitleInput(detailData.transcript.title);
    }
  }, [detailData]);

  // Compute word frequencies once we have content
  const [wordFrequencies, setWordFrequencies] = useState<
    { word: string; count: number }[]
  >([]);
  useEffect(() => {
    if (!detailData?.transcript.content) return;
    const matches =
      detailData.transcript.content
        .toLowerCase()
        .match(/\b[^\d\W]+\b/g) || [];
    const filtered = matches.filter(
      (w: string) => !stopwords.includes(w)
    );
    const freqMap: Record<string, number> = {};
    filtered.forEach((w: string | number) => (freqMap[w] = (freqMap[w] || 0) + 1));
    setWordFrequencies(
      Object.entries(freqMap)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
    );
  }, [detailData]);

  // Inline-save handler
  async function saveTitle() {
    if (!id) return;
    try {
      const res = await fetch(`/api/transcripts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleInput }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }

      // 1) Optimistically update detail panel
      mutateDetail(
        {
          transcript: { ...detailData!.transcript, title: titleInput },
        },
        false
      );

      // 2) Optimistically update sidebar list
      mutateList(
        {
          transcripts: listData!.transcripts.map((t: Transcript) =>
            t.id === id ? { ...t, title: titleInput } : t
          ),
        },
        false
      );
    } catch (e) {
      console.error("Failed to save title", e);
    } finally {
      setIsEditing(false);
    }
  }

  // Guards: auth / loading / error
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
  if (listLoading || detailLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar transcripts={listData?.transcripts || []} />
        <main className="flex-1 flex items-center justify-center">
          <p>Loading…</p>
        </main>
      </div>
    );
  }
  if (listError || detailError) {
    return (
      <div className="flex h-screen">
        <Sidebar transcripts={listData?.transcripts || []} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-600">
            {(listError || detailError)!.message}
          </p>
        </main>
      </div>
    );
  }

  // Destructure out the detail
  const transcript = detailData!.transcript;
  const transcripts = listData!.transcripts;

  // Render
  return (
    <div className="flex h-screen">
      <Sidebar transcripts={transcripts} />

      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {/* Inline‐editable title */}
        {isEditing ? (
          <div className="relative mb-1">
            <input
              type="text"
              maxLength={MAX_TITLE_LENGTH}
              className="w-full text-2xl font-bold border-b-2 border-blue-500 focus:outline-none pr-16"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitleInput(transcript.title);
                  setIsEditing(false);
                }
              }}
              autoFocus
            />
            <span className="absolute top-0 right-0 text-sm text-gray-500 mt-1 mr-2">
              {titleInput.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
        ) : (
          <h1
            className="text-2xl font-bold mb-1 cursor-text"
            onDoubleClick={() => setIsEditing(true)}
          >
            {transcript.title}
          </h1>
        )}

        <p className="text-xs text-gray-500 mb-4">
          {new Date(transcript.created).toLocaleString("nl-NL", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>

        <ResultsSection
          audioDuration={transcript.audioLength}
          wordCount={transcript.content.split(/\s+/).length}
          processingTime={transcript.timeLength}
          transcript={transcript.content}
          summary={transcript.summary || ""}
          speakersTranscript=""
          actionItems={transcript.actionPoints || ""}
          wordFrequencies={wordFrequencies}
          saving={false}
          session={session}
          handleSave={() => {}}
          exportToWord={() => {}}
          handleNewTranscription={() => {}}
        />
      </main>
    </div>
  );
}
