// components/ResultsSection.tsx
"use client";

import React, { useMemo, useState } from "react"; // NEW: useState, useMemo
import DOMPurify from "dompurify";
import { FaCopy } from "react-icons/fa";
import { useUser } from "@clerk/nextjs";


interface WordFreq { word: string; count: number; }
interface QnaItem  { question: string; answer: string; }

interface ResultsSectionProps {
  audioDuration: string;
  wordCount: number;
  processingTime: number;
  transcript: string;
  summary: string;
  speakersTranscript: string;
  actionItems: string;
  wordFrequencies: WordFreq[];
  qna: QnaItem[];
  saving: boolean;
  handleSave: () => void;
  exportToWord: () => void;
  handleNewTranscription: () => void;
}



function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// ---- Helpers (NEW) ----
function splitIntoSentences(text: string): string[] {
  // Simple splitter; tweak if you need better sentence detection
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function HtmlPanel({
  title,
  html,
  onCopy,
}: {
  title: string;
  html: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <button
          onClick={onCopy}
          className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
        >
          <FaCopy className="mr-1" /> Kopieer
        </button>
      </div>

      <div
        className="rounded-lg border border-gray-200 bg-white p-4 text-gray-800"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    </div>
  );
}
const looksLikeHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);



function getContextSlice(
  sentences: string[],
  question: string,
  windowSize = 5
) {
  const lowerQ = question.toLowerCase();
  const idx = sentences.findIndex(s => s.toLowerCase().includes(lowerQ));

  if (idx === -1) {
    const start = 0;
    const end = Math.min(sentences.length, windowSize * 2 + 1);
    return { slice: sentences.slice(start, end), foundIndex: -1, start };
  }

  const start = Math.max(0, idx - windowSize);
  const end = Math.min(sentences.length, idx + windowSize + 1);
  return { slice: sentences.slice(start, end), foundIndex: idx - start, start };
}


// ---- Modal component (NEW) ----
function ContextModal({
  open,
  onClose,
  title,
  qna,
  contextSentences,
  highlightIndex,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  qna: QnaItem | null;
  contextSentences: string[];
  highlightIndex: number;
}) {
  if (!open) return null;

  const snapshot = contextSentences.join(" "); // single paragraph, no enters

  const highlightedSnapshot = React.useMemo(() => {
    if (!qna?.question) {
      return snapshot;
    }
    const q = qna.question.trim();
    if (!q) return snapshot;

    try {
      const re = new RegExp(escapeRegExp(q), "gi");
      const parts = snapshot.split(re);
      const matches = snapshot.match(re);

      if (!matches) {
        // fallback: highlight whole sentence if we have an index
        if (highlightIndex >= 0 && contextSentences[highlightIndex]) {
          const fallback = contextSentences
            .map((s, i) =>
              i === highlightIndex
                ? `<span class="bg-blue-100 text-blue-800 font-medium">${s}</span>`
                : s
            )
            .join(" ");
          return (
            <span
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fallback) }}
            />
          );
        }
        return snapshot;
      }

      const out: React.ReactNode[] = [];
      for (let i = 0; i < parts.length; i++) {
        out.push(<span key={`p-${i}`}>{parts[i]}</span>);
        if (i < parts.length - 1) {
          const m = matches[i];
          out.push(
            <span
              key={`h-${i}`}
              className="bg-blue-100 text-blue-800 font-medium"
            >
              {m}
            </span>
          );
        }
      }
      return out;
    } catch {
      return snapshot;
    }
  }, [snapshot, qna?.question, highlightIndex, contextSentences]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Context</h3>
          <button
            aria-label="Sluiten"
            onClick={onClose}
            className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Q & A on top */}
        {qna && (
          <div className="mb-4 space-y-2 rounded-md border border-gray-200 bg-white p-4">
            <div>
              <p className="font-medium text-blue-900">Vraag</p>
              <p>{qna.question}</p>
            </div>
            <div>
              <p className="font-medium text-green-900">Antwoord</p>
              <p>{qna.answer}</p>
            </div>
          </div>
        )}

        {/* Snapshot */}
        <div className="rounded-md bg-gray-50 p-4 text-gray-800">
          <p className="leading-relaxed">{highlightedSnapshot}</p>
        </div>
      </div>
    </div>
  );
}



