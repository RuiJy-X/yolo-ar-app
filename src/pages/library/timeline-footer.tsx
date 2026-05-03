import type { ChangeEventHandler } from "react";
import type { ActionTimelineTag } from "./useLibrary";

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

const TimelineFooter = ({
  height,
  currentTimeSeconds,
  timelineDurationSeconds,
  actionTimelineTags,
  onDividerMouseDown,
  onScrub,
  onSeekToFrame,
}: TimelineFooterProps) => {
  return (
    <div
      id="timeline-footer"
      style={{ height }}
      className="w-full  rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] flex flex-col relative"
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDividerMouseDown}
        className="absolute inset-x-0 top-0 flex items-center justify-center cursor-ns-resize"
        style={{ height: 10, zIndex: 10, marginTop: -5 }}
      >
        <div className="w-12 h-1 rounded-full bg-[#BFDBFE]" />
      </div>

      {/* Inner content */}
      <div className="flex flex-col h-full px-4 pt-4 pb-3 gap-2">
        {/* Header */}
        <div className="flex items-center justify-between text-[13px] font-bold uppercase text-[#1E40AF] shrink-0">
          <span>Timeline</span>
          <span className="font-mono font-normal">
            {formatSeconds(currentTimeSeconds)} /{" "}
            {formatSeconds(timelineDurationSeconds)}
          </span>
        </div>

        {/* Scrubber */}
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

        {/* Action tracks */}
        <div className="relative flex-1 overflow-hidden rounded border border-[#BFDBFE] bg-white min-h-0">
          {actionTimelineTags.length > 0 ? (
            actionTimelineTags.map((tag) => {
              const leftPercent =
                (tag.startSeconds / timelineDurationSeconds) * 100;
              const widthPercent = Math.max(
                0.8,
                ((tag.endSeconds - tag.startSeconds) /
                  timelineDurationSeconds) *
                  100,
              );
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onSeekToFrame(tag.startFrame)}
                  className="absolute top-0 h-full rounded-sm text-[9px] font-bold text-white/90 hover:brightness-110"
                  style={{
                    left: `${Math.max(0, Math.min(99, leftPercent))}%`,
                    width: `${Math.max(0.8, Math.min(100 - leftPercent, widthPercent))}%`,
                    backgroundColor: tag.color,
                  }}
                >
                  <span className="ml-1 truncate">{tag.action}</span>
                </button>
              );
            })
          ) : (
            <div className="flex h-full items-center px-3 text-[11px] text-[#64748B]">
              Run analysis to see action tracks.
            </div>
          )}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-red-500"
            style={{
              left: `${Math.max(0, Math.min(100, (currentTimeSeconds / timelineDurationSeconds) * 100))}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default TimelineFooter;
