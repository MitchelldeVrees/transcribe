// components/Sidebar.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { FaHistory, FaHeadphones, FaSignInAlt, FaSignOutAlt, FaCog, FaBars, FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export interface Transcript {
  id: string | number;
  title: string;
  created: string;
}

interface SidebarProps {
  transcripts: Transcript[];
}

const SIDEBAR_WIDTH = 256;

export default function Sidebar({ transcripts }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const toggleSidebar = () => setIsOpen((o) => !o);

  return (
    <>
      {/* Hamburger / Close button with title */}
      
<div className="fixed top-4 left-4 z-50 flex items-center space-x-2">
  <button
    onClick={toggleSidebar}
    className="relative w-10 h-10 p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none transition-colors overflow-hidden"
  >
    <AnimatePresence initial={false} mode="wait">
      {isOpen ? (
        <motion.div
          key="close"
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{  rotate: 90, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <FaTimes size={20} />
        </motion.div>
      ) : (
        <motion.div
          key="open"
          initial={{ rotate: 90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: -90, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <FaBars size={20} />
        </motion.div>
      )}
    </AnimatePresence>
  </button>

  {isOpen && <span className="text-white text-xl font-bold">Luisterslim</span>}
</div>


      {/* Sidebar container */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? SIDEBAR_WIDTH : 0 }}
        transition={{ type: 'tween', duration: 0.3 }}
        className="bg-blue-600 text-white flex flex-col h-screen overflow-hidden fixed top-0 left-0"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {/* Spacer under header */}
        <div className="pt-16"></div>

        {/* Header inside sidebar for spacing */}
        

        {/* Login prompt */}
        {!isSignedIn && isOpen && (
          <div className="p-4 border-b border-blue-700">
            <p className="text-sm text-blue-200 mb-2">
              Log in om je notules te bekijken en op te slaan.
            </p>
            <button
              onClick={() => (window.location.href = "https://accounts.luisterslim.nl/sign-in")}
              className="w-full bg-white text-blue-800 py-2 px-4 rounded-md font-medium hover:bg-blue-700 transition-all"
            >
              <FaSignInAlt className="inline mr-2" /> Login
            </button>
          </div>
        )}

        
        {isOpen && (
          <>
            <div className="px-4 py-2 border-b border-blue-700 flex items-center space-x-2">
              <FaHistory />
              <h2 className="font-medium">Recente notulen</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isSignedIn ? (
                transcripts.length > 0 ? (
                  transcripts.map((t) => {
                    const idStr = String(t.id);
                    const date = new Date(t.created).toLocaleString("nl-NL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    });
                    return (
                      <Link
                        key={idStr}
                        href={`/transcripts/${idStr}`}
                        className="block p-3 hover:bg-blue-700 cursor-pointer transition-all"
                      >
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-blue-300 truncate">{date}</div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="p-4 text-blue-300 italic">Nog geen transcriptie.</div>
                )
              ) : (
                <div className="p-4 text-blue-300 italic">Log in om deze notulen te bekijken.</div>
              )}
              <div className="p-4">
                <Link
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.reload();
                  }}
                  className="inline-block text-sm text-blue-200 hover:text-white font-semibold"
                >
                  Maak een nieuwe notulen +
                </Link>
              </div>
            </div>
          </>
        )}

        {/* Account info */}
        {isSignedIn && isOpen && (
          <div className="p-4 border-t border-blue-700 bg-blue-900">
            <div className="flex items-center space-x-2 mb-2">
              <div className="font-medium">{user?.fullName}</div>
              <div className="text-xs text-indigo-300">Free Plan</div>
            </div>
            <div className="flex justify-between text-xs">
              <button className="text-indigo-300 hover:text-white">
                <FaCog className="inline mr-1" /> Instellingen
              </button>
              <button
                onClick={() => signOut()}
                className="text-indigo-300 hover:text-white"
              >
                <FaSignOutAlt className="inline mr-1" /> Logout
              </button>
            </div>
          </div>
        )}
      </motion.aside>
    </>
  );
}
