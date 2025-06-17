// components/ResultsSection.tsx
"use client";

import React from "react";
import DOMPurify from "dompurify";

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
  return (
    <div id="results-section" className="space-y-6 px-4 py-6">
      {/* Metrics responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-3">
            <i className="fas fa-clock text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Lengte</p>
            <p className="text-lg font-semibold">{audioDuration}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-green-100 text-green-600 mr-3">
            <i className="fas fa-font text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Woord aantal</p>
            <p className="text-lg font-semibold">{wordCount}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-3">
            <i className="fas fa-bolt text-xl"></i>
          </div>
          <div>
            <p className="text-sm text-gray-500">Process tijd</p>
            <p className="text-lg font-semibold">{processingTime}s</p>
          </div>
        </div>
      </div>

      {/* Transcript, Summary, Speakers, Actions, Q&A, Word Frequency */}
      <div className="space-y-6">
        {/* Reusable Section Panel */}
        {renderPanel(
          "Transcript",
          transcript,
          transcript,
          () => navigator.clipboard.writeText(transcript),
          exportToWord,
          true
        )}

        {summary && renderPanel(
          "Samenvatting",
          summary,
          summary,
          () => navigator.clipboard.writeText(summary),
          undefined,
          false
        )}

        {speakersTranscript && renderPanel(
          "Sprekers Transcript",
          speakersTranscript,
          speakersTranscript,
          () => navigator.clipboard.writeText(speakersTranscript),
          undefined,
          false,
          true
        )}

        {actionItems && renderPanel(
          "Actiepunten & Taken",
          actionItems,
          actionItems.split("\n").filter(line => line.trim()),
          () => navigator.clipboard.writeText(actionItems),
          undefined
        )}

        {qna.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-gray-800">Vragen & Antwoorden</h3>
              <button
                onClick={() => navigator.clipboard.writeText(
                  qna.map(item => `Vraag: ${item.question}\nAntwoord: ${item.answer}`).join("\n\n")
                )}
                className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >Kopieer Q&A</button>
            </div>
            <div className="space-y-4">
              {qna.map((item, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <p className="font-medium text-blue-900">Vraag</p>
                  <p className="mb-2">{item.question}</p>
                  <p className="font-medium text-green-900">Antwoord</p>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Woord frequentie as horizontal scroll list */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-3">Woord frequentie</h3>
          <div className="flex space-x-2 overflow-x-auto py-2">
            {wordFrequencies.map(item => (
              <span key={item.word} className="flex-shrink-0 px-3 py-1 bg-white rounded-full text-sm shadow-sm">
                {item.word} <span className="font-medium text-blue-600">{item.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Buttons at bottom */}
      <div className="flex flex-col sm:flex-row justify-center sm:justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >{saving ? 'Saving…' : 'Save to Account'}</button>
        <button
          onClick={handleNewTranscription}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
        >Begin nieuwe notulen</button>
      </div>
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
  const lines = Array.isArray(content) ? content : content.split(preserveWhitespace ? "" : "\n\n");
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex space-x-2">
          <button onClick={onCopy} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">Kopieer</button>
        </div>
      </div>
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto text-gray-800 ${preserveWhitespace ? 'whitespace-pre-wrap' : ''}`}>
        {lines.map((line, idx) => (
          <div key={idx} className="mb-2">{line}</div>
        ))}
      </div>
    </div>
  );
}
