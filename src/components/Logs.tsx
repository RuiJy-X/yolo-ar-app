import { Activity, ChevronDown, User } from "lucide-react";
import type { AnalyzeVideoResponse } from "@/lib/types";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
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
            Run the analysis to view grouped action logs.
          </p>
        </div>
      </aside>
    );
  }

  const groupedActions = Object.entries(analysis.grouped_detections).sort(
    (a, b) => b[1].length - a[1].length,
  );

  return (
    <aside className="w-full rounded-xl border border-[#D6E4FF] bg-white text-slate-100 shadow-sm xl:w-[390px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#344054] font-heading p-3">
          Detections
        </div>
      </div>

      <div className="mt-1 overflow-hidden border border-[#D6E4FF]  ">
        <div className="h-full divide-y divide-slate-800 overflow-y-auto">
          {groupedActions.map(([action, entries]) => (
            <details key={action} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-800/60">
                <span className="font-semibold font-heading text-black/70">
                  {action}
                </span>
                <span className="flex items-center gap-2 text-xs text-gray-600">
                  {entries.length} frames
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>

              <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
                {entries.map((entry) => {
                  return (
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
                        <div className="text-sm font-semibold text-black/90 font-heading">
                          Frame {entry.frame_number}
                        </div>
                        <span className="text-sm font-semibold text-blue-600">
                          {(entry.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
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
