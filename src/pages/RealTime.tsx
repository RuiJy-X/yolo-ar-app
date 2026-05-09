import AppLayout from "@/applayout";
import { Badge } from "@/components/ui/badge";
import RealTimeVideo, {
  type InferencePayload,
} from "@/components/realtime-video";
import Config from "./library/config";
import { useCallback, useState } from "react";

const RealTime = () => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [latestAction, setLatestAction] = useState<string | null>(null);
  const [detectionCount, setDetectionCount] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  const appendLog = useCallback((line: string) => {
    setLogs((previous) => [line, ...previous].slice(0, 80));
  }, []);

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

      const label = payload.action?.label ?? "Unknown";
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
    },
    [appendLog],
  );

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* Main Section: Config | Video | Logs */}
        <div className="flex flex-1 min-h-0 w-full">
          {/* 1. Config Panel (25%) */}
          <div className="w-1/4 h-full border-r border-gray-200 overflow-auto">
            <Config className="h-full" />
          </div>

          {/* 2. Video Panel (50%) */}
          <div className="bg-white flex flex-col w-1/2 p-3">
            <div>
              <div className="text-sm font-bold tracking-tight text-[#344054] mb-2">
                Real-Time Inference
              </div>
            </div>
            <div className="h-full flex flex-col overflow-hidden">
              <RealTimeVideo
                isCameraActive={isCameraActive}
                setIsCameraActive={setIsCameraActive}
                onInference={handleInference}
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

            {/* Log scroll area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {logs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#CBD5E1] p-3 text-xs text-[#64748B]">
                  Frame-level inference logs will appear here once the camera
                  starts receiving responses.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {logs.map((line, index) => (
                    <div
                      key={`${line}-${index}`}
                      className="rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 font-mono text-[10px] text-[#334155] leading-relaxed"
                    >
                      {line}
                    </div>
                  ))}
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
