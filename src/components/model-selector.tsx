import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, ChevronDown, Loader2 } from "lucide-react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

type ModelRegistry = {
  /** e.g. { "model_16": ["best_model_1", ..., "best_model_10"], "model_64": [...] } */
  folders: Record<string, string[]>;
  /** e.g. "model_16/best_model_3" */
  active_model: string;
};

// ── Hook ───────────────────────────────────────────────────────────────────

function useModelSelector() {
  const [registry, setRegistry] = useState<ModelRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/models`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ModelRegistry = await res.json();
      setRegistry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const switchModel = useCallback(async (modelKey: string) => {
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/models/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: modelKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRegistry((prev) =>
        prev ? { ...prev, active_model: data.active_model ?? modelKey } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return { registry, loading, switching, error, switchModel };
}

// ── Two-level model selector UI ────────────────────────────────────────────

const ModelSelector = () => {
  const { registry, loading, switching, error, switchModel } =
    useModelSelector();

  // Derive the currently selected folder and checkpoint from active_model
  // active_model format: "model_16/best_model_3"
  const activeParts = registry?.active_model?.split("/") ?? [];
  const activeFolder = activeParts[0] ?? "";
  const activeCheckpoint = activeParts.slice(1).join("/") ?? "";

  const folders = Object.keys(registry?.folders ?? {}).sort();

  // When the folder changes, default to the first checkpoint in that folder
  const handleFolderChange = (newFolder: string) => {
    const checkpoints = registry?.folders[newFolder] ?? [];
    const firstCheckpoint = checkpoints[0] ?? "";
    if (firstCheckpoint) switchModel(`${newFolder}/${firstCheckpoint}`);
  };

  const handleCheckpointChange = (newCheckpoint: string) => {
    if (activeFolder) switchModel(`${activeFolder}/${newCheckpoint}`);
  };

  const checkpoints = (registry?.folders[activeFolder] ?? [])
    .slice()
    .sort((a, b) => {
      // Sort numerically by trailing number: best_model_2 < best_model_10
      const numA = parseInt(a.match(/\d+$/)?.[0] ?? "0", 10);
      const numB = parseInt(b.match(/\d+$/)?.[0] ?? "0", 10);
      return numA - numB;
    });

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#344054]/60 px-2">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Loading models…</span>
      </div>
    );
  }

  if (!registry || folders.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#344054]/50 px-2">
        <BrainCircuit className="size-3.5" />
        <span>No models found</span>
      </div>
    );
  }

  const selectCls = [
    "appearance-none pl-2.5 pr-6 py-1 rounded-md border text-xs font-medium",
    "bg-white text-[#1d2939] border-[#D6E4FF]",
    "focus:outline-none focus:ring-2 focus:ring-blue-400/40",
    "transition cursor-pointer disabled:opacity-60 disabled:cursor-wait",
    "hover:border-blue-400",
  ].join(" ");

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Label */}
      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#344054]/70 uppercase tracking-wide select-none">
        <BrainCircuit className="size-3.5 text-blue-500" />
        InfoGCN Model
      </span>

      {/* Folder selector */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-[#344054]/50 select-none">Config</span>
        <div className="relative">
          <select
            value={activeFolder}
            disabled={switching}
            onChange={(e) => handleFolderChange(e.target.value)}
            className={selectCls}
          >
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
            {switching ? (
              <Loader2 className="size-3 animate-spin text-blue-500" />
            ) : (
              <ChevronDown className="size-3 text-[#344054]/40" />
            )}
          </span>
        </div>
      </div>

      {/* Divider */}
      <span className="text-[#D6E4FF] select-none">/</span>

      {/* Checkpoint selector */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-[#344054]/50 select-none">
          Checkpoint
        </span>
        <div className="relative">
          <select
            value={activeCheckpoint}
            disabled={switching || checkpoints.length === 0}
            onChange={(e) => handleCheckpointChange(e.target.value)}
            className={selectCls}
          >
            {checkpoints.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
            {switching ? (
              <Loader2 className="size-3 animate-spin text-blue-500" />
            ) : (
              <ChevronDown className="size-3 text-[#344054]/40" />
            )}
          </span>
        </div>
      </div>

      {/* Inline error */}
      {error && (
        <span
          className="text-xs text-red-500 font-medium cursor-help"
          title={error}
        >
          ⚠ Switch failed
        </span>
      )}
    </div>
  );
};

export default ModelSelector;
