"use client";

import React, { useState, useRef } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { stopwords } from "./stopwords"; // adjust path as needed

export default function Home() {
  // States for file data and transcription
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

  // New state: transcription model choice ("assembly" or "openai")
  const [model, setModel] = useState<"assembly" | "openai">("assembly");
  // New state: summarization enabled (true/false)
  const [summarization, setSummarization] = useState<boolean>(false);

  // Reference to the audio element
  const audioRef = useRef<HTMLAudioElement>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 ) {
      handleFiles(files);
    }
  };

  // Process selected file
  const handleFiles = (files: FileList) => {
    const selectedFile = files[0];
    setFile(selectedFile);
    setFileName(selectedFile.name);
    const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
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
  const handleTranscribe = async () => {
    if (!file) return;
    setError("");
    setStage("loading");
    setProgress(0);
    const startTime = Date.now();

    // Simulate progress bar animation
    let simulatedProgress = 0;
    const progressInterval = setInterval(() => {
      simulatedProgress += Math.random() * 5;
      if (simulatedProgress > 95) simulatedProgress = 95;
      setProgress(simulatedProgress);
    }, 300);

    try {
      const formData = new FormData();
      formData.append("audioFile", file);
      // Append the selected transcription model and summarization flag
      formData.append("transcriptionModel", model);
      formData.append("enableSummarization", summarization ? "true" : "false");

      // Ensure the endpoint matches your API route location
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }
      const data = await response.json();
      setTranscript(data.text);
      if (data.summary) {
        setSummary(data.summary);
      }
      // Calculate word count from transcript
      const words = data.text.split(/\s+/).filter((w: string) => w.length > 0);
      setWordCount(words.length);

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setProcessingTime(elapsed);

      const cleanedText = data.text.replace(/[^\w\s]/g, "").toLowerCase();
      const wordsArray = cleanedText.split(/\s+/).filter(Boolean);

      // 🛑 Filter out stopwords
      const filteredWords = wordsArray.filter((word: string) => !stopwords.includes(word));

      const freqMap: Record<string, number> = {};
      filteredWords.forEach((word: string) => {
        freqMap[word] = (freqMap[word] || 0) + 1;
      });

      const topWords = Object.entries(freqMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 7)
        .map(([word, count]) => ({ word, count }));

      setWordFrequencies(topWords);

    } catch (err: any) {
      setError(err.message);
      setStage("upload");
      clearInterval(progressInterval);
      return;
    }
    clearInterval(progressInterval);
    setProgress(100);
    setTimeout(() => {
      setStage("results");
    }, 500);
  };

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

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* New controls row: model selector and summarization toggle */}
       


        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Audio Transcriber
          </h1>
          <p className="text-gray-600">
            Upload een MP3 file
          </p>
        </div>
  {/* Transcription Model Dropdown */}
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-start gap-6 mb-6">
  {/* Transcription Model Dropdown */}
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
    <label htmlFor="model" className="font-medium text-gray-700 whitespace-nowrap">
      Transcriptie Model:
    </label>
    <select
      id="model"
      value={model}
      onChange={(e) => {
        const selected = e.target.value as "assembly" | "openai";
        setModel(selected);
        if (selected === "assembly") {
          setSummarization(false);
        }
      }}
      className="block w-full sm:w-auto px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
    >
      <option value="assembly">V1</option>
      <option value="openai">V2</option>
    </select>
  </div>

  {/* Summarization Toggle */}
  <div className="flex items-center gap-3">
    <input
      type="checkbox"
      id="summarization"
      checked={summarization}
      onChange={(e) => setSummarization(e.target.checked)}
      disabled={model === "assembly"}
      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
    />
    <label htmlFor="summarization" className="font-medium text-gray-700 select-none">
      Samenvatting
    </label>
  </div>
</div>
   
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
                  Upload MP3 bestand
                </h3>
                <p className="text-gray-500 mb-6">
                  Drag &amp; drop een bestand hier of klik om op je computer te bladeren.
                </p>
                <input
                  type="file"
                  id="audio-upload"
                  accept=".mp3,.wav,.m4a,.aac,.ogg,.flac"
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
              <div className="bg-blue-600 text-white p-6">
                <h2 className="text-2xl font-bold flex items-center">
                  <i className="fas fa-file-alt mr-3"></i> Transcript resultaten
                </h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                        <i className="fas fa-clock text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Lengte</p>
                        <p id="duration-metric" className="text-lg font-semibold">
                          {audioDuration}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                        <i className="fas fa-font text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Woord aantal</p>
                        <p id="word-count" className="text-lg font-semibold">
                          {wordCount}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
                        <i className="fas fa-bolt text-xl"></i>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Process tijd</p>
                        <p
                          id="processing-time"
                          className="text-lg font-semibold text-black"
                        >
                          {processingTime}s
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

<div className="mb-6">
  <div className="flex justify-between items-center mb-4">
  <h3 className="text-lg font-semibold text-gray-800">Transcript</h3>

  <div className="flex items-center">
    <button
      id="copy-btn"
      onClick={() => {
        if (transcript) {
          navigator.clipboard.writeText(transcript);
        }
      }}
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

{summary && (
  <div className="mb-6">
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-semibold text-gray-800">Summary</h3>
      <button
        id="copy-summary-btn"
        onClick={() => {
          if (summary) {
            navigator.clipboard.writeText(summary);
          }
        }}
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
        {item.word} <span className="ml-1 text-blue-600 font-medium">{item.count}</span>
      </span>
    ))}
  </div>
</div>
              </div>
              <div className="border-t border-gray-200 p-6 bg-gray-50">
                <button
                  id="new-transcription"
                  onClick={handleNewTranscription}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center mx-auto"
                >
                  <i className="fas fa-redo mr-2"></i> Begin nieuwe transcriptie
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
  );
}
