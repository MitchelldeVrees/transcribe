"use client";

import React, { useState, useRef, useEffect } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { stopwords } from "./stopwords"; // adjust path as needed
import Sidebar from "../components/Sidebar";
import ResultsSection from "@/components/ResultsSection";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useTranscriptsData } from "./transcriptsProvider";
import { countMeaningfulWords as countDutch } from "../lib/wordCountDutch";
import { useRouter } from "next/navigation";
import Swal from 'sweetalert2';

interface QnaItem {
  question: string;
  answer:   string;
}

const MAX_FILE_BYTES = Number.POSITIVE_INFINITY; // disable cap for large-file testing
const FILE_SIZE_LIMIT_ENABLED = Number.isFinite(MAX_FILE_BYTES);
const MAX_UPLOAD_MB = FILE_SIZE_LIMIT_ENABLED
  ? Math.floor(MAX_FILE_BYTES / (1024 * 1024))
  : null;
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/m4a",
  "audio/webm",
  "audio/aac",
  "audio/ogg",
  "audio/mpga",
  "video/mp4",
  "video/webm",
]);
const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".wave",
  ".aac",
  ".mp4",
  ".webm",
]);
const ACCEPTED_FILE_LABEL = Array.from(ALLOWED_EXTENSIONS).join(", ");

const STORAGE_KEY = "pendingTranscriptData";
function isAllowedClientFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  if (ALLOWED_MIME_TYPES.has(mime)) return true;
  const dot = file.name.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = file.name.slice(dot).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

function validateSelectedFile(file: File | null): string | null {
  if (!file) return "Selecteer eerst een bestand.";
  if (!isAllowedClientFile(file)) {
    return `Dit bestandstype wordt niet ondersteund. Gebruik een van: ${ACCEPTED_FILE_LABEL}.`;
  }
  if (FILE_SIZE_LIMIT_ENABLED && file.size > MAX_FILE_BYTES) {
    return `Bestand is te groot. Maximaal ${MAX_UPLOAD_MB} MB toegestaan.`;
  }
  return null;
}


