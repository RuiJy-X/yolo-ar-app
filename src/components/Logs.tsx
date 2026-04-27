import { Activity, AlertTriangle, ChevronDown, User } from "lucide-react";
import type { AnalyzeVideoResponse, AlertEvent } from "@/lib/types";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  medium: "bg-blue-50 text-blue-800 border-blue-200",
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
};

function AlertCard({
  alert,
  onSeekToFrame,
}: {
  alert: AlertEvent;
  onSeekToFrame: (frame: number) => void;
}) {
  const runLength = alert.end_frame - alert.start_frame + 1;
  const severity = alert.severity_level.toLowerCase();

  return (
    <button
      type="button"
      onClick={() => onSeekToFrame(alert.start_frame)}
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-red-400/60"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-black/90 font-heading">
          Frames {alert.start_frame} – {alert.end_frame}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
            SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium
          }`}
        >
          {alert.severity_level}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-black/50">
        <span
          className={`inline-block size-1.5 rounded-full ${
            SEVERITY_DOT[severity] ?? SEVERITY_DOT.medium
          }`}
        />
        <User className="size-3" />
        Person {alert.person_id}
        <span className="mx-1">·</span>
        {runLength} frames
      </div>
    </button>
  );
}

const Logs = ({ analysis, onSeekToFrame }: LogsProps) => {
  if (!analysis) {
    return (
      <aside className="w-full rounded-xl border border-slate-400 bg-white p-4 text-slate-100 xl:w-[390px]">
        <div className="text-sm font-semibold uppercase tracking-wide text-[#344054] flex items-center gap-2">
          <Activity className="size-4" />
          Detections
        </div>
        <p className="mt-4 text-sm text-[#344054]/80">
          Run the analysis to view grouped action logs.
        </p>
      </aside>
    );
  }

  const groupedActions = Object.entries(analysis.grouped_detections).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const alerts = analysis.alert_events ?? [];

  return (
    <aside className="w-full rounded-xl border border-[#D6E4FF] bg-white text-slate-100 shadow-sm xl:w-[390px]">
      <div className="flex items-center gap-2 p-3 text-sm font-semibold uppercase tracking-wide text-[#344054] font-heading border-b border-[#D6E4FF]">
        <Activity className="size-4" />
        Detections
      </div>

      <div className="divide-y divide-[#D6E4FF]">
        {/* ── Alerts accordion ── */}
        {alerts.length > 0 && (
          <details className="group" open>
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
              <span className="flex items-center gap-2 font-semibold font-heading text-black/80">
                <AlertTriangle className="size-4 text-red-500" />
                Alerts
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-600">
                <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-800">
                  {alerts.length} {alerts.length === 1 ? "event" : "events"}
                </span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
              {alerts.map((alert) => (
                <AlertCard
                  key={`alert-${alert.person_id}-${alert.start_frame}`}
                  alert={alert}
                  onSeekToFrame={onSeekToFrame}
                />
              ))}
            </div>
          </details>
        )}

        {/* ── Action detection accordions ── */}
        {groupedActions.map(([action, entries]) => (
          <details key={action} className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
              <span className="font-semibold font-heading text-black/70">
                {action}
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-600">
                {entries.length} frames
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
              {entries.map((entry) => (
                <button
                  key={`${action}-${entry.person_id}-${entry.frame_number}`}
                  type="button"
                  onClick={() => onSeekToFrame(entry.frame_number)}
                  className="w-full rounded-md border border-blue-500/30 bg-white px-3 py-2 text-left transition hover:border-blue-500/60"
                >
                  <div className="flex items-center justify-between text-xs text-black/60">
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5" /> P{entry.person_id}
                    </span>
                    <span className="font-mono text-black/70">
                      {entry.timestamp}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-black/90 font-heading">
                      Frame {entry.frame_number}
                    </span>
                    <span className="text-sm font-semibold text-blue-600">
                      {(entry.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </details>
        ))}
      </div>
    </aside>
  );
};

export default Logs;
