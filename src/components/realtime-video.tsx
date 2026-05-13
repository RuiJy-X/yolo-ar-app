import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";

// ─── Types (kept identical so RealTime.tsx needs zero changes) ────────────────

export type Keypoint = { id: number; x: number; y: number; confidence: number };

export type PersonDetection = {
  person_id: number;
  action: { label: string; confidence: number };
  all_scores?: Record<string, number> | null;
  bbox: [number, number, number, number];
  keypoints: Keypoint[];
};

export type InferencePayload = {
  type: string;
  frame_index?: number;
  persons?: PersonDetection[];
  detection?: boolean;
  timing_ms?: number;
  message?: string;
  action?: { label?: string; confidence?: number };
  bbox?: [number, number, number, number] | null;
  keypoints?: Keypoint[];
};

type RealTimeVideoProps = {
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  onInference?: (payload: InferencePayload) => void;
  onConnectionStateChange?: (
    state: "disconnected" | "connecting" | "connected",
  ) => void;
  onCameraLabelChange?: (label: string) => void;
  onRecordingComplete?: (blob: Blob, mimeType: string) => void;
  onSourceRecordingComplete?: (blob: Blob, mimeType: string) => void;
};

// ─── Binary protocol parser ───────────────────────────────────────────────────
//
//  Backend sends: [4-byte big-endian uint32: JSON length][JSON bytes][JPEG bytes]
//
function parseAnnotatedFrame(buffer: ArrayBuffer): {
  payload: InferencePayload;
  jpegUrl: string;
} | null {
  if (buffer.byteLength < 4) return null;

  const view = new DataView(buffer);
  const jsonLen = view.getUint32(0, false); // big-endian
  if (buffer.byteLength < 4 + jsonLen) return null;

  const jsonBytes = new Uint8Array(buffer, 4, jsonLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);

  let payload: InferencePayload;
  try {
    payload = JSON.parse(jsonStr) as InferencePayload;
  } catch {
    return null;
  }

  const jpegBytes = new Uint8Array(buffer, 4 + jsonLen);
  const blob = new Blob([jpegBytes], { type: "image/jpeg" });
  const jpegUrl = URL.createObjectURL(blob);

  return { payload, jpegUrl };
}

// ─── Recording helpers ────────────────────────────────────────────────────────

function pickRecordingMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

// ─── Component ────────────────────────────────────────────────────────────────

