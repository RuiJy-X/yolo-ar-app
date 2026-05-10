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
import TitleMono from "./titile-mono";

type LogsProps = {
  analysis: AnalyzeVideoResponse | null;
  onSeekToFrame: (frame: number) => void;
};

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

  const flush = () =>
    instances.push({
      personId: runPersonId,
      startFrame: runStart,
      endFrame: runEnd,
      startTimestamp: runStartTs,
      endTimestamp: runEndTs,
      frameCount: runEnd - runStart + 1,
      avgConfidence: runConfs.reduce((a, b) => a + b, 0) / runConfs.length,
    });

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur.person_id === runPersonId && cur.frame_number - runEnd <= MAX_GAP) {
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

// ── InstanceCard ──

function InstanceCard({
  instance,
  action,
  onSeekToFrame,
}: {
  instance: ActionInstance;
  action: string;
  onSeekToFrame: (frame: number) => void;
}) {
  const color = getActionColor(action);
  const bg = getActionBg(action);
  const text = getActionText(action);
  const isSingleFrame = instance.startFrame === instance.endFrame;
  const confPct = Math.round(instance.avgConfidence * 100);
  const startTime = cleanTs(shortTs(instance.startTimestamp));
  const endTime = cleanTs(shortTs(instance.endTimestamp));

  return (
    <button
      type="button"
      onClick={() => onSeekToFrame(instance.startFrame)}
      className="w-full text-left rounded-[8px] border bg-[#ffffff] px-3 py-2 transition-shadow hover:shadow-sm"
      style={{ borderColor: color + "44" }}
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
        <div className="flex items-center gap-1 font-mono text-[12px] text-[#707070]">
          <Clock className="size-3" />
          {isSingleFrame ? startTime : `${startTime}–${endTime}`}
        </div>
      </div>
    </button>
  );
}

// ── ActionSummaryRow ──

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
    <div className="flex items-center gap-2.5 px-4 py-3">
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

const Logs = ({ analysis, onSeekToFrame }: LogsProps) => {
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
        {groupedActions.map(({ action, instances, avgConfidence }) => (
          <details key={action} className="group">
            <summary className="list-none cursor-pointer hover:bg-[#fafafa] transition-colors">
              <ActionSummaryRow
                action={action}
                instances={instances}
                avgConfidence={avgConfidence}
                open={false}
              />
            </summary>
            <div className="flex flex-col gap-1.5 px-3 pb-3">
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