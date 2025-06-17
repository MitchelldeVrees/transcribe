// components/ResultsSection.tsx
"use client";

import React from "react";

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
    <div id="results-section">
      {/* Header bar */}
      
      {/* Metrics & Content */}
      <div className="p-6">
        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Duration */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                <i className="fas fa-clock text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Lengte</p>
                <p className="text-lg font-semibold">{audioDuration}</p>
              </div>
            </div>
          </div>
          {/* Word count */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                <i className="fas fa-font text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Woord aantal</p>
                <p className="text-lg font-semibold">{wordCount}</p>
              </div>
            </div>
          </div>
          {/* Processing time */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
                <i className="fas fa-bolt text-xl"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Process tijd</p>
                <p className="text-lg font-semibold text-black">
                  {processingTime}s
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transcript block */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Transcript</h3>
            <div className="flex items-center">
              <button
                onClick={() => navigator.clipboard.writeText(transcript)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center"
              >
                <i className="fas fa-copy mr-2"></i> Kopieer tekst
              </button>
              <button
                onClick={exportToWord}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center ml-2"
              >
                <i className="fas fa-file-word mr-2"></i> Download als Word-bestand
              </button>
            </div>
          </div>
          <div
            id="transcript-container"
            className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto text-gray-800"
          >
            {transcript.split("\n\n").map(
              (line, idx) =>
                line.trim() && (
                  <div key={idx} className="transcript-line mb-3 p-2 rounded-lg">
                    {line}
                  </div>
                )
            )}
          </div>
        </div>

        {/* Summary */}
        {summary && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Summary</h3>
              <button
                onClick={() => navigator.clipboard.writeText(summary)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center"
              >
                <i className="fas fa-copy mr-2"></i> Kopieer samenvatting
              </button>
            </div>
            <div
              id="summary-container"
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto text-gray-800"
            >
              {summary.split("\n\n").map(
                (line, idx) =>
                  line.trim() && (
                    <div key={idx} className="summary-line mb-3 p-2 rounded-lg">
                      {line}
                    </div>
                  )
              )}
            </div>
          </div>
        )}

        {/* Speakers Transcript */}
        {speakersTranscript && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Sprekers Transcript
              </h3>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(speakersTranscript)
                }
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center"
              >
                <i className="fas fa-copy mr-2"></i> Kopieer sprekers transcript
              </button>
            </div>
            <div
              id="speakers-container"
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto text-gray-800 whitespace-pre-wrap"
            >
              {speakersTranscript}
            </div>
          </div>
        )}

        {/* Action Items */}
        {actionItems && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Actiepunten & Taken
              </h3>
              <button
                onClick={() => navigator.clipboard.writeText(actionItems)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center"
              >
                <i className="fas fa-copy mr-2"></i> Kopieer actiepunten
              </button>
            </div>
            <div
              id="action-items-container"
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto text-gray-800"
            >
              {actionItems.split("\n").map((line, idx) =>
                line.trim() ? (
                  <div key={idx} className="action-item-line mb-3 p-2 rounded-lg">
                    {line}
                  </div>
                ) : null
              )}

              
            </div>
          </div>
        )}


        {/* Q&A */}
{qna.length > 0 && (
  <div className="mb-6">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-semibold text-gray-800">
        Vragen & Antwoorden
      </h3>
      <button
        onClick={() =>
          navigator.clipboard.writeText(
            qna
              .map(
                (item) =>
                  `Vraag: ${item.question}\nAntwoord: ${item.answer}`
              )
              .join("\n\n")
          )
        }
        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 flex items-center"
      >
        <i className="fas fa-copy mr-2"></i> Kopieer Q&A
      </button>
    </div>
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto text-gray-800">
      {qna.map((item, idx) => (
        <div
          key={idx}
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-4"
        >
          <p className="font-medium text-blue-900 mb-1">Vraag</p>
          <p className="mb-2">{item.question}</p>
          <p className="font-medium text-green-900 mb-1">Antwoord</p>
          <p>{item.answer}</p>
        </div>
      ))}
    </div>
  </div>
)}


        {/* Word Frequency */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-3 flex items-center">
            <i className="fas fa-chart-pie mr-2"></i> Woord frequentie
          </h3>
          <div id="word-frequency" className="flex flex-wrap gap-2">
            {wordFrequencies.map((item) => (
              <span
                key={item.word}
                className="px-3 py-1 bg-white rounded-full text-sm shadow-sm flex items-center"
              >
                {item.word}{" "}
                <span className="ml-1 text-blue-600 font-medium">
                  {item.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      
    </div>
  );
}
