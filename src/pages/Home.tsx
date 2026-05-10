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
  AlertTriangle,
  Wifi,
  WifiOff,
  Cpu,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────

interface HealthData {
  status: "ok" | "error";
  model?: string;
  action_model?: string;
  device?: string;
  gpu_name?: string;
}

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
      {entry.hasWaveAlert && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1"
          style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}
        >
          <AlertTriangle size={9} />
          Wave alert
        </span>
      )}
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

// ── StatsStrip ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  highlight?: boolean;
}

const StatCard = ({ icon, value, label, highlight }: StatCardProps) => (
  <div
    className="rounded-lg p-4 flex flex-col items-center justify-center text-center"
    style={{
      border: "0.5px solid #ededed",
      background: "#fff",
      boxShadow: "var(--shadow-1)",
    }}
  >
    <div
      className="w-7 h-7 rounded-[6px] flex items-center justify-center mb-2.5 shrink-0"
      style={{
        background: highlight ? "rgba(239,68,68,0.08)" : "rgba(0,82,255,0.08)",
      }}
    >
      {icon}
    </div>
    <p
      className="font-bold"
      style={{
        fontSize: 22,
        color: "#171717",
        margin: "0 0 4px 0",
        lineHeight: 1,
      }}
    >
      {value}
    </p>
    <p style={{ fontSize: 11, color: "#9a9a9a", margin: 0 }}>{label}</p>
  </div>
);

const StatsStrip = ({
  entries,
  loading,
}: {
  entries: HistoryListEntry[];
  loading: boolean;
}) => {
  const stats = useMemo(() => {
    const totalSessions = entries.length;
    const totalActions = entries.reduce((count, entry) => {
      if (Array.isArray(entry.detectedActions)) {
        return (
          count + entry.detectedActions.filter((action) => action.trim()).length
        );
      }
      return count + (entry.topAction ? 1 : 0);
    }, 0);
    const waveAlerts = entries.filter((e) => e.hasWaveAlert).length;
    const minutesProcessed =
      entries.reduce((acc, e) => acc + (e.durationSeconds ?? 0), 0) / 60;

    return {
      totalSessions,
      totalActions,
      waveAlerts,
      minutesProcessed: isFinite(minutesProcessed)
        ? Math.round(minutesProcessed)
        : 0,
    };
  }, [entries]);

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={<FileVideo size={14} style={{ color: "#0052ff" }} />}
        value={loading ? "—" : stats.totalSessions}
        label="Total Sessions"
      />
      <StatCard
        icon={<Activity size={14} style={{ color: "#0052ff" }} />}
        value={loading ? "—" : stats.totalActions}
        label="Total Actions"
      />

      <StatCard
        icon={<AlertTriangle size={14} style={{ color: "#ef4444" }} />}
        value={loading ? "—" : stats.waveAlerts}
        label="Wave Alerts"
        highlight
      />
    </div>
  );
};

// ── ResumeCard ─────────────────────────────────────────────────────────────

