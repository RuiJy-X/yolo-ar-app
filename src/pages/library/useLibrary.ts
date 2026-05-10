import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
} from "react";
import type { AnalyzeVideoResponse, Detection } from "@/lib/types";
import type {
  HistoryEntry,
  SessionVideoEntry,
  VideoInferenceJobStartResponse,
  VideoInferenceJobStatusResponse,
  VideoInferenceResponse,
} from "./types";
import {
  getFilenameFromUrl,
  loadSessionEntries,
  pruneSessionEntries,
  toAbsoluteUrl,
  withCacheBust,
} from "./utils";

const apiBaseUrl =
  import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000";
const SESSION_STORAGE_KEY = "library:annotated-videos";
const DEFAULT_RETENTION_SECONDS = 30 * 60;
const JOB_STATUS_POLL_MS = 900;

export type ActionTimelineTag = {
  id: string;
  action: string;
  personId: number;
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  color: string;
};

const ACTION_TAG_COLORS = [
  "#2563EB",
  "#EA580C",
  "#059669",
  "#9333EA",
  "#0E7490",
  "#B91C1C",
];

const groupIntoRuns = (frames: number[]) => {
  const runs: Array<{ start: number; end: number }> = [];
  if (frames.length === 0) return runs;

  let runStart = frames[0];
  let prev = frames[0];
  for (let idx = 1; idx < frames.length; idx += 1) {
    const frame = frames[idx];
    if (frame <= prev + 1) {
      prev = frame;
      continue;
    }
    runs.push({ start: runStart, end: prev });
    runStart = frame;
    prev = frame;
  }
  runs.push({ start: runStart, end: prev });
  return runs;
};

/**
 * Unwrap the analysis object coming from either:
 *  - a normal Library inference run  → already an AnalyzeVideoResponse
 *  - a realtime session history entry → the full job result object, where
 *    the AnalyzeVideoResponse lives under `analysis_summary`
 */
