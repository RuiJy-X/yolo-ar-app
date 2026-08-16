import ModelSelector from "@/components/model-selector";
import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  Cpu,
  Layers,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";
const SETTINGS_BACKUP_KEY = "skysight:settings_backup";
const RUNTIME_CONFIG_KEY = "skysight:runtime-config";

const saveSettingsToLocalStorage = (data: RuntimeConfig) => {
  try {
    const raw = JSON.stringify(data);
    window.localStorage.setItem(SETTINGS_BACKUP_KEY, raw);
    window.localStorage.setItem(RUNTIME_CONFIG_KEY, raw);
  } catch {
    // ignore
  }
};

const loadSettingsFromLocalStorage = (): RuntimeConfig | null => {
  try {
    const raw =
      window.localStorage.getItem(SETTINGS_BACKUP_KEY) ||
      window.localStorage.getItem(RUNTIME_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RuntimeConfig;
  } catch {
    return null;
  }
};

type SahiMode = "disabled" | "standard" | "dense" | "ultra_dense";

type RuntimeConfig = {
  yolo_model: string;
  yolo_models: Array<{ key: string; label: string; filename: string }>;
  yolo_conf: number;
  yolo_iou: number;
  video_yolo_conf: number;
  video_yolo_iou: number;
  use_sahi?: boolean;
  sahi_mode?: SahiMode;
  sahi_pipeline_mode?: "1-stage" | "2-stage";
  sahi_tile_conf?: number;
  sahi_kpt_conf?: number;
  sahi_min_kpts?: number;
  sahi_min_mean_kpt_conf?: number;
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
  use_sahi: boolean;
  sahi_mode: SahiMode;
  sahi_pipeline_mode: "1-stage" | "2-stage";
  sahi_tile_conf: number;
  sahi_kpt_conf: number;
  sahi_min_kpts: number;
  sahi_min_mean_kpt_conf: number;
  action_threshold_mode: "uniform" | "per-action";
  action_threshold: number;
  action_thresholds: Record<string, number>;
};

type SettingsTab = "pose" | "sahi" | "action" | "system";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const Toggle = ({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff]/40 shrink-0 ${
      disabled
        ? "bg-slate-200 opacity-60 cursor-not-allowed"
        : checked
          ? "bg-[#0052ff]"
          : "bg-slate-300 hover:bg-slate-400"
    }`}
  >
    <span
      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
        checked ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

const RangeSliderInput = ({
  value,
  onChange,
  disabled = false,
  label,
  description,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value: number;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}) => (
  <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors">
    <div className="flex items-center justify-between gap-2">
      <div>
        <span className="text-[13px] font-semibold text-slate-800 tracking-tight">
          {label}
        </span>
        {description && (
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-16 text-right rounded-md border px-2 py-1 text-[13px] font-mono font-medium outline-none transition-colors ${
            disabled
              ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
              : "border-slate-300 bg-white text-slate-900 focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20"
          }`}
        />
      </div>
    </div>
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full accent-[#0052ff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      />
      <span className="text-[11px] font-mono text-slate-400 w-8 text-right shrink-0">
        {Math.round(value * 100)}%
      </span>
    </div>
  </div>
);

type ConfigProps = {
  className?: string;
  transparent?: boolean;
};

const Config = ({ className, transparent = false }: ConfigProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("pose");
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [matchLibrarySettings, setMatchLibrarySettings] = useState(true);
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
      saveSettingsToLocalStorage(data);
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        use_sahi: data.use_sahi ?? false,
        sahi_mode: data.sahi_mode ?? (data.use_sahi ? "dense" : "disabled"),
        sahi_pipeline_mode: data.sahi_pipeline_mode ?? "2-stage",
        sahi_tile_conf: data.sahi_tile_conf ?? 0.15,
        sahi_kpt_conf: data.sahi_kpt_conf ?? 0.10,
        sahi_min_kpts: data.sahi_min_kpts ?? 3,
        sahi_min_mean_kpt_conf: data.sahi_min_mean_kpt_conf ?? 0.15,
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
      const cached = loadSettingsFromLocalStorage();
      if (cached) {
        setConfig(cached);
        setDraft({
          yolo_model: cached.yolo_model,
          yolo_conf: cached.yolo_conf,
          yolo_iou: cached.yolo_iou,
          video_yolo_conf: cached.video_yolo_conf,
          video_yolo_iou: cached.video_yolo_iou,
          use_sahi: cached.use_sahi ?? false,
          sahi_mode: cached.sahi_mode ?? (cached.use_sahi ? "dense" : "disabled"),
          sahi_pipeline_mode: cached.sahi_pipeline_mode ?? "2-stage",
          sahi_tile_conf: cached.sahi_tile_conf ?? 0.15,
          sahi_kpt_conf: cached.sahi_kpt_conf ?? 0.10,
          sahi_min_kpts: cached.sahi_min_kpts ?? 3,
          sahi_min_mean_kpt_conf: cached.sahi_min_mean_kpt_conf ?? 0.15,
          action_threshold_mode: cached.action_threshold_mode,
          action_threshold: cached.action_threshold,
          action_thresholds: { ...cached.action_thresholds },
        });
        setError("Backend API offline. Loaded cached settings from local storage.");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const actions = useMemo(() => config?.actions ?? [], [config]);

  const hasChanges = useMemo(() => {
    if (!config || !draft) return false;
    return (
      draft.yolo_model !== config.yolo_model ||
      draft.yolo_conf !== config.yolo_conf ||
      draft.yolo_iou !== config.yolo_iou ||
      draft.video_yolo_conf !== config.video_yolo_conf ||
      draft.video_yolo_iou !== config.video_yolo_iou ||
      draft.use_sahi !== config.use_sahi ||
      draft.sahi_mode !== config.sahi_mode ||
      draft.sahi_pipeline_mode !== config.sahi_pipeline_mode ||
      draft.sahi_tile_conf !== config.sahi_tile_conf ||
      draft.sahi_kpt_conf !== config.sahi_kpt_conf ||
      draft.sahi_min_kpts !== config.sahi_min_kpts ||
      draft.sahi_min_mean_kpt_conf !== config.sahi_min_mean_kpt_conf ||
      draft.action_threshold_mode !== config.action_threshold_mode ||
      draft.action_threshold !== config.action_threshold ||
      JSON.stringify(draft.action_thresholds) !==
        JSON.stringify(config.action_thresholds)
    );
  }, [config, draft]);

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
      saveSettingsToLocalStorage(data);
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        use_sahi: data.use_sahi ?? draft.use_sahi,
        sahi_mode: data.sahi_mode ?? draft.sahi_mode,
        sahi_pipeline_mode: data.sahi_pipeline_mode ?? draft.sahi_pipeline_mode,
        sahi_tile_conf: data.sahi_tile_conf ?? draft.sahi_tile_conf,
        sahi_kpt_conf: data.sahi_kpt_conf ?? draft.sahi_kpt_conf,
        sahi_min_kpts: data.sahi_min_kpts ?? draft.sahi_min_kpts,
        sahi_min_mean_kpt_conf: data.sahi_min_mean_kpt_conf ?? draft.sahi_min_mean_kpt_conf,
        action_threshold_mode: data.action_threshold_mode,
        action_threshold: data.action_threshold,
        action_thresholds: { ...data.action_thresholds },
      });
      window.dispatchEvent(
        new CustomEvent("runtime-config-updated", {
          detail: data,
        }),
      );
      setSavedMessage("Configuration saved successfully.");
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const testApiHealth = async () => {
    setPinging(true);
    setHealthStatus(null);
    try {
      const start = performance.now();
      const res = await fetch(`${apiBaseUrl}/api/config`);
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        setHealthStatus(`Connected to backend API (${elapsed}ms)`);
      } else {
        setHealthStatus(`API responded with HTTP ${res.status}`);
      }
    } catch (err) {
      setHealthStatus(`Connection failed: ${String(err)}`);
    } finally {
      setPinging(false);
    }
  };

  if (loading || !draft || !config) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white rounded-xl border border-slate-200 p-8 text-slate-500">
        <RefreshCw size={24} className="animate-spin text-[#0052ff] mb-3" />
        <p className="text-sm font-medium">Loading system configurations...</p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full w-full overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm ${className ?? ""}`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0052ff]/10 flex items-center justify-center text-[#0052ff]">
            <Sliders size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Control Panel &amp; Settings
            </h2>
            <p className="text-[11px] text-slate-500">
              Manage detection models, thresholds, and performance
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium animate-pulse">
              <Sparkles size={12} /> Unsaved Changes
            </span>
          )}

          <button
            type="button"
            onClick={loadConfig}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[12px] font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 rounded-lg bg-[#0052ff] hover:bg-[#0047df] text-white text-[12px] font-semibold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 shrink-0">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {savedMessage && (
        <div className="px-6 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2 shrink-0">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span>{savedMessage}</span>
        </div>
      )}

      {/* Main Container: Sidebar Tabs + Content Panel */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Navigation Sidebar */}
        <div className="w-60 border-r border-slate-200 bg-slate-50/50 p-3 flex flex-col gap-1 shrink-0 overflow-y-auto">
          <button
            type="button"
            onClick={() => setActiveTab("pose")}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all text-left ${
              activeTab === "pose"
                ? "bg-[#0052ff] text-white shadow-sm font-semibold"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
          >
            <Box size={16} className="shrink-0" />
            <span>Pose Detection</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("sahi")}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all text-left ${
              activeTab === "sahi"
                ? "bg-[#0052ff] text-white shadow-sm font-semibold"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
          >
            <Layers size={16} className="shrink-0" />
            <span>SAHI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("action")}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all text-left ${
              activeTab === "action"
                ? "bg-[#0052ff] text-white shadow-sm font-semibold"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
          >
            <Activity size={16} className="shrink-0" />
            <span>Action Recognition</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all text-left ${
              activeTab === "system"
                ? "bg-[#0052ff] text-white shadow-sm font-semibold"
                : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
            }`}
          >
            <Cpu size={16} className="shrink-0" />
            <span>System &amp; API</span>
          </button>
        </div>

        {/* Right Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {/* TAB 1: POSE DETECTION (YOLO) */}
          {activeTab === "pose" && (
            <div className="flex flex-col gap-6 max-w-4xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  YOLO Pose Detection Settings
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Configure the primary YOLO pose estimator model, confidence
                  sensitivity, and IoU bounding box deduplication.
                </p>
              </div>

              {/* Model Choice Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-800">
                    YOLO Model Weights
                  </span>
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Active: {draft.yolo_model}
                  </span>
                </div>
                <select
                  value={draft.yolo_model}
                  onChange={(e) =>
                    setDraft({ ...draft, yolo_model: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20 transition-colors"
                >
                  {config.yolo_models.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label} ({model.filename})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sync Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div>
                  <p className="text-[13px] font-semibold text-slate-800">
                    Synchronize Live Realtime &amp; Library Video Settings
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Automatically mirror confidence &amp; IoU thresholds between
                    live feeds and uploaded video files.
                  </p>
                </div>
                <Toggle
                  checked={matchLibrarySettings}
                  onChange={() => {
                    const next = !matchLibrarySettings;
                    if (next) {
                      setCachedRealtime({
                        yolo_conf: draft.yolo_conf,
                        yolo_iou: draft.yolo_iou,
                      });
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
                    setMatchLibrarySettings(next);
                  }}
                />
              </div>

              {/* Threshold Sliders Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Realtime Column */}
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Realtime Live Feed
                    </h4>
                  </div>
                  <RangeSliderInput
                    label="Detection Confidence"
                    description="Minimum person score required on live frames"
                    value={draft.yolo_conf}
                    onChange={(v) => updateDraftNumber("yolo_conf", v)}
                    disabled={matchLibrarySettings}
                  />
                  <RangeSliderInput
                    label="NMS IoU Threshold"
                    description="Bounding box overlap deduplication"
                    value={draft.yolo_iou}
                    onChange={(v) => updateDraftNumber("yolo_iou", v)}
                    disabled={matchLibrarySettings}
                  />
                </div>

                {/* Library Video Column */}
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Library Video Upload
                    </h4>
                  </div>
                  <RangeSliderInput
                    label="Detection Confidence"
                    description="Minimum person score on processed videos"
                    value={draft.video_yolo_conf}
                    onChange={(v) => updateLibraryNumber("video_yolo_conf", v)}
                  />
                  <RangeSliderInput
                    label="NMS IoU Threshold"
                    description="Bounding box overlap deduplication"
                    value={draft.video_yolo_iou}
                    onChange={(v) => updateLibraryNumber("video_yolo_iou", v)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SAHI & AERIAL */}
          {activeTab === "sahi" && (
            <div className="flex flex-col gap-6 max-w-4xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  SAHI Sliced Inference &amp; Aerial Optimization
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enhance detection of small or distant people in
                  high-resolution aerial footage using SAHI tile slicing.
                </p>
              </div>

              {/* SAHI Pipeline Architecture Selector Card */}
              <div className="flex items-center justify-between p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 mt-0.5">
                    <Maximize2 size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      SAHI Pipeline Architecture
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      2-Stage Crop &amp; Upscale detects tiny person bboxes first, adds 25% contextual padding, upscales crops to 256px, and runs targeted pose estimation for maximum keypoint recall on far-away subjects.
                    </p>
                  </div>
                </div>
                <select
                  value={draft.sahi_pipeline_mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sahi_pipeline_mode: e.target.value as "1-stage" | "2-stage",
                    })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20 shadow-xs cursor-pointer"
                >
                  <option value="2-stage">2-Stage Crop &amp; Upscale (Recommended)</option>
                  <option value="1-stage">1-Stage Direct Tile Slicing</option>
                </select>
              </div>

              {/* SAHI Slicing Mode Dropdown Card */}
              <div className="flex items-center justify-between p-5 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-[#0052ff] mt-0.5">
                    <Layers size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      SAHI Slicing Mode
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xl">
                      Configures tile crop size for aerial and drone footage. Dense SAHI (384px) magnifies 15px distant people to 25px for maximum recall on 1080p video.
                    </p>
                  </div>
                </div>
                <select
                  value={draft.sahi_mode}
                  onChange={(e) => {
                    const mode = e.target.value as SahiMode;
                    setDraft({
                      ...draft,
                      sahi_mode: mode,
                      use_sahi: mode !== "disabled",
                    });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20 shadow-xs cursor-pointer"
                >
                  <option value="disabled">Disabled (Full Frame Pass)</option>
                  <option value="standard">Standard SAHI (640px)</option>
                  <option value="dense">Dense SAHI (384px) [Recommended]</option>
                  <option value="ultra_dense">Ultra-Dense SAHI (320px)</option>
                </select>
              </div>

              {/* SAHI Fine-Tuning & Anti-Hallucination Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Sub-Tile &amp; Keypoint Confidence
                    </h4>
                  </div>
                  <RangeSliderInput
                    label="Sub-Tile Detection Floor"
                    description="Minimum score inside sub-tiles. Lowering to 0.15 boosts recall for 15px distant subjects"
                    value={draft.sahi_tile_conf}
                    onChange={(v) => updateDraftNumber("sahi_tile_conf", v)}
                  />
                  <RangeSliderInput
                    label="Keypoint Confidence Floor"
                    description="Minimum score for a COCO body keypoint to be counted"
                    value={draft.sahi_kpt_conf}
                    onChange={(v) => updateDraftNumber("sahi_kpt_conf", v)}
                  />
                </div>

                <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Anti-Hallucination Validation Filter
                    </h4>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-800">
                      Minimum Valid Keypoints: <span className="font-mono text-[#0052ff]">{draft.sahi_min_kpts}</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Minimum connected keypoints required per detection (filters out foliage, shadows, and rock cracks)
                    </p>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={draft.sahi_min_kpts}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sahi_min_kpts: Number.parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="w-full accent-[#0052ff] cursor-pointer mt-1"
                    />
                  </div>
                  <RangeSliderInput
                    label="Average Keypoint Confidence Floor"
                    description="Minimum average confidence across valid keypoints for a candidate to be kept"
                    value={draft.sahi_min_mean_kpt_conf}
                    onChange={(v) => updateDraftNumber("sahi_min_mean_kpt_conf", v)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTION RECOGNITION (INFOGCN) */}
          {activeTab === "action" && (
            <div className="flex flex-col gap-6 max-w-4xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  InfoGCN Action Recognition &amp; Sensitivity
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select keypoint action classification models and configure
                  confidence display thresholds.
                </p>
              </div>

              {/* Model Selector Card */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col gap-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  InfoGCN Model Checkpoint
                </h4>
                <ModelSelector />
              </div>

              {/* Threshold Mode & Sliders Card */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Action Confidence Threshold Mode
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choose whether to apply a single threshold to all actions
                      or customize each action individually.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, action_threshold_mode: "uniform" })
                      }
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        draft.action_threshold_mode === "uniform"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Uniform
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          action_threshold_mode: "per-action",
                        })
                      }
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        draft.action_threshold_mode === "per-action"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Per-Action
                    </button>
                  </div>
                </div>

                {draft.action_threshold_mode === "uniform" ? (
                  <RangeSliderInput
                    label="Global Action Confidence Threshold"
                    description="Action predictions below this confidence display as 'Unknown'"
                    value={draft.action_threshold}
                    onChange={(v) => updateDraftNumber("action_threshold", v)}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    {actions.map((action) => (
                      <RangeSliderInput
                        key={action}
                        label={`${action.charAt(0).toUpperCase() + action.slice(1)} Threshold`}
                        value={draft.action_thresholds[action] ?? 0.25}
                        onChange={(v) => updateActionThreshold(action, v)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM & API */}
          {activeTab === "system" && (
            <div className="flex flex-col gap-6 max-w-4xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Backend API &amp; Health Diagnostics
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Inspect server endpoints, connection latency, and active
                  system properties.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      API Server Endpoint
                    </p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">
                      {apiBaseUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={testApiHealth}
                    disabled={pinging}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {pinging ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Cpu size={14} />
                    )}
                    Test API Connection
                  </button>
                </div>

                {healthStatus && (
                  <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-700">
                    {healthStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Config;
