import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Save,
} from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "./ui/badge";

export type RealTimeSaveState = {
  status: "idle" | "pending_confirmation" | "uploading" | "saving" | "done";
  annotated?: any;
  source?: any;
  historyId?: string;
};

export type RealTimeLogsProps = {
  logs: string[];
  latestAction: string | null;
  isCameraActive: boolean;
  frameCount: number;
  detectionCount: number;
  saveState: RealTimeSaveState;
  onSaveSession: (annotated: any, source: any) => void;
  onDiscardSession: () => void;
  waveAlertLogs: string[];
  isAlertsExpanded: boolean;
  onToggleAlerts: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export const RealTimeLogs: React.FC<RealTimeLogsProps> = ({
  logs,
  latestAction,
  isCameraActive,
  frameCount,
  detectionCount,
  saveState,
  onSaveSession,
  onDiscardSession,
  waveAlertLogs,
  isAlertsExpanded,
  onToggleAlerts,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const navigate = useNavigate();

  if (isCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-l border-slate-200 bg-white py-4 shadow-sm shrink-0">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand inference logs"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <PanelRightOpen size={18} />
        </button>
        <div className="mt-8 flex flex-col items-center gap-3 text-slate-400">
          <span className="writing-mode-vertical text-xs font-semibold uppercase tracking-wider text-slate-500">
            Inference Logs
          </span>
          <Badge className="bg-blue-50 text-[#0052ff] border-blue-100 font-mono text-[10px]">
            {logs.length}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200/80 bg-white shadow-sm shrink-0">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#0052ff]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Inference Logs
          </h3>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            aria-label="Collapse inference logs"
            onClick={onToggleCollapse}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
          >
            <PanelRightClose size={16} />
          </button>
        )}
      </div>

      {/* Live stats grid */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-white p-3.5 shrink-0">
        <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Latest Action
          </div>
          <div className="mt-1 text-xs font-bold text-slate-800 truncate">
            {latestAction ?? (
              <span className="text-slate-400 font-normal">Waiting...</span>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Pipeline Status
          </div>
          <div className="mt-1">
            {isCameraActive ? (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold px-2 py-0.5">
                Live
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-semibold px-2 py-0.5">
                Idle
              </Badge>
            )}
          </div>
        </div>

        <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Processed Frames
          </div>
          <div className="mt-1 text-xs font-bold font-mono text-slate-800">
            {frameCount.toLocaleString()}
          </div>
        </div>

        <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Total Detections
          </div>
          <div className="mt-1 text-xs font-bold font-mono text-slate-800">
            {detectionCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Save status banner */}
      {saveState.status === "pending_confirmation" && (
        <div className="border-b border-amber-200 bg-amber-50 px-3.5 py-2.5 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-amber-900 font-semibold truncate">
            <Save className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="truncate">Save video session?</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              className="text-xs bg-[#0052ff] hover:bg-[#0043d1] text-white font-medium px-2.5 py-1 rounded shadow-sm transition-colors"
              onClick={() => onSaveSession(saveState.annotated, saveState.source)}
            >
              Save
            </button>
            <button
              type="button"
              className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1"
              onClick={onDiscardSession}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {(saveState.status === "uploading" || saveState.status === "saving") && (
        <div className="border-b border-blue-100 bg-blue-50 px-3.5 py-2.5 shrink-0 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 text-[#0052ff] animate-spin shrink-0" />
          <span className="text-xs font-medium text-blue-900 truncate">
            {saveState.status === "uploading" ? "Uploading video session..." : "Saving analysis to history..."}
          </span>
        </div>
      )}

      {saveState.status === "done" && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-3.5 py-2.5 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Session saved to history</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-[#0052ff] hover:underline"
            onClick={() => navigate(`/library?history=${saveState.historyId}`)}
          >
            View in Library
          </button>
        </div>
      )}

      {/* Waving Alerts Accordion */}
      {waveAlertLogs.length > 0 && (
        <div className="border-b border-amber-200/80 shrink-0">
          <button
            type="button"
            onClick={onToggleAlerts}
            className="w-full flex items-center justify-between px-3.5 py-2 bg-amber-50/80 hover:bg-amber-100/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs font-semibold text-amber-900">
                Waving Alerts
              </span>
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                {waveAlertLogs.length}
              </span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-amber-700 transition-transform ${
                isAlertsExpanded ? "rotate-180" : ""
              }`}
            />
          </button>

          {isAlertsExpanded && (
            <div className="max-h-36 overflow-y-auto bg-amber-50/50 p-2.5 space-y-1">
              {waveAlertLogs.map((line, i) => (
                <div
                  key={i}
                  className="rounded border border-amber-200/70 bg-white px-2.5 py-1.5 font-mono text-[10px] text-amber-900"
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Realtime log list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 font-mono text-xs leading-relaxed text-slate-600 space-y-1">
        {logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs font-sans text-slate-400">
            Real-time inference logs will stream here once active.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className="py-0.5 border-b border-slate-50 last:border-0 hover:bg-slate-50 px-1 rounded transition-colors text-[11px]"
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
