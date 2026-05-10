import AppLayout from "@/applayout";
import { Badge } from "@/components/ui/badge";
import RealTimeVideo, {
  type InferencePayload,
} from "@/components/realtime-video";
import Config from "./library/config";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";

// ─── Waving Toast ─────────────────────────────────────────────────────────────

type WaveToast = {
  id: number;
  timestamp: string;
};

const WAVE_THRESHOLD = 32; // consecutive frames required

// ─── Component ────────────────────────────────────────────────────────────────

const RealTime = () => {
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
          // Pick the label with highest confidence across all tracked persons
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

      // ── Consecutive waving detection ────────────────────────────────────
      const isWaving = label.toLowerCase().includes("wav");

      if (isWaving) {
        consecutiveWaveRef.current += 1;

        if (consecutiveWaveRef.current === WAVE_THRESHOLD) {
          const alertTs = new Date().toLocaleTimeString();
          const newId = ++toastIdRef.current;

          setWaveToasts((prev) => [...prev, { id: newId, timestamp: alertTs }]);

          // Store in dedicated alert log instead of general log
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

        {/* Main Section: Config | Video | Logs */}
        <div className="flex flex-1 min-h-0 w-full">
          {/* 1. Config Panel (25%) */}
          <div className="w-1/4 h-full border-r border-gray-200 overflow-auto">
            <Config className="h-full" />
          </div>

          {/* 2. Video Panel (50%) */}
          <div className="bg-white flex flex-col w-1/2 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold tracking-tight text-[#344054]">
                Real-Time Inference
              </div>
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
                setIsCameraActive={setIsCameraActive}
                onInference={handleInference}
                onConnectionStateChange={setConnectionState}
                onCameraLabelChange={setCameraLabel}
              />
            </div>
          </div>

          {/* 3. Logs Panel (25%) */}
          <div className="w-1/4 h-full border-l border-gray-200 overflow-hidden flex flex-col">
            {/* Panel header */}
            <div className="p-3 border-b border-gray-200 bg-white shrink-0">
              <div className="text-xs font-semibold uppercase text-[#344054]">
                Inference Logs
              </div>
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
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 px-1.5 py-0">
                      Live
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] bg-gray-100 text-gray-500 border-gray-200 px-1.5 py-0">
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