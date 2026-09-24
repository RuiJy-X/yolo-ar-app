import React, { useState, useMemo, useRef, useEffect } from "react";
import type { Detection } from "@/lib/types";
import { getActionColor } from "@/pages/library/action-colors";
import {
  BarChart3,
  Activity,
  Eye,
  EyeOff,
  X,
  Maximize2,
  Users,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.0";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. PEOPLE COUNT BAR HISTOGRAM COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

type PeopleCountHistogramProps = {
  detectionsByFrame: Map<number, Detection[]>;
  totalFrames: number;
  seekFps?: number;
  onSeekToFrame?: (frame: number) => void;
  compact?: boolean;
};

export const PeopleCountHistogram: React.FC<PeopleCountHistogramProps> = ({
  detectionsByFrame,
  totalFrames,
  seekFps = 30,
  onSeekToFrame,
  compact = false,
}) => {
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null);
  const [inspectedFrame, setInspectedFrame] = useState<{
    frame: number;
    count: number;
    timestamp: string;
    detections: Detection[];
  } | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [modalHoveredFrame, setModalHoveredFrame] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const modalSvgRef = useRef<SVGSVGElement | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMaximized]);

  const {
    frameData,
    peakPeople,
    avgPeople,
    presencePct,
    effectiveTotalFrames,
  } = useMemo(() => {
    const maxFrameInDets = Math.max(0, ...Array.from(detectionsByFrame.keys()));
    const effectiveTotal = Math.max(totalFrames, maxFrameInDets, 1);

    const framesList: Array<{
      frame: number;
      count: number;
      timestamp: string;
      detections: Detection[];
    }> = [];

    let peak = 0;
    let totalDetectionsSum = 0;
    let framesWithPeople = 0;

    for (let f = 1; f <= effectiveTotal; f++) {
      const dets = detectionsByFrame.get(f) ?? [];
      const count = dets.length;
      if (count > peak) peak = count;
      totalDetectionsSum += count;
      if (count > 0) framesWithPeople++;

      const seconds = f / (seekFps > 0 ? seekFps : 30);
      framesList.push({
        frame: f,
        count,
        timestamp: formatTime(seconds),
        detections: dets,
      });
    }

    const safePeak = Math.max(peak, 1);
    const avg = (totalDetectionsSum / effectiveTotal).toFixed(1);
    const pct = Math.round((framesWithPeople / effectiveTotal) * 100);

    return {
      frameData: framesList,
      peakPeople: safePeak,
      avgPeople: avg,
      presencePct: pct,
      effectiveTotalFrames: effectiveTotal,
    };
  }, [detectionsByFrame, totalFrames, seekFps]);

  // Dimensions for standard/compact view
  const height = compact ? 140 : 170;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const width = 600; // SVG viewBox coordinate width

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const totalF = Math.max(frameData.length, 1);
  const barWidth = Math.max(plotWidth / totalF - 0.2, 0.8);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || frameData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < paddingLeft || svgX > width - paddingRight) {
      setHoveredFrame(null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
    setHoveredFrame(frameData[idx]?.frame ?? null);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || frameData.length === 0 || !onSeekToFrame) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
    const target = frameData[idx];
    if (target) {
      setInspectedFrame(target);
      onSeekToFrame(target.frame);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg || frameData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < paddingLeft || svgX > width - paddingRight) return;

    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
    const target = frameData[idx];
    if (target) {
      setInspectedFrame(target);
    }
  };

  const hoveredX =
    hoveredFrame !== null
      ? paddingLeft + ((hoveredFrame - 1) / totalF) * plotWidth
      : null;

  const inspectedX =
    inspectedFrame !== null
      ? paddingLeft + ((inspectedFrame.frame - 1) / totalF) * plotWidth
      : null;

  // Modal Dimensions
  const mWidth = 960;
  const mHeight = 320;
  const mPadLeft = 40;
  const mPadRight = 20;
  const mPadTop = 20;
  const mPadBottom = 30;
  const mPlotWidth = mWidth - mPadLeft - mPadRight;
  const mPlotHeight = mHeight - mPadTop - mPadBottom;
  const mBarWidth = Math.max(mPlotWidth / totalF - 0.2, 1);

  const handleModalMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = modalSvgRef.current;
    if (!svg || frameData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * mWidth;

    if (svgX < mPadLeft || svgX > mWidth - mPadRight) {
      setModalHoveredFrame(null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (svgX - mPadLeft) / mPlotWidth));
    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
    setModalHoveredFrame(frameData[idx]?.frame ?? null);
  };

  const handleModalSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = modalSvgRef.current;
    if (!svg || frameData.length === 0 || !onSeekToFrame) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * mWidth;
    const ratio = Math.max(0, Math.min(1, (svgX - mPadLeft) / mPlotWidth));
    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
    const target = frameData[idx];
    if (target) {
      setInspectedFrame(target);
      onSeekToFrame(target.frame);
    }
  };

  const modalHoveredX =
    modalHoveredFrame !== null
      ? mPadLeft + ((modalHoveredFrame - 1) / totalF) * mPlotWidth
      : null;

  const modalInspectedX =
    inspectedFrame !== null
      ? mPadLeft + ((inspectedFrame.frame - 1) / totalF) * mPlotWidth
      : null;

  return (
    <>
      <div className="flex flex-col bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {/* Header & Maximize Button */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                People Detected Per Frame
              </h4>
              <p className="text-[11px] text-slate-500">
                Exact frame-by-frame count of detected individuals across all{" "}
                {effectiveTotalFrames} frames
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMaximized(true)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-all shrink-0 cursor-pointer"
            title="Maximize Histogram"
          >
            <Maximize2 size={13} />
          </button>
        </div>

        {/* Metric Badges */}
        <div className="flex gap-2 w-full">
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 font-mono block leading-none">
              Peak
            </span>
            <span className="text-xs font-bold font-mono text-slate-800">
              {peakPeople} {peakPeople === 1 ? "person" : "people"}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 font-mono block leading-none">
              AvgP/Frame
            </span>
            <span className="text-xs font-bold font-mono text-slate-800">
              {avgPeople}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <span className="text-[10px] text-blue-500 font-mono block leading-none">
              Presence
            </span>
            <span className="text-xs font-bold font-mono text-[#0052ff]">
              {presencePct}%
            </span>
          </div>
        </div>

        {/* SVG Exact Frame Bar Chart */}
        <div className="relative w-full overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredFrame(null)}
            onClick={handleSvgClick}
            onContextMenu={handleContextMenu}
            className="w-full h-auto cursor-crosshair select-none"
          >
            {/* Horizontal Grid lines with integer scale */}
            {Array.from({ length: peakPeople + 1 }).map((_, val) => {
              const ratio = val / peakPeople;
              const y = paddingTop + plotHeight * (1 - ratio);
              return (
                <g key={val}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray={
                      val > 0 && val < peakPeople ? "3 3" : undefined
                    }
                  />
                  <text
                    x={paddingLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#94a3b8"
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Time Labels on X-Axis */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const x = paddingLeft + plotWidth * ratio;
              const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
              const pt = frameData[idx];
              return (
                <g key={ratio}>
                  <line
                    x1={x}
                    y1={paddingTop + plotHeight}
                    x2={x}
                    y2={paddingTop + plotHeight + 4}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={paddingTop + plotHeight + 16}
                    textAnchor={
                      ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                    }
                    fontSize="9"
                    fill="#94a3b8"
                    fontFamily="monospace"
                  >
                    {pt?.timestamp ?? ""}
                  </text>
                </g>
              );
            })}

            {/* Exact Frame-by-Frame Bars */}
            {frameData.map((d, i) => {
              if (d.count === 0) return null;
              const x = paddingLeft + (i / totalF) * plotWidth;
              const bHeight = (d.count / peakPeople) * plotHeight;
              const y = paddingTop + plotHeight - bHeight;
              const isHovered = hoveredFrame === d.frame;
              const isInspected = inspectedFrame?.frame === d.frame;

              return (
                <rect
                  key={d.frame}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={bHeight}
                  rx={barWidth > 3 ? 1.5 : 0}
                  fill={
                    isInspected ? "#e11d48" : isHovered ? "#0041cc" : "#0052ff"
                  }
                  opacity={isInspected ? 1 : isHovered ? 1 : 0.85}
                />
              );
            })}

            {/* Persistent Inspection Marker */}
            {inspectedX !== null && (
              <g>
                <line
                  x1={inspectedX}
                  y1={paddingTop}
                  x2={inspectedX}
                  y2={paddingTop + plotHeight}
                  stroke="#0052ff"
                  strokeWidth="2"
                />
                <circle cx={inspectedX} cy={paddingTop} r="3.5" fill="#0052ff" />
              </g>
            )}

            {/* Hover Crosshair Scrubber Line */}
            {hoveredX !== null && inspectedX !== hoveredX && (
              <line
                x1={hoveredX}
                y1={paddingTop}
                x2={hoveredX}
                y2={paddingTop + plotHeight}
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}
          </svg>
        </div>

        {/* Inspection Card */}
        {inspectedFrame && (
          <div className="p-3 rounded-xl border border-blue-200/80 bg-blue-50/40 text-slate-800 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150 space-y-2">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-100/70">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#0052ff] text-white font-mono font-bold text-xs">
                  Frame #{inspectedFrame.frame}
                </span>
                <span className="font-mono text-xs text-slate-600 font-medium">
                  {inspectedFrame.timestamp}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  • {inspectedFrame.count}{" "}
                  {inspectedFrame.count === 1
                    ? "person detected"
                    : "people detected"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onSeekToFrame && (
                  <button
                    type="button"
                    onClick={() => onSeekToFrame(inspectedFrame.frame)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#0052ff] text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                  >
                    Seek Video
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectedFrame(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                  title="Close inspection"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="pt-0.5">
              {inspectedFrame.detections.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {inspectedFrame.detections.map((d, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-mono shadow-2xs"
                    >
                      <span className="font-bold text-slate-800">
                        Person #{d.person_id}
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="text-[#0052ff] font-semibold">
                        {d.action_label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({Math.round(d.confidence * 100)}%)
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No people detected in this frame.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MAXIMIZED MODAL ── */}
      {isMaximized && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMaximized(false);
          }}
        >
          <div className="flex flex-col w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0052ff] border border-blue-100/80 shadow-xs">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      People Count Histogram
                    </h3>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 font-mono">
                      {effectiveTotalFrames} frames
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    High-resolution frame-by-frame detected people distribution with timeline crosshair scrubbing.
                  </p>
                </div>
              </div>

              {/* Metric Badges & Close */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2">
                  <div className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-mono block leading-none">
                      Peak
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-800">
                      {peakPeople} {peakPeople === 1 ? "person" : "people"}
                    </span>
                  </div>

                  <div className="px-3 py-1 rounded-xl bg-white border border-slate-200 text-center shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-mono block leading-none">
                      Avg/Frame
                    </span>
                    <span className="text-xs font-bold font-mono text-slate-800">
                      {avgPeople}
                    </span>
                  </div>

                  <div className="px-3 py-1 rounded-xl bg-blue-50 border border-blue-100 text-center shadow-2xs">
                    <span className="text-[10px] text-blue-500 font-mono block leading-none">
                      Presence
                    </span>
                    <span className="text-xs font-bold font-mono text-[#0052ff]">
                      {presencePct}%
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsMaximized(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Maximized SVG Canvas */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                <svg
                  ref={modalSvgRef}
                  viewBox={`0 0 ${mWidth} ${mHeight}`}
                  onMouseMove={handleModalMouseMove}
                  onMouseLeave={() => setModalHoveredFrame(null)}
                  onClick={handleModalSvgClick}
                  className="w-full h-auto cursor-crosshair select-none"
                >
                  {/* Horizontal Grid lines */}
                  {Array.from({ length: peakPeople + 1 }).map((_, val) => {
                    const ratio = val / peakPeople;
                    const y = mPadTop + mPlotHeight * (1 - ratio);
                    return (
                      <g key={val}>
                        <line
                          x1={mPadLeft}
                          y1={y}
                          x2={mWidth - mPadRight}
                          y2={y}
                          stroke="#f1f5f9"
                          strokeWidth="1"
                          strokeDasharray={
                            val > 0 && val < peakPeople ? "3 3" : undefined
                          }
                        />
                        <text
                          x={mPadLeft - 8}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="#94a3b8"
                          fontFamily="monospace"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Time Labels on X-Axis */}
                  {[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((ratio) => {
                    const x = mPadLeft + mPlotWidth * ratio;
                    const idx = Math.min(Math.floor(ratio * totalF), totalF - 1);
                    const pt = frameData[idx];
                    return (
                      <g key={ratio}>
                        <line
                          x1={x}
                          y1={mPadTop + mPlotHeight}
                          x2={x}
                          y2={mPadTop + mPlotHeight + 6}
                          stroke="#cbd5e1"
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={mPadTop + mPlotHeight + 18}
                          textAnchor={
                            ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                          }
                          fontSize="10"
                          fill="#64748b"
                          fontFamily="monospace"
                        >
                          {pt?.timestamp ?? ""}
                        </text>
                      </g>
                    );
                  })}

                  {/* High-Resolution Bars */}
                  {frameData.map((d, i) => {
                    if (d.count === 0) return null;
                    const x = mPadLeft + (i / totalF) * mPlotWidth;
                    const bHeight = (d.count / peakPeople) * mPlotHeight;
                    const y = mPadTop + mPlotHeight - bHeight;
                    const isHovered = modalHoveredFrame === d.frame;
                    const isInspected = inspectedFrame?.frame === d.frame;

                    return (
                      <rect
                        key={d.frame}
                        x={x}
                        y={y}
                        width={mBarWidth}
                        height={bHeight}
                        rx={mBarWidth > 3 ? 1.5 : 0}
                        fill={
                          isInspected ? "#e11d48" : isHovered ? "#0041cc" : "#0052ff"
                        }
                        opacity={isInspected ? 1 : isHovered ? 1 : 0.85}
                      />
                    );
                  })}

                  {/* Persistent Inspection Marker */}
                  {modalInspectedX !== null && (
                    <g>
                      <line
                        x1={modalInspectedX}
                        y1={mPadTop}
                        x2={modalInspectedX}
                        y2={mPadTop + mPlotHeight}
                        stroke="#0052ff"
                        strokeWidth="2.5"
                      />
                      <circle cx={modalInspectedX} cy={mPadTop} r="4" fill="#0052ff" />
                    </g>
                  )}

                  {/* Hover Crosshair Scrubber */}
                  {modalHoveredX !== null && modalInspectedX !== modalHoveredX && (
                    <line
                      x1={modalHoveredX}
                      y1={mPadTop}
                      x2={modalHoveredX}
                      y2={mPadTop + mPlotHeight}
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                    />
                  )}
                </svg>
              </div>

              {/* Inspection Card in Modal */}
              {inspectedFrame && (
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 text-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-100">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-md bg-[#0052ff] text-white font-mono font-bold text-xs">
                        Frame #{inspectedFrame.frame}
                      </span>
                      <span className="font-mono text-xs text-slate-700 font-semibold">
                        Timestamp: {inspectedFrame.timestamp}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        • {inspectedFrame.count}{" "}
                        {inspectedFrame.count === 1
                          ? "person detected"
                          : "people detected"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSeekToFrame && (
                        <button
                          type="button"
                          onClick={() => onSeekToFrame(inspectedFrame.frame)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#0052ff] text-white hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
                        >
                          Seek Video Here
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setInspectedFrame(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                        title="Close frame inspection"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    {inspectedFrame.detections.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {inspectedFrame.detections.map((d, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono shadow-2xs"
                          >
                            <span className="font-bold text-slate-900">
                              Person #{d.person_id}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-[#0052ff] font-semibold">
                              {d.action_label}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({Math.round(d.confidence * 100)}% conf)
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No individuals detected in Frame #{inspectedFrame.frame}.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <span className="text-xs text-slate-500">
                Click anywhere on the graph to seek video player to that frame.
              </span>
              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. MULTI-LINE ACTION TIMELINE GRAPH COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

type ActionTimelineLineGraphProps = {
  detectionsByFrame: Map<number, Detection[]>;
  totalFrames: number;
  seekFps?: number;
  onSeekToFrame?: (frame: number) => void;
  compact?: boolean;
};

export const ActionTimelineLineGraph: React.FC<
  ActionTimelineLineGraphProps
> = ({
  detectionsByFrame,
  totalFrames,
  seekFps = 30,
  onSeekToFrame,
  compact = false,
}) => {
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(
    null,
  );
  const [inspectedPoint, setInspectedPoint] = useState<{
    frame: number;
    timestamp: string;
    counts: Record<string, number>;
    totalCount: number;
  } | null>(null);
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());
  const [isMaximized, setIsMaximized] = useState(false);
  const [modalHoveredPointIndex, setModalHoveredPointIndex] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const modalSvgRef = useRef<SVGSVGElement | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMaximized(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMaximized]);

  const { timelineData, allActions, maxCount } = useMemo(() => {
    const maxFrameInDets = Math.max(0, ...Array.from(detectionsByFrame.keys()));
    const effectiveTotal = Math.max(totalFrames, maxFrameInDets, 1);

    // Identify all unique actions across the session
    const actionsSet = new Set<string>();
    detectionsByFrame.forEach((dets) => {
      dets.forEach((d) => {
        if (d.action_label && d.action_label.trim()) {
          actionsSet.add(d.action_label.trim());
        }
      });
    });

    const actionList = Array.from(actionsSet).sort();

    // Sample points for smooth vector path
    const sampleCount = Math.min(Math.max(effectiveTotal, 2), 120);
    const dataPoints: Array<{
      frame: number;
      timestamp: string;
      counts: Record<string, number>;
      totalCount: number;
    }> = [];

    let highestCount = 1;

    for (let i = 0; i < sampleCount; i++) {
      const frameIndex = Math.round(
        1 + (i / (sampleCount - 1)) * (effectiveTotal - 1),
      );
      const detections = detectionsByFrame.get(frameIndex) ?? [];
      const counts: Record<string, number> = {};
      let total = 0;

      for (const d of detections) {
        const act = d.action_label?.trim();
        if (act) {
          counts[act] = (counts[act] ?? 0) + 1;
          total++;
        }
      }

      if (total > highestCount) highestCount = total;

      const seconds = frameIndex / (seekFps > 0 ? seekFps : 30);
      dataPoints.push({
        frame: frameIndex,
        timestamp: formatTime(seconds),
        counts,
        totalCount: total,
      });
    }

    return {
      timelineData: dataPoints,
      allActions: actionList,
      maxCount: highestCount,
      effectiveTotalFrames: effectiveTotal,
    };
  }, [detectionsByFrame, totalFrames, seekFps]);

  const toggleAction = (action: string) => {
    setHiddenActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  };

  // Standard/compact dimensions
  const height = compact ? 150 : 200;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 28;
  const width = 600; // SVG viewBox coordinate width

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Compute SVG paths for each visible action in standard view
  const lines = useMemo(() => {
    if (timelineData.length < 2) return [];

    return allActions.map((action) => {
      const isHidden = hiddenActions.has(action);
      const color = getActionColor(action);

      const points = timelineData.map((d, i) => {
        const count = d.counts[action] ?? 0;
        const x = paddingLeft + (i / (timelineData.length - 1)) * plotWidth;
        const y = paddingTop + plotHeight - (count / maxCount) * plotHeight;
        return { x, y, count };
      });

      const pathD = points.reduce((acc, p, idx) => {
        return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
      }, "");

      const firstX = points[0].x;
      const lastX = points[points.length - 1].x;
      const bottomY = paddingTop + plotHeight;
      const areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

      return {
        action,
        color,
        isHidden,
        pathD,
        areaD,
        points,
      };
    });
  }, [
    allActions,
    timelineData,
    hiddenActions,
    maxCount,
    plotWidth,
    plotHeight,
  ]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || timelineData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < paddingLeft || svgX > width - paddingRight) {
      setHoveredPointIndex(null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.round(ratio * (timelineData.length - 1));
    setHoveredPointIndex(idx);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || timelineData.length === 0 || !onSeekToFrame) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.round(ratio * (timelineData.length - 1));
    const point = timelineData[idx];
    if (point) {
      setInspectedPoint(point);
      onSeekToFrame(point.frame);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg || timelineData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    if (svgX < paddingLeft || svgX > width - paddingRight) return;

    const ratio = Math.max(0, Math.min(1, (svgX - paddingLeft) / plotWidth));
    const idx = Math.round(ratio * (timelineData.length - 1));
    const point = timelineData[idx];
    if (point) setInspectedPoint(point);
  };

  const hoveredX =
    hoveredPointIndex !== null
      ? paddingLeft +
        (hoveredPointIndex / (timelineData.length - 1)) * plotWidth
      : null;

  const inspectedPointIndex =
    inspectedPoint !== null
      ? timelineData.findIndex((p) => p.frame === inspectedPoint.frame)
      : -1;

  const inspectedX =
    inspectedPointIndex >= 0
      ? paddingLeft +
        (inspectedPointIndex / (timelineData.length - 1)) * plotWidth
      : null;

  // Modal Dimensions
  const mWidth = 960;
  const mHeight = 340;
  const mPadLeft = 40;
  const mPadRight = 20;
  const mPadTop = 20;
  const mPadBottom = 32;
  const mPlotWidth = mWidth - mPadLeft - mPadRight;
  const mPlotHeight = mHeight - mPadTop - mPadBottom;

  // Compute SVG paths for modal view
  const modalLines = useMemo(() => {
    if (timelineData.length < 2) return [];

    return allActions.map((action) => {
      const isHidden = hiddenActions.has(action);
      const color = getActionColor(action);

      const points = timelineData.map((d, i) => {
        const count = d.counts[action] ?? 0;
        const x = mPadLeft + (i / (timelineData.length - 1)) * mPlotWidth;
        const y = mPadTop + mPlotHeight - (count / maxCount) * mPlotHeight;
        return { x, y, count };
      });

      const pathD = points.reduce((acc, p, idx) => {
        return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
      }, "");

      const firstX = points[0].x;
      const lastX = points[points.length - 1].x;
      const bottomY = mPadTop + mPlotHeight;
      const areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

      return {
        action,
        color,
        isHidden,
        pathD,
        areaD,
        points,
      };
    });
  }, [allActions, timelineData, hiddenActions, maxCount, mPlotWidth, mPlotHeight]);

  const handleModalMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = modalSvgRef.current;
    if (!svg || timelineData.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * mWidth;

    if (svgX < mPadLeft || svgX > mWidth - mPadRight) {
      setModalHoveredPointIndex(null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (svgX - mPadLeft) / mPlotWidth));
    const idx = Math.round(ratio * (timelineData.length - 1));
    setModalHoveredPointIndex(idx);
  };

  const handleModalSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = modalSvgRef.current;
    if (!svg || timelineData.length === 0 || !onSeekToFrame) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * mWidth;
    const ratio = Math.max(0, Math.min(1, (svgX - mPadLeft) / mPlotWidth));
    const idx = Math.round(ratio * (timelineData.length - 1));
    const point = timelineData[idx];
    if (point) {
      setInspectedPoint(point);
      onSeekToFrame(point.frame);
    }
  };

  const modalHoveredX =
    modalHoveredPointIndex !== null
      ? mPadLeft +
        (modalHoveredPointIndex / (timelineData.length - 1)) * mPlotWidth
      : null;

  const modalInspectedX =
    inspectedPointIndex >= 0
      ? mPadLeft +
        (inspectedPointIndex / (timelineData.length - 1)) * mPlotWidth
      : null;

  return (
    <>
      <div className="flex flex-col bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {/* Graph Header & Maximize Button */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Action Activity Across Frames
              </h4>
              <p className="text-[11px] text-slate-500">
                Multi-line breakdown of detected actions over the video timeline
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMaximized(true)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-all shrink-0 cursor-pointer"
            title="Maximize Action Activity Graph"
          >
            <Maximize2 size={13} />
          </button>
        </div>

        {/* SVG Line Chart Canvas */}
        <div className="relative w-full overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPointIndex(null)}
            onClick={handleSvgClick}
            onContextMenu={handleContextMenu}
            className="w-full h-auto cursor-crosshair select-none"
          >
            {/* Horizontal Grid lines */}
            {[0, 0.5, 1].map((ratio) => {
              const y = paddingTop + plotHeight * (1 - ratio);
              const val = Math.round(ratio * maxCount);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray={ratio > 0 && ratio < 1 ? "3 3" : undefined}
                  />
                  <text
                    x={paddingLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#94a3b8"
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Time Labels on X-Axis */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const x = paddingLeft + plotWidth * ratio;
              const idx = Math.round(ratio * (timelineData.length - 1));
              const pt = timelineData[idx];
              return (
                <g key={ratio}>
                  <line
                    x1={x}
                    y1={paddingTop + plotHeight}
                    x2={x}
                    y2={paddingTop + plotHeight + 4}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={paddingTop + plotHeight + 16}
                    textAnchor={
                      ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                    }
                    fontSize="9"
                    fill="#94a3b8"
                    fontFamily="monospace"
                  >
                    {pt?.timestamp ?? ""}
                  </text>
                </g>
              );
            })}

            {/* Render Area fills and Lines */}
            {lines.map((line) => {
              if (line.isHidden) return null;
              return (
                <g key={line.action}>
                  {/* Area Gradient */}
                  <path
                    d={line.areaD}
                    fill={line.color}
                    opacity="0.08"
                    className="transition-opacity duration-200"
                  />
                  {/* Smooth Action Line */}
                  <path
                    d={line.pathD}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

            {/* Persistent Inspection Marker Line & Dots */}
            {inspectedX !== null && inspectedPointIndex >= 0 && (
              <g>
                <line
                  x1={inspectedX}
                  y1={paddingTop}
                  x2={inspectedX}
                  y2={paddingTop + plotHeight}
                  stroke="#10b981"
                  strokeWidth="2"
                />
                <circle cx={inspectedX} cy={paddingTop} r="3.5" fill="#10b981" />
                {lines.map((line) => {
                  if (line.isHidden) return null;
                  const pt = line.points[inspectedPointIndex];
                  if (!pt || pt.count === 0) return null;
                  return (
                    <circle
                      key={`inspect-${line.action}`}
                      cx={pt.x}
                      cy={pt.y}
                      r="4.5"
                      fill={line.color}
                      stroke="#ffffff"
                      strokeWidth="2"
                      className="shadow-sm"
                    />
                  );
                })}
              </g>
            )}

            {/* Hover Tracker Cursor Line */}
            {hoveredX !== null && inspectedX !== hoveredX && (
              <g>
                <line
                  x1={hoveredX}
                  y1={paddingTop}
                  x2={hoveredX}
                  y2={paddingTop + plotHeight}
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {/* Highlight circle on each visible line */}
                {lines.map((line) => {
                  if (line.isHidden || hoveredPointIndex === null) return null;
                  const pt = line.points[hoveredPointIndex];
                  if (!pt || pt.count === 0) return null;
                  return (
                    <circle
                      key={line.action}
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill={line.color}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="shadow-sm"
                    />
                  );
                })}
              </g>
            )}
          </svg>
        </div>

        {/* Right-Click / Click Detailed Inspection Card */}
        {inspectedPoint && (
          <div className="p-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 text-slate-800 shadow-xs animate-in fade-in slide-in-from-top-1 duration-150 space-y-2">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-100/70">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-mono font-bold text-xs">
                  Frame #{inspectedPoint.frame}
                </span>
                <span className="font-mono text-xs text-slate-600 font-medium">
                  {inspectedPoint.timestamp}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  • {inspectedPoint.totalCount}{" "}
                  {inspectedPoint.totalCount === 1
                    ? "action detected"
                    : "actions detected"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onSeekToFrame && (
                  <button
                    type="button"
                    onClick={() => onSeekToFrame(inspectedPoint.frame)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
                  >
                    Seek Video
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectedPoint(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                  title="Close inspection"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="pt-0.5">
              {inspectedPoint.totalCount > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {allActions.map((action) => {
                    const count = inspectedPoint.counts[action] ?? 0;
                    if (count === 0) return null;
                    const color = getActionColor(action);
                    return (
                      <span
                        key={action}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                        <span>{action}:</span>
                        <span className="font-bold font-mono text-slate-900">
                          {count}
                        </span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No actions detected in this frame.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Interactive Legend with Line Toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">
            Actions:
          </span>
          {allActions.map((action) => {
            const isHidden = hiddenActions.has(action);
            const color = getActionColor(action);

            return (
              <button
                key={action}
                type="button"
                onClick={() => toggleAction(action)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                  isHidden
                    ? "bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60"
                    : "bg-white text-slate-800 border-slate-200 shadow-2xs hover:border-slate-300"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: isHidden ? "#94a3b8" : color }}
                />
                <span>{action}</span>
                {isHidden ? (
                  <EyeOff size={11} className="text-slate-400 ml-0.5" />
                ) : (
                  <Eye size={11} className="text-slate-400 ml-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MAXIMIZED MODAL ── */}
      {isMaximized && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMaximized(false);
          }}
        >
          <div className="flex flex-col w-full max-w-5xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100/80 shadow-xs">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Action Activity Across Frames
                    </h3>
                    <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 font-mono">
                      {allActions.length} Actions Tracked
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Multi-line breakdown of detected actions over the video timeline with interactive toggles.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Maximized Line Chart SVG */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                <svg
                  ref={modalSvgRef}
                  viewBox={`0 0 ${mWidth} ${mHeight}`}
                  onMouseMove={handleModalMouseMove}
                  onMouseLeave={() => setModalHoveredPointIndex(null)}
                  onClick={handleModalSvgClick}
                  className="w-full h-auto cursor-crosshair select-none"
                >
                  {/* Horizontal Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = mPadTop + mPlotHeight * (1 - ratio);
                    const val = Math.round(ratio * maxCount);
                    return (
                      <g key={ratio}>
                        <line
                          x1={mPadLeft}
                          y1={y}
                          x2={mWidth - mPadRight}
                          y2={y}
                          stroke="#f1f5f9"
                          strokeWidth="1"
                          strokeDasharray={ratio > 0 && ratio < 1 ? "3 3" : undefined}
                        />
                        <text
                          x={mPadLeft - 8}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="#94a3b8"
                          fontFamily="monospace"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Time Labels on X-Axis */}
                  {[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((ratio) => {
                    const x = mPadLeft + mPlotWidth * ratio;
                    const idx = Math.round(ratio * (timelineData.length - 1));
                    const pt = timelineData[idx];
                    return (
                      <g key={ratio}>
                        <line
                          x1={x}
                          y1={mPadTop + mPlotHeight}
                          x2={x}
                          y2={mPadTop + mPlotHeight + 6}
                          stroke="#cbd5e1"
                          strokeWidth="1"
                        />
                        <text
                          x={x}
                          y={mPadTop + mPlotHeight + 18}
                          textAnchor={
                            ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"
                          }
                          fontSize="10"
                          fill="#64748b"
                          fontFamily="monospace"
                        >
                          {pt?.timestamp ?? ""}
                        </text>
                      </g>
                    );
                  })}

                  {/* High-Definition Render Area Fills and Lines */}
                  {modalLines.map((line) => {
                    if (line.isHidden) return null;
                    return (
                      <g key={line.action}>
                        <path
                          d={line.areaD}
                          fill={line.color}
                          opacity="0.08"
                          className="transition-opacity duration-200"
                        />
                        <path
                          d={line.pathD}
                          fill="none"
                          stroke={line.color}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}

                  {/* Persistent Inspection Marker */}
                  {modalInspectedX !== null && inspectedPointIndex >= 0 && (
                    <g>
                      <line
                        x1={modalInspectedX}
                        y1={mPadTop}
                        x2={modalInspectedX}
                        y2={mPadTop + mPlotHeight}
                        stroke="#10b981"
                        strokeWidth="2.5"
                      />
                      <circle cx={modalInspectedX} cy={mPadTop} r="4" fill="#10b981" />
                      {modalLines.map((line) => {
                        if (line.isHidden) return null;
                        const pt = line.points[inspectedPointIndex];
                        if (!pt || pt.count === 0) return null;
                        return (
                          <circle
                            key={`modal-inspect-${line.action}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="5"
                            fill={line.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="shadow-sm"
                          />
                        );
                      })}
                    </g>
                  )}

                  {/* Hover Tracker Cursor Line */}
                  {modalHoveredX !== null && modalInspectedX !== modalHoveredX && (
                    <g>
                      <line
                        x1={modalHoveredX}
                        y1={mPadTop}
                        x2={modalHoveredX}
                        y2={mPadTop + mPlotHeight}
                        stroke="#64748b"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                      />
                      {modalLines.map((line) => {
                        if (line.isHidden || modalHoveredPointIndex === null) return null;
                        const pt = line.points[modalHoveredPointIndex];
                        if (!pt || pt.count === 0) return null;
                        return (
                          <circle
                            key={`modal-hover-${line.action}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="4.5"
                            fill={line.color}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            className="shadow-sm"
                          />
                        );
                      })}
                    </g>
                  )}
                </svg>
              </div>

              {/* Inspection Card in Modal */}
              {inspectedPoint && (
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 text-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-100">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-mono font-bold text-xs">
                        Frame #{inspectedPoint.frame}
                      </span>
                      <span className="font-mono text-xs text-slate-700 font-semibold">
                        Timestamp: {inspectedPoint.timestamp}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        • {inspectedPoint.totalCount}{" "}
                        {inspectedPoint.totalCount === 1
                          ? "action detected"
                          : "actions detected"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSeekToFrame && (
                        <button
                          type="button"
                          onClick={() => onSeekToFrame(inspectedPoint.frame)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer"
                        >
                          Seek Video Here
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setInspectedPoint(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
                        title="Close inspection"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    {inspectedPoint.totalCount > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {allActions.map((action) => {
                          const count = inspectedPoint.counts[action] ?? 0;
                          if (count === 0) return null;
                          const color = getActionColor(action);
                          return (
                            <div
                              key={action}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: color }}
                              />
                              <span>{action}:</span>
                              <span className="font-bold font-mono text-slate-900">
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        No actions detected in Frame #{inspectedPoint.frame}.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Interactive Legend in Modal */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs uppercase font-mono font-bold text-slate-500 tracking-wider">
                  Action Toggles:
                </span>
                {allActions.map((action) => {
                  const isHidden = hiddenActions.has(action);
                  const color = getActionColor(action);

                  return (
                    <button
                      key={`modal-${action}`}
                      type="button"
                      onClick={() => toggleAction(action)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                        isHidden
                          ? "bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60"
                          : "bg-white text-slate-800 border-slate-200 shadow-2xs hover:border-slate-300"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: isHidden ? "#94a3b8" : color }}
                      />
                      <span>{action}</span>
                      {isHidden ? (
                        <EyeOff size={13} className="text-slate-400 ml-0.5" />
                      ) : (
                        <Eye size={13} className="text-slate-400 ml-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
              <span className="text-xs text-slate-500">
                Click anywhere on the graph to seek video player to that frame.
              </span>
              <button
                type="button"
                onClick={() => setIsMaximized(false)}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
