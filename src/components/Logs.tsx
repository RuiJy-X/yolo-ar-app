import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  ShieldCheck,
  User,
} from "lucide-react";
import type { AnalyzeVideoResponse, Detection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
};

const asPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const getAlertForDetection = (
  detection: Detection,
  alerts: AnalyzeVideoResponse["alert_events"],
) => {
  return alerts.find(
    (alert) =>
      alert.person_id === detection.person_id &&
      detection.frame_number >= alert.start_frame &&
      detection.frame_number <= alert.end_frame,
  );
};

const Logs = ({ analysis, onSeekToFrame }: LogsProps) => {
  if (!analysis) {
    return (
      <aside className="w-full rounded-xl border border-slate-400 bg-white p-4 text-slate-100 xl:w-[390px]">
        <div className="text-sm font-semibold uppercase tracking-wide text-[#344054] flex items-center gap-2">
          <Activity className="size-4" />
          Detections
        </div>
        <div>
          <p className="mt-4 text-sm text-[#344054]/80">
            Run the analysis to view summary </p>
        </div>
      </aside>
    );
  }

  const metric = analysis.summary_metrics;
  const actionScores = Object.entries(analysis.action_confidence_scores).sort(
    (a, b) => b[1] - a[1],
  );
  const groupedActions = Object.entries(analysis.grouped_detections).sort(
    (a, b) => b[1].length - a[1].length,
  );
  const activeAlerts = analysis.alert_events.length;

  return (
    <aside className="w-full rounded-xl border border-[#D6E4FF] shadow-sm bg-white p-4 text-slate-100 xl:w-[390px]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold uppercase tracking-wide text-[#344054] flex items-center gap-2">
          Detections
        </div>
        
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="rounded-lg border border-slate-700 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[#344054] font-semibold">
            <ShieldCheck className="size-4 text-blue-900" />
            InfoGCN accuracy
          </div>
          <div className="text-lg font-bold text-black">
            {asPercent(metric.infogcn_accuracy)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-700 bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[#344054] font-semibold">
            <Activity className="size-4 text-blue-900" />
            Yolo Metrics
          </div>
          <div className="text-sm font-bold text-black flex gap-4 justify-around">
            <div className="flex flex-col text-lg">
              {asPercent(metric.yolo_precision)}
              <p className="text-gray-600 text-xs">Precision</p>

            </div>
            <div className="flex flex-col text-lg">
              {asPercent(metric.yolo_recall)}
              <p className="text-gray-600 text-xs">Recall</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-red-500/35 bg-red-500/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-red-900 font-semibold">
            <AlertTriangle className="size-4" />
            Active Alerts
          </div>
          <div className="text-lg font-bold text-foreground">{activeAlerts}</div>
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
            <Clock className="size-4 text-blue-400" />
            Action Confidence
          </div>
          <div className="space-y-1 text-xs text-slate-200">
            {actionScores.slice(0, 3).map(([action, score]) => (
              <div key={action} className="flex items-center justify-between">
                <span>{action}</span>
                <span className="font-semibold">{asPercent(score)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/55">
        <div className="border-b border-slate-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
          Grouped Detection Log
        </div>

        <div className="max-h-[430px] divide-y divide-slate-800 overflow-y-auto">
          {groupedActions.map(([action, entries]) => (
            <details key={action} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-800/60">
                <span className="font-semibold text-blue-300">{action}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {entries.length} frames
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>

              <div className="space-y-2 px-3 pb-3">
                {entries.map((entry) => {
                  const alert = getAlertForDetection(entry, analysis.alert_events);
                  const isAlert = Boolean(alert);

                  return (
                    <button
                      key={`${action}-${entry.person_id}-${entry.frame_number}`}
                      type="button"
                      onClick={() => onSeekToFrame(entry.frame_number)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition ${
                        isAlert
                          ? "border-red-500 bg-red-950/35 shadow-[0_0_16px_rgba(239,68,68,0.35)]"
                          : "border-blue-500/30 bg-slate-900/80 hover:border-blue-500/60"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <User className="size-3.5" /> P{entry.person_id}
                        </span>
                        <span className="font-mono">{entry.timestamp}</span>
                      </div>

                      <div className="mt-1 flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-100">
                          Frame {entry.frame_number}
                        </div>
                        <Badge
                          variant={isAlert ? "destructive" : "outline"}
                          className={
                            isAlert
                              ? "border-red-400/60 bg-red-500/25 text-red-100"
                              : "border-blue-500/45 text-blue-300"
                          }
                        >
                          {isAlert ? (
                            <>
                              <AlertTriangle className="mr-1 size-3.5" /> High Priority
                            </>
                          ) : (
                            `${asPercent(entry.confidence)}`
                          )}
                        </Badge>
                      </div>

                      {alert && (
                        <div className="mt-1 text-xs text-red-200">
                          Distress Alert: {alert.start_frame}-{alert.end_frame} (
                          {alert.severity_level})
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Logs;