import type { RefObject, ChangeEventHandler } from "react";
import { Download, Save, Upload } from "lucide-react";
import TitleMono from "@/components/titile-mono";

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
  onRequestUpload,
  onVideoLoaded,
  onTimeUpdate,
  onSourcePlaybackError,
  onResultPlaybackError,
  onClearResult,
  onPlaybackStateChange,
}: VideoPanelProps) => {
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

          {(file || sourceVideoUrl) && !isSubmitting && (
            <button
              type="button"
              onClick={onRunInference}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
            >
              {resultVideoUrl ? "Re-analyze" : "Analyze"}
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
      <div className="relative flex-1 min-h-0 bg-[#1c1c1c]">
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
              onSourcePlaybackError("Browser cannot decode this video.");
            }}
            className="h-full w-full object-contain"
          />
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="w-12 h-12 rounded-[12px] border border-[#dfdfdf] bg-[#202020] flex items-center justify-center">
              <Upload size={18} className="text-[#9a9a9a]" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-[#9a9a9a]">
                No video uploaded
              </p>
              <p className="text-[12px] text-[#707070] mt-1">
                Upload a video file to begin analysis
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestUpload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
            >
              <Upload size={13} />
              Upload Video
            </button>
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
