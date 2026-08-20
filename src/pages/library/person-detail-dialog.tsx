import React, { useMemo } from "react";
import type { Detection } from "@/lib/types";
import { getActionColor, getActionBg, getActionText } from "@/pages/library/action-colors";
import { ActionPieChart } from "@/components/Logs";
import {
  X,
  User,
  Clock,
  Activity,
  BarChart3,
  Calendar,
  Layers,
  ChevronRight,
  Sparkles,
  PieChart,
} from "lucide-react";

type PersonDetailDialogProps = {
  isOpen: boolean;
  personId: number | null;
  currentFrameNumber: number;
  personDetections: Detection[];
  onClose: () => void;
  onSeekToFrame: (frame: number) => void;
};

type ActionEpisode = {
  action: string;
  startFrame: number;
  endFrame: number;
  startTimestamp: string;
  endTimestamp: string;
  frameCount: number;
  avgConfidence: number;
};

const collapseDetectionsToEpisodes = (
  detections: Detection[],
  maxGap = 5,
): ActionEpisode[] => {
  if (detections.length === 0) return [];
  const sorted = [...detections].sort((a, b) => a.frame_number - b.frame_number);

  const episodes: ActionEpisode[] = [];
  let currentAction = sorted[0].action_label;
  let startFrame = sorted[0].frame_number;
  let endFrame = sorted[0].frame_number;
  let startTs = sorted[0].timestamp;
  let endTs = sorted[0].timestamp;
  let confidences = [sorted[0].confidence];

  const flush = () => {
    episodes.push({
      action: currentAction,
      startFrame,
      endFrame,
      startTimestamp: startTs,
      endTimestamp: endTs,
      frameCount: endFrame - startFrame + 1,
      avgConfidence:
        confidences.reduce((a, b) => a + b, 0) / confidences.length,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const isSameAction = cur.action_label.toLowerCase() === currentAction.toLowerCase();
    const isWithinGap = cur.frame_number - endFrame <= maxGap;

    if (isSameAction && isWithinGap) {
      endFrame = cur.frame_number;
      endTs = cur.timestamp;
      confidences.push(cur.confidence);
    } else {
      flush();
      currentAction = cur.action_label;
      startFrame = cur.frame_number;
      endFrame = cur.frame_number;
      startTs = cur.timestamp;
      endTs = cur.timestamp;
      confidences = [cur.confidence];
    }
  }
  flush();
  return episodes;
};

export const PersonDetailDialog: React.FC<PersonDetailDialogProps> = ({
  isOpen,
  personId,
  currentFrameNumber,
  personDetections,
  onClose,
  onSeekToFrame,
}) => {
  if (!isOpen || personId === null) return null;

  // Find detection at current frame (if present)
  const currentDetection = useMemo(() => {
    return (
      personDetections.find((d) => d.frame_number === currentFrameNumber) ?? null
    );
  }, [personDetections, currentFrameNumber]);

  // Chronological episodes across video
  const episodes = useMemo(() => {
    return collapseDetectionsToEpisodes(personDetections);
  }, [personDetections]);

  // Overall action distribution across all frames for this person
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of personDetections) {
      counts[d.action_label] = (counts[d.action_label] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [personDetections]);

  const totalFrames = personDetections.length;
  const topActionOverall = actionCounts[0]?.[0] ?? "Unknown";

  const firstDetection = personDetections[0];
  const lastDetection = personDetections[personDetections.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* ── Dialog Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0052ff] border border-blue-100/80 shadow-xs">
              <User className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Person ID #{personId}
                </h3>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  {totalFrames} frames tracked
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Primary Action: <span className="font-semibold text-slate-700">{topActionOverall}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Dialog Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Current Frame Snapshot */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Current Frame Snapshot (Frame #{currentFrameNumber})
                </span>
              </div>
              {currentDetection && (
                <span className="font-mono text-xs text-slate-500">
                  {currentDetection.timestamp}
                </span>
              )}
            </div>

            {currentDetection ? (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white border border-slate-200/70 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Top Action
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: getActionColor(currentDetection.action_label) }}
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {currentDetection.action_label}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-200/70 p-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Confidence
                    </span>
                    <div className="mt-1 text-sm font-bold text-slate-900 font-mono">
                      {(currentDetection.confidence * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="rounded-lg bg-white border border-slate-200/70 p-3 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Bounding Box
                    </span>
                    <div className="mt-1 text-xs font-mono text-slate-700 truncate">
                      {currentDetection.bbox
                        ? `[${currentDetection.bbox.map((v) => Math.round(v)).join(", ")}]`
                        : "Available"}
                    </div>
                  </div>
                </div>

                {/* Current frame probability distribution */}
                {currentDetection.all_scores && Object.keys(currentDetection.all_scores).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <BarChart3 size={13} /> Action Probabilities
                    </span>
                    <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200/70">
                      {Object.entries(currentDetection.all_scores)
                        .sort(([, a], [, b]) => b - a)
                        .map(([act, score]) => {
                          const pct = Math.round(score * 100);
                          const color = getActionColor(act);
                          const isTop = act.toLowerCase() === currentDetection.action_label.toLowerCase();
                          return (
                            <div key={act} className="flex items-center gap-3">
                              <span
                                className={`w-20 text-xs font-medium truncate ${
                                  isTop ? "font-bold text-slate-900" : "text-slate-500"
                                }`}
                              >
                                {act}
                              </span>
                              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${pct}%`,
                                    background: isTop ? color : "#cbd5e1",
                                  }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs font-mono text-slate-600">
                                {pct}%
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50/80 border border-amber-200/70 p-3 text-xs text-amber-900">
                Person #{personId} is not detected at frame #{currentFrameNumber}.
                {firstDetection && lastDetection && (
                  <span className="block mt-1 text-amber-700">
                    Active range: Frame #{firstDetection.frame_number} ({firstDetection.timestamp}) → Frame #{lastDetection.frame_number} ({lastDetection.timestamp}).
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Session Action Distribution Pie Chart */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <PieChart size={14} className="text-slate-500" />
              Overall Action Distribution for Person #{personId}
            </h4>
            <ActionPieChart
              data={actionCounts.map(([action, count]) => ({ action, count }))}
              size={140}
              donut={true}
            />
          </div>

          {/* Section 3: Chronological Action History Timeline */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Activity size={14} className="text-slate-500" />
                Action History Timeline
              </h4>
              <span className="text-[11px] text-slate-400">
                {episodes.length} episode{episodes.length !== 1 ? "s" : ""} · Click row to seek
              </span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
              {episodes.map((ep, idx) => {
                const color = getActionColor(ep.action);
                const bg = getActionBg(ep.action);
                const text = getActionText(ep.action);
                const isCurrent =
                  currentFrameNumber >= ep.startFrame && currentFrameNumber <= ep.endFrame;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSeekToFrame(ep.startFrame);
                      onClose();
                    }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors ${
                      isCurrent ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0"
                        style={{ background: bg, color: text }}
                      >
                        {ep.action}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-slate-800">
                          {ep.startTimestamp} – {ep.endTimestamp}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Frames {ep.startFrame}–{ep.endFrame} ({ep.frameCount} frames)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {Math.round(ep.avgConfidence * 100)}% avg
                      </span>
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Dialog Footer ── */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonDetailDialog;
