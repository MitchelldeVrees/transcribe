"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranscriptsData } from "../transcriptsProvider";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    transcripts,
    setTranscripts,
    loading: transcriptsLoading,
    error: transcriptsError,
  } = useTranscriptsData();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  const isSignedIn = status === "authenticated";
  const accessToken = session?.accessToken;

  useEffect(() => {
    setCurrentPage(1);
  }, [transcripts.length]);

  const userName = session?.user?.name ?? "Onbekende gebruiker";
  const userEmail = session?.user?.email ?? "Geen e-mailadres";
  const normalizedEmail =
    typeof session?.user?.email === "string"
      ? session.user.email.trim().toLowerCase()
      : "";

  const formattedTranscripts = useMemo(
    () =>
      transcripts.map((tx) => ({
        ...tx,
        createdLabel: tx.created
          ? new Date(tx.created).toLocaleString("nl-NL", {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "",
      })),
    [transcripts]
  );

  const totalPages = Math.max(1, Math.ceil(formattedTranscripts.length / PAGE_SIZE));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const paginatedTranscripts = useMemo(() => {
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return formattedTranscripts.slice(start, start + PAGE_SIZE);
  }, [formattedTranscripts, currentPageSafe]);

  useEffect(() => {
    if (currentPage !== currentPageSafe) {
      setCurrentPage(currentPageSafe);
    }
  }, [currentPageSafe]);

  async function handleDeleteTranscript(id: string) {
    if (!accessToken) return;
    const confirmed = window.confirm(
      "Weet je zeker dat je deze notulen definitief wilt verwijderen?"
    );
    if (!confirmed) return;

    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/mobileBackend/transcripts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok && res.status !== 204) {
        const message = await res.text();
        throw new Error(message || "Verwijderen mislukt");
      }
      setTranscripts((prev) => prev.filter((tx) => String(tx.id) !== id));
    } catch (err) {
      console.error("[account] delete transcript failed", err);
      setError("Verwijderen van deze notulen is mislukt.");
    } finally {
      setDeletingId(null);
    }
  }

  async function performAccountDeletion() {
    if (!accessToken) return;
    setDeletingAccount(true);
    setError(null);
    try {
      const res = await fetch("/api/mobileBackend/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Account verwijderen mislukt");
      }
      await signOut({ redirect: false });
      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error("[account] delete account failed", err);
      setError("Account verwijderen is mislukt. Neem contact op met support als dit blijft gebeuren.");
      setDeletingAccount(false);
    }
  }

  function openDeleteModal() {
    setConfirmEmail("");
    setConfirmError(null);
    setShowDeleteModal(true);
  }

  function closeDeleteModal() {
    if (deletingAccount) return;
    setShowDeleteModal(false);
    setConfirmEmail("");
    setConfirmError(null);
  }

  function handleConfirmDeletion() {
    const typed = confirmEmail.trim().toLowerCase();
    if (!typed) {
      setConfirmError("Voer je e-mailadres in om te bevestigen.");
      return;
    }
    if (normalizedEmail && typed !== normalizedEmail) {
      setConfirmError("E-mailadres komt niet overeen met je account.");
      return;
    }
    setConfirmError(null);
    setShowDeleteModal(false);
    setConfirmEmail("");
    performAccountDeletion();
  }

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-600">
        Even geduld aub...
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <h1 className="text-3xl font-semibold text-gray-900">Meld je aan</h1>
        <p className="mt-3 max-w-md text-gray-600">
          Je hebt een account nodig om je profiel te bekijken, notulen te beheren of je account te verwijderen.
        </p>
        <button
          onClick={() => signIn("google")}
          className="mt-6 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow hover:bg-blue-500"
        >
          Inloggen met Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar transcripts={transcripts} />

      <main className="flex-1 overflow-y-auto px-6 pb-16 pt-20">
        <div className="mx-auto max-w-4xl space-y-6">
          <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Account</h1>
            <p className="mt-2 text-sm text-gray-600">
              Bekijk je gegevens, beheer notulen en verwijder indien nodig je hele account.
            </p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-gray-500">Naam</dt>
                <dd className="text-lg font-medium text-gray-900">{userName}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-gray-500">E-mail</dt>
                <dd className="text-lg font-medium text-gray-900 break-all">{userEmail}</dd>
              </div>
            </dl>
          </header>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Opgeslagen notulen</h2>
                <p className="text-sm text-gray-500">Bekijk of verwijder individuele notulen.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {transcripts.length} totaal
              </span>
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-4 rounded-xl border border-gray-100">
              {transcriptsLoading && (
                <div className="py-10 text-center text-sm text-gray-500">
                  Notulen aan het laden...
                </div>
              )}
              {!transcriptsLoading && transcripts.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-500">
                  Je hebt nog geen notulen opgeslagen.
                </div>
              )}

              {!transcriptsLoading && transcripts.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {paginatedTranscripts.map((tx) => (
                    <li key={tx.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{tx.title}</p>
                        <p className="text-xs text-gray-500">{tx.createdLabel}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/transcripts/${tx.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-500"
                        >
                          Bekijken
                        </Link>
                        <button
                          onClick={() => handleDeleteTranscript(String(tx.id))}
                          disabled={deletingId === String(tx.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                        >
                          {deletingId === String(tx.id) ? "Verwijderen..." : "Verwijderen"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!transcriptsLoading && transcripts.length > 0 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
                  <span>
                    Pagina {currentPageSafe} van {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPageSafe === 1}
                      className="rounded-md border border-gray-300 px-3 py-1 font-medium disabled:opacity-50"
                    >
                      Vorige
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPageSafe === totalPages}
                      className="rounded-md border border-gray-300 px-3 py-1 font-medium disabled:opacity-50"
                    >
                      Volgende
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-900">Gevaarzone</h2>
            <p className="mt-2 text-sm text-red-700">
              Het verwijderen van je account is definitief. Alle notulen, quota, abonnementen en verwijzingspunten gaan verloren.
            </p>
            <button
              onClick={openDeleteModal}
              disabled={deletingAccount}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-red-500 bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {deletingAccount ? "Account verwijderen..." : "Verwijder mijn account"}
            </button>
          </section>
        </div>
      </main>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-gray-900">Bevestig verwijdering</h3>
            <p className="mt-2 text-sm text-gray-600">
              Typ je e-mailadres (<span className="font-medium">{session?.user?.email || "onbekend"}</span>) om te bevestigen dat je je account definitief wilt verwijderen.
            </p>
            <input
              type="email"
              autoComplete="email"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="jij@example.com"
              value={confirmEmail}
              onChange={(e) => {
                setConfirmEmail(e.target.value);
                if (confirmError) setConfirmError(null);
              }}
              disabled={deletingAccount}
            />
            {confirmError && (
              <p className="mt-2 text-sm text-red-600">{confirmError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={deletingAccount}
              >
                Annuleren
              </button>
              <button
                onClick={handleConfirmDeletion}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={deletingAccount}
              >
                Definitief verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
