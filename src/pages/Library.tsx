import AppLayout from "@/applayout";
import Logs from "@/components/Logs";
import { useLibraryState } from "./library/useLibrary";
import type { ActionTimelineTag } from "./library/useLibrary";
import VideoPanel from "./library/video-panel";
import TimelineFooter from "./library/timeline-footer";
import Config from "./library/config";
import { useSearchParams } from "react-router";
import { useState } from "react";

const Library = () => {
  const [searchParams] = useSearchParams();
  const historyId = searchParams.get("history");
  const [selectedTag, setSelectedTag] = useState<ActionTimelineTag | null>(
    null,
  );
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
    historySavedAt,
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
    saveToHistory,
    handleTimelineScrub,
    seekToFrame,
    togglePlayPause,
    handlePlaybackStateChange,
  } = useLibraryState(historyId);

  const canSaveToHistory =
    Boolean(analysis) && Boolean(resultDownloadUrl ?? resultVideoUrl);

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden gap-1">
        {/* Top Section: Config | Video | Logs */}
        <div className="flex flex-1 min-h-0 w-full gap-1">
          {/* 1. Config Panel (25%) */}
          <div className="w-1/4 h-full border-r border-gray-200 overflow-auto">
            <Config className="h-full" />
          </div>

          {/* 2. Video Panel (50%) */}
          <div className="w-1/2 h-full flex flex-col overflow-hidden bg-black/5">
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
              canSaveToHistory={canSaveToHistory}
              historySavedAt={historySavedAt}
              onFileChange={handleFileChange}
              onRunInference={handleRunInference}
              onDownload={handleDownload}
              onSaveToHistory={saveToHistory}
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

          {/* 3. Logs Panel (25%) */}
          <div className="w-1/4 h-full border-l border-gray-200 overflow-hidden">
            <Logs
              analysis={analysis}
              onSeekToFrame={seekToFrame}
              selectedTag={selectedTag}
            />
          </div>
        </div>

        {/* Bottom Section: Dynamic Timeline */}
        <div className="w-full border-t border-gray-200 bg-white shrink-0">
          <TimelineFooter
            currentTimeSeconds={currentTimeSeconds}
            timelineDurationSeconds={timelineDurationSeconds}
            actionTimelineTags={actionTimelineTags}
            onScrub={handleTimelineScrub}
            onSeekToFrame={seekToFrame}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
            onSelectTag={setSelectedTag}
            onDividerMouseDown={function (): void {
              throw new Error("Function not implemented.");
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
};

export default Library;
