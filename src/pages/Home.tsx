import AppLayout from "@/applayout";
import type { HistoryListEntry } from "@/pages/library/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Trash2,
  RotateCw,
  ExternalLink,
  FileVideo,
  AlertCircle,
  Inbox,
  CalendarDays,
  X,
  Camera,
  ChevronDown,
  Clock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

const toDateKey = (value: number): string => {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SkeletonRow = () => (
  <div className="flex items-center gap-4 px-5 py-4 border-b border-[#ededed] last:border-0">
    <div className="w-8 h-8 rounded-[6px] bg-[#f0f0f0] animate-pulse shrink-0" />
    <div className="flex-1 flex flex-col gap-2">
      <div className="h-3 w-48 rounded-full bg-[#f0f0f0] animate-pulse" />
      <div className="h-2.5 w-32 rounded-full bg-[#f5f5f5] animate-pulse" />
    </div>
    <div className="h-7 w-16 rounded-[6px] bg-[#f0f0f0] animate-pulse shrink-0" />
  </div>
);

// ── Entry Row ─────────────────────────────────────────────────────────────────

const EntryRow = ({
  entry,
  isDeleting,
  onOpen,
  onDelete,
}: {
  entry: HistoryListEntry;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) => (
  <div className="group flex items-center gap-4 px-5 py-3.5 border-b border-[#ededed] last:border-0 hover:bg-[#fafafa] transition-colors">
    {/* Icon */}
    <div
      className="w-8 h-8 rounded-[6px] shrink-0 flex items-center justify-center transition-colors"
      style={{ background: "rgba(0,82,255,0.08)" }}
    >
      <FileVideo size={14} style={{ color: "#0052ff" }} />
    </div>

    {/* Info */}
    <div className="flex-1 min-w-0">
      <p
        className="text-[13px] font-medium truncate"
        style={{ color: "#171717" }}
      >
        {entry.filename || "Untitled Analysis"}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <Clock size={10} style={{ color: "#9a9a9a" }} />
        <span className="text-[11px] font-mono" style={{ color: "#9a9a9a" }}>
          {formatDateTime(entry.createdAt)}
        </span>
        {entry.summary && (
          <>
            <span style={{ color: "#d4d4d4" }}>·</span>
            <span
              className="text-[11px] truncate max-w-70"
              style={{ color: "#9a9a9a" }}
            >
              {entry.summary}
            </span>
          </>
        )}
      </div>
    </div>

    {/* Actions */}
    <div className="flex items-center gap-1.5 shrink-0 transition-opacity">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-colors"
        style={{
          background: "#0052ff",
          color: "#ffffff",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#0041cc")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#0052ff")}
      >
        <ExternalLink size={11} />
        Open
      </button>
      <Button
        variant={"destructive"}
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors disabled:opacity-40 bg-red-400 text-white hover:bg-red-600"
      >
        {isDeleting ? (
          <RotateCw size={11} className="animate-spin" />
        ) : (
          <Trash2 size={11} />
        )}
      </Button>
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────

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
      <div
        className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full"
        style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}
      >
        <div className="flex flex-col gap-4 py-4 px-1">
          {/* ── Quick-action cards ── */}
          <div className="grid grid-cols-2 gap-3" style={{ minHeight: 112 }}>
            {/* Realtime */}
            <Link
              to="/realtime"
              className="group flex justify-between rounded-lg p-4 transition-all"
              style={{
                background:
                  "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(226,236,255,0.98) 100%)",
                border: "0.5px solid rgba(0,82,255,0.12)",
                boxShadow: "var(--shadow-1)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#0052ff";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 0 0 1px #0052ff22, var(--shadow-1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#ededed";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "var(--shadow-1)";
              }}
            >
              <div>
                <div
                  className="w-8 h-8 rounded-[6px] flex items-center justify-center mb-3"
                  style={{ background: "rgba(0,82,255,0.08)" }}
                >
                  <Camera size={15} style={{ color: "#0052ff" }} />
                </div>
                <div>
                  <p
                    className="font-medium"
                    style={{ fontSize: 13, color: "#171717", margin: 0 }}
                  >
                    Realtime analysis
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#9a9a9a",
                      margin: "2px 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    Stream live camera inference
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center bg-black/90 rounded-xs w-6 h-6 justify-center">
                <Plus size={15} className="text-white" />
              </div>
            </Link>

            {/* Library */}
            <Link
              to="/library"
              className="group flex  justify-between rounded-lg p-4 transition-all "
              style={{
                background: "linear-gradient(145deg, #0052ff 0%, #7ca2ff 100%)",
                border: "0.5px solid rgba(0,82,255,0.22)",
                boxShadow: "var(--shadow-1)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(145deg, #0048e6 0%, #5f8eff 100%)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(145deg, #0052ff 0%, #7ca2ff 100%)";
              }}
            >
              <div>
                <div
                  className="w-8 h-8 rounded-[6px] flex items-center justify-center mb-3"
                  style={{ background: "rgba(255,255,255,0.15)" }}
                >
                  <FileVideo size={15} style={{ color: "#ffffff" }} />
                </div>
                <div>
                  <p
                    className="font-medium"
                    style={{ fontSize: 13, color: "#ffffff", margin: 0 }}
                  >
                    Analyze video
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.6)",
                      margin: "2px 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    Upload and process footage
                  </p>
                </div>
              </div>
              <div className="flex items-center bg-white rounded-xs w-6 h-6 justify-center">
                <Plus size={15} className="text-black/90" />
              </div>
            </Link>
          </div>

          {/* ── History panel ── */}
          <div
            className="flex flex-col rounded-lg overflow-hidden"
            style={{
              background: "#ffffff",
              border: "0.5px solid #ededed",
              boxShadow: "var(--shadow-1)",
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: "0.5px solid #ededed" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[12px] font-semibold uppercase tracking-[0.08em]"
                  style={{ fontFamily: "var(--mono)", color: "#1a1a1a" }}
                >
                  History
                </span>
                {entries.length > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: "rgba(0,82,255,0.08)",
                      color: "#0052ff",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {entries.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Date filter */}
                {availableDates.length > 1 && (
                  <div className="relative flex items-center">
                    <CalendarDays
                      size={11}
                      className="absolute left-2.5 pointer-events-none"
                      style={{ color: "#9a9a9a" }}
                    />
                    <select
                      value={selectedDate ?? ""}
                      onChange={(e) => setSelectedDate(e.target.value || null)}
                      className="appearance-none rounded-[6px] pl-7 pr-6 text-[11px] font-medium transition-colors outline-none cursor-pointer"
                      style={{
                        height: 28,
                        border: "0.5px solid #dfdfdf",
                        background: "#ffffff",
                        color: selectedDate ? "#171717" : "#9a9a9a",
                      }}
                    >
                      <option value="">All dates</option>
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
                    <ChevronDown
                      size={10}
                      className="absolute right-2 pointer-events-none"
                      style={{ color: "#9a9a9a" }}
                    />
                  </div>
                )}

                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="flex items-center gap-1 rounded-[6px] px-2 transition-colors"
                    style={{
                      height: 28,
                      border: "0.5px solid #dfdfdf",
                      background: "#ffffff",
                      color: "#9a9a9a",
                      fontSize: 11,
                    }}
                  >
                    <X size={10} />
                    Clear
                  </button>
                )}

                {/* Refresh */}
                <button
                  type="button"
                  onClick={loadHistory}
                  disabled={loading}
                  className="w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors disabled:opacity-40"
                  style={{
                    border: "0.5px solid #dfdfdf",
                    background: "#ffffff",
                    color: "#9a9a9a",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "#c7c7c7";
                    (e.currentTarget as HTMLElement).style.color = "#171717";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "#dfdfdf";
                    (e.currentTarget as HTMLElement).style.color = "#9a9a9a";
                  }}
                  title="Refresh"
                >
                  <RotateCw
                    size={11}
                    className={loading ? "animate-spin" : ""}
                  />
                </button>

                {/* Clear all */}
                {entries.length > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleClearHistory}
                    disabled={loading || clearing || entries.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] font-medium transition-colors disabled:opacity-40 bg-red-400 text-white hover:bg-red-600"
                  >
                    <Trash2 size={11} />
                    {clearing ? "Clearing…" : "Clear all"}
                  </Button>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2.5 mx-4 my-3 px-3 py-2 rounded-[6px] text-[12px]"
                style={{
                  background: "#fff5f5",
                  border: "0.5px solid #fca5a5",
                  color: "#b91c1c",
                }}
              >
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            {/* Body */}
            {loading && entries.length === 0 ? (
              <div>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div
                  className="w-10 h-10 rounded-[8px] flex items-center justify-center mb-4"
                  style={{
                    background: "#fafafa",
                    border: "0.5px solid #ededed",
                  }}
                >
                  {selectedDate ? (
                    <CalendarDays size={16} style={{ color: "#b2b2b2" }} />
                  ) : (
                    <Inbox size={16} style={{ color: "#b2b2b2" }} />
                  )}
                </div>
                <p
                  className="font-medium"
                  style={{ fontSize: 13, color: "#171717", margin: 0 }}
                >
                  {selectedDate
                    ? `No entries for ${formatDateKey(selectedDate)}`
                    : "No history yet"}
                </p>
                <p style={{ fontSize: 12, color: "#9a9a9a", marginTop: 4 }}>
                  {selectedDate
                    ? "Try a different date or clear the filter."
                    : "Saved analyses will appear here."}
                </p>
                {selectedDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="mt-4 text-[11px] font-medium underline underline-offset-2 transition-colors"
                    style={{ color: "#0052ff" }}
                  >
                    Show all entries
                  </button>
                )}
              </div>
            ) : (
              <div>
                {filteredEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    isDeleting={deletingId === entry.id}
                    onOpen={() => navigate(`/library?history=${entry.id}`)}
                    onDelete={() => handleDeleteEntry(entry)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Home;
