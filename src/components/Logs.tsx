import { Activity, AlertTriangle, ChevronDown, User } from "lucide-react";
import type { AnalyzeVideoResponse, AlertEvent } from "@/lib/types";

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

/** A run of consecutive frames for one person doing one action. */
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

/**
 * Collapse a flat list of per-frame detections (already filtered to one action
 * label) into consecutive-frame instances.
 *
 * Two frames are considered "consecutive" when they belong to the same person
 * AND differ by at most MAX_GAP frames (allows for the occasional missed frame
 * inside what is conceptually one continuous action segment).
 */
const MAX_GAP = 4; // frames; tune as needed

function collapseToInstances(entries: Detection[]): ActionInstance[] {
  if (!entries.length) return [];

  // Sort by person, then frame so we can do a single linear pass.
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
      // Extend current run
      runEnd = cur.frame_number;
      runEndTs = cur.timestamp;
      runConfs.push(cur.confidence);
    } else {
      // Flush current run and start a new one
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

  // Sort output by start frame so the list is chronological
  return instances.sort((a, b) => a.startFrame - b.startFrame);
}

// ── Severity styles (shared with AlertCard) ────────────────────────────────

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

// ── Sub-components ─────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onSeekToFrame,
}: {
  alert: AlertEvent;
  onSeekToFrame: (frame: number) => void;
}) {
  const runLength = alert.end_frame - alert.start_frame + 1;
  const severity = alert.severity_level.toLowerCase();

  return (
    <button
      type="button"
      onClick={() => onSeekToFrame(alert.start_frame)}
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-red-400/60"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-black/90 font-heading">
          Frames {alert.start_frame} – {alert.end_frame}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${
            SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium
          }`}
        >
          {alert.severity_level}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-black/50">
        <span
          className={`inline-block size-1.5 rounded-full ${
            SEVERITY_DOT[severity] ?? SEVERITY_DOT.medium
          }`}
        />
        <User className="size-3" />
        Person {alert.person_id}
        <span className="mx-1">·</span>
        {runLength} frames
      </div>
    </button>
  );
}

function InstanceCard({
  instance,
  onSeekToFrame,
}: {
  instance: ActionInstance;
  onSeekToFrame: (frame: number) => void;
}) {
  const isSingleFrame = instance.startFrame === instance.endFrame;

  return (
    <button
      type="button"
      onClick={() => onSeekToFrame(instance.startFrame)}
      className="w-full rounded-md border border-blue-500/30 bg-white px-3 py-2 text-left transition hover:border-blue-500/60"
    >
      {/* Row 1: person + timestamp range */}
      <div className="flex items-center justify-between text-xs text-black/60">
        <span className="flex items-center gap-1.5">
          <User className="size-3.5" />P{instance.personId}
        </span>
        <span className="font-mono text-black/70">
          {isSingleFrame
            ? instance.startTimestamp
            : `${instance.startTimestamp} – ${instance.endTimestamp}`}
        </span>
      </div>

      {/* Row 2: frame range + confidence */}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm font-semibold text-black/90 font-heading">
          {isSingleFrame
            ? `Frame ${instance.startFrame}`
            : `Frames ${instance.startFrame} – ${instance.endFrame}`}
          <span className="ml-2 text-xs font-normal text-black/40">
            ({instance.frameCount} frame{instance.frameCount !== 1 ? "s" : ""})
          </span>
        </span>
        <span className="text-sm font-semibold text-blue-600">
          {(instance.avgConfidence * 100).toFixed(1)}%
        </span>
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const Logs = ({ analysis, onSeekToFrame }: LogsProps) => {
  if (!analysis) {
    return (
      <div className="w-full h-full rounded-md border border-[#D6E4FF] bg-white p-4 text-slate-100">
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

  // Build instances for every action group
  const groupedActions = Object.entries(analysis.grouped_detections)
    .map(([action, entries]) => ({
      action,
      instances: collapseToInstances(entries as Detection[]),
    }))
    .sort((a, b) => b.instances.length - a.instances.length);

  const alerts = analysis.alert_events ?? [];

  return (
    <div className="w-full h-full rounded-xl border border-[#D6E4FF] bg-white text-slate-100 shadow-sm">
      <div className="flex items-center gap-2 p-3 text-sm font-semibold uppercase tracking-wide text-[#344054] font-heading border-b border-[#D6E4FF]">
        <Activity className="size-4" />
        Detections
      </div>

      <div className="divide-y divide-[#D6E4FF]">
        {/* ── Alerts accordion ── */}
        {alerts.length > 0 && (
          <details className="group" open>
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
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
            <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
              {alerts.map((alert) => (
                <AlertCard
                  key={`alert-${alert.person_id}-${alert.start_frame}`}
                  alert={alert}
                  onSeekToFrame={onSeekToFrame}
                />
              ))}
            </div>
          </details>
        )}

        {/* ── Action detection accordions ── */}
        {groupedActions.map(({ action, instances }) => (
          <details key={action} className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
              <span className="font-semibold font-heading text-black/70">
                {action}
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-600">
                {instances.length}{" "}
                {instances.length === 1 ? "instance" : "instances"}
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="space-y-2 px-3 pb-3 max-h-[400px] overflow-y-auto">
              {instances.map((instance) => (
                <InstanceCard
                  key={`${action}-p${instance.personId}-f${instance.startFrame}`}
                  instance={instance}
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
