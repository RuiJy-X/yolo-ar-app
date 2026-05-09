import AppLayout from "@/applayout";
import { Button } from "@/components/ui/button";
import type { HistoryListEntry } from "@/pages/library/types";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { 
  Trash2, 
  RotateCw, 
  History, 
  ExternalLink, 
  FileVideo, 
  AlertCircle,
  Inbox
} from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

const formatDateTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Date(value).toLocaleString([], { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const Home = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history`);
      const payload = (await response.json().catch(() => null)) as HistoryListEntry[] | { detail?: string };
      
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload !== null && "detail" in payload
            ? payload.detail || "Failed to load history."
            : "Failed to load history."
        );
      }
      setEntries(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleClearHistory = async () => {
    if (entries.length === 0 || clearing) return;
    const confirmed = window.confirm("Clear all saved history? This will delete videos and logs from disk.");
    if (!confirmed) return;

    setClearing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to clear history.");
      setEntries([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteEntry = async (entry: HistoryListEntry) => {
    if (deletingId) return;
    const confirmed = window.confirm(`Delete "${entry.filename || "Saved analysis"}"?`);
    if (!confirmed) return;

    setDeletingId(entry.id);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history/${entry.id}`, { method: "DELETE" });
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
      <div className="max-w-5xl mx-auto w-full space-y-6 py-6">
        {/* Header Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-auto sm:h-40">
          <Link 
            to="/realtime"
            className="group relative flex flex-col items-center justify-center h-full space-y-3 border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all duration-300"
          >
            <div className="p-3 rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <History className="h-6 w-6 animate-pulse" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">Realtime Analysis</div>
              <p className="text-xs text-slate-500 font-normal">Stream live video for instant feedback</p>
            </div>
          </Link>

          <Link 
            to="/Library"
            className="group relative flex flex-col items-center justify-center h-full space-y-3 border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all duration-300"
          >
            <div className="p-3 rounded-full bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileVideo className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">Analyze Video</div>
              <p className="text-xs text-slate-500 font-normal">Upload and process recorded footage</p>
            </div>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold tracking-tight text-slate-850 ">
                Analysis History
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Review and manage your previously annotated videos and logs.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              disabled={loading}
              className="bg-white"
            >
              <RotateCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearHistory}
              disabled={loading || clearing || entries.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {clearing ? "Clearing..." : "Clear All"}
            </Button>
          </div>
          
        </div>
        

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Content Section */}
        <div className="min-h-[400px]">
          {loading && entries.length === 0 ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 w-full animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-20 text-center">
              <div className="rounded-full bg-white p-4 shadow-sm mb-4">
                <Inbox className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No history found</h3>
              <p className="mt-1 text-sm text-slate-500">
                Run an analysis to see your saved results here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {entries.map((entry) => (
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
                        <span className="font-medium">{formatDateTime(entry.createdAt)}</span>
                        <span>•</span>
                        <span className="truncate max-w-[200px] sm:max-w-md italic">
                          {entry.summary || "No summary available"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => navigate(`/library?history=${entry.id}`)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 flex-1 sm:flex-none"
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