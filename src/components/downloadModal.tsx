"use client";

import React, { useState } from "react";
import { Document, Packer, Paragraph } from "docx";
import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  transcript: string;     // kan HTML bevatten
  summary: string;        // kan HTML bevatten
  actionPoints: string;   // kan HTML bevatten
  qna: { question: string; answer: string }[]; // kan HTML bevatten
  type: "word" | "pdf";
}

// === Helper: HTML -> Plain text (met behoud van basis-structuur) ===
function htmlToPlainText(input: string): string {
  if (!input) return "";
  const el = document.createElement("div");
  el.innerHTML = input;

  // <br> => newline
  el.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

  // Voeg newlines toe rondom blok-elementen
  const blockTags = [
    "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "tr"
  ];
  blockTags.forEach((tag) => {
    el.querySelectorAll(tag).forEach((node) => {
      node.insertAdjacentText("beforebegin", "\n");
      node.insertAdjacentText("afterend", "\n");
    });
  });

  let text = el.textContent || "";
  text = text
    .replace(/\u00A0/g, " ")    
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export default function DownloadModal({
  isOpen,
  onClose,
  title,
  transcript,
  summary,
  actionPoints,
  qna,
  type,
}: DownloadModalProps) {
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [includeActions, setIncludeActions] = useState(false);
  const [includeQnA, setIncludeQnA] = useState(false);

  if (!isOpen) return null;

  // Structureer content met labels voor headers
  const gatherContent = () => {
    const blocks: { label: string; text: string }[] = [];
    if (includeTranscript && transcript) {
      blocks.push({ label: "Notulen", text: htmlToPlainText(transcript) });
    }
    if (includeSummary && summary) {
      blocks.push({ label: "Samenvatting", text: htmlToPlainText(summary) });
    }
    if (includeActions && actionPoints) {
      blocks.push({ label: "Actiepunten", text: htmlToPlainText(actionPoints) });
    }
    if (includeQnA && qna.length) {
      const qnaText = qna
        .map(({ question, answer }) => {
          const q = htmlToPlainText(question);
          const a = htmlToPlainText(answer);
          return [`Q: ${q}`, `A: ${a}`].join("\n");
        })
        .join("\n\n");
      blocks.push({ label: "Q&A", text: qnaText });
    }
    return blocks;
  };

  const handleDownload = async () => {
    const contentBlocks = gatherContent();

    if (type === "word") {
      const children: Paragraph[] = [];

      contentBlocks.forEach((block, idx) => {
        // Bold header paragraph
        children.push(new Paragraph({ text: block.label, bold: true }));

        // Splits op dubbele newline -> nieuwe paragrafen
        block.text.split(/\n{2,}/).forEach((para) => {
          children.push(new Paragraph(para));
        });

        // Extra lege regel tussen blokken
        if (idx < contentBlocks.length - 1) {
          children.push(new Paragraph(""));
        }
      });

      const doc = new Document({
        creator: "Luisterslim",
        title: "Transcriptie",
        sections: [{ children }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, title + ".docx");
    } else {
      const pdf = new jsPDF();
      let y = 10;
      const left = 10;
      const maxWidth = 180;

      contentBlocks.forEach((block, idx) => {
        // Bold header
        pdf.setFont("helvetica", "bold");
        pdf.text(block.label, left, y);
        y += 7;
        pdf.setFont("helvetica", "normal");

        const paragraphs = block.text.split(/\n{2,}/);
        paragraphs.forEach((p, pIdx) => {
          const lines = pdf.splitTextToSize(p, maxWidth);
          lines.forEach((line) => {
            pdf.text(line, left, y);
            y += 7;
            if (y > 280) {
              pdf.addPage();
              y = 10;
            }
          });
          if (pIdx < paragraphs.length - 1) {
            y += 5;
          }
        });

        if (idx < contentBlocks.length - 1) {
          y += 7;
        }
      });

      pdf.save(title + ".pdf");
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold mb-4">
          Selecteer onderdelen om te downloaden
        </h2>
        <div className="space-y-2 mb-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeTranscript}
              onChange={() => setIncludeTranscript(!includeTranscript)}
            />
            <span>Transcript</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={() => setIncludeSummary(!includeSummary)}
            />
            <span>Samenvatting</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeActions}
              onChange={() => setIncludeActions(!includeActions)}
            />
            <span>Actiepunten</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeQnA}
              onChange={() => setIncludeQnA(!includeQnA)}
            />
            <span>Q&amp;A</span>
          </label>
        </div>
        <div className="flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
          >
            Annuleer
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500"
          >
            Download {type === "word" ? "Word" : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
