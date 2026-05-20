import type { AnalyzeVideoResponse, Detection } from "@/lib/types";

export type VideoInferenceResponse = {
  type: string;
  output_video_url: string;
  output_download_url?: string;
  source_video_url?: string;
  source_transcode_backend?: string;
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
  detections_log?: Detection[];
  analysis_summary?: AnalyzeVideoResponse;
};

export type VideoInferenceJobStartResponse = {
  type: string;
  job_id: string;
  status_url?: string;
};

export type VideoInferenceJobStatusResponse = {
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

export type SessionVideoEntry = {
  id: string;
  videoUrl: string;
  downloadUrl: string;
  sourceVideoUrl?: string | null;
  summary: string;
  filename: string;
  createdAt: number;
  expiresAt: number;
  analysis?: AnalyzeVideoResponse | null;
  fps?: number | null;
};

export type HistoryListEntry = {
  id: string;
  videoUrl: string | null;
  sourceVideoUrl?: string | null;
  summary: string;
  filename: string;
  createdAt: number;
  durationSeconds?: number;
  detectedActions?: string[];
  topAction?: string;
  hasWaveAlert?: boolean;
};

export type HistoryEntry = HistoryListEntry & {
  analysis: AnalyzeVideoResponse;
};
