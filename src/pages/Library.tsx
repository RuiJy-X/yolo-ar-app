import { useEffect, useRef, useState, type ChangeEventHandler } from "react";
import AppLayout from "@/applayout";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import Logs from "@/components/Logs";
import MetricsCards from "@/components/library/metrics-cards";
import type { AnalyzeVideoResponse } from "@/lib/types";
import type {
  SessionVideoEntry,
  VideoInferenceJobStartResponse,
  VideoInferenceJobStatusResponse,
  VideoInferenceResponse,
} from "./library/types";
import {
  getFilenameFromUrl,
  loadSessionEntries,
  pruneSessionEntries,
  toAbsoluteUrl,
  withCacheBust,
} from "./library/utils";

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";
const SESSION_STORAGE_KEY = "library:annotated-videos";
const DEFAULT_RETENTION_SECONDS = 30 * 60;
const JOB_STATUS_POLL_MS = 900;

const Library = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [resultVideoUrl, setResultVideoUrl] = useState<string | null>(null);
  const [resultDownloadUrl, setResultDownloadUrl] = useState<string | null>(
    null,
  );
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [recentVideos, setRecentVideos] = useState<SessionVideoEntry[]>([]);
  const [sourcePlaybackError, setSourcePlaybackError] = useState<string | null>(
    null,
  );
  const [resultPlaybackError, setResultPlaybackError] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeVideoResponse | null>(null);
  const [seekFps, setSeekFps] = useState<number>(30);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressFrameIndex, setProgressFrameIndex] = useState<number | null>(
    null,
  );
  const [progressTotalFrames, setProgressTotalFrames] = useState<number | null>(
    null,
  );

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setResultVideoUrl(null);
    setResultDownloadUrl(null);
    setSummary(null);
    setAnalysis(null);
    setError(null);
    setSourcePlaybackError(null);
    setResultPlaybackError(null);

    setSourceVideoUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      return selected ? URL.createObjectURL(selected) : null;
    });
  };

  const handleRunInference = async () => {
    if (!file) {
      setError("Please select a video file first.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResultVideoUrl(null);
    setResultDownloadUrl(null);
    setSummary(null);
    setAnalysis(null);
    setResultPlaybackError(null);
    setProgressPercent(0);
    setProgressMessage("Queued for processing...");
    setProgressFrameIndex(null);
    setProgressTotalFrames(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiBaseUrl}/api/infer-video`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | VideoInferenceJobStartResponse
        | { detail?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload !== null && "detail" in payload
            ? payload.detail || "Upload inference failed."
            : "Upload inference failed.",
        );
      }

      const start = payload as VideoInferenceJobStartResponse;
      if (!start.job_id) {
        throw new Error("Inference job did not return a valid job id.");
      }

      const statusUrl = `${apiBaseUrl}/api/infer-video/${start.job_id}`;
      const pollStartedAt = Date.now();
      let output: VideoInferenceResponse | null = null;

      while (!output) {
        if (Date.now() - pollStartedAt > 1000 * 60 * 60) {
          throw new Error("Inference timed out. Please try a shorter video.");
        }

        const statusResponse = await fetch(statusUrl);
        const statusPayload = (await statusResponse.json()) as
          | VideoInferenceJobStatusResponse
          | { detail?: string };

        if (!statusResponse.ok) {
          throw new Error(
            typeof statusPayload === "object" &&
              statusPayload !== null &&
              "detail" in statusPayload
              ? statusPayload.detail || "Could not fetch inference progress."
              : "Could not fetch inference progress.",
          );
        }

        const status = statusPayload as VideoInferenceJobStatusResponse;
        setProgressPercent(
          Number.isFinite(status.progress_percent)
            ? Math.min(100, Math.max(0, Number(status.progress_percent)))
            : 0,
        );
        setProgressMessage(status.progress_message ?? "Processing...");
        setProgressFrameIndex(
          typeof status.frame_index === "number" ? status.frame_index : null,
        );
        setProgressTotalFrames(
          typeof status.total_frames === "number" ? status.total_frames : null,
        );

        if (status.status === "completed") {
          if (!status.result) {
            throw new Error(
              "Inference completed but result payload is missing.",
            );
          }
          output = status.result;
          setProgressPercent(100);
          setProgressMessage("Inference complete.");
          break;
        }

        if (status.status === "failed") {
          throw new Error(status.error || "Video inference failed.");
        }

        await new Promise((resolve) =>
          window.setTimeout(resolve, JOB_STATUS_POLL_MS),
        );
      }

      const playbackUrl = toAbsoluteUrl(output.output_video_url, apiBaseUrl);
      const downloadUrl = toAbsoluteUrl(
        output.output_download_url ?? output.output_video_url,
        apiBaseUrl,
      );

      let analysisPayload = output.analysis_summary ?? null;
      if (
        !analysisPayload &&
        output.detections_log &&
        output.detections_log.length
      ) {
        const analyzeResponse = await fetch(`${apiBaseUrl}/analyze-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            detections_log: output.detections_log,
            total_frames: output.frames_processed,
          }),
        });

        const analyzeJson = (await analyzeResponse.json()) as
          | AnalyzeVideoResponse
          | { detail?: string };
        if (!analyzeResponse.ok) {
          throw new Error(
            typeof analyzeJson === "object" &&
              analyzeJson !== null &&
              "detail" in analyzeJson
              ? analyzeJson.detail || "Post-inference analysis failed."
              : "Post-inference analysis failed.",
          );
        }

        analysisPayload = analyzeJson as AnalyzeVideoResponse;
      }

      setAnalysis(analysisPayload);
      setSeekFps(output.fps > 0 ? output.fps : 30);

      const summaryText = `Frames: ${output.frames_processed} | Tracks: ${output.tracks_created} | Detections: ${output.people_instances_detected} | FPS: ${output.fps} | Resolution: ${output.resolution.width}x${output.resolution.height} | Codec: ${output.output_codec ?? "unknown"} | Processing: ${output.processing_seconds ?? "n/a"}s`;
      const retentionSeconds =
        typeof output.retention_seconds === "number" &&
        Number.isFinite(output.retention_seconds) &&
        output.retention_seconds > 0
          ? output.retention_seconds
          : DEFAULT_RETENTION_SECONDS;

      const entry: SessionVideoEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        videoUrl: playbackUrl,
        downloadUrl,
        summary: summaryText,
        filename: getFilenameFromUrl(downloadUrl),
        createdAt: Date.now(),
        expiresAt: Date.now() + retentionSeconds * 1000,
      };

      setResultVideoUrl(withCacheBust(playbackUrl));
      setResultDownloadUrl(downloadUrl);
      setSummary(summaryText);
      setRecentVideos((previous) => {
        const deduped = previous.filter(
          (item) => item.videoUrl !== playbackUrl,
        );
        return pruneSessionEntries([entry, ...deduped]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgressMessage(null);
      setProgressPercent(0);
      setProgressFrameIndex(null);
      setProgressTotalFrames(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreRecentVideo = (entry: SessionVideoEntry) => {
    setResultPlaybackError(null);
    setAnalysis(null);
    setResultVideoUrl(withCacheBust(entry.videoUrl));
    setResultDownloadUrl(entry.downloadUrl);
    setSummary(entry.summary);
  };

  const seekToFrame = (frame: number) => {
    if (!videoPlayerRef.current || !Number.isFinite(frame)) {
      return;
    }

    const safeFps = seekFps > 0 ? seekFps : 30;
    videoPlayerRef.current.currentTime = Math.max(0, frame / safeFps);
    void videoPlayerRef.current.play().catch(() => {
      // Keep silent: browsers may block autoplay after seek.
    });
  };

  const handleDownload = async () => {
    if (!resultDownloadUrl) {
      return;
    }

    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(resultDownloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}.`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = getFilenameFromUrl(resultDownloadUrl);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
    }
  };

  const clearSessionVideos = () => {
    setRecentVideos([]);
    setResultVideoUrl(null);
    setResultDownloadUrl(null);
    setSummary(null);
    setAnalysis(null);
    setResultPlaybackError(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  useEffect(() => {
    const loaded = loadSessionEntries(SESSION_STORAGE_KEY);
    setRecentVideos(loaded);
    if (loaded[0]) {
      restoreRecentVideo(loaded[0]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const pruned = pruneSessionEntries(recentVideos);
    if (pruned.length === 0) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(pruned));
  }, [recentVideos]);

  useEffect(() => {
    return () => {
      if (sourceVideoUrl) {
        URL.revokeObjectURL(sourceVideoUrl);
      }
    };
  }, [sourceVideoUrl]);

  return (
    <AppLayout>
      <Header
        title="Video Library Inference"
        description="Upload a video and run offline action-recognition inference with annotated output (bbox, keypoints, bones, and per-person action labels)."
      />
      <div className="mt-1 w-full">
        <MetricsCards analysis={analysis} />
      </div>
      <div className="flex w-full flex-col gap-3 xl:flex-row">
        <div className="w-full rounded-xl border  border-[#D6E4FF] bg-white p-6 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.avi,video/avi,video/x-msvideo"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-[#344054] font-heading">
              Inference Video Panel
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold text-[#1D4ED8] underline underline-offset-2"
              >
                {file || sourceVideoUrl || resultVideoUrl
                  ? "Upload Another Video"
                  : "Upload Video"}
              </button>

              {file && !isSubmitting && !resultVideoUrl && (
                <Button onClick={handleRunInference}>Analyze</Button>
              )}

              {resultDownloadUrl && !isSubmitting && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="text-sm font-semibold text-[#1D4ED8] underline underline-offset-2 disabled:text-[#94A3B8]"
                >
                  {isDownloading ? "Downloading..." : "Download"}
                </button>
              )}
            </div>
          </div>

          {sourceVideoUrl || resultVideoUrl ? (
            <video
              ref={videoPlayerRef}
              key={resultVideoUrl ?? sourceVideoUrl ?? undefined}
              controls
              src={resultVideoUrl ?? sourceVideoUrl ?? undefined}
              preload="metadata"
              onLoadedData={() => {
                setSourcePlaybackError(null);
                setResultPlaybackError(null);
              }}
              onError={() => {
                if (resultVideoUrl) {
                  setResultPlaybackError(
                    "Annotated video could not be played in-browser. Try downloading it, then play it locally. If this repeats, set ALLOW_OPENH264=1 on backend for stronger browser compatibility.",
                  );
                } else {
                  setSourcePlaybackError(
                    "This browser could not decode the selected video for preview. Inference may still run, but try MP4 (H.264/AAC) for reliable playback.",
                  );
                }
              }}
              className="h-105 w-full rounded-md bg-black object-contain"
            />
          ) : (
            <div className="flex h-105 items-center justify-center rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-center">
              <div>
                <div className="text-sm text-[#64748B]">
                  No video uploaded yet.
                </div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3"
                >
                  Upload Any Video File
                </Button>
              </div>
            </div>
          )}

          {isSubmitting && (
            <div className="mt-4 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-3 text-sm text-[#1E40AF]">
              <div className="font-semibold">
                {progressMessage ?? "Inference is running..."}
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#DBEAFE]">
                <div
                  className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-[#1E3A8A]">
                <span>{Math.round(progressPercent)}%</span>
                {typeof progressFrameIndex === "number" &&
                typeof progressTotalFrames === "number" &&
                progressTotalFrames > 0 ? (
                  <span>
                    {progressFrameIndex} / {progressTotalFrames} frames
                  </span>
                ) : (
                  <span>Estimating progress...</span>
                )}
              </div>
            </div>
          )}

          {file && (
            <div className="mt-4 text-sm text-[#475467]">
              Selected:{" "}
              <span className="font-semibold text-[#1D2939]">{file.name}</span>
            </div>
          )}

          {summary && (
            <div className="mt-4 rounded-md bg-[#ECFDF3] px-3 py-2 text-sm text-[#166534]">
              {summary}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-[#FEF2F2] px-3 py-2 text-sm text-[#B42318]">
              {error}
            </div>
          )}

          {sourcePlaybackError && (
            <div className="mt-3 rounded-md bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
              {sourcePlaybackError}
            </div>
          )}

          {resultPlaybackError && (
            <div className="mt-3 rounded-md bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
              {resultPlaybackError}
            </div>
          )}

          {recentVideos.length > 0 && (
            <div className="mt-4 rounded-md border border-[#D6E4FF] bg-[#F8FAFF] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">
                  Session Outputs
                </div>
                <button
                  type="button"
                  onClick={clearSessionVideos}
                  className="text-xs font-semibold text-[#B42318] underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentVideos.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => restoreRecentVideo(entry)}
                    className="rounded-md border border-[#BFDBFE] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-[#EFF6FF]"
                  >
                    {entry.filename}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Logs analysis={analysis} onSeekToFrame={seekToFrame} />
      </div>
    </AppLayout>
  );
};

export default Library;
