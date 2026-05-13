import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

type ModelRegistry = {
  models: string[];
  active_model: string;
};

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
      setRegistry(await res.json());
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

const ModelSelector = () => {
  const { registry, loading, switching, error, switchModel } =
    useModelSelector();

  if (loading && !registry) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#9a9a9a]">
        <Loader2 size={12} className="animate-spin text-[#0052ff]" />
        Loading models…
      </div>
    );
  }

  const activeModel = registry?.active_model ?? "";
  const models = (registry?.models ?? []).sort();

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#707070]">
        InfoGCN Frame Config
      </span>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <select
            value={activeModel}
            disabled={switching}
            onChange={(e) => switchModel(e.target.value)}
            className="w-full appearance-none rounded-[6px] border border-[#dfdfdf] bg-[#ffffff] px-3 py-1.5 text-[13px] text-[#171717] outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/30 disabled:bg-[#fafafa] disabled:text-[#9a9a9a] transition-colors"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#9a9a9a]">
            {switching ? (
              <Loader2 size={12} className="animate-spin text-[#0052ff]" />
            ) : (
              <ChevronDown size={12} />
            )}
          </span>
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
};

export default ModelSelector;
