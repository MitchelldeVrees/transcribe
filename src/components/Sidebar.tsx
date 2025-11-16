// components/Sidebar.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession, signIn, signOut } from "next-auth/react";
import {
  FaHistory,
  FaHeadphones,
  FaSignInAlt,
  FaSignOutAlt,
  FaCog,
  FaBars,
  FaTimes,
} from "react-icons/fa";
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

function formatPlanName(code: string) {
  if (!code) return 'Free plan';
  return code
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function Sidebar({ transcripts }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";
  const user = session?.user;
  const [planLabel, setPlanLabel] = useState<string>('Free plan');
  const toggleSidebar = () => setIsOpen((open) => !open);

  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn || !session?.accessToken) {
      setPlanLabel('Free plan');
      return;
    }
    let cancelled = false;

    fetch('/api/mobileBackend/usage', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          const code = data.plan_info?.code || data.plan || 'free';
          setPlanLabel(formatPlanName(String(code)));
        }
      })
      .catch(() => {
        if (!cancelled) setPlanLabel('Free plan');
      });

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, session?.accessToken]);

  
  return (
    <>
      {/* Hamburger / Close button */}
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
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
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
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <FaBars size={20} />
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {isOpen && (
          <Link href="/" className="text-white text-xl font-bold">
            Luisterslim
          </Link>
        )}
      </div>

      {/* Sidebar container */}
      <motion.aside
        initial={false}
        animate={{ width: isOpen ? SIDEBAR_WIDTH : 0 }}
        transition={{ type: "tween", duration: 0.3 }}
        className={`
          /* mobile: overlay under the button */
          fixed inset-y-0 left-0 z-40
          bg-blue-600 text-white flex flex-col overflow-hidden

          /* show in-flow on desktop so it pushes main */
          md:relative md:inset-auto md:z-auto
        `}
      >
        
        {/* Spacer under header */}
        <div className="pt-16" />

        {/* Login prompt */}
        {!isSignedIn && isOpen && (
          <div className="p-4 border-b border-blue-700">
            <p className="text-sm text-blue-200 mb-2">
              Log in om je notules te bekijken en op te slaan.
            </p>
            <button
              onClick={() => signIn("google")}
              className="w-full bg-white text-blue-800 py-2 px-4 rounded-md font-medium hover:bg-blue-700 transition-all"
            >
              <FaSignInAlt className="inline mr-2" /> Login
            </button>
            
          </div>
        )}

        {isOpen && (
          <>
            {/* Recent transcripts header */}
            <div className="px-4 py-2 border-b border-blue-700 flex items-center space-x-2">
              <FaHistory />
              <h2 className="font-medium">Recente notulen</h2>
            </div>

            {/* Transcript list */}
            <div className="flex-1 overflow-y-auto sidebar-scroll">
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

              {/* New transcript link */}
              <div className="p-4">
                <Link
                  href="/#"
                  className="inline-block text-sm text-blue-200 hover:text-white font-semibold"
                >
                  Maak een nieuwe notulen +
                </Link>
              </div>
            </div>
          </>
        )}

        {/* Account info / Sign out */}
        {isSignedIn && isOpen && (
          <div className="p-4 border-t border-blue-700 bg-blue-900">
            <div className="flex items-center space-x-2 mb-2">
              <div className="font-medium">{user?.name}</div>
              <div className="text-xs text-indigo-300">{planLabel}</div>
            </div>
            <button
      onClick={async () => {
        // don’t auto-redirect so we can refresh UI first
        await signOut({ redirect: false });
        router.replace("/");  // where you want them after logout
        router.refresh();      // revalidate server components / session
      }}
      className="text-indigo-300 hover:text-white"
    >
      <FaSignOutAlt className="inline mr-1" /> Logout
    </button>
          </div>
        )}
      </motion.aside>
      <style jsx global>{`
        .sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.5) transparent;
        }
        .sidebar-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.5);
          border-radius: 9999px;
        }
        .sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background-color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </>
  );
}
