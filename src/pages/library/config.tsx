import ModelSelector from "@/components/model-selector";
import { Save, RefreshCw, ChevronDown } from "lucide-react";
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Primitives ────────────────────────────────────────────────────────────────

const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex w-9 h-5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff]/40 shrink-0 ${
      checked ? "bg-[#0052ff]" : "bg-[#d4d4d4]"
    }`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

const NumberInput = ({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-[11px] text-[#9a9a9a] uppercase tracking-[0.05em] font-medium">
      {label}
    </span>
    <div className="relative">
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-colors ${
          disabled
            ? "border-[#ededed] bg-[#f7f7f7] text-[#b0b0b0] cursor-not-allowed"
            : "border-[#dfdfdf] bg-white text-[#171717] focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20"
        }`}
      />
    </div>
  </div>
);

// ── Section wrapper ───────────────────────────────────────────────────────────

const Section = ({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 w-6 h-6 rounded-md bg-[#f0f4ff] flex items-center justify-center shrink-0 text-[#0052ff]">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#1a1a1a] leading-tight">
          {title}
        </p>
        {description && (
          <p className="text-[11px] text-[#9a9a9a] mt-0.5">{description}</p>
        )}
      </div>
    </div>
    <div className="flex flex-col gap-3">{children}</div>
  </div>
);

// ── Pill badge ────────────────────────────────────────────────────────────────
const Pill = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors border ${
      active
        ? "bg-[#0052ff] border-[#0052ff] text-white"
        : "bg-white border-[#dfdfdf] text-[#707070] hover:border-[#0052ff] hover:text-[#0052ff]"
    }`}
  >
    {children}
  </button>
);

// ── Icons (inline SVG, minimal) ───────────────────────────────────────────────
const IconDetect = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="1"
      y="1"
      width="4"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <rect
      x="9"
      y="1"
      width="4"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <rect
      x="1"
      y="9"
      width="4"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <rect
      x="9"
      y="9"
      width="4"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);
const IconTune = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <line
      x1="2"
      y1="4"
      x2="12"
      y2="4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle
      cx="5"
      cy="4"
      r="1.5"
      fill="white"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <line
      x1="2"
      y1="10"
      x2="12"
      y2="10"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <circle
      cx="9"
      cy="10"
      r="1.5"
      fill="white"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);
const IconFrame = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect
      x="1.5"
      y="1.5"
      width="11"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M4.5 7h5M7 4.5v5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);
const IconModel = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="7" cy="2" r="1" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="7" cy="12" r="1" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="2" cy="7" r="1" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="12" cy="7" r="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────────

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
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent("runtime-config-updated", {
          detail: { ...data, realtime_disable_downscale: nextDisableDownscale },
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

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading || !draft || !config) {
    return (
      <div
        className={`flex flex-col h-full rounded-xl bg-white border border-[#ededed] ${className ?? ""}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ededed]">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">
            Configuration
          </span>
        </div>
        <div className="flex items-center justify-center flex-1 gap-2 text-[13px] text-[#9a9a9a]">
          <RefreshCw size={14} className="animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col min-h-0 rounded-xl bg-white border border-[#ededed] ${className ?? ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#ededed] shrink-0">
        <div>
          <p className="text-[13px] font-semibold text-[#1a1a1a]">
            Configuration
          </p>
          <p className="text-[11px] text-[#9a9a9a] mt-0.5">
            Model &amp; detection settings
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-[#0052ff] text-white hover:bg-[#0041cc] disabled:opacity-50 transition-colors shadow-sm"
        >
          <Save size={13} />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Toasts */}
      {(error || savedMessage) && (
        <div
          className={`mx-4 mt-3 px-3.5 py-2.5 rounded-lg text-[12px] flex items-center gap-2 ${
            error
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-[#eef3ff] border border-[#c7d7ff] text-[#0041cc]"
          }`}
        >
          {error ? "⚠ " + error : "✓ " + savedMessage}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-6">
        {/* ── 1. Pose Model ─────────────────────────────────────────────────── */}
        <Section
          icon={<IconDetect />}
          title="Pose detection model"
          description="YOLO model used to locate people in the frame"
        >
          <div className="relative">
            <select
              value={draft.yolo_model}
              onChange={(e) =>
                setDraft({ ...draft, yolo_model: e.target.value })
              }
              className="w-full rounded-md border border-[#dfdfdf] bg-white px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20 appearance-none pr-8 transition-colors"
            >
              {config.yolo_models.map((model) => (
                <option key={model.key} value={model.key}>
                  {model.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9a9a9a]"
            />
          </div>
        </Section>

        <div className="h-px bg-[#f0f0f0]" />

        {/* ── 2. YOLO Thresholds ────────────────────────────────────────────── */}
        <Section
          icon={<IconTune />}
          title="Detection thresholds"
          description="Confidence and IOU values for person detection"
        >
          {/* Sync toggle */}
          <div className="flex items-center justify-between py-2.5 px-3.5 rounded-lg bg-[#f7f8fa] border border-[#ededed]">
            <div>
              <p className="text-[12px] font-medium text-[#1a1a1a]">
                Sync library &amp; realtime
              </p>
              <p className="text-[11px] text-[#9a9a9a]">
                Apply the same values to both modes
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

          {/* Grid: two columns = Realtime / Library */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
            {/* Realtime column */}
            <div className="flex flex-col gap-2 p-3 rounded-lg border border-[#ededed] bg-[#fafafa]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                <span className="text-[11px] font-semibold text-[#4a4a4a] uppercase tracking-[0.05em]">
                  Realtime
                </span>
              </div>
              <NumberInput
                label="Confidence"
                value={draft.yolo_conf}
                onChange={(v) => updateDraftNumber("yolo_conf", v)}
                disabled={matchLibrarySettings}
              />
              <NumberInput
                label="IOU"
                value={draft.yolo_iou}
                onChange={(v) => updateDraftNumber("yolo_iou", v)}
                disabled={matchLibrarySettings}
              />
            </div>

            {/* Library column */}
            <div className="flex flex-col gap-2 p-3 rounded-lg border border-[#ededed] bg-[#fafafa]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                <span className="text-[11px] font-semibold text-[#4a4a4a] uppercase tracking-[0.05em]">
                  Library
                </span>
              </div>
              <NumberInput
                label="Confidence"
                value={draft.video_yolo_conf}
                onChange={(v) => updateLibraryNumber("video_yolo_conf", v)}
              />
              <NumberInput
                label="IOU"
                value={draft.video_yolo_iou}
                onChange={(v) => updateLibraryNumber("video_yolo_iou", v)}
              />
            </div>
          </div>
        </Section>

        <div className="h-px bg-[#f0f0f0]" />

        {/* ── 3. Frame scaling ──────────────────────────────────────────────── */}
        <Section
          icon={<IconFrame />}
          title="Realtime frame scaling"
          description="Controls the resolution frames are sent at"
        >
          <div className="flex items-center justify-between py-2.5 px-3.5 rounded-lg bg-[#f7f8fa] border border-[#ededed]">
            <div>
              <p className="text-[12px] font-medium text-[#1a1a1a]">
                Disable downscaling
              </p>
              <p className="text-[11px] text-[#9a9a9a]">
                Send frames at full camera resolution
              </p>
            </div>
            <Toggle
              checked={draft.realtime_disable_downscale}
              onChange={() =>
                setDraft({
                  ...draft,
                  realtime_disable_downscale: !draft.realtime_disable_downscale,
                })
              }
            />
          </div>
        </Section>

        <div className="h-px bg-[#f0f0f0]" />

        {/* ── 4. Action model ───────────────────────────────────────────────── */}
        <Section
          icon={<IconModel />}
          title="Action recognition model"
          description="InfoGCN model for classifying detected poses"
        >
          <ModelSelector />
        </Section>

        <div className="h-px bg-[#f0f0f0]" />

        {/* ── 5. Action thresholds ──────────────────────────────────────────── */}
        <Section
          icon={<IconTune />}
          title="Action confidence thresholds"
          description="Minimum confidence required to display an action label"
        >
          {/* Mode pills */}
          <div className="flex items-center gap-2">
            <Pill
              active={draft.action_threshold_mode === "uniform"}
              onClick={() =>
                setDraft({ ...draft, action_threshold_mode: "uniform" })
              }
            >
              Uniform
            </Pill>
            <Pill
              active={draft.action_threshold_mode === "per-action"}
              onClick={() =>
                setDraft({ ...draft, action_threshold_mode: "per-action" })
              }
            >
              Per action
            </Pill>
          </div>

          {draft.action_threshold_mode === "uniform" ? (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[12px] text-[#707070] shrink-0">
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
                className="flex-1 rounded-md border border-[#dfdfdf] bg-white px-3 py-2 text-[13px] text-[#171717] outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]/20 transition-colors"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-1">
              {actions.map((action) => (
                <NumberInput
                  key={action}
                  label={action}
                  value={draft.action_thresholds[action] ?? 0}
                  onChange={(v) => updateActionThreshold(action, v)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Bottom padding */}
        <div className="h-2" />
      </div>
    </div>
  );
};

export default Config;