const ResumeCard = ({
  entry,
  onOpen,
}: {
  entry: HistoryListEntry;
  onOpen: () => void;
}) => (
  <div
    className="flex items-center gap-3 rounded-lg p-4"
    style={{
      border: "0.5px solid #ededed",
      background: "#fafafa",
      boxShadow: "var(--shadow-1)",
    }}
  >
    <div
      className="w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0"
      style={{ background: "rgba(0,82,255,0.08)" }}
    >
      <FileVideo size={14} style={{ color: "#0052ff" }} />
    </div>
    <div className="flex-1 min-w-0">
      <p
        className="text-[12px] font-medium truncate"
        style={{ color: "#9a9a9a" }}
      >
        Resume last session
      </p>
      <p
        className="text-[13px] font-medium truncate"
        style={{ color: "#171717" }}
      >
        {entry.filename || "Untitled Analysis"}
      </p>
    </div>
    <button
      onClick={onOpen}
      className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium"
      style={{ background: "#0052ff", color: "#fff" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#0041cc")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#0052ff")}
    >
      Open
    </button>
  </div>
);

// ── BackendStatus ──────────────────────────────────────────────────────────

const BackendStatus = ({
  healthData,
  healthError,
}: {
  healthData: HealthData | null;
  healthError: boolean;
}) => {
  const isOnline = healthData?.status === "ok" && !healthError;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: "0.5px solid #ededed",
        background: "#ffffff",
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3"
        style={{ borderBottom: "0.5px solid #ededed" }}
      >
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ fontFamily: "var(--mono)", color: "#1a1a1a" }}
        >
          System
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-3 space-y-3">
        {/* Backend Status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={13} style={{ color: "#16a34a" }} />
            ) : (
              <WifiOff size={13} style={{ color: "#dc2626" }} />
            )}
            <span style={{ fontSize: 12, color: "#171717" }}>Backend</span>
          </div>
          <span
            className="text-[11px] font-semibold px-2 py-1 rounded-[4px]"
            style={{
              background: isOnline
                ? "rgba(34,197,94,0.1)"
                : "rgba(239,68,68,0.1)",
              color: isOnline ? "#16a34a" : "#dc2626",
            }}
          >
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        {/* Device */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu size={13} style={{ color: "#9a9a9a" }} />
            <span style={{ fontSize: 12, color: "#171717" }}>Device</span>
          </div>
          <span className="text-[11px] font-mono" style={{ color: "#9a9a9a" }}>
            {healthData?.device === "cuda"
              ? `cuda · ${healthData.gpu_name || "GPU"}`
              : healthData?.device || "—"}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── ActionFrequencyChart ───────────────────────────────────────────────────

const ActionFrequencyChart = ({ entries }: { entries: HistoryListEntry[] }) => {
  const actionFrequency = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const actions = Array.isArray(e.detectedActions)
        ? e.detectedActions
        : e.topAction
          ? [e.topAction]
          : [];
      for (const action of actions) {
        const label = action.trim();
        if (!label) continue;
        counts[label] = (counts[label] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const maxCount = Math.max(...actionFrequency.map((a) => a[1]), 1);

  if (actionFrequency.length === 0) {
    return (
      <div
        className="rounded-lg overflow-hidden"
        style={{
          border: "0.5px solid #ededed",
          background: "#ffffff",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: "0.5px solid #ededed" }}
        >
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ fontFamily: "var(--mono)", color: "#1a1a1a" }}
          >
            Action Distribution
          </span>
        </div>
        <div className="px-5 py-12 text-center">
          <p style={{ fontSize: 12, color: "#9a9a9a" }}>No action data yet</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: "0.5px solid #ededed",
        background: "#ffffff",
        boxShadow: "var(--shadow-1)",
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-3"
        style={{ borderBottom: "0.5px solid #ededed" }}
      >
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ fontFamily: "var(--mono)", color: "#1a1a1a" }}
        >
          Action Distribution
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {actionFrequency.map(([action, count]) => (
          <div key={action} className="flex items-center gap-3">
            <span
              className="text-[13px] font-medium shrink-0"
              style={{ color: "#171717", minWidth: 80 }}
            >
              {action}
            </span>
            <div
              className="h-1.5 rounded-full flex-1 flex items-center"
              style={{ background: "#f0f0f0" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: "#0052ff",
                  width: `${(count / maxCount) * 100}%`,
                }}
              />
            </div>
            <span
              className="text-[11px] font-mono shrink-0"
              style={{ color: "#9a9a9a", minWidth: 30, textAlign: "right" }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const Home = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [waveOnly, setWaveOnly] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState(false);

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
    // Fetch health data
    fetch(`${apiBaseUrl}/health`)
      .then((r) => r.json())
      .then(setHealthData)
      .catch(() => setHealthError(true));
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
    let result = selectedDate
      ? entries.filter(
          (e) =>
            Number.isFinite(e.createdAt) &&
            e.createdAt > 0 &&
            toDateKey(e.createdAt) === selectedDate,
        )
      : entries;
    if (waveOnly) result = result.filter((e) => e.hasWaveAlert);
    return result;
  }, [entries, selectedDate, waveOnly]);

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
        className="flex flex-col flex-1 min-h-0 overflow-y-auto w-full px-4 md:px-6 lg:px-8"
        style={{ width: "100%" }}
      >
        <div className="flex flex-col gap-4 py-4 w-full">
          {/* ── Stats Strip ── */}
          {/* ── Quick-action cards + Backend Status ── */}
          <div className="grid grid-cols-2 gap-3" style={{ minHeight: 112 }}>
            {/* Left: Quick-action cards */}
            <div className="flex flex-col gap-3">
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
                  flex: 1,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#0052ff";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 0 0 1px #0052ff22, var(--shadow-1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#ededed";
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
                <div className="flex items-center justify-center bg-black/90 rounded-xs w-6 h-6">
                  <Plus size={15} className="text-white" />
                </div>
              </Link>

              {/* Library */}
              <Link
                to="/library"
                className="group flex  justify-between rounded-lg p-4 transition-all "
                style={{
                  background:
                    "linear-gradient(145deg, #0052ff 0%, #7ca2ff 100%)",
                  border: "0.5px solid rgba(0,82,255,0.22)",
                  boxShadow: "var(--shadow-1)",
                  textDecoration: "none",
                  flex: 1,
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

            {/* Right: Backend Status */}
            <BackendStatus healthData={healthData} healthError={healthError} />
          </div>
          <StatsStrip entries={entries} loading={loading} />

          {/* ── Resume Card (if entries exist) ── */}
          {entries.length > 0 && entries[0] && (
            <ResumeCard
              entry={entries[0]}
              onOpen={() => navigate(`/library?history=${entries[0].id}`)}
            />
          )}

          {/* ── Action Frequency Chart ── */}
          <ActionFrequencyChart entries={entries} />

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

                {/* Wave Alert Filter */}
                {entries.some((e) => e.hasWaveAlert) && (
                  <button
                    onClick={() => setWaveOnly((prev) => !prev)}
                    style={{
                      height: 28,
                      border: "0.5px solid #dfdfdf",
                      background: waveOnly ? "rgba(239,68,68,0.08)" : "#fff",
                      color: waveOnly ? "#dc2626" : "#9a9a9a",
                      borderColor: waveOnly ? "#fca5a5" : "#dfdfdf",
                    }}
                    className="flex items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] font-medium transition-colors"
                  >
                    <AlertTriangle size={10} />
                    Alerts only
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
