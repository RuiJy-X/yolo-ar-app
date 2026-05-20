import AppLayout from "@/applayout";
import Logs from "@/components/Logs";
import { useLibraryState } from "./library/useLibrary";
import type { ActionTimelineTag } from "./library/useLibrary";
import VideoPanel from "./library/video-panel";
import TimelineFooter from "./library/timeline-footer";
import Config from "./library/config";
import ProjectNameDialog from "./library/project-name-dialog";
import SaveToast from "./library/save-toast";
import LeaveGuardDialog from "./library/leave-guard-dialog";
import LeaveProgressDialog from "./library/leave-progress-dialog";
import { useBlocker, useSearchParams } from "react-router";
import { useEffect, useState } from "react";

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
    currentProjectName,
    saveToastMessage,
    showProjectNameDialog,
    projectNameInput,
    loadedHistoryId,
    currentTimeSeconds,
    actionTimelineTags,
    timelineDurationSeconds,
    isPlaying,
    setCurrentTimeSeconds,
    setVideoDurationSeconds,
    setResultVideoUrl,
    setSourcePlaybackError,
    setResultPlaybackError,
    setShowProjectNameDialog,
    handleFileChange,
    handleRunInference,
    handleDownload,
    saveToHistory,
    confirmProjectNameAndSave,
    resetCurrentSession,
    handleTimelineScrub,
    seekToFrame,
    togglePlayPause,
    handlePlaybackStateChange,
  } = useLibraryState(historyId);

  const canSaveToHistory =
    Boolean(analysis) && Boolean(resultDownloadUrl ?? resultVideoUrl);

  const hasUnsavedChanges = Boolean(analysis) && !loadedHistoryId;
  const [showUploadGuard, setShowUploadGuard] = useState(false);
  const [uploadAfterSave, setUploadAfterSave] = useState(false);
  const progressBlocker = useBlocker(isSubmitting);

  useEffect(() => {
    if (!isSubmitting) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSubmitting]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleRequestUpload = () => {
    if (hasUnsavedChanges) {
      setShowUploadGuard(true);
      return;
    }
    openFilePicker();
  };

  const handleStayOnPage = () => {
    setShowUploadGuard(false);
    setUploadAfterSave(false);
  };

  const handleResetBeforeUpload = () => {
    resetCurrentSession();
    setShowUploadGuard(false);
    setUploadAfterSave(false);
    openFilePicker();
  };

  const handleSaveBeforeUpload = () => {
    setShowUploadGuard(false);
    setUploadAfterSave(true);
    saveToHistory();
  };

  const handleConfirmAndSave = async (projectName: string) => {
    const saved = await confirmProjectNameAndSave(projectName);
    if (saved && uploadAfterSave) {
      openFilePicker();
    }
    setUploadAfterSave(false);
  };

  return (
    <AppLayout>
      <div className="flex flex-col w-full h-full overflow-hidden gap-1">
        {/* Header with Project Name */}
        {currentProjectName && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-blue-600 uppercase tracking-wider">
                Current Project
              </span>
              <span className="text-[14px] font-semibold text-blue-900">
                {currentProjectName}
              </span>
            </div>
          </div>
        )}
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
              onRequestUpload={handleRequestUpload}
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

      {/* Project Name Dialog */}
      <ProjectNameDialog
        isOpen={showProjectNameDialog}
        initialValue={projectNameInput}
        onConfirm={handleConfirmAndSave}
        onCancel={() => {
          setShowProjectNameDialog(false);
          setUploadAfterSave(false);
        }}
      />

      {/* Save Toast */}
      <SaveToast
        message={saveToastMessage}
        onDismiss={() => {
          /* auto-dismisses after 4 seconds */
        }}
      />

      <LeaveGuardDialog
        isOpen={showUploadGuard}
        onStay={handleStayOnPage}
        onSave={handleSaveBeforeUpload}
        onReset={handleResetBeforeUpload}
      />

      <LeaveProgressDialog
        isOpen={progressBlocker.state === "blocked"}
        onCancel={() => progressBlocker.reset()}
        onLeave={() => progressBlocker.proceed()}
      />
    </AppLayout>
  );
};

export default Library;
