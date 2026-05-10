import AppLayout from "@/applayout";
import { Button } from "@/components/ui/button";
import type { HistoryListEntry } from "@/pages/library/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Trash2,
  RotateCw,
  History,
  ExternalLink,
  FileVideo,
  AlertCircle,
  Inbox,
  CalendarDays,
  X,
} from "lucide-react";

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

const formatDateTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Format a timestamp into a "YYYY-MM-DD" date key in local time */
const toDateKey = (value: number): string => {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Format a "YYYY-MM-DD" key into a human-readable label */
const formatDateKey = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
};

const Home = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history`);
      const payload = (await response.json().catch(() => null)) as
        | HistoryListEntry[]
        | { detail?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload !== null && "detail" in payload
            ? payload.detail || "Failed to load history."
            : "Failed to load history.",
        );
      }
      setEntries(Array.isArray(payload) ? payload : []);
      setSelectedDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Derive the unique dates present in history, sorted newest → oldest
  const availableDates = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of entries) {
      if (Number.isFinite(entry.createdAt) && entry.createdAt > 0) {
        keys.add(toDateKey(entry.createdAt));
      }
    }
    return Array.from(keys).sort((a, b) => (a > b ? -1 : 1));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!selectedDate) return entries;
    return entries.filter(
      (e) =>
        Number.isFinite(e.createdAt) &&
        e.createdAt > 0 &&
        toDateKey(e.createdAt) === selectedDate,
    );
  }, [entries, selectedDate]);

  const handleClearHistory = async () => {
    if (entries.length === 0 || clearing) return;
    const confirmed = window.confirm(
      "Clear all saved history? This will delete videos and logs from disk.",
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to clear history.");
      setEntries([]);
      setSelectedDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteEntry = async (entry: HistoryListEntry) => {
    if (deletingId) return;
    const confirmed = window.confirm(
      `Delete "${entry.filename || "Saved analysis"}"?`,
    );
    if (!confirmed) return;

    setDeletingId(entry.id);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history/${entry.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete entry.");
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto w-full space-y-6 py-6 overflow-auto">
        {/* Quick-action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-auto sm:h-40">
          {/* Realtime Analysis Link */}
          <Link
            to="/realtime"
            className="group relative flex flex-col items-center justify-center h-full space-y-3 border-2 border-slate-200 
               bg-gradient-to-br from-white via-white to-blue-200/50 
               hover:border-blue-500 hover:from-blue-50/50 to-blue-200/50 
               transition-all duration-300 shadow-sm"
          >
            <div className="p-3 rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <History className="h-6 w-6 animate-pulse" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold font-heading tracking-tight">
                Realtime Analysis
              </div>
              <p className="text-xs text-slate-500 font-normal">
                Stream live video for instant feedback
              </p>
            </div>
          </Link>

          {/* Library / Analyze Video Link */}
          <Link
            to="/Library"
            className="group relative flex flex-col items-center justify-center h-full space-y-3 border-2 border-slate-200 
               bg-gradient-to-br from-white via-white to-indigo-200/50 
               hover:border-indigo-500 hover:from-indigo-50/50 hover:to-indigo-200/50 
               transition-all duration-300 shadow-sm"
          >
            <div className="p-3 rounded-full bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileVideo className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">Analyze Video</div>
              <p className="text-xs text-slate-500 font-normal">
                Upload and process recorded footage
              </p>
            </div>
          </Link>
        </div>

        {/* History header + actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="text-2xl font-bold tracking-tight text-slate-850">
              Analysis History
            </div>
            <p className="text-xs text-slate-500">
              Review and manage your previously annotated videos and logs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadHistory}
              disabled={loading}
              className="bg-blue-600 text-white"
            >
              <RotateCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearHistory}
              disabled={loading || clearing || entries.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4 " />
              {clearing ? "Clearing..." : "Clear All"}
            </Button>
          </div>
        </div>

        {/* ── Date filter dropdown ──────────────────────────────────────── */}
        {availableDates.length > 1 && (
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <CalendarDays className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedDate ?? ""}
                onChange={(e) => setSelectedDate(e.target.value || null)}
                className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">All dates ({entries.length})</option>
                {availableDates.map((dateKey) => {
                  const count = entries.filter(
                    (e) =>
                      Number.isFinite(e.createdAt) &&
                      e.createdAt > 0 &&
                      toDateKey(e.createdAt) === dateKey,
                  ).length;
                  return (
                    <option key={dateKey} value={dateKey}>
                      {formatDateKey(dateKey)} ({count})
                    </option>
                  );
                })}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Entry list */}
        <div className="min-h-[400px]">
          {loading && entries.length === 0 ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 w-full animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-20 text-center">
              <div className="rounded-full bg-white p-4 shadow-sm mb-4">
                {selectedDate ? (
                  <CalendarDays className="h-8 w-8 text-slate-400" />
                ) : (
                  <Inbox className="h-8 w-8 text-slate-400" />
                )}
              </div>
              <h3 className="text-lg font-medium text-slate-900">
                {selectedDate
                  ? `No entries for ${formatDateKey(selectedDate)}`
                  : "No history found"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {selectedDate
                  ? "Try selecting a different date or clear the filter."
                  : "Run an analysis to see your saved results here."}
              </p>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="mt-4 text-xs text-blue-600 underline underline-offset-2 hover:text-blue-700"
                >
                  Show all entries
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <FileVideo className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {entry.filename || "Untitled Analysis"}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="font-medium">
                          {formatDateTime(entry.createdAt)}
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-[200px] sm:max-w-md italic">
                          {entry.summary || "No summary available"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => navigate(`/library?history=${entry.id}`)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deletingId === entry.id}
                      onClick={() => handleDeleteEntry(entry)}
                    >
                      {deletingId === entry.id ? (
                        <RotateCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Home;