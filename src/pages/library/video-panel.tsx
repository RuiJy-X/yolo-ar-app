import { useRef, useState, type RefObject, type ChangeEventHandler } from "react";
import { Download, Save, Upload, Eye, EyeOff, Layers } from "lucide-react";
import TitleMono from "@/components/titile-mono";
import type { Detection, AnalyzeVideoResponse } from "@/lib/types";
import VideoFocusOverlay from "./video-focus-overlay";

type VideoPanelProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  videoPlayerRef: RefObject<HTMLVideoElement | null>;
  file: File | null;
  sourceVideoUrl: string | null;
  resultVideoUrl: string | null;
  resultDownloadUrl: string | null;
  loadedHistoryId?: string | null;
  isSubmitting: boolean;
  isDownloading: boolean;
  progressPercent: number;
  progressMessage: string | null;
  progressFrameIndex: number | null;
  progressTotalFrames: number | null;
  canSaveToHistory: boolean;
  historySavedAt: number | null;
  currentFrameDetections?: Detection[];
  focusedPersonId?: number | null;
  analysis?: AnalyzeVideoResponse | null;
  showVideoAnnotations?: boolean;
  showAnnotations?: boolean;
  showBrowserOverlay?: boolean;
  onToggleVideoAnnotations?: () => void;
  onToggleAnnotations?: () => void;
  onToggleBrowserOverlay?: () => void;
  onFocusPerson?: (personId: number) => void;
  onClearFocus?: () => void;
  onOpenPersonDetails?: (personId: number) => void;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
  onDropFile?: (file: File) => void;
  onRunInference: () => void;
  onDownload: () => void;
  onSaveToHistory: () => void;
  onRequestUpload: () => void;
  onVideoLoaded: (duration: number, currentTime: number) => void;
  onTimeUpdate: (currentTime: number) => void;
  onSourcePlaybackError: (msg: string | null) => void;
  onResultPlaybackError: (msg: string | null) => void;
  onClearResult: () => void;
  onPlaybackStateChange: (playing: boolean) => void;
};

