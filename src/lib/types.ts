export type Detection = {
  frame_number: number;
  action_label: string;
  confidence: number;
  person_id: number;
  timestamp: string;
};

export type SummaryMetrics = {
  yolo_precision: number;
  yolo_recall: number;
  infogcn_accuracy: number;
  mean_average_precision: number;
};

export type AlertEvent = {
  start_frame: number;
  end_frame: number;
  severity_level: string;
  person_id: number;
  start_timestamp: string;
  end_timestamp: string;
};

export type AnalyzeVideoResponse = {
  summary_metrics: SummaryMetrics;
  alert_events: AlertEvent[];
  action_confidence_scores: Record<string, number>;
  grouped_detections: Record<string, Detection[]>;
};
