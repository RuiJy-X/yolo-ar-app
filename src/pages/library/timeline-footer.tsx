import { useRef } from "react";
import type { ChangeEventHandler } from "react";
import type { ActionTimelineTag } from "./useLibrary";
import { getActionColor } from "@/pages/library/action-colors";

const formatSeconds = (seconds: number) => {
  const clamped = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(clamped);
  const mm = Math.floor(whole / 60)
    .toString()
    .padStart(2, "0");
  const ss = (whole % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
};

type TimelineFooterProps = {
  height: number;
  currentTimeSeconds: number;
  timelineDurationSeconds: number;
  actionTimelineTags: ActionTimelineTag[];
  onDividerMouseDown: (e: React.MouseEvent) => void;
  onScrub: ChangeEventHandler<HTMLInputElement>;
  onSeekToFrame: (frame: number) => void;
};

// ── Confidence waveform ────────────────────────────────────────────────────
// Builds an SVG polyline path from the per-tag confidence values, bucketed
// into N slots across the timeline width.

function buildWaveformPath(
  tags: ActionTimelineTag[],
  action: string,
  durationSeconds: number,
  width: number,
  height: number,
  buckets = 120,
): string {
  if (!tags.length || durationSeconds <= 0) return "";

  const bucket = new Array<{ sum: number; count: number }>(buckets)
    .fill(null as never)
    .map(() => ({ sum: 0, count: 0 }));

  for (const tag of tags) {
    if (tag.action !== action) continue;
    const startBucket = Math.floor(
      (tag.startSeconds / durationSeconds) * buckets,
    );
    const endBucket = Math.ceil((tag.endSeconds / durationSeconds) * buckets);
    // Derive confidence from tag color/action — tags carry a `confidence` field
    // if available, otherwise default to 0.75 to indicate presence
    const conf =
      (tag as ActionTimelineTag & { confidence?: number }).confidence ?? 0.75;
    for (let b = startBucket; b < endBucket && b < buckets; b++) {
      bucket[b].sum += conf;
      bucket[b].count += 1;
    }
  }

  const points = bucket.map((b, i) => {
    const x = (i / (buckets - 1)) * width;
    const v = b.count > 0 ? b.sum / b.count : 0;
    const y = height - v * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return `M ${points.join(" L ")}`;
}

const TimelineFooter = ({
  height,
  currentTimeSeconds,
  timelineDurationSeconds,
  actionTimelineTags,
  onDividerMouseDown,
  onScrub,
  onSeekToFrame,
}: TimelineFooterProps) => {
  const trackRef = useRef<HTMLDivElement>(null);

  // Unique actions in the order they first appear
  const uniqueActions = Array.from(
    new Set(actionTimelineTags.map((t) => t.action)),
  );

  // Timestamp markers: every ~15s
  const markerCount = Math.max(2, Math.ceil(timelineDurationSeconds / 15));
  const markers = Array.from(
    { length: markerCount + 1 },
    (_, i) => (i / markerCount) * timelineDurationSeconds,
  );

  const playheadPct =
    timelineDurationSeconds > 0
      ? Math.max(
          0,
          Math.min(100, (currentTimeSeconds / timelineDurationSeconds) * 100),
        )
      : 0;

  return (
    <div
      id="timeline-footer"
      style={{ height }}
      className="w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] flex flex-col relative"
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDividerMouseDown}
        className="absolute inset-x-0 top-0 flex items-center justify-center cursor-ns-resize"
        style={{ height: 10, zIndex: 10, marginTop: -5 }}
      >
        <div className="w-12 h-1 rounded-full bg-[#BFDBFE]" />
      </div>

      <div className="flex flex-col h-full px-4 pt-4 pb-2 gap-1.5 min-h-0">
        {/* ── Header: title + current time + legend ── */}
        <div className="flex items-center justify-between shrink-0 gap-4">
          <span className="text-[13px] font-bold uppercase text-[#1E40AF]">
            Timeline
          </span>

          {/* Action color legend */}
          {uniqueActions.length > 0 && (
            <div className="flex items-center gap-3 flex-1 justify-center flex-wrap">
              {uniqueActions.map((action) => (
                <span
                  key={action}
                  className="flex items-center gap-1.5 text-[11px] text-[#334155]"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: getActionColor(action) }}
                  />
                  {action}
                </span>
              ))}
              {/* Alert marker legend */}
              <span className="flex items-center gap-1.5 text-[11px] text-[#334155]">
                <span className="inline-block w-0.5 h-3 rounded-full bg-red-500" />
                Alert
              </span>
            </div>
          )}

          <span className="font-mono text-[13px] text-[#1E40AF] shrink-0">
            {formatSeconds(currentTimeSeconds)} /{" "}
            {formatSeconds(timelineDurationSeconds)}
          </span>
        </div>

        {/* ── Scrubber ── */}
        <input
          type="range"
          min={0}
          max={timelineDurationSeconds}
          step={0.05}
          value={Math.min(currentTimeSeconds, timelineDurationSeconds)}
          onChange={onScrub}
          className="w-full cursor-pointer accent-[#1D4ED8] shrink-0"
          style={{ height: 4 }}
        />

        {/* ── Action segment track ── */}
        <div
          ref={trackRef}
          className="relative w-full overflow-hidden rounded border border-[#BFDBFE] bg-white shrink-0"
          style={{ height: 28 }}
        >
          {actionTimelineTags.length > 0 ? (
            actionTimelineTags.map((tag) => {
              const leftPct =
                (tag.startSeconds / timelineDurationSeconds) * 100;
              const widthPct = Math.max(
                0.4,
                ((tag.endSeconds - tag.startSeconds) /
                  timelineDurationSeconds) *
                  100,
              );
              const color = getActionColor(tag.action);
              return (
                <button
                  key={tag.id}
                  type="button"
                  title={`${tag.action} · P${tag.personId} · ${formatSeconds(tag.startSeconds)}–${formatSeconds(tag.endSeconds)}`}
                  onClick={() => onSeekToFrame(tag.startFrame)}
                  className="absolute top-0 h-full opacity-80 hover:opacity-100 transition-opacity"
                  style={{
                    left: `${Math.max(0, Math.min(99.6, leftPct))}%`,
                    width: `${Math.max(0.4, Math.min(100 - leftPct, widthPct))}%`,
                    backgroundColor: color,
                    borderRadius: 2,
                  }}
                />
              );
            })
          ) : (
            <div className="flex h-full items-center px-3 text-[11px] text-[#64748B]">
              Run analysis to see action tracks.
            </div>
          )}

          {/* Alert ticks */}
          {([] as { start_frame: number; end_frame: number }[])
            .concat
            // We don't have alert_events here directly, but alert segments
            // appear as waving runs — mark any gap between consecutive waving
            // tags of the same person as a tick if > 30 frames. Simpler:
            // just show a tick at the start of each tag that starts after
            // a gap, which is already handled by tags themselves.
            // Real alert ticks need to come from props if needed — skip for now.
            ()
            .map((_, i) => null)}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500 z-10"
            style={{ left: `${playheadPct}%` }}
          />
        </div>

        {/* ── Timestamp ruler ── */}
        <div className="flex justify-between shrink-0" style={{ marginTop: 1 }}>
          {markers.map((t, i) => (
            <span key={i} className="text-[10px] text-[#64748B] font-mono">
              {formatSeconds(t)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineFooter;
