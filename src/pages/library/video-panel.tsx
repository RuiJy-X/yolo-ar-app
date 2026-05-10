import type { RefObject, ChangeEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { Download, Save, Upload } from "lucide-react";

type VideoPanelProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  videoPlayerRef: RefObject<HTMLVideoElement | null>;
  file: File | null;
  sourceVideoUrl: string | null;
  resultVideoUrl: string | null;
  resultDownloadUrl: string | null;
  isSubmitting: boolean;
  isDownloading: boolean;
  progressPercent: number;
  progressMessage: string | null;
  progressFrameIndex: number | null;
  progressTotalFrames: number | null;
  canSaveToHistory: boolean;
  historySavedAt: number | null;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
  onRunInference: () => void;
  onDownload: () => void;
  onSaveToHistory: () => void;
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
  isSubmitting,
  isDownloading,
  progressPercent,
  progressMessage,
  progressFrameIndex,
  progressTotalFrames,
  canSaveToHistory,
  historySavedAt,
  onFileChange,
  onRunInference,
  onDownload,
  onSaveToHistory,
  onVideoLoaded,
  onTimeUpdate,
  onSourcePlaybackError,
  onResultPlaybackError,
  onClearResult,
  onPlaybackStateChange,
}: VideoPanelProps) => {
  return (
    <div className="rounded-md border border-[#D6E4FF] bg-white p-3 shadow-sm h-full flex-1 flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.avi,video/avi,video/x-msvideo"
        onChange={onFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-bold uppercase text-[#344054] font-heading ">
          Video Playback
        </div>

        <div className="flex items-center gap-2">
          {(file || sourceVideoUrl || resultVideoUrl) && (
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs "
            >
              <Upload />
              Upload Video
            </Button>
          )}

          {file && !isSubmitting && !resultVideoUrl && (
            <Button onClick={onRunInference}>Analyze</Button>
          )}

          {resultDownloadUrl && !isSubmitting && (
            <Button
              type="button"
              variant={"outline"}
              onClick={onDownload}
              disabled={isDownloading}
              className="text-xs"
            >
              <Download />
              {isDownloading ? "Downloading..." : "Download"}
            </Button>
          )}

          {(resultVideoUrl || sourceVideoUrl) && (
            <Button
              type="button"
              onClick={onSaveToHistory}
              disabled={!canSaveToHistory}
              variant={historySavedAt ? "secondary" : "default"}
              className="text-xs"
            >
              <Save />
              {historySavedAt ? "Saved" : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* Video container */}
      <div className="flex flex-1 flex-col w-full min-h-0 rounded-md bg-black  ">
        {sourceVideoUrl || resultVideoUrl ? (
          <video
            ref={videoPlayerRef}
            key={resultVideoUrl ?? sourceVideoUrl ?? undefined}
            controls
            src={resultVideoUrl ?? sourceVideoUrl ?? undefined}
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
              onSourcePlaybackError(
                "Browser cannot decode this video preview.",
              );
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex items-center justify-center border border-dashed border-[#CBD5E1] bg-[#F8FAFC] flex-1 px-4 text-center">
            <div>
              <div className="text-sm text-[#64748B]">
                No video uploaded yet.
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3"
              >
                Upload Video
              </Button>
            </div>
          </div>
        )}

        {/* Progress overlay */}
        {isSubmitting && (
          <div className="absolute inset-x-0 top-0 z-10 bg-black/60 p-4 backdrop-blur-sm transition-opacity">
            <div className="flex items-center justify-between gap-4 text-white">
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Processing
                </span>
                <span className="text-sm font-medium">
                  {progressMessage ?? "Analyzing..."}
                </span>
              </div>
              <div className="text-right text-xs font-mono">
                {typeof progressFrameIndex === "number" && progressTotalFrames
                  ? `${progressFrameIndex} / ${progressTotalFrames} frames`
                  : `${Math.round(progressPercent)}%`}
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPanel;
