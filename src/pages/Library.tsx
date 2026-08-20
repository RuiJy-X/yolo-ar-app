import AppLayout from "@/applayout";
import Logs from "@/components/Logs";
import { useLibraryState } from "./library/useLibrary";
import type { ActionTimelineTag } from "./library/useLibrary";
import VideoPanel from "./library/video-panel";
import TimelineFooter from "./library/timeline-footer";
import ProjectNameDialog from "./library/project-name-dialog";
import SaveToast from "./library/save-toast";
import LeaveGuardDialog from "./library/leave-guard-dialog";
import LeaveProgressDialog from "./library/leave-progress-dialog";
import PersonDetailDialog from "./library/person-detail-dialog";
import InDepthAnalysisDialog from "./library/in-depth-analysis-dialog";
import { useBlocker, useSearchParams } from "react-router";
import { useEffect, useState, useMemo } from "react";

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
    focusedPersonId,
    showPersonDetailDialog,
    inspectedPersonId,
    showInDepthDialog,
    sidebarTab,
    setSidebarTab,
    showVideoAnnotations,
    toggleVideoAnnotations,
    showBrowserOverlay,
    toggleBrowserOverlay,
    allDetections,
    detectionsByFrame,
    detectionsByPerson,
    currentFrameNumber,
    currentFrameDetections,
    seekFps,
    focusPerson,
    clearFocus,
    openPersonDetails,
    closePersonDetails,
    openInDepthDetails,
    closeInDepthDetails,
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

  const inspectedPersonDetections = useMemo(() => {
    if (inspectedPersonId === null) return [];
    return detectionsByPerson.get(inspectedPersonId) ?? [];
  }, [detectionsByPerson, inspectedPersonId]);

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
        {/* Top Section: Video | Logs */}
        <div className="flex flex-1 min-h-0 w-full gap-1">
          {/* 1. Video Panel (66%) */}
          <div className="w-2/3 h-full flex flex-col overflow-hidden bg-black/5 rounded-lg">
            <VideoPanel
              fileInputRef={fileInputRef}
              videoPlayerRef={videoPlayerRef}
              file={file}
              sourceVideoUrl={sourceVideoUrl}
              resultVideoUrl={resultVideoUrl}
              resultDownloadUrl={resultDownloadUrl}
              loadedHistoryId={loadedHistoryId}
              isSubmitting={isSubmitting}
              isDownloading={isDownloading}
              progressPercent={progressPercent}
              progressMessage={progressMessage}
              progressFrameIndex={progressFrameIndex}
              progressTotalFrames={progressTotalFrames}
              canSaveToHistory={canSaveToHistory}
              historySavedAt={historySavedAt}
              currentFrameDetections={currentFrameDetections}
              focusedPersonId={focusedPersonId}
              analysis={analysis}
              showVideoAnnotations={showVideoAnnotations}
              onToggleVideoAnnotations={toggleVideoAnnotations}
              showBrowserOverlay={showBrowserOverlay}
              onToggleBrowserOverlay={toggleBrowserOverlay}
              onFocusPerson={focusPerson}
              onClearFocus={clearFocus}
              onOpenPersonDetails={openPersonDetails}
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

          {/* 2. Logs & Details Panel (33%) */}
          <div className="w-1/3 h-full border-l border-gray-200 overflow-hidden rounded-lg">
            <Logs
              analysis={analysis}
              onSeekToFrame={seekToFrame}
              selectedTag={selectedTag}
              focusedPersonId={focusedPersonId}
              onFocusPerson={focusPerson}
              onClearFocus={clearFocus}
              onOpenPersonDetails={openPersonDetails}
              currentFrameNumber={currentFrameNumber}
              totalFrames={Math.max(
                progressTotalFrames || 0,
                Math.round(timelineDurationSeconds * seekFps),
              )}
              seekFps={seekFps}
              detectionsByFrame={detectionsByFrame}
              detectionsByPerson={detectionsByPerson}
              sidebarTab={sidebarTab}
              onTabChange={setSidebarTab}
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

      {/* Person Detail Inspector Dialog */}
      <PersonDetailDialog
        isOpen={showPersonDetailDialog}
        personId={inspectedPersonId}
        currentFrameNumber={currentFrameNumber}
        personDetections={inspectedPersonDetections}
        onClose={closePersonDetails}
        onSeekToFrame={seekToFrame}
      />

      {/* In-Depth Video & Frame Analysis Dialog */}
      <InDepthAnalysisDialog
        isOpen={showInDepthDialog}
        onClose={closeInDepthDetails}
        analysis={analysis}
        currentFrameNumber={currentFrameNumber}
        totalFrames={Math.max(progressTotalFrames || 0, Math.round(timelineDurationSeconds * seekFps))}
        seekFps={seekFps}
        onSeekToFrame={seekToFrame}
        onFocusPerson={focusPerson}
        onOpenPersonDetails={openPersonDetails}
        detectionsByFrame={detectionsByFrame}
        detectionsByPerson={detectionsByPerson}
      />

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
