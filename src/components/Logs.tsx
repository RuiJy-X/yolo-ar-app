import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalyzeVideoResponse, AlertEvent } from "@/lib/types";
import type { ActionTimelineTag } from "@/pages/library/useLibrary";
import {
  getActionColor,
  getActionBg,
  getActionText,
} from "@/pages/library/action-colors";
import TitleMono from "./titile-mono";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
  selectedTag?: ActionTimelineTag | null;
};

type Detection = {
  frame_number: number;
  action_label: string;
  confidence: number;
  person_id: number;
  timestamp: string;
  all_scores?: Record<string, number>; // all action confidences from model
};

type ActionInstance = {
  personId: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: string;
  endTimestamp: string;
  frameCount: number;
  avgConfidence: number;
  avgAllScores: Record<string, number>; // averaged across detections in run
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

// ── ScoreBar — single action row inside the breakdown ──

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
}: {
  instance: ActionInstance;
  action: string;
  onSeekToFrame: (frame: number) => void;
  isSelected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasScores = Object.keys(instance.avgAllScores).length > 0;

  const color = getActionColor(action);
  const bg = getActionBg(action);
  const text = getActionText(action);
  const isSingleFrame = instance.startFrame === instance.endFrame;
  const confPct = Math.round(instance.avgConfidence * 100);
  const startTime = cleanTs(shortTs(instance.startTimestamp));
  const endTime = cleanTs(shortTs(instance.endTimestamp));

  // Sort scores highest → lowest for display
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
      {/* Main row — clickable to seek */}
      <button
        type="button"
        onClick={handleRowClick}
        className="w-full text-left px-3 py-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[12px] text-[#707070]">
              <User className="size-3" />P{instance.personId}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
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
            {/* Expand toggle — only show if scores are available */}
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
      </button>

      {/* Score breakdown — animated expand */}
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

// ── Main ──

const Logs = ({ analysis, onSeekToFrame, selectedTag }: LogsProps) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());
  const [openActions, setOpenActions] = useState<Set<string>>(new Set());
  const [openInstanceKey, setOpenInstanceKey] = useState<string | null>(null);
  const instanceRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const groupedActions = analysis
    ? Object.entries(analysis.grouped_detections ?? {})
        .map(([action, entries]) => {
          const instances = collapseToInstances(entries as Detection[]);
          const avgConfidence =
            analysis.action_confidence_scores?.[action] ?? 0;
          return { action, instances, avgConfidence };
        })
        .sort((a, b) => b.avgConfidence - a.avgConfidence)
    : [];

  const allActions = groupedActions.map((entry) => entry.action);

  const selectedAction = selectedTag?.action ?? null;
  const selectedInstanceKey = useMemo(() => {
    if (!selectedTag) return null;
    return `${selectedTag.action}-p${selectedTag.personId}-f${selectedTag.startFrame}-${selectedTag.endFrame}`;
  }, [selectedTag]);

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

  if (!analysis) {
    return (
      <div
        className="w-full h-full rounded-lg border border-[#ededed] bg-[#ffffff] flex flex-col"
        style={{ boxShadow: "var(--shadow-1)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ededed]">
          <Activity className="size-3.5 text-[#1a1a1a]" />
          <TitleMono text="Detections" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-[#9a9a9a] text-center px-6">
            Run analysis to view action logs.
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
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ededed] shrink-0">
        <Activity className="size-3.5 text-[#9a9a9a]" />
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]"
          style={{ fontFamily: "var(--mono)" }}
        >
          Detections
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
            className="flex items-center gap-1.5 rounded-full border border-[#ededed] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a] hover:text-[#171717] hover:border-[#d6d6d6] transition-colors"
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
  );
};

export default Logs;
