import React, { useState, useMemo, useRef } from "react";
import type { Detection } from "@/lib/types";
import { getActionColor } from "@/pages/library/action-colors";
import { BarChart3, Activity, Eye, EyeOff, X, Crosshair } from "lucide-react";

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
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { frameData, peakPeople, avgPeople, presencePct, effectiveTotalFrames } = useMemo(() => {
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

  // Dimensions
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
    if (target) onSeekToFrame(target.frame);
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

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      {/* Header & Metric Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-[#0052ff]">
            <BarChart3 size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              People Detected Per Frame
            </h4>
            <p className="text-[11px] text-slate-500">
              Exact frame-by-frame count of detected individuals across all {effectiveTotalFrames} frames
            </p>
          </div>
        </div>

        {/* Metric Badges & Hint */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            Right-click graph to inspect
          </span>

          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 font-mono block leading-none">Peak</span>
            <span className="text-xs font-bold font-mono text-slate-800">
              {peakPeople} {peakPeople === 1 ? "person" : "people"}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] text-slate-400 font-mono block leading-none">Avg/Frame</span>
            <span className="text-xs font-bold font-mono text-slate-800">
              {avgPeople}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-center">
            <span className="text-[10px] text-blue-500 font-mono block leading-none">Presence</span>
            <span className="text-xs font-bold font-mono text-[#0052ff]">
              {presencePct}%
            </span>
          </div>
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
                  strokeDasharray={val > 0 && val < peakPeople ? "3 3" : undefined}
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
                  textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
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
                fill={isInspected ? "#e11d48" : isHovered ? "#0041cc" : "#0052ff"}
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
              <circle
                cx={inspectedX}
                cy={paddingTop}
                r="3.5"
                fill="#0052ff"
              />
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

      {/* Right-Click Detailed Inspection Card (Positioned cleanly below graph so it never covers it) */}
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
                • {inspectedFrame.count} {inspectedFrame.count === 1 ? "person detected" : "people detected"}
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
                    <span className="font-bold text-slate-800">Person #{d.person_id}</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-[#0052ff] font-semibold">{d.action_label}</span>
                    <span className="text-[10px] text-slate-400">({Math.round(d.confidence * 100)}%)</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No people detected in this frame.</p>
            )}
          </div>
        </div>
      )}
    </div>
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

export const ActionTimelineLineGraph: React.FC<ActionTimelineLineGraphProps> = ({
  detectionsByFrame,
  totalFrames,
  seekFps = 30,
  onSeekToFrame,
  compact = false,
}) => {
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [inspectedPoint, setInspectedPoint] = useState<{
    frame: number;
    timestamp: string;
    counts: Record<string, number>;
    totalCount: number;
  } | null>(null);
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement | null>(null);

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

    // Determine sampling resolution: up to 120 points for smooth vector paths
    const sampleCount = Math.min(Math.max(effectiveTotal, 2), 120);
    const dataPoints: Array<{
      frame: number;
      timestamp: string;
      counts: Record<string, number>;
      totalCount: number;
    }> = [];

    let highestCount = 1;

    for (let i = 0; i < sampleCount; i++) {
      const frameIndex = Math.round(1 + (i / (sampleCount - 1)) * (effectiveTotal - 1));
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

  // Dimensions
  const height = compact ? 150 : 200;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 28;
  const width = 600; // SVG viewBox coordinate width

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Compute SVG paths for each visible action
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

      // Construct SVG path string
      const pathD = points.reduce((acc, p, idx) => {
        return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
      }, "");

      // Construct filled area path underneath the line
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
  }, [allActions, timelineData, hiddenActions, maxCount, plotWidth, plotHeight]);

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
    if (point) onSeekToFrame(point.frame);
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
      ? paddingLeft + (hoveredPointIndex / (timelineData.length - 1)) * plotWidth
      : null;

  const inspectedPointIndex =
    inspectedPoint !== null
      ? timelineData.findIndex((p) => p.frame === inspectedPoint.frame)
      : -1;

  const inspectedX =
    inspectedPointIndex >= 0
      ? paddingLeft + (inspectedPointIndex / (timelineData.length - 1)) * plotWidth
      : null;

  return (
    <div className="flex flex-col bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      {/* Graph Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
            <Activity size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              Action Activity Across Frames
            </h4>
            <p className="text-[11px] text-slate-500">
              Multi-line breakdown of detected actions over the video timeline
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            Right-click graph to inspect
          </span>
          {onSeekToFrame && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              Click to seek
            </span>
          )}
        </div>
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
                  textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
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
              <circle
                cx={inspectedX}
                cy={paddingTop}
                r="3.5"
                fill="#10b981"
              />
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

      {/* Right-Click Detailed Inspection Card (Positioned cleanly below graph so it never covers it) */}
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
                • {inspectedPoint.totalCount} {inspectedPoint.totalCount === 1 ? "action detected" : "actions detected"}
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
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span>{action}:</span>
                      <span className="font-bold font-mono text-slate-900">{count}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No actions detected in this frame.</p>
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
  );
};
