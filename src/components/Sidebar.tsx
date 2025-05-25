// components/Sidebar.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { handleSignIn, handleSignOut } from "@/lib/auth";

export interface Transcript {
  id: string | number;
  title: string;      // e.g. your transcript title or filename
  created: string; // ISO date string
}

interface SidebarProps {
  transcripts: Transcript[];
}

export default function Sidebar({ transcripts }: SidebarProps) {
  const { data: session, status } = useSession();
  
  if (status === "unauthenticated") {
    return (
      <aside className="w-64 bg-blue-600 text-white flex flex-col h-full sticky top-0">
        {/* …header… */}
        <div className="p-4 border-b border-blue-700">
          <p className="text-sm text-blue-200 mb-2">
            Log in om je transcriptie te bekijken en op te slaan.
          </p>
          <button onClick={() => handleSignIn()} /* … */>
            Login
          </button>
        </div>
      </aside>
    );
  }
  return (
    <aside className="w-64 bg-blue-600 text-white flex flex-col h-full sticky top-0">
      {/* Logo / Title */}
      <div className="p-4 border-b border-blue-700">
        <h1 className="text-xl font-bold flex items-center">
          <i className="fas fa-headphones mr-2"></i>
          Luisterslim
        </h1>
      </div>

      {/* Login prompt when NOT signed in */}
      {!session && (
        <div className="p-4 border-b border-blue-700">
          <p className="text-sm text-blue-200 mb-2">
            Log in om je transcriptie te bekijken en op te slaan.
          </p>
          <button
            onClick={() => handleSignIn()}
            className="w-full bg-white text-blue-800 py-2 px-4 rounded-md font-medium hover:bg-blue-700 transition-all"
          >
            <i className="fas fa-sign-in-alt mr-2"></i> Login
          </button>
        </div>
      )}

      {/* History / Recent Transcripts */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-blue-700">
          <h2 className="font-medium flex items-center">
            <i className="fas fa-history mr-2"></i>
            Recente Transcriptie
          </h2>
        </div>

        <div className=" ">
          {session ? (
            transcripts.length > 0 ? (
              transcripts.map((t) => {
                const idStr = String(t.id);
                return (
                  <Link
                    key={idStr}
                    href={`/transcripts/${idStr}`}
                    className="block p-3 hover:bg-blue-700 cursor-pointer transition-all"
                  >
                    <div className="text-sm font-medium truncate">
                      {t.title}
                    </div>
                    <div className="text-xs text-blue-300 truncate">
                      {new Date(t.created).toLocaleString("nl-NL", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </Link>
                  
                );
                
              })
              
            ) : (
              <div className="p-4 text-blue-300 italic">
                Nog geen transciptie.
              </div>
            )
          ) : (
            <div className="p-4 text-blue-300 italic">
              Log in om deze transcriptie te bekijken.
            </div>
          )}
        </div>
      </div>

      {/* Account info & Sign-out when signed in */}
      {session && (
        <div className="p-4 border-t border-blue-700 bg-blue-900">
          <div className="flex items-center">
           
            <div>
              <div className="font-medium">{session.user?.name}</div>
              <div className="text-xs text-indigo-300">Free Plan</div>
            </div>
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <button className="text-indigo-300 hover:text-white">
              <i className="fas fa-cog mr-1"></i> 
            </button>
            <button
              onClick={() => handleSignOut()}
              className="text-indigo-300 hover:text-white"
            >
              <i className="fas fa-sign-out-alt mr-1"></i> Logout
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
