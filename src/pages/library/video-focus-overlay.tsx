import React, { useEffect, useState, useMemo } from "react";
import type { RefObject } from "react";
import type { Detection } from "@/lib/types";
import { getActionColor } from "@/pages/library/action-colors";
import { Info, X, Eye } from "lucide-react";

type VideoFocusOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  currentDetections: Detection[];
  focusedPersonId: number | null;
  showAnnotations?: boolean;
  onFocusPerson: (personId: number) => void;
  onClearFocus: () => void;
  onOpenPersonDetails: (personId: number) => void;
};

type RenderRect = {
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
  videoWidth: number;
  videoHeight: number;
};

export const VideoFocusOverlay: React.FC<VideoFocusOverlayProps> = ({
  videoRef,
  containerRef,
  currentDetections,
  focusedPersonId,
  showAnnotations = true,
  onFocusPerson,
  onClearFocus,
  onOpenPersonDetails,
}) => {
  const [renderRect, setRenderRect] = useState<RenderRect | null>(null);

  // Measure and recompute the video's actual display rect inside the object-contain container
  useEffect(() => {
    const updateRect = () => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 360;

      if (containerWidth <= 0 || containerHeight <= 0) return;

      const scale = Math.min(
        containerWidth / vWidth,
        containerHeight / vHeight,
      );
      const renderWidth = vWidth * scale;
      const renderHeight = vHeight * scale;
      const offsetX = (containerWidth - renderWidth) / 2;
      const offsetY = (containerHeight - renderHeight) / 2;

      setRenderRect({
        offsetX,
        offsetY,
        renderWidth,
        renderHeight,
        videoWidth: vWidth,
        videoHeight: vHeight,
      });
    };

    updateRect();
    window.addEventListener("resize", updateRect);
    const interval = setInterval(updateRect, 300);

    return () => {
      window.removeEventListener("resize", updateRect);
      clearInterval(interval);
    };
  }, [videoRef, containerRef]);

  // Find the detection matching the focusedPersonId in the current frame
  const focusedDetection = useMemo(() => {
    if (focusedPersonId === null) return null;
    return (
      currentDetections.find((d) => d.person_id === focusedPersonId) ?? null
    );
  }, [focusedPersonId, currentDetections]);

  // Helper to map video coordinates to screen pixels
  const getScaledBox = (bbox?: [number, number, number, number] | number[]) => {
    if (!renderRect || !bbox || bbox.length < 4) return null;
    const [x1, y1, x2, y2] = bbox;
    const { offsetX, offsetY, renderWidth, renderHeight, videoWidth, videoHeight } =
      renderRect;

    const left = offsetX + (x1 / videoWidth) * renderWidth;
    const top = offsetY + (y1 / videoHeight) * renderHeight;
    const width = Math.max(20, ((x2 - x1) / videoWidth) * renderWidth);
    const height = Math.max(20, ((y2 - y1) / videoHeight) * renderHeight);

    return { left, top, width, height, x1, y1, x2, y2 };
  };

  if (!showAnnotations || !renderRect) return null;

  const focusedBox = focusedDetection ? getScaledBox(focusedDetection.bbox) : null;
  const isFocusActive = focusedPersonId !== null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {/* ── 1. SPOTLIGHT DARKENING MASK ── */}
      {isFocusActive && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="spotlight-mask">
              {/* White background = visible mask (darkened) */}
              <rect width="100%" height="100%" fill="white" />
              {/* Black cutout = transparent window for focused person */}
              {focusedBox && (
                <rect
                  x={focusedBox.left - 4}
                  y={focusedBox.top - 4}
                  width={focusedBox.width + 8}
                  height={focusedBox.height + 8}
                  rx="10"
                  ry="10"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          {/* Semi-transparent dark overlay covering everything except the mask cutout */}
          <rect
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.78)"
            mask="url(#spotlight-mask)"
            className="transition-all duration-300 ease-out"
          />
        </svg>
      )}

      {/* ── 2. FOCUS STATUS / NOTIFICATION BANNER ── */}
      {isFocusActive && (
        <div className="absolute top-4 left-4 z-30 pointer-events-auto flex items-center gap-2 bg-slate-900/90 text-white backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            <span className="text-xs font-semibold">
              Focusing Person #{focusedPersonId}
            </span>
          </div>

          {!focusedDetection && (
            <span className="text-[11px] text-amber-300 font-medium">
              (Not in this frame)
            </span>
          )}

          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-700 pl-2">
            <button
              type="button"
              onClick={() => onOpenPersonDetails(focusedPersonId)}
              className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-2 py-1 rounded-md transition-colors shadow-xs"
            >
              <Info size={12} />
              <span>Details</span>
            </button>
            <button
              type="button"
              onClick={onClearFocus}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              title="Clear Focus"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── 3. DETECTED PERSONS BOUNDING BOXES & INTERACTIVE CALLOUTS ── */}
      {(showAnnotations || isFocusActive) &&
        currentDetections.map((det) => {
          const box = getScaledBox(det.bbox);
          if (!box) return null;

          const isThisFocused = det.person_id === focusedPersonId;
          if (!showAnnotations && !isThisFocused) return null;
        const color = getActionColor(det.action_label);
        const confPercent = Math.round(det.confidence * 100);

        return (
          <div
            key={`det-${det.person_id}-${det.frame_number}`}
            style={{
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
            className={`absolute pointer-events-auto rounded-lg transition-all duration-150 ${
              isThisFocused
                ? "ring-4 ring-[#0052ff] shadow-[0_0_24px_rgba(0,82,255,0.6)] z-30"
                : isFocusActive
                  ? "opacity-30 pointer-events-none border border-white/20"
                  : "border-2 border-dashed hover:border-solid hover:bg-blue-500/10 cursor-pointer group z-10"
            }`}
            onClick={() => {
              if (!isThisFocused) onFocusPerson(det.person_id);
            }}
          >
            {/* Header Tag / Actions on Bounding Box */}
            <div
              className={`absolute -top-7 left-0 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white whitespace-nowrap shadow-md transition-all ${
                isThisFocused
                  ? "bg-[#0052ff] scale-105"
                  : "bg-slate-900/85 hover:bg-slate-900 group-hover:scale-105"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span>P{det.person_id}: {det.action_label}</span>
              <span className="opacity-80 font-mono text-[10px]">({confPercent}%)</span>

              {/* Action buttons inside focused bounding box banner */}
              {isThisFocused ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPersonDetails(det.person_id);
                  }}
                  className="ml-1 text-white hover:text-blue-200 p-0.5"
                  title="View Person Metadata"
                >
                  <Info size={11} />
                </button>
              ) : (
                <span className="hidden group-hover:inline-flex items-center gap-0.5 ml-1 text-blue-300 text-[10px]">
                  <Eye size={10} /> Focus
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VideoFocusOverlay;
