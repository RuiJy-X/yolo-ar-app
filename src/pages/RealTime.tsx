import AppLayout from "@/applayout";
import { Badge } from "@/components/ui/badge";
import RealTimeVideo, {
  type InferencePayload,
} from "@/components/realtime-video";
import TelloDronePanel from "@/components/tello-drone-panel";
import { RealTimeLogs } from "@/components/RealTimeLogs";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Plane,
  X,
  Save,
  Loader2,
  CheckCircle2,
  ExternalLink,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TitleMono from "@/components/titile-mono";
import type { Detection } from "@/lib/types";

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";

type WaveToast = {
  id: number;
  timestamp: string;
};

const WAVE_THRESHOLD = 32; // consecutive frames required

type SaveState =
  | { status: "idle" }
  | {
      status: "pending_confirmation";
      annotated: { blob: Blob; mime: string };
      source: { blob: Blob; mime: string } | null;
      isTello?: boolean;
    }
  | { status: "uploading"; message: string }
  | { status: "saving" }
  | { status: "done"; historyId: string }
  | { status: "error"; message: string };

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
  return `Live session ${parts.join("; ")}`;
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

const RealTime = () => {
  const navigate = useNavigate();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [streamSource, setStreamSource] = useState<"webcam" | "tello">(
    "webcam",
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [latestAction, setLatestAction] = useState<string | null>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [cameraLabel, setCameraLabel] = useState<string>("No camera selected");

  const [isAlertsExpanded, setIsAlertsExpanded] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(true);
  const [waveAlertLogs, setWaveAlertLogs] = useState<string[]>([]);

  // Waving alert state
  const [waveToasts, setWaveToasts] = useState<WaveToast[]>([]);
  const consecutiveWaveRef = useRef(0);
  const toastIdRef = useRef(0);

  // Rolling Ring Buffer & Auto-Save Cooldown Lock
  const ringBufferRef = useRef<Array<{ blob: Blob; timestamp: number }>>([]);
  const lastWaveAutoSaveTimeRef = useRef<number>(0);

  const saveWavingClipFromRingBuffer = useCallback(async () => {
    const snapshotFrames = [...ringBufferRef.current];
    if (snapshotFrames.length === 0) return;

    try {
      const firstUrl = URL.createObjectURL(snapshotFrames[0].blob);
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 640;
        canvas.height = img.naturalHeight || 480;
        URL.revokeObjectURL(firstUrl);

        const ctx = canvas.getContext("2d");
        const stream = canvas.captureStream(15);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const videoBlob = new Blob(chunks, { type: mimeType });
          const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
          const annotatedName = `annotated_wave_${timestampStr}.webm`;

          const formData = new FormData();
          formData.append(
            "annotated",
            new File([videoBlob], annotatedName, { type: mimeType }),
          );

          try {
            const uploadRes = await fetch(
              `${apiBaseUrl}/api/upload-realtime-session`,
              {
                method: "POST",
                body: formData,
              },
            );
            if (!uploadRes.ok) return;
            const uploadData = await uploadRes.json();

            const timeTitle = new Date().toLocaleTimeString();
            await fetch(`${apiBaseUrl}/api/history`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                annotatedFilename: uploadData.annotated_filename,
                summary: "Automated Waving Distress Alert Clip",
                filename: `Waving Alert Clip (${timeTitle})`,
                analysis: {
                  fps: 15,
                  source: "realtime",
                  waveAlertLogs: [
                    `[${timeTitle}] WAVING ALERT AUTOMATIC CAPTURE`,
                  ],
                  framesProcessed: snapshotFrames.length,
                },
              }),
            });
          } catch (err) {
            console.error("Auto save waving clip failed:", err);
          }
        };

        recorder.start();
        for (const frameItem of snapshotFrames) {
          await new Promise<void>((resolve) => {
            const frameImg = new Image();
            const frameUrl = URL.createObjectURL(frameItem.blob);
            frameImg.onload = () => {
              ctx?.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
              URL.revokeObjectURL(frameUrl);
              setTimeout(resolve, 66);
            };
            frameImg.onerror = () => {
              URL.revokeObjectURL(frameUrl);
              resolve();
            };
            frameImg.src = frameUrl;
          });
        }
        recorder.stop();
      };
      img.src = firstUrl;
    } catch (e) {
      console.error("Ring buffer clip generation error:", e);
    }
  }, []);

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
  const lastUiUpdateMsRef = useRef<number>(0);

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

      const nowMs = performance.now();
      if (nowMs - lastUiUpdateMsRef.current > 200) {
        lastUiUpdateMsRef.current = nowMs;
        setLatestAction(`${label} (${confidence})`);
        setFrameCount(frameCountRef.current + 1);
        if (payload.detection) setDetectionCount((c) => c + 1);
        appendLog(
          `[${ts}] frame=${payload.frame_index ?? "-"} detection=${detection} action=${label} conf=${confidence} latency=${payload.timing_ms ?? "-"}ms`,
        );
      }

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
        // Canvas stream recording in TelloDronePanel / RealTimeVideo uses 15.0 FPS.
        // Map elapsed time to the exact 15 FPS recorded video frame number (1-indexed).
        const videoFrameNumber = Math.max(
          1,
          Math.round(elapsedSeconds * 15.0) + 1,
        );

        payload.persons.forEach((person) => {
          detectionsRef.current.push({
            frame_number: videoFrameNumber,
            action_label: person.action?.label ?? "Unknown",
            confidence: person.action?.confidence ?? 0,
            person_id: person.person_id ?? 0,
            timestamp,
            all_scores: person.all_scores ?? undefined,
          });
        });
      }

      // Push frame blob to rolling ring buffer (keep last 60 frames ~ 3-4s)
      if (payload.frameBlob) {
        ringBufferRef.current.push({
          blob: payload.frameBlob,
          timestamp: Date.now(),
        });
        if (ringBufferRef.current.length > 60) {
          ringBufferRef.current.shift();
        }
      }

      const isWaving = label.toLowerCase().includes("wav");

      if (isWaving) {
        consecutiveWaveRef.current += 1;

        if (consecutiveWaveRef.current === WAVE_THRESHOLD) {
          const alertTs = new Date().toLocaleTimeString();
          const newId = ++toastIdRef.current;

          setWaveToasts((prev) => [...prev, { id: newId, timestamp: alertTs }]);

          setWaveAlertLogs((prev) => [
            `[${alertTs}] WAVING ALERT ${WAVE_THRESHOLD} consecutive frames`,
            ...prev,
          ]);

          // Check anti-bombardment cooldown lock (15 seconds)
          const now = Date.now();
          const COOLDOWN_MS = 15000;
          if (now - lastWaveAutoSaveTimeRef.current >= COOLDOWN_MS) {
            lastWaveAutoSaveTimeRef.current = now;
            saveWavingClipFromRingBuffer();
          }
        }
      } else {
        consecutiveWaveRef.current = 0;
      }
    },
    [appendLog, saveWavingClipFromRingBuffer],
  );

  const saveRealtimeSession = useCallback(
    async (
      annotated: { blob: Blob; mime: string },
      source: { blob: Blob; mime: string } | null,
    ) => {
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;

      setSaveState({
        status: "uploading",
        message: "Uploading session",
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
        // Canvas recording streams in TelloDronePanel / RealTimeVideo use 15 FPS.
        const sessionFps = 15.0;
        const totalVideoFrames = Math.max(
          1,
          Math.round(elapsedSeconds * sessionFps),
        );

        // Keep exact real-time timestamps and 15 FPS video-aligned frame numbers
        const detections = detectionsRef.current.map((entry) => ({
          ...entry,
        }));
        const analysisRes = await fetch(`${apiBaseUrl}/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            detections_log: detections,
            total_frames: totalVideoFrames,
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
    setSaveState({
      status: "pending_confirmation",
      annotated,
      source,
    });
  }, []);

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

  const handleTelloFlightStarted = useCallback(() => {
    setSaveState({ status: "idle" });
    setLogs([]);
    setWaveAlertLogs([]);
    setFrameCount(0);
    setDetectionCount(0);
    setLatestAction(null);
    consecutiveWaveRef.current = 0;
    detectionsRef.current = [];
    sessionStartMsRef.current = performance.now();
    lastInferenceMsRef.current = null;
    lastFrameIndexRef.current = 0;
    annotatedCaptureRef.current = null;
    sourceCaptureRef.current = null;
    saveInFlightRef.current = false;
  }, []);

  const handleTelloFlightFinished = useCallback(
    (annotatedBlob: Blob, sourceBlob: Blob | null) => {
      setSaveState({
        status: "pending_confirmation",
        annotated: {
          blob: annotatedBlob,
          mime: annotatedBlob.type || "video/webm",
        },
        source: sourceBlob
          ? { blob: sourceBlob, mime: sourceBlob.type || "video/webm" }
          : null,
        isTello: true,
      });
    },
    [],
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

  const renderSaveBanner = () => {
    if (saveState.status === "idle") return null;

    if (saveState.status === "pending_confirmation") {
      const { annotated, source, isTello } = saveState;
      return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur-xl min-w-[360px] max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm ${
                isTello
                  ? "bg-cyan-50 text-cyan-600 border-cyan-100"
                  : "bg-blue-50 text-blue-600 border-blue-100/80"
              }`}
            >
              {isTello ? (
                <Plane className="h-5 w-5" />
              ) : (
                <Save className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">
                {isTello ? "Save Tello Drone Flight?" : "Save Webcam Session?"}
              </h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                {isTello
                  ? "Tello drone flight finished. Do you want to save the recorded video feed and inference logs from this flight to your History library?"
                  : "Camera feed stopped. Do you want to save this recorded video session and inference analysis to your History library?"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 h-8 px-3 rounded-lg font-medium"
              onClick={() => setSaveState({ status: "idle" })}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Discard / Don't Save
            </Button>
            <Button
              size="sm"
              className={`${
                isTello
                  ? "bg-cyan-600 hover:bg-cyan-700"
                  : "bg-blue-600 hover:bg-blue-700"
              } text-white text-xs h-8 px-4 rounded-lg shadow-sm font-medium gap-1.5`}
              onClick={() => saveRealtimeSession(annotated, source)}
            >
              <Save className="h-3.5 w-3.5" />
              Save Video
            </Button>
          </div>
        </div>
      );
    }

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
        : "Saving to history";

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
                ? "Uploading session"
                : "Saving to history"}
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
        {renderSaveBanner()}

        {/* Main Section: Video (Left 70%) | Standalone Logs Sidebar (Right 30%) */}
        <div className="flex flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-slate-200/80 bg-slate-900 shadow-sm">
          {/* Video / Drone surface */}
          <div className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#101215]">
            <div className="absolute inset-0 z-0 overflow-y-auto">
              {streamSource === "tello" ? (
                <div className="w-full h-full p-0">
                  <TelloDronePanel
                    onInference={handleInference}
                    onFlightStarted={handleTelloFlightStarted}
                    onFlightFinished={handleTelloFlightFinished}
                  />
                </div>
              ) : (
                <RealTimeVideo
                  isCameraActive={isCameraActive}
                  setIsCameraActive={handleSetCameraActive}
                  onInference={handleInference}
                  onConnectionStateChange={setConnectionState}
                  onCameraLabelChange={setCameraLabel}
                  onRecordingComplete={handleRecordingComplete}
                  onSourceRecordingComplete={handleSourceRecordingComplete}
                />
              )}
            </div>

            {/* Top Stream Mode Controls Bar */}
            <div className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/40 bg-white/80 px-3.5 py-2 shadow-lg backdrop-blur-xl">
              <TitleMono text="Real-Time Inference" />

              {/* Stream Mode Toggle (Webcam vs Tello Drone) */}
              <div className="flex items-center bg-white/90 p-0.5 rounded-lg border border-slate-200 shadow-sm pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setStreamSource("webcam")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    streamSource === "webcam"
                      ? "bg-slate-900 text-white shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Webcam</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStreamSource("tello")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    streamSource === "tello"
                      ? "bg-cyan-600 text-white shadow"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Plane className="w-3.5 h-3.5" />
                  <span>Tello Drone</span>
                </button>
              </div>

              {streamSource === "webcam" && !isCameraActive && (
                <>
                  <div className="flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-xs text-slate-700">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        connectionState === "connected"
                          ? "bg-emerald-500"
                          : connectionState === "connecting"
                            ? "bg-amber-500"
                            : "bg-zinc-500"
                      }`}
                    />
                    {connectionState}
                  </div>
                  <div className="max-w-[160px] truncate text-xs text-slate-700 font-medium">
                    {cameraLabel}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Standalone Right-Hand RealTimeLogs Sidebar */}
          <div
            className={`${
              isLogsOpen ? "w-80 lg:w-96" : "w-12"
            } h-full transition-[width] duration-200 shrink-0 border-l border-slate-200`}
          >
            <RealTimeLogs
              logs={logs}
              latestAction={latestAction}
              isCameraActive={isCameraActive}
              frameCount={frameCount}
              detectionCount={detectionCount}
              saveState={saveState}
              onSaveSession={saveRealtimeSession}
              onDiscardSession={() => setSaveState({ status: "idle" })}
              waveAlertLogs={waveAlertLogs}
              isAlertsExpanded={isAlertsExpanded}
              onToggleAlerts={() => setIsAlertsExpanded((v) => !v)}
              isCollapsed={!isLogsOpen}
              onToggleCollapse={() => setIsLogsOpen((open) => !open)}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RealTime;
