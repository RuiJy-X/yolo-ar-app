import React, { useState, useMemo } from "react";
import type { AnalyzeVideoResponse, Detection } from "@/lib/types";
import { getActionColor, getActionBg, getActionText } from "@/pages/library/action-colors";
import { ActionPieChart } from "@/components/Logs";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  AlertTriangle,
  Users,
  CheckCircle2,
  PieChart,
  Film,
} from "lucide-react";

type InDepthAnalysisDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  analysis: AnalyzeVideoResponse | null;
  currentFrameNumber: number;
  totalFrames: number;
  seekFps: number;
  onSeekToFrame: (frame: number) => void;
  onFocusPerson: (personId: number) => void;
  onOpenPersonDetails: (personId: number) => void;
  detectionsByFrame: Map<number, Detection[]>;
  detectionsByPerson: Map<number, Detection[]>;
};

export const InDepthAnalysisDialog: React.FC<InDepthAnalysisDialogProps> = ({
  isOpen,
  onClose,
  analysis,
  currentFrameNumber,
  totalFrames,
  seekFps,
  onSeekToFrame,
  onFocusPerson,
  onOpenPersonDetails,
  detectionsByFrame,
  detectionsByPerson,
}) => {
  const [activeTab, setActiveTab] = useState<"frame" | "video">("frame");
  const [selectedFrame, setSelectedFrame] = useState<number>(currentFrameNumber);

  // Sync selected frame when dialog opens or when current frame updates externally
  React.useEffect(() => {
    if (isOpen) {
      setSelectedFrame(currentFrameNumber);
    }
  }, [isOpen, currentFrameNumber]);

  // Detections at the currently selected frame
  const frameDetections = useMemo(() => {
    return detectionsByFrame.get(selectedFrame) ?? [];
  }, [detectionsByFrame, selectedFrame]);

  // Frame action counts and distribution
  const frameActionStats = useMemo(() => {
    const counts: Record<string, { count: number; confidences: number[] }> = {};
    for (const d of frameDetections) {
      if (!counts[d.action_label]) {
        counts[d.action_label] = { count: 0, confidences: [] };
      }
      counts[d.action_label].count += 1;
      counts[d.action_label].confidences.push(d.confidence);
    }
    return Object.entries(counts).map(([action, data]) => ({
      action,
      count: data.count,
      avgConfidence: data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length,
    }));
  }, [frameDetections]);

  // Frame waving detection summary
  const wavingDetections = useMemo(() => {
    return frameDetections.filter((d) => d.action_label.toLowerCase().includes("wav"));
  }, [frameDetections]);

  // Whole video action breakdown
  const wholeVideoActionStats = useMemo(() => {
    if (!analysis?.grouped_detections) return [];
    const stats: Array<{ action: string; count: number; avgConfidence: number }> = [];
    for (const [action, detections] of Object.entries(analysis.grouped_detections)) {
      if (!Array.isArray(detections) || detections.length === 0) continue;
      const avgConf =
        detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / detections.length;
      stats.push({
        action,
        count: detections.length,
        avgConfidence: avgConf,
      });
    }
    return stats.sort((a, b) => b.count - a.count);
  }, [analysis]);

  // Total unique persons across video
  const uniquePersonIds = useMemo(() => {
    return Array.from(detectionsByPerson.keys()).sort((a, b) => a - b);
  }, [detectionsByPerson]);

  const maxFrame = Math.max(1, totalFrames);
  const safeFps = seekFps > 0 ? seekFps : 30;
  const currentTimestamp = `${Math.floor(selectedFrame / safeFps / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((selectedFrame / safeFps) % 60)
    .toString()
    .padStart(2, "0")}.${Math.floor(((selectedFrame / safeFps) % 1) * 1000)
    .toString()
    .padStart(3, "0")}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* ── Dialog Header & Tabs ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0052ff] border border-blue-100/80 shadow-xs">
              <PieChart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Action Distribution & Frame Insights
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect per-frame person detections, action pie charts, and session summaries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab switcher */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab("frame")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "frame"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Film size={13} />
                <span>Frame Details</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("video")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "video"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <PieChart size={13} />
                <span>Whole Video</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Dialog Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "frame" ? (
            /* ════════════════════ TAB 1: FRAME DETAILS ════════════════════ */
            <div className="space-y-6">
              {/* Frame Navigation Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Inspecting Frame:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={selectedFrame <= 1}
                      onClick={() => {
                        const prev = Math.max(1, selectedFrame - 1);
                        setSelectedFrame(prev);
                        onSeekToFrame(prev);
                      }}
                      className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
                      title="Previous frame"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxFrame}
                      value={selectedFrame}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= maxFrame) {
                          setSelectedFrame(val);
                          onSeekToFrame(val);
                        }
                      }}
                      className="w-16 text-center font-mono font-bold text-xs py-1 rounded-md border border-slate-200 bg-white"
                    />
                    <span className="text-xs font-mono text-slate-400">/ {maxFrame}</span>
                    <button
                      type="button"
                      disabled={selectedFrame >= maxFrame}
                      onClick={() => {
                        const next = Math.min(maxFrame, selectedFrame + 1);
                        setSelectedFrame(next);
                        onSeekToFrame(next);
                      }}
                      className="p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40"
                      title="Next frame"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                    Time: <span className="font-bold text-slate-900">{currentTimestamp}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onSeekToFrame(selectedFrame)}
                    className="text-xs font-medium text-[#0052ff] hover:underline"
                  >
                    Seek Player Here
                  </button>
                </div>
              </div>

              {/* Top Frame Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Total Detections
                    </span>
                    <p className="mt-1 text-2xl font-bold text-slate-900 font-mono">
                      {frameDetections.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {frameDetections.length === 1 ? "Person" : "People"} in frame
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0052ff]">
                    <Users className="h-5 w-5" />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Waving Alert
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {wavingDetections.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          <AlertTriangle size={12} /> Detected ({wavingDetections.length})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={12} /> None
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {wavingDetections.length > 0
                        ? `Accuracy: ${(wavingDetections[0].confidence * 100).toFixed(1)}%`
                        : "No waving distress signals"}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    wavingDetections.length > 0
                      ? "bg-amber-50 text-amber-600"
                      : "bg-emerald-50 text-emerald-600"
                  }`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </div>
              </div>

              {/* Action Distribution Pie Chart in this Frame */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <PieChart size={14} className="text-slate-500" />
                  Action Distribution Pie Chart in Frame #{selectedFrame}
                </h4>
                <ActionPieChart data={frameActionStats} size={150} donut={true} />
              </div>

              {/* List of Detected Persons in this Frame */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Users size={14} className="text-slate-500" />
                    Detected Persons in Frame ({frameDetections.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Click "Focus" to isolate a person on the video
                  </span>
                </div>

                {frameDetections.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No persons detected in Frame #{selectedFrame}. Use the controls above to navigate to other frames.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {frameDetections.map((det) => {
                      const bg = getActionBg(det.action_label);
                      const text = getActionText(det.action_label);

                      return (
                        <div
                          key={`frame-det-${det.person_id}`}
                          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                                P{det.person_id}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-900">
                                  Person #{det.person_id}
                                </div>
                                <span
                                  className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                  style={{ background: bg, color: text }}
                                >
                                  {det.action_label} ({(det.confidence * 100).toFixed(1)}%)
                                </span>
                              </div>
                            </div>

                            {det.bbox && (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                BBox OK
                              </span>
                            )}
                          </div>

                          {/* Quick action buttons */}
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                onOpenPersonDetails(det.person_id);
                              }}
                              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-1 rounded-md font-medium transition-colors"
                            >
                              <Info size={12} />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onFocusPerson(det.person_id);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 text-xs bg-[#0052ff] hover:bg-[#0041cc] text-white px-3 py-1 rounded-md font-medium transition-colors shadow-xs"
                            >
                              <Eye size={12} />
                              <span>Focus on Video</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ════════════════════ TAB 2: WHOLE VIDEO OVERVIEW ════════════════════ */
            <div className="space-y-6">
              {/* Global Action Breakdown Pie Chart */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <PieChart size={14} className="text-slate-500" />
                  Video Action Distribution Pie Chart
                </h4>
                <ActionPieChart data={wholeVideoActionStats} size={160} donut={true} />
              </div>

              {/* Unique Persons Tracked in Session */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Users size={14} className="text-slate-500" />
                  All Tracked Persons in Session ({uniquePersonIds.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {uniquePersonIds.map((pId) => {
                    const pDets = detectionsByPerson.get(pId) || [];
                    const firstD = pDets[0];
                    const lastD = pDets[pDets.length - 1];

                    return (
                      <div
                        key={`person-summary-${pId}`}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">Person #{pId}</span>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {pDets.length} frames
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Range: {firstD?.timestamp ?? "-"} → {lastD?.timestamp ?? "-"}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (firstD) onSeekToFrame(firstD.frame_number);
                            onFocusPerson(pId);
                            onClose();
                          }}
                          className="w-full text-center text-xs font-semibold py-1 rounded-md bg-blue-50 text-[#0052ff] hover:bg-blue-100 transition-colors"
                        >
                          Focus Person #{pId}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
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

export default InDepthAnalysisDialog;
