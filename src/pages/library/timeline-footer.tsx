import { useRef, useState, useCallback } from "react";
import type { ChangeEventHandler } from "react";
import type { ActionTimelineTag } from "./useLibrary";
import { getActionColor } from "@/pages/library/action-colors";
import { Play, SkipBack, SkipForward } from "lucide-react";

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
  isPlaying: boolean;
  onPlayPause: () => void;
  onDividerMouseDown: (e: React.MouseEvent) => void;
  onScrub: ChangeEventHandler<HTMLInputElement>;
  onSeekToFrame: (frame: number) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

// Always aim for this many tick divisions visible at any zoom level.
const TARGET_TICKS = 10;

/**
 * Given a raw ideal spacing (visibleDuration / TARGET_TICKS), snap it to the
 * nearest "nice" number so labels read as clean timestamps: 0.5, 1, 2, 5, 10,
 * 15, 30, 60, 120, 300, 600 …
 */
function niceSpacing(raw: number): number {
  const nice = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  // Pick the smallest nice value that is >= raw so we never show *fewer*
  // ticks than requested (we may show slightly more, which is fine).
  for (const n of nice) {
    if (n >= raw) return n;
  }
  return nice[nice.length - 1];
}

const TimelineFooter = ({
  height,
  currentTimeSeconds,
  timelineDurationSeconds,
  actionTimelineTags,
  isPlaying,
  onPlayPause,
  onDividerMouseDown,
  onScrub,
  onSeekToFrame,
}: TimelineFooterProps) => {
  const trackRef = useRef<HTMLDivElement>(null);

  // ── Zoom / pan ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0); // fraction [0,1] of full duration

  // ── Layered view ──────────────────────────────────────────────────────────
  const [layered, setLayered] = useState(false);

  // ── Action filter — track HIDDEN actions so new actions are visible by default
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());

  const allActions = Array.from(
    new Set(actionTimelineTags.map((t) => t.action)),
  );

  const toggleAction = useCallback((action: string) => {
    setHiddenActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
      }
      return next;
    });
  }, []);

  // ── Geometry helpers ──────────────────────────────────────────────────────
  const maxOffset = Math.max(0, 1 - 1 / zoom);

  const toPct = useCallback(
    (seconds: number) => {
      if (timelineDurationSeconds <= 0) return 0;
      const raw = seconds / timelineDurationSeconds;
      return (raw - scrollOffset) * zoom * 100;
    },
    [timelineDurationSeconds, scrollOffset, zoom],
  );

  const toWidthPct = useCallback(
    (start: number, end: number) => {
      if (timelineDurationSeconds <= 0) return 0;
      return ((end - start) / timelineDurationSeconds) * zoom * 100;
    },
    [timelineDurationSeconds, zoom],
  );

  const playheadPct =
    timelineDurationSeconds > 0
      ? Math.max(0, Math.min(100, toPct(currentTimeSeconds)))
      : 0;

  const scrubberValue = playheadPct;

  // ── Adaptive tick markers ──────────────────────────────────────────────────
  // visibleDuration shrinks proportionally as zoom grows.
  // At zoom=1: visibleDuration = full duration  → ~10 ticks across full track.
  // At zoom=8: visibleDuration = duration/8     → ~10 ticks across the visible
  //   window, so you always see the same density of grid lines regardless of
  //   how far in you are.
  const visibleDuration =
    timelineDurationSeconds > 0 ? timelineDurationSeconds / zoom : 0;
  const startTime = scrollOffset * timelineDurationSeconds;
  const endTime = startTime + visibleDuration;

  // Snap raw ideal spacing to the nearest clean interval.
  const rawSpacing = visibleDuration / TARGET_TICKS;
  const markerSpacing = visibleDuration > 0 ? niceSpacing(rawSpacing) : 1;

  const tickMarkers: number[] = [];
  if (visibleDuration > 0) {
    const firstTick = Math.ceil(startTime / markerSpacing) * markerSpacing;
    for (let t = firstTick; t <= endTime + 0.001; t += markerSpacing) {
      tickMarkers.push(Math.round(t * 1000) / 1000);
    }
  }

  // ── Pan helpers ───────────────────────────────────────────────────────────
  const pan = useCallback(
    (delta: number) => {
      setScrollOffset((prev) => Math.max(0, Math.min(maxOffset, prev + delta)));
    },
    [maxOffset],
  );

  const handleZoomIn = () => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, z * 2);
      setScrollOffset((off) => Math.min(off, 1 - 1 / next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, z / 2);
      setScrollOffset((off) => Math.min(off, 1 - 1 / next));
      return next;
    });
  };

  // ── Filtered tags ─────────────────────────────────────────────────────────
  const filteredTags = actionTimelineTags.filter(
    (t) => !hiddenActions.has(t.action),
  );

  // ── Tick grid — always ~10 evenly-spaced dividers across the visible
  //    viewport, recalculated on every zoom/pan change. ─────────────────────
  const TickGrid = () => (
    <>
      {tickMarkers.map((t) => {
        const pct = toPct(t);
        if (pct < 0 || pct > 100) return null;
        return (
          <div
            key={t}
            className="pointer-events-none absolute top-0 h-full"
            style={{
              left: `${pct}%`,
              width: 1,
              backgroundColor:
                zoom <= 2 ? "rgba(147,197,253,0.5)" : "rgba(99,155,230,0.6)",
              zIndex: 5,
            }}
          />
        );
      })}
    </>
  );

  // ── Segment renderer ──────────────────────────────────────────────────────
  const renderSegments = (tags: ActionTimelineTag[]) =>
    tags.map((tag) => {
      const leftPct = toPct(tag.startSeconds);
      const widthPct = Math.max(
        0.3,
        toWidthPct(tag.startSeconds, tag.endSeconds),
      );
      if (leftPct > 100 || leftPct + widthPct < 0) return null;
      const color = getActionColor(tag.action);
      return (
        <button
          key={tag.id}
          type="button"
          title={`${tag.action} · P${tag.personId} · ${formatSeconds(tag.startSeconds)}–${formatSeconds(tag.endSeconds)}`}
          onClick={() => onSeekToFrame(tag.startFrame)}
          className="absolute top-0 h-full opacity-80 hover:opacity-100 transition-opacity"
          style={{
            left: `${Math.max(-1, leftPct)}%`,
            width: `${Math.min(widthPct, 101)}%`,
            backgroundColor: color,
            borderRadius: 2,
            zIndex: 10,
          }}
        />
      );
    });

  const layerRowHeight = 22;

  return (
    <div
      id="timeline-footer"
      style={{ height }}
      className="w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] flex flex-col relative"
    >
      <div className="flex flex-col h-full px-4 pt-4 pb-2 gap-3 min-h-0 overflow-hidden">
        {/* ── Row 1: Play + Title + Zoom + Layers + Time ── */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 w-full justify-center">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Zoom out"
              className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-[#1D4ED8] border border-[#BFDBFE] bg-white hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-default text-[14px] leading-none"
            >
              −
            </button>
            <span className="text-[11px] font-mono text-[#1E40AF] w-8 text-center">
              {zoom}×
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Zoom in"
              className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-[#1D4ED8] border border-[#BFDBFE] bg-white hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-default text-[14px] leading-none"
            >
              +
            </button>

            {/* skip back */}
            <button
              type="button"
              onClick={() => pan(-(1 / zoom / 2))}
              disabled={scrollOffset <= 0}
              title="Pan left"
              className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-[#1D4ED8]  bg-white hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-default text-[11px]"
            >
              <SkipBack size={16} />
            </button>
            {/* play/pause */}
            <button
              type="button"
              onClick={onPlayPause}
              title={isPlaying ? "Pause" : "Play"}
              className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-[#1D4ED8] bg-white hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-default text-[14px] leading-none"
            >
              <Play />
            </button>
            {/* skip forward */}
            <button
              type="button"
              onClick={() => pan(1 / zoom / 2)}
              disabled={scrollOffset >= maxOffset}
              title="Pan right"
              className="cursor-pointer w-6 h-6 rounded flex items-center justify-center text-[#1D4ED8]  bg-white hover:bg-[#EFF6FF] disabled:opacity-30 disabled:cursor-default text-[11px]"
            >
              <SkipForward size={16} />
            </button>

            <button
              type="button"
              onClick={() => setLayered((v) => !v)}
              className={`cursor-pointer ml-1 px-2 h-6 rounded border text-[11px] font-medium transition-colors ${
                layered
                  ? "bg-[#1D4ED8] text-white border-[#1D4ED8]"
                  : "bg-white text-[#1D4ED8] border-[#BFDBFE] hover:bg-[#EFF6FF]"
              }`}
            >
              {layered ? "⊞ Layers" : "⊟ Stack"}
            </button>
          </div>

          <span className="font-mono text-[13px] text-[#1E40AF] shrink-0">
            {formatSeconds(currentTimeSeconds)} /{" "}
            {formatSeconds(timelineDurationSeconds)}
          </span>
        </div>

        {/* ── Row 2: Action filter checkboxes ── */}
        {allActions.length > 0 && (
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <span className="text-[10px] uppercase text-[#94A3B8] font-semibold tracking-wide">
              Filter:
            </span>
            {allActions.map((action) => {
              const visible = !hiddenActions.has(action);
              const color = getActionColor(action);
              return (
                <label
                  key={action}
                  className="flex items-center gap-1 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleAction(action)}
                    className="sr-only"
                  />
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded border transition-colors shrink-0"
                    style={{
                      backgroundColor: visible ? color : "white",
                      borderColor: color,
                    }}
                  >
                    {visible && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path
                          d="M1 4l2 2 4-4"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="text-[11px] text-[#334155]">{action}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* ── Scrubber ── */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.05}
          value={scrubberValue}
          onChange={(e) => {
            const pct = Number(e.target.value) / 100;
            const raw = pct / zoom + scrollOffset;
            const realSeconds = raw * timelineDurationSeconds;
            const syntheticEvent = {
              ...e,
              target: { ...e.target, value: String(realSeconds) },
            } as React.ChangeEvent<HTMLInputElement>;
            onScrub(syntheticEvent);
          }}
          className="w-full cursor-pointer accent-[#1D4ED8] shrink-0"
          style={{ height: 4 }}
        />

        {/* ── Track area ── */}
        {layered ? (
          <div className="flex flex-col gap-0.5 min-h-0 overflow-y-auto shrink-0">
            {allActions
              .filter((a) => !hiddenActions.has(a))
              .map((action) => {
                const tagsForAction = filteredTags.filter(
                  (t) => t.action === action,
                );
                return (
                  <div
                    key={action}
                    className="flex items-center gap-1 shrink-0"
                  >
                    <div
                      className="relative flex-1 overflow-hidden rounded border border-[#BFDBFE] bg-white"
                      style={{ height: layerRowHeight }}
                    >
                      <TickGrid />
                      {tagsForAction.length > 0 ? (
                        renderSegments(tagsForAction)
                      ) : (
                        <div className="flex h-full items-center px-2 text-[10px] text-[#CBD5E1]">
                          no segments
                        </div>
                      )}
                      <div
                        className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500"
                        style={{ left: `${playheadPct}%`, zIndex: 20 }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div
            ref={trackRef}
            className="relative w-full overflow-hidden rounded border border-[#BFDBFE] bg-white shrink-0"
            style={{ height: 28 }}
          >
            <TickGrid />
            {filteredTags.length > 0 ? (
              renderSegments(filteredTags)
            ) : (
              <div
                className="flex h-full items-center px-3 text-[11px] text-[#131e2e]"
                style={{ zIndex: 1, position: "relative" }}
              >
                {actionTimelineTags.length > 0
                  ? "All actions filtered out."
                  : "Run analysis to see action tracks."}
              </div>
            )}
            <div
              className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500"
              style={{ left: `${playheadPct}%`, zIndex: 20 }}
            />
          </div>
        )}

        {/* ── Timestamp ruler ── */}
        <div className="relative w-full shrink-0" style={{ height: 14 }}>
          {tickMarkers.map((t) => {
            const pct = toPct(t);
            if (pct < -1 || pct > 101) return null;
            return (
              <span
                key={t}
                className="absolute text-[10px] text-[#131e2e] font-mono"
                style={{
                  left: `${pct}%`,
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  top: 0,
                }}
              >
                {formatSeconds(t)}
              </span>
            );
          })}
        </div>

        {/* ── Pan scrollbar (only when zoomed in) ── */}
        {zoom > 1 && (
          <input
            type="range"
            min={0}
            max={maxOffset}
            step={maxOffset / 200}
            value={scrollOffset}
            onChange={(e) => setScrollOffset(Number(e.target.value))}
            className="w-full cursor-pointer accent-[#93C5FD] shrink-0"
            style={{ height: 3 }}
            title="Pan timeline"
          />
        )}
      </div>
    </div>
  );
};

export default TimelineFooter;
