import ModelSelector from "@/components/model-selector";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";
const REALTIME_DOWNSCALE_KEY = "realtime:disable-downscale";

type RuntimeConfig = {
  yolo_model: string;
  yolo_models: Array<{ key: string; label: string; filename: string }>;
  yolo_conf: number;
  yolo_iou: number;
  video_yolo_conf: number;
  video_yolo_iou: number;
  realtime_disable_downscale?: boolean;
  action_threshold_mode: "uniform" | "per-action";
  action_threshold: number;
  action_thresholds: Record<string, number>;
  actions: string[];
};

type DraftConfig = {
  yolo_model: string;
  yolo_conf: number;
  yolo_iou: number;
  video_yolo_conf: number;
  video_yolo_iou: number;
  realtime_disable_downscale: boolean;
  action_threshold_mode: "uniform" | "per-action";
  action_threshold: number;
  action_thresholds: Record<string, number>;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const inputCls =
  "w-full rounded-[6px] border border-[#dfdfdf] bg-[#ffffff] px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/30 transition-colors";

const labelCls =
  "text-[11px] font-medium text-[#707070] uppercase tracking-[0.06em]";

type ConfigProps = { className?: string };

const Config = ({ className }: ConfigProps) => {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [matchLibrarySettings, setMatchLibrarySettings] = useState(false);
  const [cachedRealtime, setCachedRealtime] = useState<{
    yolo_conf: number;
    yolo_iou: number;
  } | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RuntimeConfig = await res.json();
      const storedDownscale = (() => {
        try {
          const raw = window.localStorage.getItem(REALTIME_DOWNSCALE_KEY);
          return raw === "true" ? true : raw === "false" ? false : null;
        } catch {
          return null;
        }
      })();
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        realtime_disable_downscale:
          data.realtime_disable_downscale ?? storedDownscale ?? false,
        action_threshold_mode: data.action_threshold_mode,
        action_threshold: data.action_threshold,
        action_thresholds: { ...data.action_thresholds },
      });
      setMatchLibrarySettings(
        data.yolo_conf === data.video_yolo_conf &&
          data.yolo_iou === data.video_yolo_iou,
      );
      setCachedRealtime({ yolo_conf: data.yolo_conf, yolo_iou: data.yolo_iou });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const actions = useMemo(() => config?.actions ?? [], [config]);

  const updateDraftNumber = (key: keyof DraftConfig, value: string) => {
    if (!draft) return;
    const numeric = clamp01(Number.parseFloat(value));
    const nextValue = Number.isFinite(numeric) ? numeric : 0;
    setDraft({ ...draft, [key]: nextValue });
    if (!matchLibrarySettings && (key === "yolo_conf" || key === "yolo_iou")) {
      setCachedRealtime((prev) => ({
        yolo_conf: key === "yolo_conf" ? nextValue : (prev?.yolo_conf ?? 0),
        yolo_iou: key === "yolo_iou" ? nextValue : (prev?.yolo_iou ?? 0),
      }));
    }
  };

  const updateLibraryNumber = (
    key: "video_yolo_conf" | "video_yolo_iou",
    value: string,
  ) => {
    if (!draft) return;
    const numeric = clamp01(Number.parseFloat(value));
    const nextValue = Number.isFinite(numeric) ? numeric : 0;
    const nextDraft = { ...draft, [key]: nextValue };
    if (matchLibrarySettings) {
      if (key === "video_yolo_conf") nextDraft.yolo_conf = nextValue;
      if (key === "video_yolo_iou") nextDraft.yolo_iou = nextValue;
    }
    setDraft(nextDraft);
  };

  const updateActionThreshold = (label: string, value: string) => {
    if (!draft) return;
    const numeric = clamp01(Number.parseFloat(value));
    setDraft({
      ...draft,
      action_thresholds: {
        ...draft.action_thresholds,
        [label]: Number.isFinite(numeric) ? numeric : 0,
      },
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail ?? `HTTP ${res.status}`,
        );
      }
      const data: RuntimeConfig = await res.json();
      const nextDisableDownscale =
        data.realtime_disable_downscale ?? draft.realtime_disable_downscale;
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        realtime_disable_downscale: nextDisableDownscale,
        action_threshold_mode: data.action_threshold_mode,
        action_threshold: data.action_threshold,
        action_thresholds: { ...data.action_thresholds },
      });
      try {
        window.localStorage.setItem(
          REALTIME_DOWNSCALE_KEY,
          String(nextDisableDownscale),
        );
      } catch {
        // Ignore storage failures (private mode, quota, etc.)
      }
      window.dispatchEvent(
        new CustomEvent("runtime-config-updated", {
          detail: {
            ...data,
            realtime_disable_downscale: nextDisableDownscale,
          },
        }),
      );
      setSavedMessage("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft || !config) {
    return (
      <div
        className={`flex flex-col h-full rounded-lg bg-[#ffffff] border border-[#ededed] ${className ?? ""}`}
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <div className="px-4 py-3 border-b border-[#ededed]">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]"
            style={{ fontFamily: "var(--mono)" }}
          >
            Configuration
          </span>
        </div>
        <div className="flex items-center justify-center flex-1 text-[13px] text-[#9a9a9a]">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col min-h-0 rounded-lg bg-[#ffffff] border border-[#ededed] ${className ?? ""}`}
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ededed] shrink-0">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]"
          style={{ fontFamily: "var(--mono)" }}
        >
          Configuration
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] disabled:opacity-50 transition-colors"
        >
          <Save size={13} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-[6px] bg-red-50 border border-red-200 text-[12px] text-red-700">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-[6px] bg-[#0052ff]/10 border border-[#0052ff]/30 text-[12px] text-[#0041cc]">
          {savedMessage}
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {/* YOLO Pose Model */}
        <div className="flex flex-col gap-2">
          <label className={labelCls}>YOLO Pose Model</label>
          <div className="relative">
            <select
              value={draft.yolo_model}
              onChange={(e) =>
                setDraft({ ...draft, yolo_model: e.target.value })
              }
              className={inputCls + " appearance-none pr-7"}
            >
              {config.yolo_models.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9a9a9a]">
              ▾
            </span>
          </div>
        </div>

        {/* Realtime vs Library YOLO */}
        <div className="flex flex-col gap-3">
          <label className={labelCls}>YOLO Confidence / IOU</label>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span
              onClick={() => {
                const next = !matchLibrarySettings;
                if (next) {
                  setCachedRealtime({
                    yolo_conf: draft.yolo_conf,
                    yolo_iou: draft.yolo_iou,
                  });
                }
                setMatchLibrarySettings(next);
                if (next) {
                  setDraft({
                    ...draft,
                    yolo_conf: draft.video_yolo_conf,
                    yolo_iou: draft.video_yolo_iou,
                  });
                } else if (cachedRealtime) {
                  setDraft({
                    ...draft,
                    yolo_conf: cachedRealtime.yolo_conf,
                    yolo_iou: cachedRealtime.yolo_iou,
                  });
                }
              }}
              className={`relative inline-flex w-8 h-4.5 rounded-full transition-colors cursor-pointer shrink-0 ${
                matchLibrarySettings ? "bg-[#0052ff]" : "bg-[#dfdfdf]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  matchLibrarySettings ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-[13px] text-[#707070]">
              Use library YOLO settings for realtime
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9a9a9a]">
                Realtime confidence
              </span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.yolo_conf}
                onChange={(e) => updateDraftNumber("yolo_conf", e.target.value)}
                disabled={matchLibrarySettings}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9a9a9a]">Realtime IOU</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.yolo_iou}
                onChange={(e) => updateDraftNumber("yolo_iou", e.target.value)}
                disabled={matchLibrarySettings}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9a9a9a]">
                Library confidence
              </span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.video_yolo_conf}
                onChange={(e) =>
                  updateLibraryNumber("video_yolo_conf", e.target.value)
                }
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-[#9a9a9a]">Library IOU</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.video_yolo_iou}
                onChange={(e) =>
                  updateLibraryNumber("video_yolo_iou", e.target.value)
                }
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#ededed]" />

        {/* Realtime frame scaling */}
        <div className="flex flex-col gap-2">
          <label className={labelCls}>Realtime Frame Scaling</label>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span
              onClick={() =>
                setDraft({
                  ...draft,
                  realtime_disable_downscale: !draft.realtime_disable_downscale,
                })
              }
              className={`relative inline-flex w-8 h-4.5 rounded-full transition-colors cursor-pointer shrink-0 ${
                draft.realtime_disable_downscale
                  ? "bg-[#0052ff]"
                  : "bg-[#dfdfdf]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  draft.realtime_disable_downscale
                    ? "translate-x-3.5"
                    : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-[13px] text-[#707070]">
              Disable realtime downscaling
            </span>
          </label>
          <p className="text-[11px] text-[#9a9a9a]">
            When enabled, frames are sent at full camera resolution.
          </p>
        </div>

        {/* InfoGCN model selector */}
        <ModelSelector />

        {/* Divider */}
        <div className="h-px bg-[#ededed]" />

        {/* Action Confidence Thresholds */}
        <div className="flex flex-col gap-3">
          <label className={labelCls}>Action Confidence Threshold</label>

          {/* Uniform toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span
              onClick={() =>
                setDraft({
                  ...draft,
                  action_threshold_mode:
                    draft.action_threshold_mode === "uniform"
                      ? "per-action"
                      : "uniform",
                })
              }
              className={`relative inline-flex w-8 h-4.5 rounded-full transition-colors cursor-pointer shrink-0 ${
                draft.action_threshold_mode === "uniform"
                  ? "bg-[#0052ff]"
                  : "bg-[#dfdfdf]"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  draft.action_threshold_mode === "uniform"
                    ? "translate-x-3.5"
                    : "translate-x-0"
                }`}
              />
            </span>
            <span className="text-[13px] text-[#707070]">
              Uniform threshold
            </span>
          </label>

          {draft.action_threshold_mode === "uniform" ? (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[#707070] shrink-0 w-20">
                Threshold
              </span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.action_threshold}
                onChange={(e) =>
                  updateDraftNumber("action_threshold", e.target.value)
                }
                className={inputCls}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {actions.map((action) => (
                <div key={action} className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#9a9a9a]">{action}</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={draft.action_thresholds[action] ?? 0}
                    onChange={(e) =>
                      updateActionThreshold(action, e.target.value)
                    }
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Config;