function normalizeAnalysis(raw: unknown): AnalyzeVideoResponse | null {
  if (raw == null || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  // Already a proper AnalyzeVideoResponse — has grouped_detections at top level
  if (obj.grouped_detections != null) {
    return obj as unknown as AnalyzeVideoResponse;
  }

  // Realtime session: AnalyzeVideoResponse is nested under analysis_summary
  if (
    obj.analysis_summary != null &&
    typeof obj.analysis_summary === "object"
  ) {
    const nested = obj.analysis_summary as Record<string, unknown>;
    if (nested.grouped_detections != null) {
      return nested as unknown as AnalyzeVideoResponse;
    }
  }

  return null;
}

const buildActionTimelineTags = (
  analysis: AnalyzeVideoResponse | null,
  fps: number,
): ActionTimelineTag[] => {
  if (!analysis) return [];

  // Guard: grouped_detections may be missing/null on malformed entries
  if (!analysis.grouped_detections) return [];

  const safeFps = fps > 0 ? fps : 30;
  const tags: ActionTimelineTag[] = [];

  Object.entries(analysis.grouped_detections).forEach(
    ([action, detections], actionIdx) => {
      // Guard: detections array may be missing
      if (!Array.isArray(detections)) return;

      const byPerson = new Map<number, number[]>();
      detections.forEach((entry: Detection) => {
        const frames = byPerson.get(entry.person_id) ?? [];
        frames.push(entry.frame_number);
        byPerson.set(entry.person_id, frames);
      });

      byPerson.forEach((frames, personId) => {
        const sortedFrames = Array.from(new Set(frames)).sort((a, b) => a - b);
        const runs = groupIntoRuns(sortedFrames);
        runs.forEach((run, runIdx) => {
          const startSeconds = run.start / safeFps;
          const endSeconds = (run.end + 1) / safeFps;
          tags.push({
            id: `${action}-${personId}-${run.start}-${run.end}-${runIdx}`,
            action,
            personId,
            startFrame: run.start,
            endFrame: run.end,
            startSeconds,
            endSeconds,
            color: ACTION_TAG_COLORS[actionIdx % ACTION_TAG_COLORS.length],
          });
        });
      });
    },
  );

  return tags.sort((a, b) => a.startFrame - b.startFrame);
};

export const useLibraryState = (historyId?: string | null) => {
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
  const [historySavedAt, setHistorySavedAt] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [progressFrameIndex, setProgressFrameIndex] = useState<number | null>(
    null,
  );
  const [progressTotalFrames, setProgressTotalFrames] = useState<number | null>(
    null,
  );
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(0);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Tracks whether the current session was loaded from a history entry.
  // Used to route re-analysis through the history-aware backend endpoint.
  const [loadedHistoryId, setLoadedHistoryId] = useState<string | null>(null);

  const replaceSourceVideoUrl = (nextUrl: string | null) => {
    setSourceVideoUrl((previous) => {
      if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      return nextUrl;
    });
  };

  const actionTimelineTags = useMemo(
    () => buildActionTimelineTags(analysis, seekFps),
    [analysis, seekFps],
  );

  const inferredDurationSeconds = useMemo(() => {
    if (actionTimelineTags.length === 0) return 0;
    return actionTimelineTags.reduce(
      (max, tag) => Math.max(max, tag.endSeconds),
      0,
    );
  }, [actionTimelineTags]);

  const timelineDurationSeconds = Math.max(
    1,
    videoDurationSeconds,
    inferredDurationSeconds,
  );

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setLoadedHistoryId(null); // fresh upload — no longer tied to a history entry
    setResultVideoUrl(null);
    setResultDownloadUrl(null);
    setSummary(null);
    setAnalysis(null);
    setError(null);
    setSourcePlaybackError(null);
    setResultPlaybackError(null);
    setCurrentTimeSeconds(0);
    setVideoDurationSeconds(0);
    replaceSourceVideoUrl(selected ? URL.createObjectURL(selected) : null);
  };

  const handleRunInference = async () => {
    if (!file && !sourceVideoUrl) {
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
      let inferUrl: string;
      let fetchInit: RequestInit;

      if (file) {
        // Scenario A: Fresh local file upload
        const formData = new FormData();
        formData.append("file", file);
        inferUrl = `${apiBaseUrl}/api/infer-video`;
        fetchInit = { method: "POST", body: formData };
      } else if (loadedHistoryId) {
        // Scenario B: Re-analyzing a history entry — use the dedicated endpoint
        // so the backend reads the stored source video and writes the result
        // back into the same history folder (no expiry, no missing-file errors).
        inferUrl = `${apiBaseUrl}/api/infer-video/from-history/${loadedHistoryId}`;
        fetchInit = { method: "POST" };
      } else {
        // Scenario C: sourceVideoUrl is a remote URL but we have no local File.
        // Fetch it as a Blob and re-upload so the normal pipeline handles it.
        setProgressMessage("Fetching source video for re-upload...");
        const blobResponse = await fetch(sourceVideoUrl!);
        if (!blobResponse.ok)
          throw new Error(
            `Could not fetch source video (${blobResponse.status}).`,
          );
        const blob = await blobResponse.blob();
        const filename = getFilenameFromUrl(sourceVideoUrl!) || "source.mp4";
        const reuploadFile = new File([blob], filename, {
          type: blob.type || "video/mp4",
        });
        const formData = new FormData();
        formData.append("file", reuploadFile);
        inferUrl = `${apiBaseUrl}/api/infer-video`;
        fetchInit = { method: "POST", body: formData };
      }

      const response = await fetch(inferUrl, fetchInit);

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
      if (!start.job_id)
        throw new Error("Inference job did not return a valid job id.");

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
          if (!status.result)
            throw new Error(
              "Inference completed but result payload is missing.",
            );
          output = status.result;
          setProgressPercent(100);
          setProgressMessage("Inference complete.");
          break;
        }

        if (status.status === "failed")
          throw new Error(status.error || "Video inference failed.");

        await new Promise((resolve) =>
          window.setTimeout(resolve, JOB_STATUS_POLL_MS),
        );
      }

      const playbackUrl = toAbsoluteUrl(output.output_video_url, apiBaseUrl);
      const downloadUrl = toAbsoluteUrl(
        output.output_download_url ?? output.output_video_url,
        apiBaseUrl,
      );
      const sourcePlaybackUrl = output.source_video_url
        ? toAbsoluteUrl(output.source_video_url, apiBaseUrl)
        : null;

      let analysisPayload = output.analysis_summary ?? null;
      if (
        !analysisPayload &&
        output.detections_log &&
        output.detections_log.length
      ) {
        const analyzeResponse = await fetch(`${apiBaseUrl}/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      setCurrentTimeSeconds(0);
      setVideoDurationSeconds(0);

      if (sourcePlaybackUrl)
        replaceSourceVideoUrl(withCacheBust(sourcePlaybackUrl));

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
      setSourcePlaybackError(null);
      // If we ran via the history endpoint, stay bound to that history entry
      // so subsequent re-runs continue to use the same efficient path.
      if (!file && loadedHistoryId) {
        // loadedHistoryId is unchanged — keep it set
      } else {
        setLoadedHistoryId(null);
      }
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

  const saveToHistory = async () => {
    if (!analysis) {
      setError("Run the analysis before saving to history.");
      return;
    }

    const rawVideoUrl = resultDownloadUrl ?? resultVideoUrl;
    if (!rawVideoUrl) {
      setError("No annotated video is available to save.");
      return;
    }

    const annotatedFilename = getFilenameFromUrl(rawVideoUrl);
    if (!annotatedFilename) {
      setError("Could not resolve the annotated filename.");
      return;
    }

    const sourceFilename =
      sourceVideoUrl && !sourceVideoUrl.startsWith("blob:")
        ? getFilenameFromUrl(sourceVideoUrl)
        : null;

    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annotatedFilename,
          sourceFilename,
          summary: summary ?? "Saved video analysis",
          filename: annotatedFilename,
          analysis,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | HistoryEntry
        | { detail?: string };
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" && payload !== null && "detail" in payload
            ? payload.detail || "Saving to history failed."
            : "Saving to history failed.",
        );
      }

      setHistorySavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const restoreRecentVideo = (entry: SessionVideoEntry) => {
    setResultPlaybackError(null);
    setAnalysis(null);
    setCurrentTimeSeconds(0);
    setVideoDurationSeconds(0);
    setResultVideoUrl(withCacheBust(entry.videoUrl));
    setResultDownloadUrl(entry.downloadUrl);
    setSummary(entry.summary);
  };

  const seekToFrame = (frame: number) => {
    if (!videoPlayerRef.current || !Number.isFinite(frame)) return;
    const safeFps = seekFps > 0 ? seekFps : 30;
    const nextTime = Math.max(0, frame / safeFps);
    videoPlayerRef.current.pause();
    videoPlayerRef.current.currentTime = nextTime;
    setCurrentTimeSeconds(nextTime);
  };

  const handleTimelineScrub: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextTime = Number(event.target.value);
    if (!Number.isFinite(nextTime) || !videoPlayerRef.current) return;
    const clamped = Math.max(0, Math.min(timelineDurationSeconds, nextTime));
    videoPlayerRef.current.pause();
    videoPlayerRef.current.currentTime = clamped;
    setCurrentTimeSeconds(clamped);
  };

  const handleDownload = async () => {
    if (!resultDownloadUrl) return;
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(resultDownloadUrl);
      if (!response.ok)
        throw new Error(`Download failed with status ${response.status}.`);
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
    setCurrentTimeSeconds(0);
    setVideoDurationSeconds(0);
    if (typeof window !== "undefined")
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  };

  useEffect(() => {
    const loaded = loadSessionEntries(SESSION_STORAGE_KEY);
    setRecentVideos(loaded);
    if (loaded[0]) restoreRecentVideo(loaded[0]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pruned = pruneSessionEntries(recentVideos);
    if (pruned.length === 0) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(pruned));
  }, [recentVideos]);

  useEffect(() => {
    if (!historySavedAt) return;
    const timer = window.setTimeout(() => {
      setHistorySavedAt(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [historySavedAt]);

  useEffect(() => {
    if (!historyId) return;
    let active = true;

    const loadHistory = async () => {
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/history/${historyId}`);
        const payload = (await response.json().catch(() => null)) as
          | HistoryEntry
          | { detail?: string };
        if (!response.ok) {
          throw new Error(
            typeof payload === "object" &&
              payload !== null &&
              "detail" in payload
              ? payload.detail || "History entry not found."
              : "History entry not found.",
          );
        }

        if (!active) return;
        const entry = payload as HistoryEntry;

        // Normalize the analysis: realtime session entries store the full job
        // result object (with analysis_summary nested inside) rather than a
        // bare AnalyzeVideoResponse, so we unwrap it here.
        const normalizedAnalysis = normalizeAnalysis(entry.analysis);

        // Derive FPS from the stored job result if available
        const storedFps =
          entry.analysis &&
          typeof (entry.analysis as Record<string, unknown>).fps === "number"
            ? ((entry.analysis as Record<string, unknown>).fps as number)
            : null;

        setAnalysis(normalizedAnalysis);
        if (storedFps && storedFps > 0) setSeekFps(storedFps);
        setCurrentTimeSeconds(0);
        setVideoDurationSeconds(0);
        setResultPlaybackError(null);
        setLoadedHistoryId(entry.id); // remember which history entry this is
        setResultVideoUrl(
          withCacheBust(toAbsoluteUrl(entry.videoUrl, apiBaseUrl)),
        );
        setResultDownloadUrl(toAbsoluteUrl(entry.videoUrl, apiBaseUrl));
        setSummary(entry.summary ?? null);
        if (entry.sourceVideoUrl) {
          replaceSourceVideoUrl(
            withCacheBust(toAbsoluteUrl(entry.sourceVideoUrl, apiBaseUrl)),
          );
        } else {
          replaceSourceVideoUrl(null);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    loadHistory();
    return () => {
      active = false;
    };
  }, [historyId]);

  useEffect(() => {
    return () => {
      if (sourceVideoUrl?.startsWith("blob:"))
        URL.revokeObjectURL(sourceVideoUrl);
    };
  }, [sourceVideoUrl]);

  const togglePlayPause = () => {
    const video = videoPlayerRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch((err) => {
        console.error("Playback failed:", err);
      });
    } else {
      video.pause();
    }
  };

  const handlePlaybackStateChange = (playing: boolean) => {
    setIsPlaying(playing);
  };

  return {
    // refs
    fileInputRef,
    videoPlayerRef,
    // state
    file,
    sourceVideoUrl,
    resultVideoUrl,
    resultDownloadUrl,
    summary,
    error,
    isDownloading,
    recentVideos,
    sourcePlaybackError,
    resultPlaybackError,
    isSubmitting,
    analysis,
    progressPercent,
    progressMessage,
    progressFrameIndex,
    progressTotalFrames,
    videoDurationSeconds,
    currentTimeSeconds,
    actionTimelineTags,
    timelineDurationSeconds,
    isPlaying,
    historySavedAt,
    // setters needed by child components
    setSourcePlaybackError,
    setResultPlaybackError,
    setCurrentTimeSeconds,
    setVideoDurationSeconds,
    setResultVideoUrl,
    // handlers
    handleFileChange,
    handleRunInference,
    seekToFrame,
    handleTimelineScrub,
    handleDownload,
    saveToHistory,
    clearSessionVideos,
    restoreRecentVideo,

    togglePlayPause,
    handlePlaybackStateChange,
  };
};;