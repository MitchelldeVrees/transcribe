// app/transcripts/[id]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Sidebar from "@/components/Sidebar";
import ResultsSection from "@/components/ResultsSection";
import { stopwords } from "../../stopwords";
import { useSession } from "next-auth/react";
import DownloadModal from '../../../components/downloadModal';
import { FaFileWord, FaFilePdf } from "react-icons/fa";
import { useTranscriptsData } from "../../transcriptsProvider";

const fetcher = (url: string, token: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
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
  const router = useRouter();
  // Grab session info from NextAuth
  const { data: session, status } = useSession();
  const isLoaded = status !== "loading";
  const isSignedIn = status === "authenticated";
  const user = session?.user;
  const MAX_TITLE_LENGTH = 50;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'word'|'pdf'>('word');

  const {
    transcripts,
    setTranscripts,
    loading: transcriptsLoading,
    error: transcriptsError,
  } = useTranscriptsData();

  // --- 2) SWR for detail ---
  const {
    data: detailData,
    isLoading: detailLoading,
    error: detailError,
    mutate: mutateDetail
  } = useSWR(
    isLoaded && isSignedIn && id && session?.accessToken
      ? [`/api/transcripts/${id}`, session.accessToken]
      : null,
    ([url, token]) => fetcher(url, token!),
    { revalidateOnFocus: false }
  );

  const [isEditing, setIsEditing] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  useEffect(() => {
    if (detailData?.transcript.title) {
      setTitleInput(detailData.transcript.title);
    }
  }, [detailData]);

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

  async function saveTitle() {
    if (!id) return;
    try {
      const res = await fetch(`/api/transcripts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({ title: titleInput }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      // trigger a refetch for the detail endpoint:
      await mutateDetail();        
      setTranscripts((prev) =>
        prev.map((t) => {
          if (String(t.id) === String(id)) {
            return { ...t, title: titleInput };
          }
          return t;
        })
      );
    } catch (e) {
      console.error("Failed to save title", e);
    } finally {
      setIsEditing(false);
    }
  }
  

  // Guards: auth / loading / error
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!isSignedIn) {
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

  if ((transcriptsLoading && transcripts.length === 0) || detailLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar transcripts={transcripts} />
        <main className="flex-1 flex items-center justify-center">
          <p>Loading…</p>
        </main>
      </div>
    );
  }

  if (transcriptsError || detailError) {
    return (
      <div className="flex h-screen">
        <Sidebar transcripts={transcripts} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-red-600">
            {transcriptsError ?? detailError?.message}
          </p>
        </main>
      </div>
    );
  }

  const transcript = detailData!.transcript;

  return (
    <div className="flex h-screen">
      <Sidebar transcripts={transcripts} />

      <main className="flex-1 overflow-y-auto px-6 pb-6 pt-16 bg-gray-50">
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex md:items-center md:justify-between md:gap-8">
          <div className="flex-1">
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
                <span className="absolute top-0 right-0 mt-1 mr-2 text-sm text-gray-500">
                  {titleInput.length}/{MAX_TITLE_LENGTH}
                </span>
              </div>
            ) : (
              <h1
                className="mb-1 cursor-text text-2xl font-bold"
                onDoubleClick={() => setIsEditing(true)}
              >
                {transcript.title}
              </h1>
            )}
            <p className="text-xs text-gray-500">
              {new Date(transcript.created).toLocaleString("nl-NL", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 md:mt-0 md:items-end">
            <p className="text-sm font-semibold text-gray-600">Exporteer naar</p>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setModalType("word");
                  setModalOpen(true);
                }}
                className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500"
              >
                <FaFileWord size={20} />
              </button>
              <button
                onClick={() => {
                  setModalType("pdf");
                  setModalOpen(true);
                }}
                className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500"
              >
                <FaFilePdf size={20} />
              </button>
            </div>
          </div>
        </div>


<DownloadModal
  isOpen={modalOpen}
  onClose={() => setModalOpen(false)}
  title={transcript.title}
  type={modalType}
  transcript={transcript.content}
  summary={transcript.summary || ''}
  actionPoints={transcript.actionPoints || ''}
  qna={transcript.qna || []}
/>
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
          qna={transcript.qna || []}
          handleSave={() => {}}
          exportToWord={() => {}}
          handleNewTranscription={() => router.push("/")}
        />

      </main>
    </div>
  );
}