const RealTimeVideo = ({
  isCameraActive,
  setIsCameraActive,
  onInference,
  onConnectionStateChange,
  onCameraLabelChange,
  onRecordingComplete,
  onSourceRecordingComplete,
}: RealTimeVideoProps) => {
  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // WebSocket + frame-send refs
  const wsRef = useRef<WebSocket | null>(null);
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendIntervalRef = useRef<number | null>(null);
  const sendingRef = useRef(false);

  // ── NEW: annotated frame display ──────────────────────────────────────────
  // Instead of an overlay canvas we just swap the src of an <img> element.
  // We keep the previous object URL so we can revoke it after the swap.
  const annotatedImgRef = useRef<HTMLImageElement>(null);
  const prevUrlRef = useRef<string | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>("");
  const sourceRecorderRef = useRef<MediaRecorder | null>(null);
  const sourceChunksRef = useRef<Blob[]>([]);
  const sourceMimeTypeRef = useRef<string>("");

  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isDeviceListLoading, setIsDeviceListLoading] = useState(false);
  const manualSelectionRef = useRef(false);

  const wsUrl =
    (import.meta.env.VITE_ACTION_WS_URL ??
      "ws://localhost:8000/ws/action-recognition") + "?quality=72";

  // ── helpers ───────────────────────────────────────────────────────────────

  const updateConnectionState = useCallback(
    (state: "disconnected" | "connecting" | "connected") => {
      setConnectionState(state);
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange],
  );

  const updateCameraLabel = useCallback(
    (label: string) => onCameraLabelChange?.(label),
    [onCameraLabelChange],
  );

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    updateConnectionState("disconnected");
  }, [updateConnectionState]);

  const stopFrameLoop = useCallback(() => {
    if (sendIntervalRef.current !== null) {
      window.clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    sendingRef.current = false;
  }, []);

  const clearAnnotatedFrame = useCallback(() => {
    if (annotatedImgRef.current) annotatedImgRef.current.src = "";
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback((stream: MediaStream) => {
    if (!window.MediaRecorder) return;
    if (mediaRecorderRef.current) return;
    const mimeType = pickRecordingMimeType();
    recordedChunksRef.current = [];
    recordingMimeTypeRef.current = mimeType;
    try {
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      /* silent fail */
    }
  }, []);

  const startSourceRecording = useCallback(
    (stream: MediaStream) => {
      if (!window.MediaRecorder) return;
      if (sourceRecorderRef.current) return;
      const mimeType = pickRecordingMimeType();
      sourceChunksRef.current = [];
      sourceMimeTypeRef.current = mimeType;
      try {
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        recorder.ondataavailable = (e) => {
          if (e.data?.size > 0) sourceChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const chunks = sourceChunksRef.current;
          if (chunks.length > 0) {
            const mime = sourceMimeTypeRef.current || "video/webm";
            onSourceRecordingComplete?.(new Blob(chunks, { type: mime }), mime);
          }
          sourceChunksRef.current = [];
          sourceRecorderRef.current = null;
        };
        recorder.start(1000);
        sourceRecorderRef.current = recorder;
      } catch {
        /* silent fail */
      }
    },
    [onSourceRecordingComplete],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      if (chunks.length > 0) {
        const mime = recordingMimeTypeRef.current || "video/webm";
        onRecordingComplete?.(new Blob(chunks, { type: mime }), mime);
      }
      recordedChunksRef.current = [];
      mediaRecorderRef.current = null;
      setIsRecording(false);
    };
    if (recorder.state !== "inactive") recorder.stop();
    recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordingStreamRef.current = null;
  }, [onRecordingComplete]);

  const stopSourceRecording = useCallback(() => {
    const recorder = sourceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  // ── Receive annotated frame ───────────────────────────────────────────────

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      // All responses from the new backend are binary (packed frame)
      if (event.data instanceof ArrayBuffer) {
        const parsed = parseAnnotatedFrame(event.data);
        if (!parsed) return;

        const { payload, jpegUrl } = parsed;

        const imgEl = annotatedImgRef.current;
        if (imgEl) {
          imgEl.onload = () => {
            const canvas =
              recordingCanvasRef.current ?? document.createElement("canvas");
            recordingCanvasRef.current = canvas;

            const width = imgEl.naturalWidth || imgEl.width;
            const height = imgEl.naturalHeight || imgEl.height;
            if (width && height) {
              if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
              }
              const ctx = canvas.getContext("2d", { alpha: false });
              if (ctx) ctx.drawImage(imgEl, 0, 0, width, height);

              if (!mediaRecorderRef.current && isCameraActive) {
                const stream = canvas.captureStream(15);
                recordingStreamRef.current = stream;
                startRecording(stream);
              }
            }
          };
          imgEl.src = jpegUrl;
        }
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = jpegUrl;

        onInference?.(payload);
        return;
      }

      // Fallback: plain JSON (e.g. pong, error)
      try {
        const payload = JSON.parse(
          typeof event.data === "string" ? event.data : "",
        ) as InferencePayload;
        onInference?.(payload);
      } catch {
        setError("Backend response could not be parsed.");
      }
    },
    [isCameraActive, onInference, startRecording],
  );

  // ── Camera stream ─────────────────────────────────────────────────────────

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) =>
        video.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        }),
      );
    }
    await video.play();
  }, []);

  const openCameraStream = useCallback(
    async (deviceId?: string): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      }),
    [],
  );

  const getPreferredCameraId = useCallback(
    (devices: MediaDeviceInfo[]): string | null => {
      const preferred = devices
        .filter((d) => d.kind === "videoinput")
        .find((d) => d.label.toLowerCase().includes("droidcam"));
      return preferred?.deviceId ?? null;
    },
    [],
  );

  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setIsDeviceListLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(videoDevices);
      setSelectedDeviceId((current) => {
        if (current && videoDevices.some((d) => d.deviceId === current)) {
          return current;
        }
        if (manualSelectionRef.current) {
          return videoDevices[0]?.deviceId ?? "";
        }
        const preferred = getPreferredCameraId(videoDevices);
        return preferred ?? videoDevices[0]?.deviceId ?? "";
      });
    } finally {
      setIsDeviceListLoading(false);
    }
  }, [getPreferredCameraId]);

  // ── Start / stop camera ───────────────────────────────────────────────────

  const startCamera = async (deviceIdOverride?: string) => {
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Browser does not support camera APIs.");
      const explicitDeviceId =
        (deviceIdOverride ?? selectedDeviceId) || undefined;
      let stream: MediaStream;
      try {
        stream = await openCameraStream(explicitDeviceId);
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (
          explicitDeviceId &&
          (name === "OverconstrainedError" || name === "NotFoundError")
        ) {
          setSelectedDeviceId("");
          manualSelectionRef.current = false;
          stream = await openCameraStream();
        } else {
          throw err;
        }
      }
      if (!explicitDeviceId && !manualSelectionRef.current) {
        const fallbackTrack = stream.getVideoTracks()[0];
        const devices = await navigator.mediaDevices.enumerateDevices();
        const preferredDeviceId = getPreferredCameraId(devices);
        const currentDeviceId = fallbackTrack?.getSettings().deviceId;
        if (preferredDeviceId && preferredDeviceId !== currentDeviceId) {
          stream.getTracks().forEach((t) => t.stop());
          stream = await openCameraStream(preferredDeviceId);
        }
      }
      const selectedTrack = stream.getVideoTracks()[0];
      updateCameraLabel(selectedTrack?.label || "Unknown camera");
      if (!selectedDeviceId) {
        setSelectedDeviceId(selectedTrack?.getSettings().deviceId ?? "");
      }
      streamRef.current = stream;
      await attachStreamToVideo(stream);
      if (videoRef.current && videoRef.current.videoWidth === 0) {
        throw new Error("Camera opened but no frames received.");
      }
      startSourceRecording(stream);
      setIsCameraActive(true);
      refreshCameraDevices().catch(() => undefined);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera permission and try again."
            : err.name === "NotFoundError"
              ? "No camera device found."
              : err.message
          : String(err);
      setError("Camera error: " + message);
    }
  };

  const stopCamera = () => {
    stopFrameLoop();
    clearAnnotatedFrame();
    closeSocket();
    stopRecording();
    stopSourceRecording();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    updateCameraLabel("No camera selected");
    setIsCameraActive(false);
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  // Re-attach stream if video element remounts
  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !streamRef.current) return;
    attachStreamToVideo(streamRef.current).catch((err) =>
      setError(
        "Playback failed: " +
          (err instanceof Error ? err.message : String(err)),
      ),
    );
  }, [attachStreamToVideo, isCameraActive]);

  useEffect(() => {
    refreshCameraDevices().catch(() => undefined);
    const handleDeviceChange = () => refreshCameraDevices();
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      handleDeviceChange,
    );
    return () =>
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
  }, [refreshCameraDevices]);

  // Handle camera track ending unexpectedly
  useEffect(() => {
    if (!isCameraActive || !streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) {
      setError("No video track found.");
      return;
    }
    const onEnded = () => {
      setError("Camera stream ended.");
      stopCamera();
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [isCameraActive]);

  // WebSocket lifecycle
  useEffect(() => {
    if (!isCameraActive) {
      closeSocket();
      return;
    }
    updateConnectionState("connecting");
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer"; // ← important: receive as ArrayBuffer
    ws.onopen = () => updateConnectionState("connected");
    ws.onmessage = handleWsMessage;
    ws.onerror = () => setError("WebSocket connection error.");
    ws.onclose = () => updateConnectionState("disconnected");
    wsRef.current = ws;
    return () => closeSocket();
  }, [
    closeSocket,
    handleWsMessage,
    isCameraActive,
    updateConnectionState,
    wsUrl,
  ]);

  // Frame-send loop — unchanged from original, still sends raw JPEG to backend
  useEffect(() => {
    if (!isCameraActive) {
      stopFrameLoop();
      return;
    }
    const sendFrame = () => {
      const ws = wsRef.current,
        video = videoRef.current;
      if (
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        !video ||
        video.videoWidth === 0
      )
        return;
      if (sendingRef.current || ws.bufferedAmount > 1_000_000) return;
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const width = Math.max(2, Math.floor(video.videoWidth * scale));
      const height = Math.max(2, Math.floor(video.videoHeight * scale));
      const canvas = sendCanvasRef.current ?? document.createElement("canvas");
      sendCanvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);
      sendingRef.current = true;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            sendingRef.current = false;
            return;
          }
          blob
            .arrayBuffer()
            .then((buffer) => {
              const socket = wsRef.current;
              if (socket?.readyState === WebSocket.OPEN) socket.send(buffer);
            })
            .catch(() => setError("Failed to encode frame."))
            .finally(() => {
              sendingRef.current = false;
            });
        },
        "image/jpeg",
        0.6,
      );
    };
    sendIntervalRef.current = window.setInterval(sendFrame, 100);
    return () => stopFrameLoop();
  }, [isCameraActive, stopFrameLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFrameLoop();
      clearAnnotatedFrame();
      closeSocket();
      stopRecording();
      stopSourceRecording();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [
    clearAnnotatedFrame,
    closeSocket,
    stopFrameLoop,
    stopRecording,
    stopSourceRecording,
  ]);

  // ── Connection dot colour ─────────────────────────────────────────────────

  const connDot =
    connectionState === "connected"
      ? "bg-[#0052ff]"
      : connectionState === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-[#9a9a9a]";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-[#1c1c1c] relative">
      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isCameraActive && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-[12px] bg-[#202020] border border-[#dfdfdf]/10 flex items-center justify-center">
            <Camera size={22} className="text-[#9a9a9a]" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-medium text-[#ffffff]">
              No camera feed
            </p>
            <p className="text-[12px] text-[#9a9a9a] mt-0.5">
              Start camera to begin inference
            </p>
          </div>
          <button
            type="button"
            onClick={() => startCamera(selectedDeviceId || undefined)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] text-[13px] font-medium bg-[#0052ff] text-[#ffffff] hover:bg-[#0041cc] transition-colors"
          >
            <Camera size={14} />
            Open Camera
          </button>
          <div className="flex flex-col items-center gap-2">
            <div className="text-[11px] text-[#9a9a9a]">Select camera</div>
            <div className="flex items-center gap-2">
              <select
                value={selectedDeviceId}
                onChange={(event) => {
                  manualSelectionRef.current = true;
                  setSelectedDeviceId(event.target.value);
                }}
                className="bg-[#202020] text-[#ffffff] text-[12px] border border-white/10 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#0052ff] min-w-[220px]"
              >
                {cameraDevices.length === 0 && (
                  <option value="">No cameras found</option>
                )}
                {cameraDevices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={refreshCameraDevices}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[12px] text-white/80 hover:text-white hover:border-white/20"
                title="Refresh camera list"
              >
                <RefreshCw
                  size={12}
                  className={isDeviceListLoading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        ── NEW display layer ────────────────────────────────────────────────
        The raw camera feed sits beneath, hidden.
        On top we display the annotated JPEG returned by the backend.
        Both are positioned absolute/fill so they stack correctly.
      */}

      {/* Raw camera feed (hidden — still needed to capture frames to send) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
      />

      {/* Annotated frame from backend — shown when camera is active */}
      <img
        ref={annotatedImgRef}
        alt="Annotated inference"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
          isCameraActive ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Placeholder shown while waiting for first annotated frame */}
      {isCameraActive && (
        <div
          className="absolute inset-0 flex items-center justify-center text-xs text-white/30 pointer-events-none z-0"
          style={{ display: "none" }} // hidden once img loads; keep for reference
        />
      )}

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      {isCameraActive && (
        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-[#1c1c1c]/80 px-3 py-1 backdrop-blur-sm border border-white/10">
              <span className={`h-1.5 w-1.5 rounded-full ${connDot}`} />
              <span className="text-[11px] font-medium text-[#ffffff]">
                {connectionState === "connected"
                  ? "Live"
                  : connectionState === "connecting"
                    ? "Connecting…"
                    : "Offline"}
              </span>
            </div>
            {isRecording && (
              <div className="flex items-center gap-1.5 rounded-full bg-[#1c1c1c]/80 px-3 py-1 backdrop-blur-sm border border-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-medium text-[#ffffff]">
                  REC
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-[8px] bg-[#1c1c1c]/80 px-2 py-1 backdrop-blur-sm border border-white/10">
            <select
              value={selectedDeviceId}
              onChange={(event) => {
                const nextId = event.target.value;
                manualSelectionRef.current = true;
                setSelectedDeviceId(nextId);
                if (isCameraActive) {
                  stopCamera();
                  startCamera(nextId);
                }
              }}
              className="bg-transparent text-[#ffffff] text-[11px] outline-none min-w-[180px]"
            >
              {cameraDevices.length === 0 && (
                <option value="">No cameras found</option>
              )}
              {cameraDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refreshCameraDevices}
              className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white"
              title="Refresh camera list"
            >
              <RefreshCw
                size={11}
                className={isDeviceListLoading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Stop button ───────────────────────────────────────────────────── */}
      {isCameraActive && (
        <div className="absolute top-3 right-3 z-20">
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium bg-[#1c1c1c]/80 text-[#ffffff] border border-white/10 hover:bg-[#1c1c1c] backdrop-blur-sm transition-colors"
          >
            <CameraOff size={13} />
            Stop
          </button>
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-[8px] bg-red-900/90 border border-red-700/50 px-3 py-2 text-[12px] text-red-200 backdrop-blur-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default RealTimeVideo;
