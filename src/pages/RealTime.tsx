import AppLayout from "@/applayout";
import { Badge } from "@/components/ui/badge";
import RealTimeVideo, {
  type InferencePayload,
} from "@/components/realtime-video";
import Config from "./library/config";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ChevronDown,
  X,
  Save,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TitleMono from "@/components/titile-mono";
import type { Detection } from "@/lib/types";

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

// ─── Waving Toast ─────────────────────────────────────────────────────────────

type WaveToast = {
  id: number;
  timestamp: string;
};

const WAVE_THRESHOLD = 32; // consecutive frames required

// ─── Save-to-history state ────────────────────────────────────────────────────

type SaveState =
  | { status: "idle" }
  | { status: "uploading"; message: string }
  | { status: "saving" }
  | { status: "done"; historyId: string }
  | { status: "error"; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeToExtension(mimeType: string): string {
  if (mimeType.startsWith("video/mp4")) return ".mp4";
  return ".webm";
}

function buildSessionSummary(
  logs: string[],
  alertCount: number,
  frameCount: number,
): string {
  const actionCounts: Record<string, number> = {};
  for (const line of logs) {
    const match = line.match(/action=(\w+)/);
    if (match) {
      const label = match[1];
      actionCounts[label] = (actionCounts[label] ?? 0) + 1;
    }
  }
  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([l]) => l)
    .join(", ");

  const parts: string[] = [`${frameCount} frames processed`];
  if (topActions) parts.push(`top actions: ${topActions}`);
  if (alertCount > 0) parts.push(`${alertCount} waving alert(s)`);
  return `Live session — ${parts.join("; ")}`;
}

function formatTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

const emptyAnalysisSummary = () => ({
  summary_metrics: {
    yolo_precision: 0,
    yolo_recall: 0,
    infogcn_accuracy: 0,
    mean_average_precision: 0,
  },
  alert_events: [],
  action_confidence_scores: {},
  grouped_detections: {},
});

// ─── Component ────────────────────────────────────────────────────────────────

