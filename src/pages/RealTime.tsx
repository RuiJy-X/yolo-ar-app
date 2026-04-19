import Header from "@/components/Header";
import AppLayout from "@/applayout";
import { Badge } from "@/components/ui/badge";
import RealTimeVideo, {
  type InferencePayload,
} from "@/components/realtime-video";
import { useCallback, useState } from "react";

const RealTime = () => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [latestAction, setLatestAction] = useState("Waiting for frames...");

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
      appendLog(
        `[${ts}] frame=${payload.frame_index ?? "-"} detection=${detection} action=${label} conf=${confidence} latency=${payload.timing_ms ?? "-"}ms`,
      );
    },
    [appendLog],
  );

  return (
    <AppLayout>
      <div className="flex w-full items-start justify-between gap-4">
        <Header
          title="Real Time Inference"
          description="Use our pipine in real time by using any capturing device below."
          className="flex-1"
        />
        <div className="flex h-full items-center justify-center self-center px-4 py-2">
          <Badge variant={`${isCameraActive ? "success" : "destructive"}`}>
            {isCameraActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Video and logs */}
      <div className="content-stretch w-full flex flex-grow gap-2 h-[610px] items-stretch">
        {/* Video container */}
        <RealTimeVideo
          isCameraActive={isCameraActive}
          setIsCameraActive={setIsCameraActive}
          onInference={handleInference}
        />
        {/* Log container */}
        <div className="content-stretch border border-[#E3E3E3] rounded-lg w-[340px] h-full overflow-hidden">
          <div className="p-[16px] flex font-heading font-bold text-[#3C4A6A] bg-[#BED5FB] text-[14px] tracking-[3%] uppercase">
            Inference Logs
          </div>
          <div className="border-b border-[#E3E3E3] bg-[#F7FAFF] p-4">
            <div className="text-xs font-semibold uppercase text-[#667085]">
              Latest Action
            </div>
            <div className="mt-1 text-sm font-bold text-[#334155]">
              {latestAction}
            </div>
          </div>
          <div className="h-[calc(100%-108px)] overflow-y-auto p-3">
            {logs.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#CBD5E1] p-3 text-xs text-[#64748B]">
                Frame-level inference logs will appear here once the socket
                starts receiving responses.
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 font-mono text-[11px] text-[#334155]"
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default RealTime;
