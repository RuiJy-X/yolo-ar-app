import { useEffect, useState, type ChangeEventHandler } from "react";
import AppLayout from "@/applayout";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

type VideoInferenceResponse = {
  type: string;
  output_video_url: string;
  output_download_url?: string;
  retention_seconds?: number;
  frames_processed: number;
  people_instances_detected: number;
  tracks_created: number;
  fps: number;
  processing_seconds?: number;
  output_codec?: string;
  resolution: {
    width: number;
    height: number;
  };
};

type VideoInferenceJobStartResponse = {
  type: string;
  job_id: string;
  status_url?: string;
};

type VideoInferenceJobStatusResponse = {
  type: string;
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress_percent?: number;
  progress_message?: string;
  frame_index?: number;
  total_frames?: number | null;
  result?: VideoInferenceResponse;
  error?: string | null;
};

type SessionVideoEntry = {
  id: string;
  videoUrl: string;
  downloadUrl: string;
  summary: string;
  filename: string;
  createdAt: number;
  expiresAt: number;
};

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";
const SESSION_STORAGE_KEY = "library:annotated-videos";
const SESSION_MAX_ITEMS = 4;
const DEFAULT_RETENTION_SECONDS = 30 * 60;
const JOB_STATUS_POLL_MS = 900;

const toAbsoluteUrl = (url: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

const withCacheBust = (url: string) => {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
};

const getFilenameFromUrl = (url: string, fallback = "annotated_video.mp4") => {
  try {
    const parsed = new URL(url, window.location.origin);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length > 0
      ? decodeURIComponent(parts[parts.length - 1])
      : fallback;
  } catch {
    return fallback;
  }
};

const pruneSessionEntries = (entries: SessionVideoEntry[]) => {
  const now = Date.now();
  return entries
    .filter((entry) => entry.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SESSION_MAX_ITEMS);
};

const loadSessionEntries = (): SessionVideoEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed.filter((item): item is SessionVideoEntry => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.videoUrl === "string" &&
        typeof item.downloadUrl === "string" &&
        typeof item.summary === "string" &&
        typeof item.filename === "string" &&
        typeof item.createdAt === "number" &&
        typeof item.expiresAt === "number"
      );
    });

    return pruneSessionEntries(entries);
  } catch {
    return [];
  }
};

const Library = () => {
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

      const playbackUrl = toAbsoluteUrl(output.output_video_url);
      const downloadUrl = toAbsoluteUrl(
        output.output_download_url ?? output.output_video_url,
      );
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
    setResultVideoUrl(withCacheBust(entry.videoUrl));
    setResultDownloadUrl(entry.downloadUrl);
    setSummary(entry.summary);
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
    setResultPlaybackError(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  useEffect(() => {
    const loaded = loadSessionEntries();
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

      <div className="w-full rounded-xl border border-[#D6E4FF] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-70 flex-col gap-2 text-sm text-[#344054]">
            Select Video
            <input
              type="file"
              accept="video/*,.avi,video/avi,video/x-msvideo"
              onChange={handleFileChange}
              className="rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm"
            />
          </label>

          <Button onClick={handleRunInference} disabled={!file || isSubmitting}>
            {isSubmitting ? "Running Inference..." : "Run Inference"}
          </Button>
        </div>

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

      <div className="grid w-full grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-[#D6E4FF] bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#344054]">
            Original Video
          </div>
          {sourceVideoUrl ? (
            <video
              key={sourceVideoUrl}
              controls
              src={sourceVideoUrl}
              preload="metadata"
              onLoadedData={() => setSourcePlaybackError(null)}
              onError={() =>
                setSourcePlaybackError(
                  "This browser could not decode the selected video for preview. Inference may still run, but try MP4 (H.264/AAC) for reliable playback.",
                )
              }
              className="h-105 w-full rounded-md bg-black object-contain"
            />
          ) : (
            <div className="flex h-105 items-center justify-center rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-sm text-[#64748B]">
              Select a video to preview it.
            </div>
          )}
          {sourcePlaybackError && (
            <div className="mt-3 rounded-md bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
              {sourcePlaybackError}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#D6E4FF] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-[#344054]">
              Annotated Output
            </div>
            {resultDownloadUrl && (
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

          {resultVideoUrl ? (
            <video
              key={resultVideoUrl}
              controls
              src={resultVideoUrl}
              preload="metadata"
              onLoadedData={() => setResultPlaybackError(null)}
              onError={() =>
                setResultPlaybackError(
                  "Annotated video could not be played in-browser. Try downloading it, then play it locally. If this repeats, set ALLOW_OPENH264=1 on backend for stronger browser compatibility.",
                )
              }
              className="h-105 w-full rounded-md bg-black object-contain"
            />
          ) : (
            <div className="flex h-105 items-center justify-center rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-sm text-[#64748B]">
              Run inference to generate the annotated video.
            </div>
          )}
          {resultPlaybackError && (
            <div className="mt-3 rounded-md bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
              {resultPlaybackError}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Library;