const RealTime = () => {
  const navigate = useNavigate();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [latestAction, setLatestAction] = useState<string | null>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [cameraLabel, setCameraLabel] = useState<string>("No camera selected");

  // ─── Waving Alerts Accordion ──────────────────────────────────────────────────

  const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);
  const [waveAlertLogs, setWaveAlertLogs] = useState<string[]>([]);

  // Waving alert state
  const [waveToasts, setWaveToasts] = useState<WaveToast[]>([]);
  const consecutiveWaveRef = useRef(0);
  const toastIdRef = useRef(0);

  // ─── Save-to-history state ────────────────────────────────────────────────

  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const saveAbortRef = useRef<AbortController | null>(null);

  const detectionsRef = useRef<Detection[]>([]);
  const sessionStartMsRef = useRef<number | null>(null);
  const lastInferenceMsRef = useRef<number | null>(null);
  const lastFrameIndexRef = useRef<number>(0);
  const annotatedCaptureRef = useRef<{ blob: Blob; mime: string } | null>(null);
  const sourceCaptureRef = useRef<{ blob: Blob; mime: string } | null>(null);
  const saveInFlightRef = useRef(false);

  // Keep a live snapshot of logs/alerts/frames for use in the save callback
  const logsRef = useRef<string[]>([]);
  const waveAlertLogsRef = useRef<string[]>([]);
  const frameCountRef = useRef(0);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    waveAlertLogsRef.current = waveAlertLogs;
  }, [waveAlertLogs]);
  useEffect(() => {
    frameCountRef.current = frameCount;
  }, [frameCount]);

  const appendLog = useCallback((line: string) => {
    setLogs((previous) => [line, ...previous].slice(0, 80));
  }, []);

  const dismissToast = useCallback((id: number) => {
    setWaveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto-dismiss toasts after 6 s
  useEffect(() => {
    if (waveToasts.length === 0) return;
    const latest = waveToasts[waveToasts.length - 1];
    const timer = setTimeout(() => dismissToast(latest.id), 6000);
    return () => clearTimeout(timer);
  }, [waveToasts, dismissToast]);

  const handleInference = useCallback(
    (payload: InferencePayload) => {
      const ts = new Date().toLocaleTimeString();

      if (payload.type === "error") {
        appendLog(
          `[${ts}] ERROR: ${payload.message ?? "Unknown backend error"}`,
        );
        return;
      }

      if (payload.type !== "inference") {
        return;
      }

      // Resolve the dominant action label across persons
      const resolveLabel = (): string => {
        if (payload.persons && payload.persons.length > 0) {
          return payload.persons.reduce(
            (best, p) =>
              (p.action?.confidence ?? 0) > (best.confidence ?? 0)
                ? {
                    label: p.action?.label ?? "Unknown",
                    confidence: p.action?.confidence ?? 0,
                  }
                : best,
            { label: "Unknown", confidence: 0 } as {
              label: string;
              confidence: number;
            },
          ).label;
        }
        return payload.action?.label ?? "Unknown";
      };

      const label = resolveLabel();
      const confidence =
        typeof payload.action?.confidence === "number"
          ? `${(payload.action.confidence * 100).toFixed(1)}%`
          : "n/a";
      const detection = payload.detection ? "person" : "none";

      setLatestAction(`${label} (${confidence})`);
      setFrameCount((c) => c + 1);
      if (payload.detection) setDetectionCount((c) => c + 1);

      appendLog(
        `[${ts}] frame=${payload.frame_index ?? "-"} detection=${detection} action=${label} conf=${confidence} latency=${payload.timing_ms ?? "-"}ms`,
      );

      const frameNumber =
        typeof payload.frame_index === "number"
          ? payload.frame_index
          : frameCountRef.current + 1;
      if (sessionStartMsRef.current === null) {
        sessionStartMsRef.current = performance.now();
      }
      lastInferenceMsRef.current = performance.now();
      lastFrameIndexRef.current = frameNumber;
      if (payload.persons && payload.persons.length > 0) {
        const elapsedSeconds =
          (performance.now() - (sessionStartMsRef.current ?? 0)) / 1000;
        const timestamp = formatTimestamp(elapsedSeconds);
        payload.persons.forEach((person) => {
          detectionsRef.current.push({
            frame_number: frameNumber,
            action_label: person.action?.label ?? "Unknown",
            confidence: person.action?.confidence ?? 0,
            person_id: person.person_id ?? 0,
            timestamp,
            all_scores: person.all_scores ?? undefined,
          });
        });
      }

      // ── Consecutive waving detection ─────────────────────────────────────
      const isWaving = label.toLowerCase().includes("wav");

      if (isWaving) {
        consecutiveWaveRef.current += 1;

        if (consecutiveWaveRef.current === WAVE_THRESHOLD) {
          const alertTs = new Date().toLocaleTimeString();
          const newId = ++toastIdRef.current;

          setWaveToasts((prev) => [...prev, { id: newId, timestamp: alertTs }]);

          setWaveAlertLogs((prev) => [
            `[${alertTs}] ⚠ WAVING ALERT — ${WAVE_THRESHOLD} consecutive frames`,
            ...prev,
          ]);
        }
      } else {
        consecutiveWaveRef.current = 0;
      }
    },
    [appendLog],
  );

  // ─── Recording complete → upload → analyze → save to history ─────────────

  const saveRealtimeSession = useCallback(
    async (
      annotated: { blob: Blob; mime: string },
      source: { blob: Blob; mime: string } | null,
    ) => {
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;

      setSaveState({
        status: "uploading",
        message: "Uploading session…",
      });

      const abortCtrl = new AbortController();
      saveAbortRef.current = abortCtrl;

      try {
        const annotatedExt = mimeToExtension(annotated.mime);
        const annotatedName = `session_${Date.now()}${annotatedExt}`;
        const formData = new FormData();
        formData.append(
          "annotated",
          new File([annotated.blob], annotatedName, { type: annotated.mime }),
        );

        if (source) {
          const sourceExt = mimeToExtension(source.mime);
          const sourceName = `source_${Date.now()}${sourceExt}`;
          formData.append(
            "source",
            new File([source.blob], sourceName, { type: source.mime }),
          );
        }

        const uploadRes = await fetch(
          `${apiBaseUrl}/api/upload-realtime-session`,
          {
            method: "POST",
            body: formData,
            signal: abortCtrl.signal,
          },
        );
        if (!uploadRes.ok) {
          const detail = await uploadRes.json().catch(() => ({}));
          throw new Error(
            (detail as { detail?: string }).detail ?? "Upload failed.",
          );
        }
        const uploadResult = (await uploadRes.json()) as {
          annotated_filename: string;
          source_filename?: string | null;
        };

        const totalFrames = Math.max(
          frameCountRef.current,
          lastFrameIndexRef.current,
        );
        const startMs = sessionStartMsRef.current;
        const endMs = lastInferenceMsRef.current;
        const lastFrame = lastFrameIndexRef.current;
        const elapsedSeconds =
          startMs != null && endMs != null && endMs > startMs
            ? (endMs - startMs) / 1000
            : 0;
        const derivedFps =
          elapsedSeconds > 0 && lastFrame > 0 ? lastFrame / elapsedSeconds : 0;
        const sessionFps =
          Number.isFinite(derivedFps) && derivedFps > 1
            ? Math.round(derivedFps * 100) / 100
            : 15;

        const detections = detectionsRef.current.map((entry) => ({
          ...entry,
          timestamp: formatTimestamp(
            Math.max(0, entry.frame_number - 1) / sessionFps,
          ),
        }));
        const analysisRes = await fetch(`${apiBaseUrl}/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            detections_log: detections,
            total_frames: totalFrames,
          }),
          signal: abortCtrl.signal,
        });
        const analysisSummary = analysisRes.ok
          ? await analysisRes.json()
          : emptyAnalysisSummary();

        setSaveState({ status: "saving" });

        const currentLogs = logsRef.current;
        const currentAlerts = waveAlertLogsRef.current;
        const currentFrames = frameCountRef.current;

        const summary = buildSessionSummary(
          currentLogs,
          currentAlerts.length,
          currentFrames,
        );

        const histRes = await fetch(`${apiBaseUrl}/api/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            annotatedFilename: uploadResult.annotated_filename,
            sourceFilename: uploadResult.source_filename ?? undefined,
            summary,
            filename: `Live Session ${new Date().toLocaleString()}`,
            analysis: {
              fps: sessionFps,
              analysis_summary: analysisSummary,
              realtimeLogs: currentLogs,
              waveAlertLogs: currentAlerts,
              framesProcessed: currentFrames,
              source: "realtime",
            },
          }),
          signal: abortCtrl.signal,
        });

        if (!histRes.ok) {
          throw new Error("Failed to save to history.");
        }

        const histEntry = (await histRes.json()) as { id: string };
        setSaveState({ status: "done", historyId: histEntry.id });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSaveState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [],
  );

  const tryFinalizeSave = useCallback(() => {
    const annotated = annotatedCaptureRef.current;
    const source = sourceCaptureRef.current;
    if (!annotated || !source) return;
    annotatedCaptureRef.current = null;
    sourceCaptureRef.current = null;
    saveRealtimeSession(annotated, source);
  }, [saveRealtimeSession]);

  const handleRecordingComplete = useCallback(
    (blob: Blob, mimeType: string) => {
      annotatedCaptureRef.current = { blob, mime: mimeType };
      tryFinalizeSave();
    },
    [tryFinalizeSave],
  );

  const handleSourceRecordingComplete = useCallback(
    (blob: Blob, mimeType: string) => {
      sourceCaptureRef.current = { blob, mime: mimeType };
      tryFinalizeSave();
    },
    [tryFinalizeSave],
  );

  // When camera becomes active, reset save state and logs
  const handleSetCameraActive = useCallback((active: boolean) => {
    if (active) {
      setSaveState({ status: "idle" });
      setLogs([]);
      setWaveAlertLogs([]);
      setFrameCount(0);
      setDetectionCount(0);
      setLatestAction(null);
      consecutiveWaveRef.current = 0;
      detectionsRef.current = [];
      sessionStartMsRef.current = null;
      lastInferenceMsRef.current = null;
      lastFrameIndexRef.current = 0;
      annotatedCaptureRef.current = null;
      sourceCaptureRef.current = null;
      saveInFlightRef.current = false;
    }
    setIsCameraActive(active);
  }, []);

  const dismissSaveState = useCallback(() => {
    saveAbortRef.current?.abort();
    setSaveState({ status: "idle" });
  }, []);

  // ─── Save status banner ───────────────────────────────────────────────────

  const renderSaveBanner = () => {
    if (saveState.status === "idle") return null;

    if (saveState.status === "done") {
      return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 shadow-lg min-w-[320px]">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Session saved!
            </p>
            <p className="text-xs text-emerald-700">
              Annotated video and logs saved to history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-xs h-7 px-2"
              onClick={() =>
                navigate(`/library?history=${saveState.historyId}`)
              }
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Open
            </Button>
            <button
              onClick={dismissSaveState}
              className="rounded p-0.5 text-emerald-500 hover:bg-emerald-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );
    }

    if (saveState.status === "error") {
      return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-3 shadow-lg min-w-[320px] max-w-md">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900">Save failed</p>
            <p className="text-xs text-red-700 truncate">{saveState.message}</p>
          </div>
          <button
            onClick={dismissSaveState}
            className="rounded p-0.5 text-red-400 hover:bg-red-100 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }

    const isSaving = saveState.status === "saving";
    const message =
      saveState.status === "uploading"
        ? saveState.message
        : "Saving to history…";

    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 shadow-lg min-w-[320px]">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50">
            {isSaving ? (
              <Save className="h-4 w-4 text-blue-500 animate-pulse" />
            ) : (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              {saveState.status === "uploading"
                ? "Uploading session…"
                : "Saving to history…"}
            </p>
            <p className="text-xs text-slate-500 truncate">{message}</p>
          </div>
          <button
            onClick={dismissSaveState}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 shrink-0"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: isSaving ? "100%" : "45%" }}
          />
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* ── Waving Alert Toasts ─────────────────────────────────────────── */}
        <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
          {waveToasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg shadow-amber-100 animate-in slide-in-from-right-8 duration-300 min-w-[280px] max-w-sm"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  Waving Alert Detected
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  {WAVE_THRESHOLD} consecutive waving frames at{" "}
                  {toast.timestamp}
                </p>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="mt-0.5 shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* ── Save status banner ───────────────────────────────────────────── */}
        {renderSaveBanner()}

        {/* Main Section: Config | Video | Logs */}
        <div className="flex flex-1 min-h-0 w-full">
          {/* 1. Config Panel (25%) */}
          <div className="w-1/4 h-full border-r border-gray-200 overflow-auto">
            <Config className="h-full" />
          </div>

          {/* 2. Video Panel (50%) */}
          <div className="bg-white flex flex-col w-1/2 p-3">
            <div className="flex items-center justify-between mb-2">
              <TitleMono text="Real-Time Inference" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-[#344054]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connectionState === "connected"
                        ? "bg-emerald-500"
                        : connectionState === "connecting"
                          ? "bg-amber-500"
                          : "bg-zinc-500"
                    }`}
                  />
                  Socket: {connectionState}
                </div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-[#344054] max-w-[200px] truncate">
                  {cameraLabel}
                </div>
              </div>
            </div>
            <div className="h-full flex flex-col overflow-hidden">
              <RealTimeVideo
                isCameraActive={isCameraActive}
                setIsCameraActive={handleSetCameraActive}
                onInference={handleInference}
                onConnectionStateChange={setConnectionState}
                onCameraLabelChange={setCameraLabel}
                onRecordingComplete={handleRecordingComplete}
                onSourceRecordingComplete={handleSourceRecordingComplete}
              />
            </div>
          </div>

          {/* 3. Logs Panel (25%) */}
          <div className="w-1/4 h-full border-l border-gray-200 overflow-hidden flex flex-col">
            {/* Panel header */}
            <div className="p-3 border-b border-gray-200 bg-white shrink-0">
              <TitleMono text="Inference Logs" />
            </div>

            {/* Live stats */}
            <div className="border-b border-gray-200 bg-[#F7FAFF] p-3 shrink-0 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase text-[#667085]">
                  Latest Action
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#334155] truncate">
                  {latestAction ?? (
                    <span className="text-[#94a3b8] font-normal">Waiting…</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-[#667085]">
                  Status
                </div>
                <div className="mt-0.5">
                  {isCameraActive ? (
                    <Badge
                      variant={"link"}
                      className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 px-1.5 py-0"
                    >
                      Live
                    </Badge>
                  ) : (
                    <Badge
                      variant={"destructive"}
                      className="text-[10px] bg-red-500 text-white border-gray-200 px-1.5 py-0"
                    >
                      Idle
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-[#667085]">
                  Frames
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#334155]">
                  {frameCount.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-[#667085]">
                  Detections
                </div>
                <div className="mt-0.5 text-xs font-bold text-[#334155]">
                  {detectionCount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Save status (compact, inside logs panel) */}
            {saveState.status !== "idle" &&
              saveState.status !== "done" &&
              saveState.status !== "error" && (
                <div className="border-b border-gray-200 bg-blue-50 px-3 py-2 shrink-0 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                  <span className="text-[10px] text-blue-700 truncate">
                    {saveState.status === "uploading"
                      ? "Uploading…"
                      : "Saving…"}
                  </span>
                </div>
              )}
            {saveState.status === "done" && (
              <div className="border-b border-gray-200 bg-emerald-50 px-3 py-2 shrink-0 flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                <span className="text-[10px] text-emerald-700 flex-1">
                  Saved to history
                </span>
                <button
                  className="text-[10px] text-emerald-600 underline"
                  onClick={() =>
                    navigate(`/library?history=${saveState.historyId}`)
                  }
                >
                  Open
                </button>
              </div>
            )}

            {/* Waving Alerts Accordion */}
            {waveAlertLogs.length > 0 && (
              <div className="border-b border-gray-200 shrink-0">
                <button
                  onClick={() => setIsAlertsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-800">
                      Waving Alerts
                    </span>
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                      {waveAlertLogs.length}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-amber-600 transition-transform ${isAlertsExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isAlertsExpanded && (
                  <div className="max-h-36 overflow-y-auto bg-amber-50 px-3 pb-2 space-y-1">
                    {waveAlertLogs.map((line, i) => (
                      <div
                        key={i}
                        className="rounded border border-amber-200 bg-white px-2 py-1 font-mono text-[10px] text-amber-800"
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Log scroll area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {logs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#CBD5E1] p-3 text-xs text-[#64748B]">
                  Frame-level inference logs will appear here once the camera
                  starts receiving responses.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((line, index) => {
                    const isAlert = line.includes("⚠ WAVING ALERT");
                    return (
                      <div
                        key={`${line}-${index}`}
                        className={`rounded-md border px-2 py-1.5 font-mono text-[10px] leading-relaxed ${
                          isAlert
                            ? "border-amber-300 bg-amber-50 text-amber-800 font-semibold"
                            : "border-[#E2E8F0] bg-white text-[#334155]"
                        }`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RealTime;