const VideoPanel = ({
  fileInputRef,
  videoPlayerRef,
  file,
  sourceVideoUrl,
  resultVideoUrl,
  resultDownloadUrl,
  loadedHistoryId,
  isSubmitting,
  isDownloading,
  progressPercent,
  progressMessage,
  progressFrameIndex,
  progressTotalFrames,
  canSaveToHistory,
  historySavedAt,
  currentFrameDetections = [],
  focusedPersonId = null,
  analysis = null,
  showVideoAnnotations,
  showAnnotations = true,
  showBrowserOverlay = true,
  onToggleVideoAnnotations,
  onToggleAnnotations,
  onToggleBrowserOverlay = () => {},
  onFocusPerson = () => {},
  onClearFocus = () => {},
  onOpenPersonDetails = () => {},
  onFileChange,
  onDropFile,
  onRunInference,
  onDownload,
  onSaveToHistory,
  onRequestUpload,
  onVideoLoaded,
  onTimeUpdate,
  onSourcePlaybackError,
  onResultPlaybackError,
  onClearResult,
  onPlaybackStateChange,
}: VideoPanelProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const isVideoAnnotated = showVideoAnnotations ?? showAnnotations;
  const handleToggleVideo = onToggleVideoAnnotations ?? onToggleAnnotations ?? (() => {});

  // Active video source: if annotated is ON, show annotated video (if available), else show raw source
  const activeVideoUrl = isVideoAnnotated
    ? (resultVideoUrl ?? sourceVideoUrl)
    : (sourceVideoUrl ?? resultVideoUrl);

  const canToggleVideoSource = Boolean(resultVideoUrl && sourceVideoUrl);

  const isVideoFile = (item: File) => {
    return (
      item.type.startsWith("video/") ||
      /\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv)$/i.test(item.name)
    );
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (isSubmitting) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      if (isVideoFile(droppedFile)) {
        onDropFile?.(droppedFile);
      }
    }
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden rounded-lg bg-[#ffffff] border border-[#ededed]"
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.avi,video/avi,video/x-msvideo"
        onChange={onFileChange}
        className="hidden"
      />

      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#ededed] shrink-0">
        <TitleMono text="Video Analysis" />

        <div className="flex items-center gap-2">
          {/* 1. Video Source Toggle: Annotated Video vs Raw Video */}
          {canToggleVideoSource && (
            <button
              type="button"
              onClick={handleToggleVideo}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium border transition-colors ${
                isVideoAnnotated
                  ? "border-blue-200 bg-blue-50 text-[#0052ff] hover:bg-blue-100"
                  : "border-[#dfdfdf] bg-[#ffffff] text-[#707070] hover:bg-[#fafafa]"
              }`}
              title={
                isVideoAnnotated
                  ? "Switch to raw video without burnt-in annotations"
                  : "Switch to video with burnt-in YOLO & InfoGCN annotations"
              }
            >
              {isVideoAnnotated ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>{isVideoAnnotated ? "Annotations On" : "Annotations Off"}</span>
            </button>
          )}

          {/* 2. Browser Overlay Toggle: turn off DOM/SVG drawn boxes */}
          {analysis && (
            <button
              type="button"
              onClick={onToggleBrowserOverlay}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium border transition-colors ${
                showBrowserOverlay
                  ? "border-blue-200 bg-blue-50 text-[#0052ff] hover:bg-blue-100"
                  : "border-[#dfdfdf] bg-[#ffffff] text-[#707070] hover:bg-[#fafafa]"
              }`}
              title={
                showBrowserOverlay
                  ? "Turn off browser overlay (hide browser-drawn boxes)"
                  : "Turn on browser overlay (interactive bounding boxes & focus)"
              }
            >
              <Layers size={13} />
              <span>Overlay {showBrowserOverlay ? "On" : "Off"}</span>
            </button>
          )}

          {(file || sourceVideoUrl || resultVideoUrl) && (
            <button
              type="button"
              onClick={onRequestUpload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa] transition-colors"
            >
              <Upload size={13} />
              Upload
            </button>
          )}

          {(file || sourceVideoUrl || resultVideoUrl || loadedHistoryId) &&
            !isSubmitting && (
              <button
                type="button"
                onClick={onRunInference}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
              >
                {resultVideoUrl || loadedHistoryId ? "Re-analyze" : "Analyze"}
              </button>
            )}

          {resultDownloadUrl && !isSubmitting && (
            <button
              type="button"
              onClick={onDownload}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium border border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa] disabled:opacity-40 transition-colors"
            >
              <Download size={13} />
              {isDownloading ? "Downloading…" : "Download"}
            </button>
          )}

          {(resultVideoUrl || sourceVideoUrl) && (
            <button
              type="button"
              onClick={onSaveToHistory}
              disabled={!canSaveToHistory}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium border transition-colors disabled:opacity-40 ${
                historySavedAt
                  ? "border-[#0052ff]/40 bg-[#0052ff]/8 text-[#0041cc]"
                  : "border-[#dfdfdf] bg-[#ffffff] text-[#171717] hover:bg-[#fafafa]"
              }`}
            >
              <Save size={13} />
              {historySavedAt ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* ── Video area ── */}
      <div
        ref={containerRef}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex-1 min-h-0 bg-[#1c1c1c] overflow-hidden flex flex-col"
      >
        {sourceVideoUrl || resultVideoUrl ? (
          <>
            <video
              ref={videoPlayerRef}
              key={activeVideoUrl ?? undefined}
              controls
              src={activeVideoUrl ?? undefined}
              preload="metadata"
              onLoadedMetadata={(e) => {
                const duration = e.currentTarget.duration;
                onVideoLoaded(
                  Number.isFinite(duration) && duration > 0 ? duration : 0,
                  e.currentTarget.currentTime || 0,
                );
              }}
              onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime || 0)}
              onLoadedData={() => {
                onSourcePlaybackError(null);
                onResultPlaybackError(null);
              }}
              onPlay={() => onPlaybackStateChange(true)}
              onPause={() => onPlaybackStateChange(false)}
              onError={() => {
                if (resultVideoUrl && sourceVideoUrl) {
                  onResultPlaybackError(
                    "Annotated video decoding failed. Switched to source.",
                  );
                  onClearResult();
                  return;
                }
                onSourcePlaybackError("Browser cannot decode this video.");
              }}
              className="h-full w-full object-contain"
            />
            {/* Interactive Video Spotlight & Bounding Box Overlay */}
            <VideoFocusOverlay
              videoRef={videoPlayerRef}
              containerRef={containerRef}
              currentDetections={currentFrameDetections}
              focusedPersonId={focusedPersonId}
              showAnnotations={showBrowserOverlay}
              onFocusPerson={onFocusPerson}
              onClearFocus={onClearFocus}
              onOpenPersonDetails={onOpenPersonDetails}
            />
          </>
        ) : (
          /* Empty state / Dropzone */
          <div
            onClick={onRequestUpload}
            className="group flex flex-col items-center justify-center h-full max-h-[380px] w-full max-w-md mx-auto my-auto border-2 border-dashed border-[#333333] hover:border-[#0052ff] rounded-2xl bg-[#202020]/60 hover:bg-[#0052ff]/5 p-8 transition-all cursor-pointer text-center gap-4 shadow-sm"
          >
            <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/5 group-hover:bg-[#0052ff]/10 group-hover:border-[#0052ff]/40 flex items-center justify-center transition-colors">
              <Upload size={24} className="text-[#9a9a9a] group-hover:text-[#0052ff] transition-colors" />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-white group-hover:text-[#5d85ff] transition-colors">
                Drag & drop video here
              </p>
              <p className="text-[12px] text-[#888888]">
                or click anywhere in this area to browse files
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#777777] bg-black/40 px-3 py-1 rounded-full border border-white/5">
              <span>MP4</span>
              <span>•</span>
              <span>MOV</span>
              <span>•</span>
              <span>AVI</span>
              <span>•</span>
              <span>WebM</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestUpload();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors mt-2"
            >
              <Upload size={13} />
              Upload Video
            </button>
          </div>
        )}

        {/* ── Drag & Drop Active Overlay ── */}
        {isDragging && !isSubmitting && (
          <div className="absolute inset-0 z-30 bg-[#0052ff]/20 backdrop-blur-sm border-2 border-dashed border-[#0052ff] flex flex-col items-center justify-center gap-3.5 p-6 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 rounded-2xl bg-[#0052ff] text-white flex items-center justify-center shadow-lg shadow-blue-500/30 animate-bounce">
              <Upload size={26} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-[16px] font-bold text-white drop-shadow">
                Drop video to load
              </p>
              <p className="text-[12px] text-blue-200">
                Supports MP4, MOV, AVI, WebM
              </p>
            </div>
          </div>
        )}

        {/* ── Progress overlay ── */}
        {isSubmitting && (
          <div className="absolute inset-0 z-10 bg-[#1c1c1c]/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4 px-8">
            <div className="w-full max-w-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#ffffff]/70 uppercase tracking-[0.06em]">
                  Processing
                </span>
                <span className="text-[12px] font-mono text-[#0052ff]">
                  {typeof progressFrameIndex === "number" && progressTotalFrames
                    ? `${progressFrameIndex} / ${progressTotalFrames}`
                    : `${Math.round(progressPercent)}%`}
                </span>
              </div>
              <p className="text-[14px] text-[#ffffff] mb-3">
                {progressMessage ?? "Analyzing…"}
              </p>
              {/* Progress bar */}
              <div className="h-1 w-full rounded-full bg-[#ffffff]/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#0052ff] transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPanel;
