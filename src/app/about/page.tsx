"use client";

import React, { useEffect, useState } from "react";
import Sidebar, { Transcript } from "@/components/Sidebar";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

export default function AboutPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoaded && isSignedIn) {
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
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">Loading...</div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="flex h-screen">
        <Sidebar transcripts={transcripts} />
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-12 max-w-4xl">
            <h1 className="text-4xl font-bold mb-6 text-gray-800">Over Luisterslim</h1>
            <p className="mb-4 text-gray-700">
              Luisterslim helpt je audio-opnames om te zetten in duidelijke notulen. Upload
              een bestand en ontvang automatisch een volledig transcript met samenvatting en actiepunten.
            </p>

            <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800">Functionaliteiten</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Ondersteuning voor mp3, mp4, wav en andere formaten</li>
              <li>Automatisch transcript en samenvatting</li>
              <li>Actiepunten en vraag-&amp;antwoord detectie</li>
              <li>Woordfrequentie-overzicht en export naar Word</li>
              <li>Bewaar notulen veilig in je account</li>
            </ul>

            <h2 className="text-2xl font-semibold mt-8 mb-4 text-gray-800">Privacy &amp; Veiligheid</h2>
            <p className="mb-4 text-gray-700">
              Wij verwerken je audio veilig en verwijderen bestanden direct na het transcriberen.
              Je transcripts worden opgeslagen in onze beveiligde database en worden nooit gedeeld.
            </p>
            <div className="mt-6 flex justify-center">
              <div className="w-32 h-32 bg-blue-100 rounded-full animate-pulse"></div>
            </div>
            {error && <p className="text-red-600 mt-4 text-center">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
