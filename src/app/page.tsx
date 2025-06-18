"use client";

import React, { useState, useRef, useEffect } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { stopwords } from "./stopwords"; // adjust path as needed
import Sidebar, { Transcript } from "../components/Sidebar";
import ResultsSection from "@/components/ResultsSection";
import Swal from 'sweetalert2';
import { useUser, useClerk, SignedOut, SignedIn } from "@clerk/nextjs";

interface QnaItem {
  question: string;
  answer:   string;
}

interface TranscribeResponse {
  text:        string;
  summary?:    string;
  actionItems?:string;
  qna?:        QnaItem[];   // ← now qna really is an array of {question,answer}
}


export default function Home() {
  // States for file data and transcription
  const progressInterval = useRef<NodeJS.Timeout>();
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [saving, setSaving] = useState(false);

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

  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();

  // New state: transcription model choice ("assembly" or "openai")
  // New state: summarization enabled (true/false)
  const [summarization, setSummarization] = useState<boolean>(false);

  // Reference to the audio element
  const audioRef = useRef<HTMLAudioElement>(null);

  async function handleSave() {
    if (!isSignedIn) return;           // extra guard
    setSaving(true);
  
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fileName || "Untitled Transcript",
          content: transcript,
          summary,
          actionItems,
          qna,
        }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
  
      await Swal.fire({
        icon: "success",
        title: "Saved!",
        text: "Transcript saved successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
  
      // optionally re-fetch your transcripts list here
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
      fetch("/api/transcripts")
        .then((res) => {
          if (!res.ok) throw new Error("AUTH_ERROR");
          return res.json();
        })
        .then((data) => setTranscripts(data.transcripts))
        .catch((err) => {
          console.error(err);
          setError("Er is iets misgegaan bij het ophalen van je transcripts.");
        });
    }
  }, [isSignedIn]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 ) {
      handleFiles(files);
    }
  };

  
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    preventDefaults(e);
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

  // Transcribe button action
  async function handleTranscribe() {
    if (!file) return;
    setStage("loading");
    setError("");
    setProgress(0);
  
    const startTime = performance.now();
    console.log('Uploading chunk:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    try {
      // 1) Split audio en chunk-files
  
      // 2) FormData & API-call
      const form = new FormData();
      form.append("audioFile", file, file.name);

      setSummarization(true);
      form.append("enableSummarization", summarization ? "true" : "false");
  
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const contentType = response.headers.get("content-type") || "";
        const text   = await response.text();          // always grab raw
        if (!response.ok) {
          console.error("API error:", text);
          const msg = response.status >= 500
            ? "Er is een fout opgetreden aan onze kant. Probeer het later opnieuw."
            : "Er ging iets mis met je upload. Controleer je bestand en probeer opnieuw.";
          throw new Error(msg);

        }
        if (!contentType.includes("application/json")) {
          console.error("Expected JSON but got:", text);
          throw new Error("Er is iets misgegaan bij het verwerken. Probeer het later opnieuw.");
        }
        const data = JSON.parse(text);  // now safe to parse

  

      // 4) Zet transcript en samenvatting
      setTranscript(data.text);
      setSummary(data.summary ?? "");
      setActionItems(data.actionItems ?? "");
      const parsedQna = Array.isArray(data.qna)
      ? data.qna
      : typeof data.qna === "string"
        ? JSON.parse(data.qna)
        : [];
      setQna(parsedQna);
      console.log("QNA");
      console.log(qna);
      // 5) Meet en zet verwerkingstijd
      setProcessingTime(
        Math.round((performance.now() - startTime) / 1000)
      );

      setWordCount(data.text.split(/\s+/).length);
  
      // 6) Bereken woordfrequenties
      // 6a) Vind alle woorden (geen cijfers/punctie) of lege array
      const matches = data.text
        .toLowerCase()
        .match(/\b[^\d\W]+\b/g) || [];
  
      // 6b) Filter stopwoorden
      const filtered = matches.filter((w: string) => !stopwords.includes(w));
  
      // 6c) Tel per woord
      const freqMap: Record<string, number> = {};
      filtered.forEach((word: string | number) => {
        freqMap[word] = (freqMap[word] || 0) + 1;
      });
  
      // 6d) Maak er een array van en sorteer op aflopend
      const freqArray = Object.entries(freqMap)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20); // top 20
  
      setWordFrequencies(freqArray);
  
      // 7) Toon de resultaten
      setStage("results");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Er is iets misgegaan. Probeer het later opnieuw.");
      setStage("upload");
    }
  }
 
  
  // Reset to start a new transcription
  const handleNewTranscription = () => {
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
  };

  
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
                <input
                  type="file"
                  id="audio-upload"
                  accept="audio/mpeg,audio/mp4,audio/wav,video/mp4,video/webm"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <label
                  htmlFor="audio-upload"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 cursor-pointer"
                >
                  Selecteer bestand
                </label>
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
    onClick={handleSave}
    disabled={saving || !isSignedIn}
    className={`px-4 py-2 rounded ${
      isSignedIn
        ? saving
          ? "bg-gray-400 text-white cursor-not-allowed"
          : "bg-green-600 text-white hover:bg-green-700"
        : "bg-gray-300 text-gray-600 cursor-not-allowed"
    }`}
  >
    {saving ? "Saving…" : isSignedIn ? "Save to Account" : "Sign in to Save"}
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

              
              <div className="border-t border-gray-200 p-6 bg-gray-50">
                <button
                  id="new-transcription"
                  onClick={handleNewTranscription}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center mx-auto"
                >
                  <i className="fas fa-redo mr-2"></i> Begin nieuwe notulen
                </button>
              </div>
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
