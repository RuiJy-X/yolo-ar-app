import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Clock,
  User,
} from "lucide-react";
import type { AnalyzeVideoResponse, AlertEvent } from "@/lib/types";
import {
  getActionColor,
  getActionBg,
  getActionText,
} from "@/pages/library/action-colors";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
};

// ── Types ──────────────────────────────────────────────────────────────────

type Detection = {
  frame_number: number;
  action_label: string;
  confidence: number;
  person_id: number;
  timestamp: string;
};

type ActionInstance = {
  personId: number;
  startFrame: number;
  endFrame: number;
  startTimestamp: string;
  endTimestamp: string;
  frameCount: number;
  avgConfidence: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

  const flush = () => {
    instances.push({
      personId: runPersonId,
      startFrame: runStart,
      endFrame: runEnd,
      startTimestamp: runStartTs,
      endTimestamp: runEndTs,
      frameCount: runEnd - runStart + 1,
      avgConfidence: runConfs.reduce((a, b) => a + b, 0) / runConfs.length,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const samePerson = cur.person_id === runPersonId;
    const withinGap = cur.frame_number - runEnd <= MAX_GAP;

    if (samePerson && withinGap) {
      runEnd = cur.frame_number;
      runEndTs = cur.timestamp;
      runConfs.push(cur.confidence);
    } else {
      flush();
      runPersonId = cur.person_id;
      runStart = cur.frame_number;
      runEnd = cur.frame_number;
      runStartTs = cur.timestamp;
      runEndTs = cur.timestamp;
      runConfs = [cur.confidence];
    }
  }
  flush();

  return instances.sort((a, b) => a.startFrame - b.startFrame);
}

// ── Severity styles ────────────────────────────────────────────────────────

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

// Trim timestamp to mm:ss.ms — drop the leading 00: hour if present
const shortTs = (ts: string) => ts.replace(/^00:/, "");

// ── AlertCard ──────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onSeekToFrame,
  frameTimestampMap,
}: {
  alert: AlertEvent;
  onSeekToFrame: (frame: number) => void;
  frameTimestampMap: Map<number, string>;
}) {
  const runLength = alert.end_frame - alert.start_frame + 1;
  const severity = alert.severity_level.toLowerCase();
  const startTs =
    alert.start_timestamp || frameTimestampMap.get(alert.start_frame) || "";
  const endTs =
    alert.end_timestamp || frameTimestampMap.get(alert.end_frame) || "";

  return (
    <motion.button
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      type="button"
      onClick={() => onSeekToFrame(alert.start_frame)}
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-red-400/60 hover:shadow-sm group"
    >
      <div className="flex items-center justify-between gap-2">
        {/* Primary: trimmed timestamps */}
        <span className="text-sm font-bold text-black/90 font-mono whitespace-nowrap">
          {shortTs(startTs)} – {shortTs(endTs)}
        </span>

        {/* Severity Badge */}
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold ${
            SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium
          }`}
        >
          {alert.severity_level}
        </span>
      </div>

      {/* Secondary: technical reference */}
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-black/40 font-mono">
        <span className="shrink-0">
          f{alert.start_frame}–{alert.end_frame}
        </span>
        <span className="mx-0.5 opacity-50">·</span>

        {/* Animated Status Dot */}
        <div className="relative flex items-center justify-center">
          <span
            className={`size-1.5 rounded-full ${SEVERITY_DOT[severity] ?? SEVERITY_DOT.medium}`}
          />
          {severity === "high" && (
            <span
              className={`absolute size-1.5 rounded-full animate-ping opacity-75 ${SEVERITY_DOT[severity]}`}
            />
          )}
        </div>

        <User className="size-3 -ml-0.5 opacity-70" />
        <span className="truncate">P{alert.person_id}</span>
        <span className="mx-0.5 opacity-50">·</span>
        <span className="shrink-0 group-hover:text-black/60 transition-colors">
          {runLength} frames
        </span>
      </div>
    </motion.button>
  );
}

// ── InstanceCard ───────────────────────────────────────────────────────────

function InstanceCard({
  instance,
  action,
  onSeekToFrame,
}: {
  instance: ActionInstance;
  action: string;
  onSeekToFrame: (frame: number) => void;
}) {
  const isSingleFrame = instance.startFrame === instance.endFrame;
  const color = getActionColor(action);
  const confPct = Math.round(instance.avgConfidence * 100);

  // Helper to strip milliseconds
  const cleanTs = (ts: string) => (ts.includes(".") ? ts.split(".")[0] : ts);

  const startTime = cleanTs(shortTs(instance.startTimestamp));
  const endTime = cleanTs(shortTs(instance.endTimestamp));

  return (
    <button
      type="button"
      onClick={() => onSeekToFrame(instance.startFrame)}
      className="w-full rounded-md border bg-white px-3 py-2 text-left transition hover:brightness-95"
      style={{ borderColor: color + "55" }}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Left Side: Person & Confidence */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="flex items-center gap-1 text-xs text-black/60">
            <User className="size-3.5" />P{instance.personId}
          </span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              color: getActionText(action),
              backgroundColor: color + "20",
            }}
          >
            {confPct}%
          </span>
        </div>

        {/* Right Side: Timestamps */}
        <div className="flex items-center font-mono text-xs text-black/80 whitespace-nowrap overflow-hidden">
          <Clock className="size-3.5 mr-1.5 flex-shrink-0" />
          <span>{isSingleFrame ? startTime : `${startTime}–${endTime}`}</span>
        </div>
      </div>
    </button>
  );
}

// ── Action summary row ─────────────────────────────────────────────────────

function ActionSummaryRow({
  action,
  instances,
  avgConfidence,
  open,
}: {
  action: string;
  instances: ActionInstance[];
  avgConfidence: number;
  open: boolean;
}) {
  const color = getActionColor(action);
  const bg = getActionBg(action);
  const text = getActionText(action);
  const confPct = Math.round(avgConfidence * 100);

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      {/* Color dot */}
      <span
        className="inline-block size-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {/* Label */}
      <div className="flex-1 font-semibold font-heading text-black/70 text-sm flex gap-2 items">
        {action}
        {/* Confidence chip */}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: bg, color: text }}
        >
          <span className="text-sm text-black/50 font-mono"></span> {confPct}%
        </span>
      </div>
      {/* Instance count */}
      <span className="text-xs text-gray-500">
        {instances.length} {instances.length === 1 ? "instance" : "instances"}
      </span>
      <ChevronDown
        className="size-4 transition-transform text-black/40"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const Logs = ({ analysis, onSeekToFrame }: LogsProps) => {
  if (!analysis) {
    return (
      <div className="w-full h-full rounded-md border border-[#D6E4FF] bg-white p-4">
        <div className="text-sm font-semibold uppercase tracking-wide text-[#344054] flex items-center gap-2">
          <Activity className="size-4" />
          Detections
        </div>
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-[#344054]/80">
            Run the analysis to view grouped action logs.
          </p>
        </div>
      </div>
    );
  }

  const groupedActions = Object.entries(analysis.grouped_detections)
    .map(([action, entries]) => {
      const instances = collapseToInstances(entries as Detection[]);
      const avgConfidence = analysis.action_confidence_scores?.[action] ?? 0;
      return { action, instances, avgConfidence };
    })
    .sort((a, b) => b.avgConfidence - a.avgConfidence);

  const frameTimestampMap = new Map<number, string>();
  Object.values(analysis.grouped_detections).forEach((entries) => {
    (entries as Detection[]).forEach((entry) => {
      if (entry.timestamp && !frameTimestampMap.has(entry.frame_number)) {
        frameTimestampMap.set(entry.frame_number, entry.timestamp);
      }
    });
  });

  const alerts = analysis.alert_events ?? [];

  return (
    <div className="w-full h-full rounded-xl border border-[#D6E4FF] bg-white shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 text-sm font-semibold uppercase tracking-wide text-[#344054] font-heading border-b border-[#D6E4FF] flex-shrink-0">
        <Activity className="size-4" />
        Detections
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-[#D6E4FF]">
        {/* ── Alerts accordion ── */}
        {alerts.length > 0 && (
          <details className="group" open>
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50 list-none">
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
            <div className="space-y-2 px-3 pb-3">
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

        {/* ── Action accordions — sorted by confidence ── */}
        {groupedActions.map(({ action, instances, avgConfidence }) => (
          <details key={action} className="group">
            <summary className="list-none cursor-pointer hover:bg-slate-50">
              <ActionSummaryRow
                action={action}
                instances={instances}
                avgConfidence={avgConfidence}
                open={false}
              />
            </summary>
            <div className="space-y-2 px-3 pb-3">
              {instances.map((instance) => (
                <InstanceCard
                  key={`${action}-p${instance.personId}-f${instance.startFrame}`}
                  instance={instance}
                  action={action}
                  onSeekToFrame={onSeekToFrame}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
};

export default Logs;
