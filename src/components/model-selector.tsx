import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, ChevronDown, Loader2 } from "lucide-react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

//
type ModelRegistry = {
  /** Now just a list of model names: ["model_16", "model_64"] */
  models: string[]; 
  /** e.g. "model_16" */
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

//
const ModelSelector = () => {
  const { registry, loading, switching, error, switchModel } = useModelSelector();

  const activeModel = registry?.active_model ?? "";
  const models = (registry?.models ?? []).sort();

  const handleModelChange = (newModel: string) => {
    switchModel(newModel);
  };

  if (loading && !registry) {
    return <div className="p-4 text-xs text-gray-500">Loading models...</div>;
  }

  const selectCls = "w-full appearance-none rounded-md border border-[#D0D5DD] bg-white px-2 py-1.5 text-xs font-medium text-[#344054] shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-primary">InfoGCN Config</span>
        
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-2">
        <span className="text-xs text-[#344054]/80 select-none">Model</span>
        <div className="relative">
          <select
            value={activeModel}
            disabled={switching}
            onChange={(e) => handleModelChange(e.target.value)}
            className={selectCls}
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
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
      
      {/* Error handling remains the same */}
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  );
};

export default ModelSelector;
