import { useRef, useState, useCallback } from "react";
import type { ChangeEventHandler } from "react";
import type { ActionTimelineTag } from "./useLibrary";
import { getActionColor } from "@/pages/library/action-colors";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Layers,
  AlignJustify,
} from "lucide-react";

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
const TARGET_TICKS = 10;

function niceSpacing(raw: number): number {
  const nice = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  for (const n of nice) if (n >= raw) return n;
  return nice[nice.length - 1];
}

// ── Toolbar button ──────────────────────────────────────────────────────────

const ToolBtn = ({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-7 h-7 rounded-[6px] flex items-center justify-center text-[13px] border transition-colors select-none ${
      active
        ? "bg-[#1c1c1c] text-white border-[#1c1c1c]"
        : "bg-[#ffffff] text-[#707070] border-[#dfdfdf] hover:border-[#c7c7c7] hover:text-[#171717]"
    } disabled:opacity-30 disabled:cursor-not-allowed`}
  >
    {children}
  </button>
);

const TimelineFooter = ({
  currentTimeSeconds,
  timelineDurationSeconds,
  actionTimelineTags,
  isPlaying,
  onPlayPause,
  onScrub,
  onSeekToFrame,
}: TimelineFooterProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [layered, setLayered] = useState(false);
  const [hiddenActions, setHiddenActions] = useState<Set<string>>(new Set());

  const allActions = Array.from(
    new Set(actionTimelineTags.map((t) => t.action)),
  );
  const maxOffset = Math.max(0, 1 - 1 / zoom);

  const toggleAction = useCallback((action: string) => {
    setHiddenActions((prev) => {
      const next = new Set(prev);
      next.has(action) ? next.delete(action) : next.add(action);
      return next;
    });
  }, []);

  const toPct = useCallback(
    (seconds: number) => {
      if (timelineDurationSeconds <= 0) return 0;
      return (seconds / timelineDurationSeconds - scrollOffset) * zoom * 100;
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

  const visibleDuration =
    timelineDurationSeconds > 0 ? timelineDurationSeconds / zoom : 0;
  const startTime = scrollOffset * timelineDurationSeconds;
  const endTime = startTime + visibleDuration;
  const markerSpacing =
    visibleDuration > 0 ? niceSpacing(visibleDuration / TARGET_TICKS) : 1;

  const tickMarkers: number[] = [];
  if (visibleDuration > 0) {
    const firstTick = Math.ceil(startTime / markerSpacing) * markerSpacing;
    for (let t = firstTick; t <= endTime + 0.001; t += markerSpacing) {
      tickMarkers.push(Math.round(t * 1000) / 1000);
    }
  }

  const pan = useCallback(
    (delta: number) =>
      setScrollOffset((prev) => Math.max(0, Math.min(maxOffset, prev + delta))),
    [maxOffset],
  );

  const handleZoomIn = () =>
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, z * 2);
      setScrollOffset((off) => Math.min(off, 1 - 1 / next));
      return next;
    });

  const handleZoomOut = () =>
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, z / 2);
      setScrollOffset((off) => Math.min(off, 1 - 1 / next));
      return next;
    });

  const filteredTags = actionTimelineTags.filter(
    (t) => !hiddenActions.has(t.action),
  );

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
              background: "#ededed",
              zIndex: 5,
            }}
          />
        );
      })}
    </>
  );

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
          className="absolute top-0.5 bottom-0.5 opacity-70 hover:opacity-100 transition-opacity"
          style={{
            left: `${Math.max(-1, leftPct)}%`,
            width: `${Math.min(widthPct, 101)}%`,
            background: color,
            borderRadius: 3,
            zIndex: 10,
          }}
        />
      );
    });

  return (
    <div
      className="w-full rounded-lg border border-[#ededed] bg-[#ffffff]"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <div className="flex flex-col px-4 pt-3 pb-3 gap-3">
        {/* ── Row 1: Controls + Time ── */}
        <div className="flex items-center gap-3">
          {/* Playback */}
          <div className="flex items-center gap-1">
            <ToolBtn
              onClick={() => pan(-(1 / zoom / 2))}
              disabled={scrollOffset <= 0}
              title="Pan left"
            >
              <SkipBack size={12} />
            </ToolBtn>
            <ToolBtn onClick={onPlayPause} title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </ToolBtn>
            <ToolBtn
              onClick={() => pan(1 / zoom / 2)}
              disabled={scrollOffset >= maxOffset}
              title="Pan right"
            >
              <SkipForward size={12} />
            </ToolBtn>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-[#ededed]" />

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <ToolBtn
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Zoom out"
            >
              <span className="font-mono">−</span>
            </ToolBtn>
            <span className="w-8 text-center text-[11px] font-mono text-[#707070]">
              {zoom}×
            </span>
            <ToolBtn
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Zoom in"
            >
              <span className="font-mono">+</span>
            </ToolBtn>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-[#ededed]" />

          {/* Layer toggle */}
          <ToolBtn
            onClick={() => setLayered((v) => !v)}
            active={layered}
            title="Toggle layers"
          >
            {layered ? <Layers size={12} /> : <AlignJustify size={12} />}
          </ToolBtn>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Time readout */}
          <span className="text-[12px] font-mono text-[#707070] shrink-0 tabular-nums">
            <span className="text-[#171717]">
              {formatSeconds(currentTimeSeconds)}
            </span>
            {" / "}
            {formatSeconds(timelineDurationSeconds)}
          </span>
        </div>

        {/* ── Row 2: Action filter chips ── */}
        {allActions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9a9a9a]">
              Filter:
            </span>
            {allActions.map((action) => {
              const visible = !hiddenActions.has(action);
              const color = getActionColor(action);
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => toggleAction(action)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors"
                  style={{
                    background: visible ? color + "18" : "transparent",
                    borderColor: visible ? color + "55" : "#ededed",
                    color: visible ? "#171717" : "#9a9a9a",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: visible ? color : "#d4d4d4" }}
                  />
                  {action}
                </button>
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
          value={playheadPct}
          onChange={(e) => {
            const pct = Number(e.target.value) / 100;
            const realSeconds =
              (pct / zoom + scrollOffset) * timelineDurationSeconds;
            const syntheticEvent = {
              ...e,
              target: { ...e.target, value: String(realSeconds) },
            } as React.ChangeEvent<HTMLInputElement>;
            onScrub(syntheticEvent);
          }}
          className="w-full cursor-pointer shrink-0 accent-[#0052ff]"
          style={{ height: 4 }}
        />

        {/* ── Track area ── */}
        {layered ? (
          <div className="flex flex-col gap-1 shrink-0">
            {allActions
              .filter((a) => !hiddenActions.has(a))
              .map((action) => {
                const color = getActionColor(action);
                return (
                  <div
                    key={action}
                    className="flex items-center gap-2 shrink-0"
                  >
                    <span
                      className="text-[10px] font-medium w-16 shrink-0 truncate"
                      style={{ color }}
                    >
                      {action}
                    </span>
                    <div
                      className="relative flex-1 overflow-hidden rounded-[4px] border border-[#ededed] bg-[#fafafa]"
                      style={{ height: 20 }}
                    >
                      <TickGrid />
                      {renderSegments(
                        filteredTags.filter((t) => t.action === action),
                      )}
                      <div
                        className="pointer-events-none absolute top-0 h-full"
                        style={{
                          left: `${playheadPct}%`,
                          width: 1,
                          background: "#171717",
                          zIndex: 20,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          <div
            ref={trackRef}
            className="relative w-full overflow-hidden rounded-[4px] border border-[#ededed] bg-[#fafafa] shrink-0"
            style={{ height: 28 }}
          >
            <TickGrid />
            {filteredTags.length > 0 ? (
              renderSegments(filteredTags)
            ) : (
              <div
                className="absolute inset-0 flex items-center px-3 text-[11px] text-[#9a9a9a]"
                style={{ zIndex: 1 }}
              >
                {actionTimelineTags.length > 0
                  ? "All actions filtered out."
                  : "Run analysis to see action tracks."}
              </div>
            )}
            <div
              className="pointer-events-none absolute top-0 h-full"
              style={{
                left: `${playheadPct}%`,
                width: 1,
                background: "#171717",
                zIndex: 20,
              }}
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
                className="absolute text-[10px] font-mono text-[#9a9a9a]"
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

        {/* ── Pan scrollbar ── */}
        {zoom > 1 && (
          <input
            type="range"
            min={0}
            max={maxOffset}
            step={maxOffset / 200}
            value={scrollOffset}
            onChange={(e) => setScrollOffset(Number(e.target.value))}
            className="w-full cursor-pointer shrink-0 accent-[#9a9a9a]"
            style={{ height: 3 }}
            title="Pan timeline"
          />
        )}
      </div>
    </div>
  );
};

export default TimelineFooter;