export default function ResultsSection({
  audioDuration,
  wordCount,
  processingTime,
  transcript,
  summary,
  speakersTranscript,
  actionItems,
  wordFrequencies,
  qna,
  saving,
  handleSave,
  exportToWord,
  handleNewTranscription,
}: ResultsSectionProps) {
  const { isSignedIn } = useUser();

  // NEW: pre-split transcript once
  const sentences = useMemo(() => splitIntoSentences(transcript), [transcript]);

  // NEW: modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<string[]>([]);
  const [modalTitle, setModalTitle] = useState<string>("");
  
  const [modalQna, setModalQna] = useState<QnaItem | null>(null);
  const [matchedIdx, setMatchedIdx] = useState<number>(-1);
  const openContextForQna = (q: QnaItem) => {
    const { slice, foundIndex } = getContextSlice(sentences, q.question, 5);
    setModalTitle(`Vraag: ${q.question}`);
    setModalContext(slice);
    setMatchedIdx(foundIndex);
    setModalQna(q);
    setModalOpen(true);
  };
  

  return (
    <div id="results-section" className="space-y-6 px-4 py-6">
      {/* Metrics responsive grid */}
      
      {/* Transcript, Summary, Speakers, Actions, Q&A, Word Frequency */}
      <div className="space-y-6">
        {/* Transcript */}
        {renderPanel(
          "Transcript",
          transcript,
          transcript,
          () => navigator.clipboard.writeText(transcript),
          exportToWord,
          true
        )}

        {/* Samenvatting */}
        {summary && (
  looksLikeHtml(summary) ? (
    <HtmlPanel
      title="Samenvatting"
      html={summary}
      onCopy={() => navigator.clipboard.writeText(summary)}
    />
  ) : null
)}
        

        {speakersTranscript && (
  looksLikeHtml(speakersTranscript) ? (
    <HtmlPanel
      title="Sprekers Transcript"
      html={speakersTranscript}
      onCopy={() => navigator.clipboard.writeText(speakersTranscript)}
    />
  ) : null
)}

{actionItems && (
  looksLikeHtml(actionItems) ? (
    <HtmlPanel
      title="Actiepunten & Taken"
      html={actionItems}
      onCopy={() => navigator.clipboard.writeText(actionItems)}
    />
  ) : null
)}




        {/* Vragen & Antwoorden */}
        {qna.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Vragen & Antwoorden
              </h3>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(
                    qna
                      .map(item => `Vraag: ${item.question}\nAntwoord: ${item.answer}`)
                      .join("\n\n")
                  )
                }
                className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                <FaCopy className="mr-1" /> Kopieer Q&A
              </button>
            </div>
            <div className="max-h-100 space-y-4 overflow-y-auto">
              {qna.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => openContextForQna(item)} // NEW
                  className="block w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <p className="font-medium text-blue-900">Vraag</p>
                  <p className="mb-2">{item.question}</p>
                  <p className="font-medium text-green-900">Antwoord</p>
                  <p>{item.answer}</p>
                  <p className="mt-2 text-xs text-gray-500">Klik om context te zien</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Woord frequentie */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="mb-3 text-lg font-semibold text-blue-800">Woord frequentie</h3>
          <div className="flex flex-wrap gap-2 py-2">
          {wordFrequencies.map(item => (
            <span key={item.word} className="rounded-full bg-white px-3 py-1 text-sm shadow-sm">
              {item.word} <span className="font-medium text-blue-600">{item.count}</span>
            </span>
          ))}
          </div>
        </div>
      </div>

      {/* Buttons at bottom */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {!isSignedIn && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
          >
            {saving ? "Saving…" : "Save to Account"}
          </button>
        )}
        <button
          onClick={handleNewTranscription}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-500"
        >
          Begin nieuwe notulen
        </button>
      </div>

      {/* Modal (NEW) */}
      <ContextModal
  open={modalOpen}
  onClose={() => setModalOpen(false)}
  title={modalTitle}
  qna={modalQna}
  contextSentences={modalContext}
  highlightIndex={matchedIdx}
/>


    </div>
  );
}

// Helper to render panels
function renderPanel(
  title: string,
  content: string | any[],
  rawText: string,
  onCopy: () => void,
  extraAction?: () => void,
  preserveWhitespace = false
) {
  let lines: any[];
  if (Array.isArray(content)) {
    lines = content;
  } else if (preserveWhitespace) {
    lines = content.split("\n");
  } else {
    lines = content.split("\n\n");
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <button
          onClick={onCopy}
          className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
        >
          <FaCopy className="mr-1" /> Kopieer
        </button>
      </div>
      <div
        className={`
          max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-800
          ${preserveWhitespace ? "whitespace-pre-wrap" : ""}
        `}
      >
        {lines.map((line, idx) => (
          <div key={idx} className="mb-2">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