export default function Home() {
  // States for file data and transcription
  const progressInterval = useRef<NodeJS.Timeout>();
  const { transcripts, setTranscripts, refresh: refreshTranscripts } = useTranscriptsData();
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [fileSizeMB, setFileSizeMB] = useState("");
  const [audioDuration, setAudioDuration] = useState("0:00");
  const [stage, setStage] = useState<"upload" | "loading" | "results">("upload");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const [summary, setSummary] = useState("");
  const [wordFrequencies, setWordFrequencies] = useState<{ word: string; count: number }[]>([]);
  const [actionItems, setActionItems] = useState("");
  const [qna, setQna] = useState<QnaItem[]>([]);
  const [estimatedSec, setEstimatedSec] = useState(0);
  // At the top with your other states
  const [speakersTranscript, setSpeakersTranscript] = useState("");

  // NextAuth session state
  const { data: session, status } = useSession();
  const isLoaded = status !== "loading";
  const isSignedIn = status === "authenticated";
  const router = useRouter();
  const [pendingSave, setPendingSave] = useState(false);

  // New state: transcription model choice ("assembly" or "openai")
  // New state: summarization enabled (true/false)
  const [summarization, setSummarization] = useState<boolean>(false);

  // Reference to the audio element
  const audioRef = useRef<HTMLAudioElement>(null);

  // states
  const [hasSaved, setHasSaved] = useState(false); // NEW

  // helper to (re)fetch transcripts
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setTranscript(data.transcript || "");
        setSummary(data.summary || "");
        setActionItems(data.actionItems || "");
        setQna(data.qna || []);
        setFileName(data.fileName || "");
        setAudioDuration(data.audioDuration || "0:00");
        setWordCount(data.wordCount || 0);
        setProcessingTime(data.processingTime || 0);
        setWordFrequencies(data.wordFrequencies || []);
        setSpeakersTranscript(data.speakersTranscript || "");
        setStage("results");
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  async function handleSave() {
    if (!isSignedIn || hasSaved) return; // prevent double-saves
    setSaving(true);
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({
          title: fileName || "Untitled Transcript",
          content: transcript,
          summary,
          actionItems,
          qna,
          processingTime,
          audioDuration,
        }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
  
      // Refetch the list right after saving
      await refreshTranscripts();
  
      setHasSaved(true); // lock the button
  
      await Swal.fire({
        icon: "success",
        title: "Saved!",
        text: "Transcript saved successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.error("Save failed:", err);
      await Swal.fire({
        icon: "error",
        title: "Save failed",
        text: err.message || "Er is iets misgegaan.",
      });
    } finally {
      setSaving(false);
    }
  }
  
  
  useEffect(() => {
    if (isSignedIn) {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (stored) {
        handleSave().finally(() => {
          window.localStorage.removeItem(STORAGE_KEY);
        });
      }
    }
  }, [isSignedIn]);
  
  // Fetch transcripts only when Clerk has loaded and the user is signed in
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 ) {
      handleFiles(files);
    }
  };

  useEffect(() => {
    if (isSignedIn && pendingSave) {
      handleSave()
        .finally(() => {
          setPendingSave(false);
          setHasSaved(true); // NEW: lock after auto-save
        });
    }
  }, [isSignedIn, pendingSave]);
  

  useEffect(() => {
    // whenever we enter "loading", start fresh
    if (stage === "loading") {
      setProgress(0);
      const startTime = Date.now();
  
      progressInterval.current = setInterval(() => {
        const elapsedSec = (Date.now() - startTime) / 1000;
        const pct = Math.min((elapsedSec / estimatedSec) * 100, 100);
        setProgress(pct);
        // optionally stop just shy of 100 so UI jump is smoother:
        // if (pct >= 99) clearInterval(progressInterval.current!);
        if (pct >= 100) {
          clearInterval(progressInterval.current!);
        }
      }, 100); // update 10×/sec for smoothness
    }
  
    // cleanup on unmount or whenever stage changes away from "loading"
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [stage, estimatedSec]);


  // Process selected file
  const handleFiles = (files: FileList) => {
    const selectedFile = files[0];
    if (!selectedFile) return;
    const validationMessage = validateSelectedFile(selectedFile);
    if (validationMessage) {
      setError(validationMessage);
      setFile(null);
      setFileName("");
      setAudioUrl("");
      setFileSizeMB("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setError("");
    setFile(selectedFile);
    setFileName(selectedFile.name);
    const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
    // in handleTranscribe, before setStage("loading"):
// file.size is in bytes
    const sizeMBNoRound = selectedFile.size / (1024 * 1024);

    if (sizeMBNoRound < 30) {
      setEstimatedSec(60);    // small files: ~20s
    } else if (sizeMBNoRound < 50) {
      setEstimatedSec(90);    // medium: ~45s
    } else if (sizeMBNoRound < 100) {
      setEstimatedSec(200);    // large: ~90s
    } else {
      setEstimatedSec(260);   // very large: ~2m
    }

    setFileSizeMB(sizeMB);
    const url = URL.createObjectURL(selectedFile);
    setAudioUrl(url);
  };

  // Drag and drop handlers
  const preventDefaults = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    preventDefaults(e);
    if (!isSignedIn) {
      await promptLoginIfNeeded();
      return;
    }
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  };
  

  // When metadata loads, update duration
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const duration = audioRef.current.duration;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      setAudioDuration(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    }
  };

  // --- add this inside your Home() component ---



  const exportToWord = async () => {
    if (!transcript) {
      alert("Er is geen transcript beschikbaar.");
      return;
    }
  
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: transcript.split("\n").map(
            (line) => new Paragraph({
              children: [new TextRun(line)],
            })
          ),
        },
      ],
    });
  
    try {
      const buffer = await Packer.toBlob(doc);
      saveAs(buffer, `transcript-${new Date().toISOString()}.docx`);
    } catch (error) {
      console.error("Error creating document:", error);
      alert("Fout bij het aanmaken van het Word-document.");
    }
  };

  async function promptLoginIfNeeded() {
    if (isSignedIn) return false;
  
    const result = await Swal.fire({
      title: "Login vereist",
      text: "Je moet ingelogd zijn om een audio transcriptie te maken.",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Inloggen",
      cancelButtonText: "Sluiten",
      reverseButtons: true,
    });
  
    if (result.isConfirmed) {
      // (optional) stash anything you want to restore after login
      // window.localStorage.setItem(...)
  
      signIn("google"); // or just signIn()
      return true;
    }
    return true; // treated as “handled” (don’t continue)
  }

  const sleep = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const getAuthHeaders = () =>
    session?.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : undefined;

  async function pollForTranscript(jobId: string): Promise<string> {
    const timeoutMs = 4 * 60 * 1000;
    const pollMs = 3000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const res = await fetch(
        `/api/mobileBackend/transcribe/status?jobId=${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          text || "Kan de status van de transcriptie niet ophalen."
        );
      }

      const payload = await res.json();
      const status = String(payload.status || "");
      const jobText = typeof payload.text === "string" ? payload.text : "";

      if (status === "done" && jobText) {
        return jobText;
      }

      if (status === "error") {
        throw new Error(
          payload.error ||
            "Het transcriberen is mislukt. Probeer het later opnieuw."
        );
      }

      await sleep(pollMs);
    }

    throw new Error(
      "Het ophalen van de transcriptie duurde te lang. Probeer het later opnieuw."
    );
  }

  async function requestSummaries(jobId: string, extraInfo: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(getAuthHeaders() || {}),
    };

    const res = await fetch("/api/mobileBackend/summarize", {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId, extraInfo }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        text || "Samenvatten is mislukt. Probeer het later opnieuw."
      );
    }

    return res.json();
  }

  const generateJobId = () => {
    if (typeof crypto !== "undefined") {
      if (crypto.randomUUID) return crypto.randomUUID();
      if (crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
          .slice(6, 8)
          .join("")}-${hex.slice(8, 10).join("")}-${hex
          .slice(10, 16)
          .join("")}`;
      }
    }
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  };

  async function requestUploadSlot(file: File) {
    const mimeType = file.type || "application/octet-stream";
    const res = await fetch("/api/mobileBackend/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(getAuthHeaders() || {}),
      },
      body: JSON.stringify({
        filename: file.name,
        mimeType,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        text || "Kon geen upload-URL ophalen. Probeer het later opnieuw."
      );
    }

    const data = await res.json();
    if (!data.uploadUrl || !data.blobName) {
      throw new Error("Server gaf geen geldige upload-URL terug.");
    }

    return {
      uploadUrl: String(data.uploadUrl),
      blobName: String(data.blobName),
      mimeType,
    };
  }

  async function uploadFileToAzure(
    uploadUrl: string,
    file: File,
    mimeType: string
  ) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": mimeType,
      },
      body: file,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Uploaden naar Azure is mislukt.");
    }
  }

  async function startTranscriptionJob(
    jobId: string,
    blobName: string,
    file: File,
    extraInfo: string
  ) {
    const mimeType = file.type || "application/octet-stream";
    const res = await fetch(
      `/api/mobileBackend/transcribe/start?jobId=${encodeURIComponent(jobId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthHeaders() || {}),
        },
        body: JSON.stringify({
          blobName,
          size: file.size,
          mimeType,
          extraInfo,
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Kon de transcriptie-taak niet starten.");
    }
  }

  
  // Transcribe button action
  async function handleTranscribe() {
    if (!file) return;
    const validationMessage = validateSelectedFile(file);
    if (validationMessage) {
      setError(validationMessage);
      setStage("upload");
      return;
    }
    if (!isSignedIn) {
      await promptLoginIfNeeded();
      return;
    }

    setStage("loading");
    setError("");
    setProgress(0);
    setSummarization(true);

    const startTime = performance.now();
    try {
      setProgress(5);
      const { uploadUrl, blobName, mimeType } = await requestUploadSlot(file);
      setProgress(15);

      await uploadFileToAzure(uploadUrl, file, mimeType);
      setProgress(40);

      const jobId = generateJobId();
      const extraInfoForJob = "";
      await startTranscriptionJob(jobId, blobName, file, extraInfoForJob);
      setProgress(55);

      const transcriptText = await pollForTranscript(jobId);
      setProgress(75);
      setTranscript(transcriptText);

      let summaryHtml = "";
      let actionItemsHtml = "";
      let qnaItems: QnaItem[] = [];
      let summaryError = "";

      if (summarization && transcriptText.length > 20) {
        try {
          const summaryData = await requestSummaries(jobId, extraInfoForJob);
          summaryHtml = summaryData.summary ?? "";
          actionItemsHtml = summaryData.actionItems ?? "";

          qnaItems = Array.isArray(summaryData.qna)
            ? summaryData.qna
            : typeof summaryData.qna === "string"
              ? (() => {
                  try {
                    return JSON.parse(summaryData.qna);
                  } catch {
                    return [];
                  }
                })()
              : [];
        } catch (summaryErr: any) {
          console.error(summaryErr);
          summaryError =
            "De transcriptie is gelukt, maar samenvatten is mislukt. Probeer het later opnieuw.";
        }
      }

      setSummary(summaryHtml);
      setActionItems(actionItemsHtml);
      setQna(qnaItems);

      if (summaryError) {
        setError(summaryError);
      } else {
        setError("");
      }

      setProcessingTime(Math.round((performance.now() - startTime) / 1000));
      setWordCount(countDutch(transcriptText));

      const matches = transcriptText.toLowerCase().match(/\b[^\d\W]+\b/g) || [];
      const filtered = matches.filter((w: string) => !stopwords.includes(w));
      const freqMap: Record<string, number> = {};
      filtered.forEach((word: string | number) => {
        freqMap[word] = (freqMap[word] || 0) + 1;
      });
      const freqArray = Object.entries(freqMap)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
      setWordFrequencies(freqArray);

      setProgress(100);
      setStage("results");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Er is iets misgegaan. Probeer het later opnieuw.");
      setStage("upload");
    }
  }
 
  
  // Reset to start a new transcription
  function handleNewTranscription() {
    window.localStorage.removeItem(STORAGE_KEY);
    setFile(null);
    setFileName("");
    setAudioUrl("");
    setFileSizeMB("");
    setAudioDuration("0:00");
    setTranscript("");
    setError("");
    setProgress(0);
    setWordCount(0);
    setProcessingTime(0);
    setStage("upload");
    setSummary("");
    setActionItems("");
    setQna([]);
    setWordFrequencies([]);
    setSpeakersTranscript("");
    setHasSaved(false);
    setSaving(false);
    setPendingSave(false);
    setEstimatedSec(0);
    router.push("/");
  }


  
  // Wait for Clerk to finish loading before rendering the app
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">Loading...</div>
    );
  }

  return (


    <div className="bg-gray-50 min-h-screen">
      

      {/* Inline CSS styles for waveform and visualizer */}
      <style jsx global>{`
        .waveform {
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .waveform-bar {
          width: 4px;
          background: #3b82f6;
          border-radius: 4px;
          animation: waveform 1.2s ease-in-out infinite;
        }
        @keyframes waveform {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        .waveform-bar:nth-child(1) { animation-delay: 0.1s; }
        .waveform-bar:nth-child(2) { animation-delay: 0.2s; }
        .waveform-bar:nth-child(3) { animation-delay: 0.3s; }
        .waveform-bar:nth-child(4) { animation-delay: 0.4s; }
        .waveform-bar:nth-child(5) { animation-delay: 0.5s; }
        .transcript-line:hover { background-color: #f3f4f6; }
        .audio-visualizer {
          height: 100px;
          width: 100%;
          background: linear-gradient(to bottom, #f8fafc, #e2e8f0);
          border-radius: 8px;
          overflow: hidden;
          position: relative;
        }
        .progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 0%;
          background: linear-gradient(to right, #93c5fd, #3b82f6);
          transition: width 0.1s linear;
        }
      `}</style>

<div className="flex h-screen">

{<Sidebar transcripts={transcripts} />}
<div className="flex-1 overflow-y-auto">
<div className="mt-4 flex justify-end mr-10">
    <Link
      href="/about"
      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      Informatie over de applicatie
    </Link>
  </div>
      <div className="container mx-auto px-4 py-12 max-w-4xl">

        {/* New controls row: model selector and summarization toggle */}
       


        <div className="text-center mb-12 pt-5">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Audio Transcriber
          </h1>
          <p className="text-gray-600">
          Upload een mp3, mp4, mpeg, mpga, m4a, wav of webm bestand
          </p>
          
        </div>
  {/* Transcription Model Dropdown */}
  
   
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8 transition-all duration-300">
          {stage === "upload" && (
            <div
              id="upload-section"
              className="p-8"
              onDragEnter={preventDefaults}
              onDragOver={preventDefaults}
              onDragLeave={preventDefaults}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-12 bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
                <i className="fas fa-file-audio text-5xl text-blue-500 mb-4"></i>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Upload een mp3, mp4, mpeg, mpga, m4a, wav of webm bestand
                </h3>
                <p className="text-gray-500 mb-6">
                  Drag &amp; drop een bestand hier of klik om op je computer te bladeren.
                </p>
                <button
  onClick={async (e) => {
    // If not signed in, show SweetAlert and stop
    const handled = await promptLoginIfNeeded();
    if (handled) return;

    // Otherwise open the file dialog
    fileInputRef.current?.click();
  }}
  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
>
  Selecteer bestand
</button>

<input
  ref={fileInputRef}
  type="file"
  accept=".mp3,.m4a,.wav,.mp4,.webm,.aac,.mpeg,.mpga,audio/*"
  className="hidden"
  onChange={async (e) => {
    // Block selection if not signed in
    if (!isSignedIn) {
      await promptLoginIfNeeded();
      // Clear selection just in case
      e.currentTarget.value = "";
      return;
    }
    handleFileChange(e);
  }}
/>
                {fileName && (
                  <p id="file-name" className="mt-4 text-sm text-gray-500">
                    {fileName}
                  </p>
                )}
              </div>

              {file && (
                <div id="file-info" className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <i className="fas fa-music text-blue-500 mr-3"></i>
                      <div>
                        <h4 id="track-name" className="font-medium text-gray-800">
                          {fileName.replace(/\.[^/.]+$/, "")}
                        </h4>
                        <p id="file-details" className="text-sm text-gray-500">
                          {fileSizeMB} MB • {audioDuration}
                        </p>
                      </div>
                    </div>
                    <button
                      id="transcribe-btn"
                      onClick={handleTranscribe}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
                    >
                      <i className="fas fa-keyboard mr-2"></i> Transcribe
                    </button>
              
                  </div>

                  <div className="audio-visualizer mb-4">
                    <div
                      className="progress-bar"
                      style={{
                        width: audioRef.current
                          ? `${
                              (audioRef.current.currentTime /
                                (audioRef.current.duration || 1)) *
                              100
                            }%`
                          : "0%",
                      }}
                    ></div>
                  </div>
                  <audio
                    id="audio-player"
                    controls
                    className="w-full"
                    src={audioUrl}
                    ref={audioRef}
                    onLoadedMetadata={handleLoadedMetadata}
                  ></audio>
                </div>
              )}
            </div>
          )}

          {stage === "loading" && (
            <div id="loading-section" className="p-8">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="waveform mb-6">
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                  <div className="waveform-bar"></div>
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Transcribing Audio
                </h3>
                <p className="text-gray-500 mb-6">
                  Dit kan eventjes duren...
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    id="loading-bar"
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p id="progress-text" className="mt-2 text-sm text-gray-500">
                  {Math.floor(progress)}% compleet
                </p>
              </div>
            </div>
          )}

          {stage === "results" && (
            <div id="results-section">
              <div className="bg-blue-600 text-white p-6 flex items-center justify-between">
  <h2 className="text-2xl font-bold flex items-center">
    <i className="fas fa-file-alt mr-3"></i> Transcript resultaten
  </h2>
  <button
  onClick={() => {
    if (hasSaved) return; // already saved, do nothing
    if (!isSignedIn) {
      const data = {
        transcript,
        summary,
        actionItems,
        qna,
        fileName,
        audioDuration,
        wordCount,
        processingTime,
        wordFrequencies,
        speakersTranscript,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      signIn("google");
    } else {
      handleSave();
    }
  }}
  disabled={saving || hasSaved}
  className={`px-4 py-2 rounded ${
    hasSaved
      ? "bg-gray-400 text-white cursor-not-allowed"
      : saving
      ? "bg-gray-400 text-white cursor-not-allowed"
      : "bg-green-600 text-white hover:bg-green-700"
  }`}
>
  {hasSaved ? "Already saved." : saving ? "Saving…" : "Save to Account"}
</button>

</div>

            <ResultsSection
              audioDuration={audioDuration}
              wordCount={wordCount}
              processingTime={processingTime}
              transcript={transcript}
              summary={summary}
              speakersTranscript={speakersTranscript}
              actionItems={actionItems}
              wordFrequencies={wordFrequencies}
              qna={qna}
              saving={saving}
              handleSave={handleSave}
              exportToWord={exportToWord}
              handleNewTranscription={handleNewTranscription}
            />

              
              
            </div>
          )}

          {error && (
            <p className="text-red-600 mt-4 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
    </div>
  </div>
  );
}
