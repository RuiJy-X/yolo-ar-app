import { useEffect, useRef, useState } from "react";
import AppLayout from "@/applayout";
import Logs from "@/components/Logs";
import { useLibraryState } from "./library/useLibrary";
import VideoPanel from "./library/video-panel";
import TimelineFooter from "./library/timeline-footer";
import Config from "./library/config";

const Library = () => {
  // ── Resize: timeline height (vertical drag) ──────────────────────────────
  const [timelineHeightPx, setTimelineHeightPx] = useState(130);
  const isTimelineDragging = useRef(false);

  const configContentRef = useRef<HTMLDivElement | null>(null); 

  // ── Resize: left/right panel split (horizontal drag) ─────────────────────
  const [leftWidthPx, setLeftWidthPx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  // ── Resize: config/logs split (vertical drag) ───────────────────────────
  const [rightTopHeightPx, setRightTopHeightPx] = useState(260);
  const isRightDragging = useRef(false);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);

  const handleTimelineDividerMouseDown = (e: React.MouseEvent) => {
    isTimelineDragging.current = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const handleRightDividerMouseDown = (e: React.MouseEvent) => {
    isRightDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Timeline
      if (isTimelineDragging.current) {
        const footerEl = document.getElementById("timeline-footer");
        if (footerEl) {
          const rect = footerEl.getBoundingClientRect();
          setTimelineHeightPx(
            Math.max(140, Math.min(360, rect.bottom - e.clientY)),
          );
        }
      }

      // Horizontal panel split
      if (isDragging.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;

        // Define your constraints
        const minLeftWidth = 600;  // Minimum width for Video Panel to prevent wrapping
        const minRightWidth = 480; // Minimum width for Right Panel (as discussed)
        const dividerWidth = 8;

        // Calculate the bounds
        const minAllowed = minLeftWidth;
        const maxAllowed = rect.width - minRightWidth - dividerWidth;

        // Ensure the new width is clamped between the min and max
        setLeftWidthPx(Math.max(minAllowed, Math.min(maxAllowed, offsetX)));
      }

      // Config / logs split
      if (isRightDragging.current && rightPanelRef.current) {
        const rect = rightPanelRef.current.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        
        const minTop = 220;
        const minBottom = 200;

        // NEW: Get the actual height of the content inside Config
        const contentHeight = configContentRef.current?.scrollHeight ?? 220;

        // We constrain the height so it can't grow larger than its content, 
        // but also doesn't push the bottom panel off-screen.
        const maxAllowedHeight = Math.min(rect.height - minBottom, contentHeight);

        setRightTopHeightPx(
          Math.max(minTop, Math.min(maxAllowedHeight, offsetY))
        );
      }
    };

    const onMouseUp = () => {
      isTimelineDragging.current = false;
      isDragging.current = false;
      isRightDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── All data / logic lives in the hook ───────────────────────────────────
  const {
    fileInputRef,
    videoPlayerRef,
    file,
    sourceVideoUrl,
    resultVideoUrl,
    resultDownloadUrl,
    isSubmitting,
    isDownloading,
    analysis,
    progressPercent,
    progressMessage,
    progressFrameIndex,
    progressTotalFrames,
    currentTimeSeconds,
    actionTimelineTags,
    timelineDurationSeconds,
    isPlaying,
    setCurrentTimeSeconds,
    setVideoDurationSeconds,
    setResultVideoUrl,
    setSourcePlaybackError,
    setResultPlaybackError,
    handleFileChange,
    handleRunInference,
    handleDownload,
    handleTimelineScrub,
    seekToFrame,
    togglePlayPause,
    handlePlaybackStateChange,
  } = useLibraryState();

  return (
    <AppLayout>
      {/* Main content area: flex column, fills remaining height */}
      <div className="flex flex-col w-full min-h-0 flex-1 overflow-hidden">
        {/* Video + Logs row — takes all space above the timeline */}
        <div
          ref={containerRef}
          className="flex w-full h-full overflow-hidden"
          style={{ flex: "1 1 0", minHeight: 0, gap: 0 }}
        >
          <div
              className="flex flex-col h-full overflow-hidden"
              style={{
                // Use the state value, but fallback to a percentage 
                flex: leftWidthPx ? `0 0 ${leftWidthPx}px` : "1 1 60%",
                minWidth: 600, // Match the minLeftWidth from your logic
                maxWidth: `calc(100% - 488px)`, // 480px (right) + 8px (divider)
                minHeight: 0,
              }}
            >
            <div className="flex-1 min-h-0">
              <VideoPanel
                fileInputRef={fileInputRef}
                videoPlayerRef={videoPlayerRef}
                file={file}
                sourceVideoUrl={sourceVideoUrl}
                resultVideoUrl={resultVideoUrl}
                resultDownloadUrl={resultDownloadUrl}
                isSubmitting={isSubmitting}
                isDownloading={isDownloading}
                progressPercent={progressPercent}
                progressMessage={progressMessage}
                progressFrameIndex={progressFrameIndex}
                progressTotalFrames={progressTotalFrames}
                onFileChange={handleFileChange}
                onRunInference={handleRunInference}
                onDownload={handleDownload}
                onVideoLoaded={(duration, currentTime) => {
                  setVideoDurationSeconds(duration);
                  setCurrentTimeSeconds(currentTime);
                }}
                onTimeUpdate={setCurrentTimeSeconds}
                onSourcePlaybackError={setSourcePlaybackError}
                onResultPlaybackError={setResultPlaybackError}
                onClearResult={() => setResultVideoUrl(null)}
                onPlaybackStateChange={handlePlaybackStateChange}
              />
            </div>

            {/* Timeline footer */}

            {(resultVideoUrl || sourceVideoUrl) && (
              <div
                style={{
                  flexShrink: 0,
                  marginTop: 8,
                  borderTop: "1px solid #e5e7eb",
                }}
              >
                <TimelineFooter
                  height={timelineHeightPx}
                  currentTimeSeconds={currentTimeSeconds}
                  timelineDurationSeconds={timelineDurationSeconds}
                  actionTimelineTags={actionTimelineTags}
                  onDividerMouseDown={handleTimelineDividerMouseDown}
                  onScrub={handleTimelineScrub}
                  onSeekToFrame={seekToFrame}
                  isPlaying={isPlaying}
                  onPlayPause={togglePlayPause}
                />
              </div>
            )}
          </div>

          {/* Column resize divider */}
          <div
            onMouseDown={handleDividerMouseDown}
            className="flex items-center justify-center cursor-col-resize select-none"
            style={{
              flex: "0 0 8px",
              flexShrink: 0,
              background: "transparent",
            }}
          >
            <div
              style={{
                width: 2,
                height: 40,
                borderRadius: 2,
                background: "#D6E4FF",
              }}
            />
          </div>

          <div
            ref={rightPanelRef}
            className="h-full flex flex-col overflow-hidden"
            style={{ flex: "1 1 0", minWidth: 480, minHeight: 0 }}
          >
            <div
              className="overflow-hidden"
              style={{ flex: `0 0 ${rightTopHeightPx}px`, minHeight: 220 }}
            >
              <div ref={configContentRef}>
              <Config className="h-full" />
            </div>
            </div>

            {/* Config / Logs resize divider */}
            <div
              onMouseDown={handleRightDividerMouseDown}
              className="flex items-center justify-center cursor-row-resize select-none"
              style={{
                flex: "0 0 8px",
                flexShrink: 0,
                background: "transparent",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 2,
                  borderRadius: 2,
                  background: "#D6E4FF",
                }}
              />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <Logs analysis={analysis} onSeekToFrame={seekToFrame} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};;

export default Library;
