import ModelSelector from "@/components/model-selector";
import { useEffect, useMemo, useState } from "react";

const apiBaseUrl =
  import.meta.env?.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

type RuntimeConfig = {
  yolo_model: string;
  yolo_models: Array<{ key: string; label: string; filename: string }>;
  yolo_conf: number;
  yolo_iou: number;
  video_yolo_conf: number;
  video_yolo_iou: number;
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
  action_threshold_mode: "uniform" | "per-action";
  action_threshold: number;
  action_thresholds: Record<string, number>;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const Config = () => {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RuntimeConfig = await res.json();
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        action_threshold_mode: data.action_threshold_mode,
        action_threshold: data.action_threshold,
        action_thresholds: { ...data.action_thresholds },
      });
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
    setDraft({ ...draft, [key]: Number.isFinite(numeric) ? numeric : 0 });
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
        body: JSON.stringify({
          yolo_model: draft.yolo_model,
          yolo_conf: draft.yolo_conf,
          yolo_iou: draft.yolo_iou,
          video_yolo_conf: draft.video_yolo_conf,
          video_yolo_iou: draft.video_yolo_iou,
          action_threshold_mode: draft.action_threshold_mode,
          action_threshold: draft.action_threshold,
          action_thresholds: draft.action_thresholds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail ?? `HTTP ${res.status}`,
        );
      }
      const data: RuntimeConfig = await res.json();
      setConfig(data);
      setDraft({
        yolo_model: data.yolo_model,
        yolo_conf: data.yolo_conf,
        yolo_iou: data.yolo_iou,
        video_yolo_conf: data.video_yolo_conf,
        video_yolo_iou: data.video_yolo_iou,
        action_threshold_mode: data.action_threshold_mode,
        action_threshold: data.action_threshold,
        action_thresholds: { ...data.action_thresholds },
      });
      setSavedMessage("Configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft || !config) {
    return (
      <div className="rounded-md border border-[#D6E4FF] bg-white p-3 shadow-sm">
        <div className="text-xs font-semibold uppercase text-[#344054]/70">
          Model Configuration
        </div>
        <div className="mt-2 text-xs text-[#344054]/60">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#D6E4FF] bg-white p-3 shadow-sm ">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-[#344054]">
          Model Configuration
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md border border-[#2563EB] bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs font-medium text-red-500">{error}</div>
      )}
      {savedMessage && (
        <div className="mt-2 text-xs font-medium text-emerald-600">
          {savedMessage}
        </div>
      )}

      <div className="mt-3 grid gap-7">
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-primary">
            YOLO Pose Model
          </label>
          <select
            value={draft.yolo_model}
            onChange={(e) => setDraft({ ...draft, yolo_model: e.target.value })}
            className="w-full rounded-md border border-[#D6E4FF] bg-white px-2.5 py-2 text-xs font-medium text-[#1D2939]"
          >
            {config.yolo_models.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <ModelSelector />
        {/* <div className="grid gap-2">
          <div className="text-xs font-semibold text-[#344054]/70">
            YOLO Detection Thresholds
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-[#344054]/70">
              Confidence
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.yolo_conf}
                onChange={(e) => updateDraftNumber("yolo_conf", e.target.value)}
                className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs"
              />
            </label>
            <label className="grid gap-1 text-xs text-[#344054]/70">
              IOU
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.yolo_iou}
                onChange={(e) => updateDraftNumber("yolo_iou", e.target.value)}
                className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-[#344054]/70">
              Video Confidence
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.video_yolo_conf}
                onChange={(e) =>
                  updateDraftNumber("video_yolo_conf", e.target.value)
                }
                className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs"
              />
            </label>
            <label className="grid gap-1 text-xs text-[#344054]/70">
              Video IOU
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.video_yolo_iou}
                onChange={(e) =>
                  updateDraftNumber("video_yolo_iou", e.target.value)
                }
                className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs"
              />
            </label>
          </div>
        </div> */}

        <div className="grid gap-2">
          <div className="text-xs font-semibold text-primary">
            Action Confidence Thresholds
          </div>
          <label className="flex items-center gap-2 text-xs text-[#344054]/70">
            <input
              type="checkbox"
              checked={draft.action_threshold_mode === "uniform"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  action_threshold_mode: e.target.checked
                    ? "uniform"
                    : "per-action",
                })
              }
            />
            Use the same threshold for all actions
          </label>

          {draft.action_threshold_mode === "uniform" ? (
            <label className="grid grid-cols-[auto_1fr] items-center gap-3 text-xs text-[#344054]">
              Threshold
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.action_threshold}
                onChange={(e) =>
                  updateDraftNumber("action_threshold", e.target.value)
                }
                className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs text-[#344054] "
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {actions.map((action) => (
                <label
                  key={action}
                  className="grid gap-1 text-xs text-[#344054]"
                >
                  {action}
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={draft.action_thresholds[action] ?? 0}
                    onChange={(e) =>
                      updateActionThreshold(action, e.target.value)
                    }
                    className="rounded-md border border-[#D6E4FF] px-2.5 py-2 text-xs text-[#344054]"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Config;
