import { useEffect, useRef, useState } from "react";
import AppLayout from "@/applayout";
import Logs from "@/components/Logs";
import { useLibraryState } from "./library/useLibrary";
import VideoPanel from "./library/video-panel";
import TimelineFooter from "./library/timeline-footer";

const Library = () => {
  // ── Resize: timeline height (vertical drag) ──────────────────────────────
  const [timelineHeightPx, setTimelineHeightPx] = useState(130);
  const isTimelineDragging = useRef(false);

  // ── Resize: left/right panel split (horizontal drag) ─────────────────────
  const [leftWidthPx, setLeftWidthPx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

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

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Timeline
      if (isTimelineDragging.current) {
        const footerEl = document.getElementById("timeline-footer");
        if (footerEl) {
          const rect = footerEl.getBoundingClientRect();
          setTimelineHeightPx(
            Math.max(80, Math.min(360, rect.bottom - e.clientY)),
          );
        }
      }

      // Horizontal panel split
      if (isDragging.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        setLeftWidthPx(Math.max(300, Math.min(rect.width - 200, offsetX)));
      }
    };

    const onMouseUp = () => {
      isTimelineDragging.current = false;
      isDragging.current = false;
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
  } = useLibraryState();

  return (
    <AppLayout>
      {/* Main content area: flex column, fills remaining height */}
      <div className="flex flex-col w-full min-h-0 flex-1 overflow-hidden">
        {/* Video + Logs row — takes all space above the timeline */}
        <div
          ref={containerRef}
          className="flex w-full overflow-hidden"
          style={{ flex: "1 1 0", minHeight: 0, gap: 0 }}
        >
          <div
            className="overflow-hidden"
            style={{
              flex: leftWidthPx ? `0 0 ${leftWidthPx}px` : "1 1 60%",
              minWidth: 300,
              minHeight: 0,
            }}
          >
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
            />
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
            className="h-full"
            style={{ flex: "1 1 0", minWidth: 200, minHeight: 0 }}
          >
            <Logs analysis={analysis} onSeekToFrame={seekToFrame} />
          </div>
        </div>

        {/* Timeline footer */}
        {(resultVideoUrl || sourceVideoUrl) && (
          <div style={{ flexShrink: 0 }}>
            <TimelineFooter
              height={timelineHeightPx}
              currentTimeSeconds={currentTimeSeconds}
              timelineDurationSeconds={timelineDurationSeconds}
              actionTimelineTags={actionTimelineTags}
              onDividerMouseDown={handleTimelineDividerMouseDown}
              onScrub={handleTimelineScrub}
              onSeekToFrame={seekToFrame}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Library;
