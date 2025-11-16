"use client";

import React from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  UserIcon,
  Cog8ToothIcon,
  TrashIcon,
  BugAntIcon,
  QuestionMarkCircleIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";

const featureList = [
  {
    icon: CloudArrowUpIcon,
    title: "Multi-format Support",
    description: "Upload mp3, mp4, wav & more, alles op 1 plek.",
  },
  {
    icon: DocumentTextIcon,
    title: "Auto-Transcript & Summary",
    description:
      "AI-powered notulen plus beknopte samenvattingen met 1 druk op de knop.",
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Action Points & Q&A",
    description:
      "Herkent follow-ups en genereert duidelijke actie punten automatisch.",
  },
  {
    icon: ShieldCheckIcon,
    title: "End-to-end Versleuteling",
    description:
      "TLS/SSL tijdens transport en AES-256 in rust – uw data is te allen tijde veilig.",
  },
  {
    icon: LockClosedIcon,
    title: "Privacy by Design",
    description:
      "Data minimalisatie & privacy als uitgangspunt in elke stap van ontwikkeling.",
  },
  {
    icon: UserIcon,
    title: "Volledige Controle",
    description:
      "U bepaalt welke data we verzamelen, inzien, corrigeren of verwijderen – altijd uw keuze.",
  },
  {
    icon: Cog8ToothIcon,
    title: "AI Veiligheid & Transparantie",
    description:
      "Human in the loop, bias-tests, uitlegbare modellen & continue monitoring.",
  },
];

export default function AboutPage() {
  const { data: session, status } = useSession();
  const isLoaded = status !== "loading";
  const isSignedIn = status === "authenticated";

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">Loading...</div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero */}
          <section className="relative bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div className="absolute inset-0 bg-[url('/patterns/dots.svg')] opacity-10" />
            <div className="relative container mx-auto px-6 py-24 text-center">
              <motion.h1
                className="text-5xl font-extrabold leading-tight"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                Over Luisterslim
              </motion.h1>
              <motion.p
                className="mt-4 max-w-2xl mx-auto text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                Luisterslim helpt je audio-opnames om te zetten in duidelijke
                notulen. Met onze veilige AI-toepassing krijg je binnen
                enkele minuten een volledig transcript, samenvatting en
                actiepunten – altijd AVG-proof en met volledige controle.
              </motion.p>
            </div>
          </section>

          {/* Features */}
          <section className="container mx-auto px-6 py-16">
            <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center">
              Waarom Luisterslim?
            </h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {featureList.map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <motion.div
                    key={i}
                    className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition transform hover:-translate-y-1"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 * i, duration: 0.5 }}
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-blue-100 text-blue-600">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">
                      {feat.title}
                    </h3>
                    <p className="text-gray-600">{feat.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Privacy */}
          <section className="bg-gray-50 py-16">
            <motion.div
              className="container mx-auto px-6 text-center max-w-3xl"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                Privacy & Veiligheid
              </h2>
              <ul className="mx-auto text-left text-gray-600 space-y-3 list-disc list-inside mb-6">
                <li>We volgen alle AVG-regels en voeren privacychecks uit</li>
                <li>Je data is altijd versleuteld en blijft in de EU</li>
                <li>We vragen alleen wat écht nodig is en maken data anoniem</li>
                <li>Jij hebt de controle: bekijk, wijzig of verwijder je gegevens in het dashboard</li>
                <li>
                  Lees voor meer details ons{' '}
                  <Link
                    href="/privacyVerklaring"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    volledige privacybeleid
                  </Link>
                </li>
              </ul>
              <div className="flex justify-center mb-6">
                <ShieldCheckIcon className="w-20 h-20 text-blue-400 animate-bounce" />
              </div>
            </motion.div>
          </section>

          {/* Contact Cards */}
          <section className="bg-white py-16">
            <motion.div
              className="container mx-auto px-6 text-center"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl font-bold text-gray-800 mb-8">
                Neem contact met ons op
              </h2>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <motion.div
                  className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition transform hover:-translate-y-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-blue-100 text-blue-600">
                    <TrashIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">
                    Data verwijderen
                  </h3>
                  <p className="text-gray-600">
                    Wil je je data permanent verwijderen? Laat het ons weten.
                  </p>
                </motion.div>
                <motion.div
                  className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition transform hover:-translate-y-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-blue-100 text-blue-600">
                    <BugAntIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">
                    Bug gevonden
                  </h3>
                  <p className="text-gray-600">
                    Heb je een bug gevonden? Stuur ons details, we lossen het op!
                  </p>
                </motion.div>
                <motion.div
                  className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition transform hover:-translate-y-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.5 }}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-blue-100 text-blue-600">
                    <QuestionMarkCircleIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">
                    Vragen
                  </h3>
                  <p className="text-gray-600">
                    Heb je vragen voor ons? We staan klaar om te helpen.
                  </p>
                </motion.div>
                <motion.div
                  className="p-6 bg-white rounded-2xl shadow hover:shadow-lg transition transform hover:-translate-y-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-blue-100 text-blue-600">
                    <EnvelopeIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">
                    Neem contact op
                  </h3>
                  <p className="text-gray-600">
                    Neem dan contact met ons op via{' '}
                    <Link href="mailto:info@luisterslim.nl" className="text-blue-600 hover:underline">
                      info@luisterslim.nl
                    </Link>
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </section>
        </div>
      </div>
    </div>
  );
}
