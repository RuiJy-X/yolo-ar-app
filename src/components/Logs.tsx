import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  User,
  Eye,
  Info,
  Film,
  BarChart2,
  PieChart,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Layers,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeVideoResponse, AlertEvent, Detection } from "@/lib/types";
import type { ActionTimelineTag } from "@/pages/library/useLibrary";
import {
  getActionColor,
  getActionBg,
  getActionText,
} from "@/pages/library/action-colors";
import TitleMono from "./titile-mono";

export type SidebarTab = "detections" | "frame" | "person" | "overview";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
  selectedTag?: ActionTimelineTag | null;
  focusedPersonId?: number | null;
  onFocusPerson?: (personId: number) => void;
  onClearFocus?: () => void;
  onOpenPersonDetails?: (personId: number) => void;
  currentFrameNumber?: number;
  totalFrames?: number;
  seekFps?: number;
  detectionsByFrame?: Map<number, Detection[]>;
  detectionsByPerson?: Map<number, Detection[]>;
  sidebarTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
};

type ActionInstance = {
  personId: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: string;
  endTimestamp: string;
  frameCount: number;
  avgConfidence: number;
  avgAllScores: Record<string, number>;
};

// ── ActionPieChart Component ──

export const ActionPieChart: React.FC<{
  data: Array<{ action: string; count: number; avgConfidence?: number }>;
  size?: number;
  donut?: boolean;
}> = ({ data, size = 140, donut = true }) => {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (total === 0 || data.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
        No action data in this selection.
      </div>
    );
  }

  const center = size / 2;
  const radius = size / 2 - 6;
  const innerRadius = donut ? radius * 0.62 : 0;

  // If only 1 item with 100%, handle complete circle
  if (data.length === 1) {
    const item = data[0];
    const color = getActionColor(item.action);
    return (
      <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-white rounded-xl border border-slate-200">
        <div className="relative shrink-0 flex items-center justify-center">
          <svg width={size} height={size}>
            <circle
              cx={center}
              cy={center}
              r={(radius + innerRadius) / 2}
              fill="transparent"
              stroke={color}
              strokeWidth={radius - innerRadius}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-xs font-bold font-mono text-slate-900 leading-tight">
              100%
            </span>
            <span className="text-[10px] text-slate-500 truncate max-w-[60px]">
              {item.action}
            </span>
          </div>
        </div>
        <div className="flex-1 w-full space-y-1">
          <div className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg bg-slate-50 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-slate-800 font-semibold">{item.action}</span>
            </div>
            <div className="font-mono text-slate-700">
              {item.count} frame{item.count !== 1 ? "s" : ""} (100%)
            </div>
          </div>
        </div>
      </div>
    );
  }

  let cumulativeAngle = 0;
  const slices = data.map((item, idx) => {
    const fraction = item.count / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;

    const x1 = center + radius * Math.cos(startAngle - Math.PI / 2);
    const y1 = center + radius * Math.sin(startAngle - Math.PI / 2);
    const x2 = center + radius * Math.cos(endAngle - Math.PI / 2);
    const y2 = center + radius * Math.sin(endAngle - Math.PI / 2);

    const largeArcFlag = angle > Math.PI ? 1 : 0;

    let pathData = "";
    if (donut) {
      const ix1 = center + innerRadius * Math.cos(endAngle - Math.PI / 2);
      const iy1 = center + innerRadius * Math.sin(endAngle - Math.PI / 2);
      const ix2 = center + innerRadius * Math.cos(startAngle - Math.PI / 2);
      const iy2 = center + innerRadius * Math.sin(startAngle - Math.PI / 2);

      pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix2} ${iy2}`,
        "Z",
      ].join(" ");
    } else {
      pathData = [
        `M ${center} ${center}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        "Z",
      ].join(" ");
    }

    const color = getActionColor(item.action);
    const pct = Math.round(fraction * 100);

    return {
      ...item,
      pathData,
      color,
      pct,
      idx,
    };
  });

  const activeSlice = hoveredIdx !== null ? slices[hoveredIdx] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 bg-white rounded-xl border border-slate-200">
      <div className="relative shrink-0 flex items-center justify-center">
        <svg width={size} height={size} className="overflow-visible">
          {slices.map((slice) => {
            const isHovered = hoveredIdx === slice.idx;
            return (
              <path
                key={slice.action}
                d={slice.pathData}
                fill={slice.color}
                opacity={hoveredIdx === null || isHovered ? 1 : 0.45}
                stroke="#ffffff"
                strokeWidth={1.5}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(slice.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        {/* Center label for Donut */}
        {donut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            {activeSlice ? (
              <>
                <span className="text-xs font-bold font-mono text-slate-800 leading-tight">
                  {activeSlice.pct}%
                </span>
                <span className="text-[9px] text-slate-500 truncate max-w-[55px] font-medium">
                  {activeSlice.action}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-bold font-mono text-slate-900 leading-tight">
                  {total}
                </span>
                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold">
                  Total
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex-1 w-full space-y-1 min-w-0">
        {slices.map((slice) => {
          const isHovered = hoveredIdx === slice.idx;
          return (
            <div
              key={slice.action}
              className={`flex items-center justify-between text-xs py-1 px-1.5 rounded-lg transition-colors cursor-pointer ${
                isHovered ? "bg-blue-50 font-bold" : "hover:bg-slate-50"
              }`}
              onMouseEnter={() => setHoveredIdx(slice.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: slice.color }}
                />
                <span className="truncate text-slate-800">{slice.action}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-slate-600 shrink-0 text-[11px]">
                <span className="font-semibold">{slice.count}</span>
                <span className="text-slate-400">({slice.pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MAX_GAP = 4;

function collapseToInstances(entries: Detection[]): ActionInstance[] {
  if (!entries.length) return [];
  const sorted = [...entries].sort(
    (a, b) => a.person_id - b.person_id || a.frame_number - b.frame_number,
  );

  const instances: ActionInstance[] = [];
  let runPersonId = sorted[0].person_id;
  let runStart = sorted[0].frame_number;
  let runEnd = sorted[0].frame_number;
  let runStartTs = sorted[0].timestamp;
  let runEndTs = sorted[0].timestamp;
  let runConfs: number[] = [sorted[0].confidence];
  let runAllScores: Record<string, number[]> = {};

  const accumScores = (det: Detection) => {
    if (!det.all_scores) return;
    for (const [k, v] of Object.entries(det.all_scores)) {
      if (!runAllScores[k]) runAllScores[k] = [];
      runAllScores[k].push(v);
    }
  };
  accumScores(sorted[0]);

  const flush = () => {
    const avgAllScores: Record<string, number> = {};
    for (const [k, vs] of Object.entries(runAllScores)) {
      avgAllScores[k] = vs.reduce((a, b) => a + b, 0) / vs.length;
    }
    instances.push({
      personId: runPersonId,
      startFrame: runStart,
      endFrame: runEnd,
      startTimestamp: runStartTs,
      endTimestamp: runEndTs,
      frameCount: runEnd - runStart + 1,
      avgConfidence: runConfs.reduce((a, b) => a + b, 0) / runConfs.length,
      avgAllScores,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.person_id === runPersonId && cur.frame_number - runEnd <= MAX_GAP) {
      runEnd = cur.frame_number;
      runEndTs = cur.timestamp;
      runConfs.push(cur.confidence);
      accumScores(cur);
    } else {
      flush();
      runPersonId = cur.person_id;
      runStart = cur.frame_number;
      runEnd = cur.frame_number;
      runStartTs = cur.timestamp;
      runEndTs = cur.timestamp;
      runConfs = [cur.confidence];
      runAllScores = {};
      accumScores(cur);
    }
  }
  flush();
  return instances.sort((a, b) => a.startFrame - b.startFrame);
}

const collapseDetectionsToEpisodes = (
  detections: Detection[],
  maxGap = 5,
): Array<{
  action: string;
  startFrame: number;
  endFrame: number;
  startTimestamp: string;
  endTimestamp: string;
  frameCount: number;
  avgConfidence: number;
}> => {
  if (detections.length === 0) return [];
  const sorted = [...detections].sort((a, b) => a.frame_number - b.frame_number);

  const episodes: Array<{
    action: string;
    startFrame: number;
    endFrame: number;
    startTimestamp: string;
    endTimestamp: string;
    frameCount: number;
    avgConfidence: number;
  }> = [];
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

const SEVERITY_STYLES: Record<string, { pill: string; border: string }> = {
  critical: {
    pill: "bg-red-50 text-red-700 border-red-200",
    border: "border-red-200",
  },
  high: {
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    border: "border-amber-200",
  },
  medium: {
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    border: "border-blue-200",
  },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
};

const shortTs = (ts: string) => ts.replace(/^00:/, "");
const cleanTs = (ts: string) => (ts.includes(".") ? ts.split(".")[0] : ts);

// ── AlertCard ──

function AlertCard({
  alert,
  onSeekToFrame,
  frameTimestampMap,
}: {
  alert: AlertEvent;
  onSeekToFrame: (frame: number) => void;
  frameTimestampMap: Map<number, string>;
}) {
  const severity = alert.severity_level.toLowerCase();
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium;
  const startTs =
    alert.start_timestamp || frameTimestampMap.get(alert.start_frame) || "";
  const endTs =
    alert.end_timestamp || frameTimestampMap.get(alert.end_frame) || "";
  const runLength = alert.end_frame - alert.start_frame + 1;

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.995 }}
      type="button"
      onClick={() => onSeekToFrame(alert.start_frame)}
      className={`w-full text-left rounded-[8px] border px-3 py-2.5 bg-[#ffffff] transition-shadow hover:shadow-sm ${style.border}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[#171717] font-mono">
          {shortTs(startTs)} – {shortTs(endTs)}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.pill}`}
        >
          {alert.severity_level}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#9a9a9a] font-mono">
        <span>
          f{alert.start_frame}–{alert.end_frame}
        </span>
        <span className="opacity-40">·</span>
        <div className="relative flex items-center">
          <span
            className={`size-1.5 rounded-full ${SEVERITY_DOT[severity] ?? SEVERITY_DOT.medium}`}
          />
          {severity === "high" && (
            <span
              className={`absolute size-1.5 rounded-full animate-ping opacity-60 ${SEVERITY_DOT[severity]}`}
            />
          )}
        </div>
        <User className="size-3" />
        <span>P{alert.person_id}</span>
        <span className="opacity-40">·</span>
        <span>{runLength} frames</span>
      </div>
    </motion.button>
  );
}

// ── ScoreBar ──

function ScoreBar({
  action,
  score,
  isTop,
}: {
  action: string;
  score: number;
  isTop: boolean;
}) {
  const color = getActionColor(action);
  const pct = Math.round(score * 100);

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-[62px] shrink-0 text-[10px] font-medium truncate"
        style={{ color: isTop ? color : "#9a9a9a" }}
      >
        {action}
      </span>
      <div className="flex-1 h-[5px] rounded-full bg-[#f0f0f0] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: isTop ? color : "#d4d4d4" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      </div>
      <span
        className="w-[28px] text-right text-[10px] font-mono shrink-0"
        style={{ color: isTop ? color : "#b0b0b0" }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ── InstanceCard ──

function InstanceCard({
  instance,
  action,
  onSeekToFrame,
  isSelected,
  expanded,
  onToggleExpand,
  onFocusPerson,
  onOpenPersonDetails,
}: {
  instance: ActionInstance;
  action: string;
  onSeekToFrame: (frame: number) => void;
  isSelected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onFocusPerson?: (personId: number) => void;
  onOpenPersonDetails?: (personId: number) => void;
}) {
  const hasScores = Object.keys(instance.avgAllScores).length > 0;

  const color = getActionColor(action);
  const bg = getActionBg(action);
  const text = getActionText(action);
  const isSingleFrame = instance.startFrame === instance.endFrame;
  const confPct = Math.round(instance.avgConfidence * 100);
  const startTime = cleanTs(shortTs(instance.startTimestamp));
  const endTime = cleanTs(shortTs(instance.endTimestamp));

  const sortedScores = Object.entries(instance.avgAllScores).sort(
    ([, a], [, b]) => b - a,
  );

  const handleRowClick = () => {
    onSeekToFrame(instance.startFrame);
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  return (
    <div
      className="w-full rounded-[8px] border bg-[#ffffff] overflow-hidden transition-shadow hover:shadow-sm"
      style={{
        borderColor: color + "44",
        boxShadow: isSelected ? `0 0 0 2px ${color}22` : undefined,
        background: isSelected ? `${color}0d` : "#ffffff",
      }}
    >
      <div
        role="button"
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleRowClick();
        }}
        className="w-full text-left px-3 py-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[12px] text-[#707070]">
              <User className="size-3" />P{instance.personId}
            </span>
            {onFocusPerson && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusPerson(instance.personId);
                  onSeekToFrame(instance.startFrame);
                }}
                className="p-0.5 rounded hover:bg-blue-50 text-[#9a9a9a] hover:text-[#0052ff] transition-colors"
                title={`Focus Person #${instance.personId} on video`}
              >
                <Eye className="size-3" />
              </button>
            )}
            {onOpenPersonDetails && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPersonDetails(instance.personId);
                }}
                className="p-0.5 rounded hover:bg-slate-100 text-[#9a9a9a] hover:text-[#171717] transition-colors"
                title={`View Person #${instance.personId} details`}
              >
                <Info className="size-3" />
              </button>
            )}
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5"
              style={{ color: text, background: bg }}
            >
              {confPct}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-mono text-[12px] text-[#707070]">
              <Clock className="size-3" />
              {isSingleFrame ? startTime : `${startTime}–${endTime}`}
            </div>
            {hasScores && (
              <button
                type="button"
                onClick={handleChevronClick}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-[#f5f5f5] transition-colors"
                aria-label={expanded ? "Collapse scores" : "Expand scores"}
              >
                <ChevronDown
                  className="size-3 text-[#b0b0b0] transition-transform duration-200"
                  style={{
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasScores && (
          <motion.div
            key="scores"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-3 pb-3 pt-1 flex flex-col gap-1.5 border-t"
              style={{ borderColor: color + "22" }}
            >
              <span className="text-[9px] uppercase tracking-widest text-[#c0c0c0] font-semibold mb-0.5">
                Avg score per action
              </span>
              {sortedScores.map(([a, score]) => (
                <ScoreBar
                  key={a}
                  action={a}
                  score={score}
                  isTop={a.toLowerCase() === action.toLowerCase()}
                />
              ))}
              <p className="text-[9px] text-[#c8c8c8] mt-1 font-mono">
                {instance.frameCount} frame
                {instance.frameCount !== 1 ? "s" : ""} · f{instance.startFrame}–
                {instance.endFrame}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ActionSummaryRow ──

function ActionSummaryRow({
  action,
  instances,
  avgConfidence,
  open,
  active,
}: {
  action: string;
  instances: ActionInstance[];
  avgConfidence: number;
  open: boolean;
  active: boolean;
}) {
  const color = getActionColor(action);
  const bg = getActionBg(action);
  const text = getActionText(action);
  const confPct = Math.round(avgConfidence * 100);

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-3"
      style={{
        background: active ? `${color}12` : "transparent",
        boxShadow: active ? `inset 2px 0 0 ${color}` : undefined,
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />
      <span className="flex-1 text-[13px] font-medium text-[#171717]">
        {action}
      </span>
      <span
        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: bg, color: text }}
      >
        {confPct}%
      </span>
      <span className="text-[11px] text-[#9a9a9a]">{instances.length}</span>
      <ChevronDown
        className="size-3.5 text-[#9a9a9a] transition-transform"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </div>
  );
}

// ── Main Component with Tabs ──

export const Logs: React.FC<LogsProps> = ({
  analysis,
  onSeekToFrame,
  selectedTag,
  focusedPersonId = null,
  onFocusPerson = () => {},
  onClearFocus = () => {},
  onOpenPersonDetails = () => {},
  currentFrameNumber = 1,
  totalFrames = 1,
  seekFps = 30,
  detectionsByFrame = new Map(),
  detectionsByPerson = new Map(),
  sidebarTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<SidebarTab>("detections");
  const currentTab = sidebarTab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;

  const [filterOpen, setFilterOpen] = useState(false);
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());
  const [openActions, setOpenActions] = useState<Set<string>>(new Set());
  const [openInstanceKey, setOpenInstanceKey] = useState<string | null>(null);
  const instanceRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const groupedActions = useMemo(() => {
    return analysis
      ? Object.entries(analysis.grouped_detections ?? {})
          .map(([action, entries]) => {
            const instances = collapseToInstances(entries as Detection[]);
            const avgConfidence =
              analysis.action_confidence_scores?.[action] ?? 0;
            return { action, instances, avgConfidence };
          })
          .sort((a, b) => b.avgConfidence - a.avgConfidence)
      : [];
  }, [analysis]);

  const allActions = useMemo(() => groupedActions.map((entry) => entry.action), [groupedActions]);
  const selectedAction = selectedTag?.action ?? null;

  const selectedInstanceKey = useMemo(() => {
    if (!selectedTag) return null;
    const entry = groupedActions.find(
      (group) => group.action === selectedTag.action,
    );
    if (!entry) return null;

    const candidates = entry.instances.filter(
      (instance) => instance.personId === selectedTag.personId,
    );
    if (candidates.length === 0) return null;

    const overlap = candidates.find(
      (instance) =>
        instance.startFrame <= selectedTag.endFrame &&
        instance.endFrame >= selectedTag.startFrame,
    );

    const bestMatch =
      overlap ??
      candidates.reduce(
        (best, instance) => {
          const distance =
            selectedTag.startFrame < instance.startFrame
              ? instance.startFrame - selectedTag.startFrame
              : selectedTag.startFrame > instance.endFrame
                ? selectedTag.startFrame - instance.endFrame
                : 0;

          if (!best) return { instance, distance };
          return distance < best.distance ? { instance, distance } : best;
        },
        null as { instance: ActionInstance; distance: number } | null,
      )?.instance;

    if (!bestMatch) return null;

    return `${selectedTag.action}-p${bestMatch.personId}-f${bestMatch.startFrame}-${bestMatch.endFrame}`;
  }, [groupedActions, selectedTag]);

  const toggleHiddenAction = (action: string) => {
    setHiddenActions((prev) => {
      const next = new Set(prev);
      next.has(action) ? next.delete(action) : next.add(action);
      return next;
    });
  };

  const filteredActions = groupedActions.filter(
    (entry) => !hiddenActions.has(entry.action),
  );

  useEffect(() => {
    if (!selectedAction) return;
    setOpenActions((prev) => {
      const next = new Set(prev);
      next.add(selectedAction);
      return next;
    });
    setHiddenActions((prev) => {
      if (!prev.has(selectedAction)) return prev;
      const next = new Set(prev);
      next.delete(selectedAction);
      return next;
    });
  }, [selectedAction]);

  useEffect(() => {
    if (!selectedInstanceKey) return;
    setOpenInstanceKey(selectedInstanceKey);
  }, [selectedInstanceKey]);

  useEffect(() => {
    if (!selectedInstanceKey) return;
    const frame = requestAnimationFrame(() => {
      const node = instanceRefs.current.get(selectedInstanceKey);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedInstanceKey, openActions, filteredActions.length]);

  // Frame statistics
  const frameDetections = useMemo(() => {
    return detectionsByFrame.get(currentFrameNumber) ?? [];
  }, [detectionsByFrame, currentFrameNumber]);

  const frameActionCounts = useMemo(() => {
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
      pct: frameDetections.length > 0 ? (data.count / frameDetections.length) * 100 : 0,
    }));
  }, [frameDetections]);

  const wavingInFrame = useMemo(() => {
    return frameDetections.filter((d) => d.action_label.toLowerCase().includes("wav"));
  }, [frameDetections]);

  // Person statistics for focusedPersonId
  const focusedPersonDetections = useMemo(() => {
    if (focusedPersonId === null) return [];
    return detectionsByPerson.get(focusedPersonId) ?? [];
  }, [detectionsByPerson, focusedPersonId]);

  const focusedCurrentDetection = useMemo(() => {
    return frameDetections.find((d) => d.person_id === focusedPersonId) ?? null;
  }, [frameDetections, focusedPersonId]);

  const focusedPersonEpisodes = useMemo(() => {
    return collapseDetectionsToEpisodes(focusedPersonDetections);
  }, [focusedPersonDetections]);

  const focusedPersonActionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of focusedPersonDetections) {
      counts[d.action_label] = (counts[d.action_label] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);
  }, [focusedPersonDetections]);

  // Whole video action totals
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

  const uniquePersonIds = useMemo(() => {
    return Array.from(detectionsByPerson.keys()).sort((a, b) => a - b);
  }, [detectionsByPerson]);

  if (!analysis) {
    return (
      <div
        className="w-full h-full rounded-lg border border-[#ededed] bg-[#ffffff] flex flex-col"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ededed]">
          <Activity className="size-3.5 text-[#1a1a1a]" />
          <TitleMono text="Detections & Analysis" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-[#9a9a9a] text-center px-6">
            Run analysis to view action logs, frame details, and person metadata.
          </p>
        </div>
      </div>
    );
  }

  const frameTimestampMap = new Map<number, string>();
  Object.values(analysis.grouped_detections ?? {}).forEach((entries) => {
    (entries as Detection[]).forEach((entry) => {
      if (entry.timestamp && !frameTimestampMap.has(entry.frame_number)) {
        frameTimestampMap.set(entry.frame_number, entry.timestamp);
      }
    });
  });

  const alerts = analysis.alert_events ?? [];

  return (
    <div
      className="w-full h-full rounded-lg border border-[#ededed] bg-[#ffffff] flex flex-col overflow-hidden"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      {/* ── Sidebar Tab Navigation Header ── */}
      <div className="flex items-center justify-between border-b border-[#ededed] bg-slate-50/60 p-1.5 shrink-0 gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab("detections")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
            currentTab === "detections"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Activity size={13} />
          <span>Logs</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("frame")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
            currentTab === "frame"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Film size={13} />
          <span>Frame #{currentFrameNumber}</span>
          {frameDetections.length > 0 && (
            <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-mono">
              {frameDetections.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (focusedPersonId !== null || uniquePersonIds.length > 0) {
              if (focusedPersonId === null && uniquePersonIds.length > 0) {
                onFocusPerson(uniquePersonIds[0]);
              }
              setTab("person");
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
            currentTab === "person"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : focusedPersonId !== null
                ? "text-[#0052ff] bg-blue-50/50 hover:bg-blue-50"
                : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <User size={13} />
          <span>{focusedPersonId !== null ? `P#${focusedPersonId}` : "Person"}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
            currentTab === "overview"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <PieChart size={13} />
          <span>Overview</span>
        </button>
      </div>

      {/* ── TAB 1: DETECTION LOGS ── */}
      {currentTab === "detections" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Action Filter Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#ededed] bg-white shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a] font-mono">
              Action Timeline Logs
            </span>
            <div
              className="relative ml-auto"
              tabIndex={0}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setFilterOpen(false);
                }
              }}
            >
              <button
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-[#ededed] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a] hover:text-[#171717] hover:border-[#d6d6d6] transition-colors"
              >
                Filter
                <ChevronDown
                  className="size-3 text-[#b0b0b0] transition-transform"
                  style={{
                    transform: filterOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              {filterOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-[8px] border border-[#ededed] bg-[#ffffff] shadow-lg z-20 p-2">
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">
                      Actions
                    </span>
                    <button
                      type="button"
                      onClick={() => setHiddenActions(new Set())}
                      className="text-[10px] font-semibold text-[#707070] hover:text-[#171717]"
                    >
                      Show all
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto pr-1">
                    {allActions.length === 0 ? (
                      <p className="px-1 py-2 text-[11px] text-[#9a9a9a]">
                        No actions yet.
                      </p>
                    ) : (
                      allActions.map((action) => {
                        const color = getActionColor(action);
                        const visible = !hiddenActions.has(action);
                        return (
                          <label
                            key={action}
                            className="flex items-center gap-2 px-1 py-1.5 text-[11px] text-[#171717]"
                          >
                            <input
                              type="checkbox"
                              checked={visible}
                              onChange={() => toggleHiddenAction(action)}
                              className="accent-[#1f2937]"
                            />
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ background: color }}
                            />
                            <span className="truncate">{action}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#ededed]">
            {/* Alerts */}
            {alerts.length > 0 && (
              <details className="group" open>
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 hover:bg-[#fafafa] list-none transition-colors">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-[#171717]">
                    <AlertTriangle className="size-3.5 text-red-500" />
                    Alerts
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      {alerts.length}
                    </span>
                    <ChevronDown className="size-3.5 text-[#9a9a9a] transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <div className="flex flex-col gap-1.5 px-3 pb-3">
                  {alerts.map((alert) => (
                    <AlertCard
                      key={`alert-${alert.person_id}-${alert.start_frame}`}
                      alert={alert}
                      onSeekToFrame={onSeekToFrame}
                      frameTimestampMap={frameTimestampMap}
                    />
                  ))}
                </div>
              </details>
            )}

            {/* Actions */}
            {filteredActions.length === 0 ? (
              <div className="px-4 py-3 text-[12px] text-[#9a9a9a]">
                {groupedActions.length > 0
                  ? "All actions are filtered out."
                  : "No detections available."}
              </div>
            ) : (
              filteredActions.map(({ action, instances, avgConfidence }) => (
                <details
                  key={action}
                  className="group"
                  open={openActions.has(action)}
                  onToggle={(e) => {
                    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                    setOpenActions((prev) => {
                      const next = new Set(prev);
                      if (isOpen) next.add(action);
                      else next.delete(action);
                      return next;
                    });
                  }}
                >
                  <summary className="list-none cursor-pointer hover:bg-[#fafafa] transition-colors">
                    <ActionSummaryRow
                      action={action}
                      instances={instances}
                      avgConfidence={avgConfidence}
                      open={openActions.has(action)}
                      active={selectedAction === action}
                    />
                  </summary>
                  <div className="flex flex-col gap-1.5 px-3 pb-3">
                    {instances.map((instance) => {
                      const key = `${action}-p${instance.personId}-f${instance.startFrame}-${instance.endFrame}`;
                      const isSelected = key === selectedInstanceKey;
                      const isExpanded = key === openInstanceKey;
                      return (
                        <div
                          key={key}
                          ref={(node) => {
                            if (node) instanceRefs.current.set(key, node);
                            else instanceRefs.current.delete(key);
                          }}
                        >
                          <InstanceCard
                            instance={instance}
                            action={action}
                            onSeekToFrame={onSeekToFrame}
                            isSelected={isSelected}
                            expanded={isExpanded}
                            onToggleExpand={() =>
                              setOpenInstanceKey((prev) =>
                                prev === key ? null : key,
                              )
                            }
                            onFocusPerson={(pId) => {
                              onFocusPerson(pId);
                              setTab("person");
                            }}
                            onOpenPersonDetails={(pId) => {
                              onFocusPerson(pId);
                              setTab("person");
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: FRAME DETAILS ── */}
      {currentTab === "frame" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Frame & Timestamp Selector */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Film size={14} className="text-slate-600" />
              <span className="text-xs font-bold text-slate-800">
                Frame #{currentFrameNumber}
              </span>
              <span className="text-[11px] font-mono text-slate-400">/ {totalFrames}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentFrameNumber <= 1}
                onClick={() => onSeekToFrame(Math.max(1, currentFrameNumber - 1))}
                className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                title="Previous frame"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                disabled={currentFrameNumber >= totalFrames}
                onClick={() => onSeekToFrame(Math.min(totalFrames, currentFrameNumber + 1))}
                className="p-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                title="Next frame"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Detections
              </span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono text-slate-900">
                  {frameDetections.length}
                </span>
                <span className="text-[10px] text-slate-400">
                  {frameDetections.length === 1 ? "person" : "people"}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Waving Alert
              </span>
              <div className="mt-1">
                {wavingInFrame.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    <AlertTriangle size={11} /> {wavingInFrame.length} Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={11} /> None
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Distribution Pie Chart in Frame */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <PieChart size={13} className="text-slate-500" />
                Action Distribution Pie Chart
              </span>
              <span className="text-[10px] font-mono text-slate-400">Frame #{currentFrameNumber}</span>
            </div>

            <ActionPieChart data={frameActionCounts} size={130} donut={true} />
          </div>

          {/* Detected Persons in Frame List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Persons in Frame ({frameDetections.length})
              </span>
              <span className="text-[10px] text-slate-400">Click Focus to highlight</span>
            </div>

            {frameDetections.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No persons detected at Frame #{currentFrameNumber}. Scrub the timeline or seek to active frames.
              </div>
            ) : (
              <div className="space-y-2">
                {frameDetections.map((det) => {
                  const isFocused = det.person_id === focusedPersonId;
                  const color = getActionColor(det.action_label);
                  const bg = getActionBg(det.action_label);
                  const text = getActionText(det.action_label);

                  return (
                    <div
                      key={`frame-det-${det.person_id}`}
                      className={`p-3 rounded-xl border transition-all ${
                        isFocused
                          ? "border-[#0052ff] bg-blue-50/50 shadow-xs"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            Person #{det.person_id}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: bg, color: text }}
                          >
                            {det.action_label} ({(det.confidence * 100).toFixed(0)}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onFocusPerson(det.person_id);
                              setTab("person");
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                            title="Inspect Person Details"
                          >
                            <Info size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isFocused) onClearFocus();
                              else onFocusPerson(det.person_id);
                            }}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                              isFocused
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            {isFocused ? "Unfocus" : "Focus"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: PERSON DETAILS (INSPECTOR) ── */}
      {currentTab === "person" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
          {focusedPersonId !== null ? (
            <>
              {/* Person Header Banner */}
              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    P{focusedPersonId}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Person #{focusedPersonId} Metadata
                    </h4>
                    <span className="text-[10px] text-blue-700 font-medium">
                      {focusedPersonDetections.length} frames tracked in video
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClearFocus}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-blue-100/70 transition-colors"
                >
                  Clear Focus
                </button>
              </div>

              {/* Current Frame Snapshot */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                  <span>Frame #{currentFrameNumber} Snapshot</span>
                  <span className="font-mono text-slate-400 font-normal">
                    {focusedCurrentDetection ? focusedCurrentDetection.timestamp : "Not in frame"}
                  </span>
                </div>

                {focusedCurrentDetection ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Action
                        </span>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: getActionColor(focusedCurrentDetection.action_label) }}
                          />
                          <span className="text-xs font-bold text-slate-900">
                            {focusedCurrentDetection.action_label}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Confidence
                        </span>
                        <div className="mt-0.5 text-xs font-bold font-mono text-slate-900">
                          {(focusedCurrentDetection.confidence * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Action Probabilities */}
                    {focusedCurrentDetection.all_scores && Object.keys(focusedCurrentDetection.all_scores).length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Probabilities
                        </span>
                        <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          {Object.entries(focusedCurrentDetection.all_scores)
                            .sort(([, a], [, b]) => b - a)
                            .map(([a, s]) => (
                              <div key={a} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600">{a}</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {Math.round(s * 100)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 text-xs text-amber-800 border border-amber-200">
                    Person #{focusedPersonId} is not in Frame #{currentFrameNumber}.
                  </div>
                )}
              </div>

              {/* Session Action Breakdown Pie Chart for this Person */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <PieChart size={13} className="text-slate-500" />
                  Person #{focusedPersonId} Action Pie Chart
                </span>
                <ActionPieChart data={focusedPersonActionCounts} size={130} donut={true} />
              </div>

              {/* Action History Timeline for Person */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Action History Timeline
                  </span>
                  <span className="text-[10px] text-slate-400">Click to seek</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {focusedPersonEpisodes.map((ep, idx) => {
                    const bg = getActionBg(ep.action);
                    const text = getActionText(ep.action);
                    const isCurrent =
                      currentFrameNumber >= ep.startFrame && currentFrameNumber <= ep.endFrame;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSeekToFrame(ep.startFrame)}
                        className={`w-full text-left p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${
                          isCurrent ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: bg, color: text }}
                          >
                            {ep.action}
                          </span>
                          <div className="text-[11px] font-mono text-slate-700 truncate">
                            f{ep.startFrame}–{ep.endFrame} ({ep.startTimestamp})
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-semibold text-slate-600 shrink-0">
                          {Math.round(ep.avgConfidence * 100)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 space-y-3">
              <User size={24} className="mx-auto text-slate-300" />
              <p>No person selected. Click on a person's bounding box on the video or choose from the list below:</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {uniquePersonIds.map((pId) => (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => onFocusPerson(pId)}
                    className="px-2.5 py-1 rounded-md bg-blue-50 text-[#0052ff] hover:bg-blue-100 text-xs font-semibold"
                  >
                    Person #{pId}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: WHOLE VIDEO OVERVIEW ── */}
      {currentTab === "overview" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Whole Video Action Breakdown Pie Chart */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <PieChart size={14} className="text-slate-500" />
              Whole Video Action Distribution
            </span>
            <ActionPieChart data={wholeVideoActionStats} size={140} donut={true} />
          </div>

          {/* All Tracked Persons */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Users size={14} className="text-slate-500" />
              All Tracked Persons ({uniquePersonIds.length})
            </span>
            <div className="grid grid-cols-2 gap-2">
              {uniquePersonIds.map((pId) => {
                const pDets = detectionsByPerson.get(pId) || [];
                return (
                  <button
                    key={`all-p-${pId}`}
                    type="button"
                    onClick={() => {
                      onFocusPerson(pId);
                      setTab("person");
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 text-left transition-colors"
                  >
                    <div className="text-xs font-bold text-slate-900">Person #{pId}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{pDets.length} frames</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Logs;
