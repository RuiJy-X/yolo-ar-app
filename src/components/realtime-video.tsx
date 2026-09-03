import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";


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
  frameBlob?: Blob;
};

type RuntimeConfig = {
  realtime_disable_downscale?: boolean;
};

export type RealTimeVideoRef = {
  startCamera: (deviceIdOverride?: string) => Promise<void>;
  stopCamera: () => void;
  refreshCameraDevices: () => Promise<void>;
};

export type RealTimeVideoProps = {
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  onInference?: (payload: InferencePayload) => void;
  onConnectionStateChange?: (
    state: "disconnected" | "connecting" | "connected",
  ) => void;
  onCameraLabelChange?: (label: string) => void;
  onRecordingComplete?: (blob: Blob, mimeType: string) => void;
  onSourceRecordingComplete?: (blob: Blob, mimeType: string) => void;
  onDevicesChange?: (devices: MediaDeviceInfo[]) => void;
  onSelectedDeviceIdChange?: (deviceId: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
};


function parseAnnotatedFrame(buffer: ArrayBuffer): {
  payload: InferencePayload;
  jpegUrl: string;
  blob: Blob;
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

  return { payload, jpegUrl, blob };
}

// Recording helpers 

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


const RealTimeVideo = forwardRef<RealTimeVideoRef, RealTimeVideoProps>(({
  isCameraActive,
  setIsCameraActive,
  onInference,
  onConnectionStateChange,
  onCameraLabelChange,
  onRecordingComplete,
  onSourceRecordingComplete,
  onDevicesChange,
  onSelectedDeviceIdChange,
  onRecordingStateChange,
}: RealTimeVideoProps, ref) => {
  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // WebSocket + frame-send refs
  const wsRef = useRef<WebSocket | null>(null);
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendIntervalRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  // Keep only the newest frame: do not enqueue work while the backend is inferring.
  const inferenceInFlightRef = useRef(false);

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
    inferenceInFlightRef.current = false;
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
    inferenceInFlightRef.current = false;
  }, []);

  const clearAnnotatedFrame = useCallback(() => {
    if (annotatedImgRef.current) annotatedImgRef.current.src = "";
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
  }, []);

  const buildVideoConstraints = useCallback(
    (deviceId?: string): MediaTrackConstraints | boolean => {
      const constraints: MediaTrackConstraints = {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 15, max: 30 },
      };
      if (deviceId) constraints.deviceId = { exact: deviceId };
      return constraints;
    },
    [],
  );
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

 

  const handleWsMessage = useCallback(
    async (event: MessageEvent) => {
      // The server processes WebSocket frames serially. Releasing this only on a
      // response prevents client-side buffering and keeps the displayed result fresh.
      inferenceInFlightRef.current = false;
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
                try {
                  const stream = canvas.captureStream(15);
                  recordingStreamRef.current = stream;
                  startRecording(stream);
                } catch {
                  // Recording is optional; ignore captureStream failures.
                }
              }
            }
          };
          imgEl.src = jpegUrl;
        }
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = jpegUrl;

        onInference?.({ ...payload, frameBlob: parsed.blob });
        return;
      }

      if (event.data instanceof Blob) {
        try {
          const buffer = await event.data.arrayBuffer();
          const parsed = parseAnnotatedFrame(buffer);
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
                  try {
                    const stream = canvas.captureStream(15);
                    recordingStreamRef.current = stream;
                    startRecording(stream);
                  } catch {
                    // Recording is optional; ignore captureStream failures.
                  }
                }
              }
            };
            imgEl.src = jpegUrl;
          }
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
          prevUrlRef.current = jpegUrl;

          onInference?.(payload);
          return;
        } catch {
          setError("Failed to decode binary frame.");
          return;
        }
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
    async (deviceId?: string): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: buildVideoConstraints(deviceId),
          audio: false,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "OverconstrainedError") {
          return navigator.mediaDevices.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: false,
          });
        }
        throw err;
      }
    },
    [buildVideoConstraints],
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

  useImperativeHandle(
    ref,
    () => ({
      startCamera,
      stopCamera,
      refreshCameraDevices,
    }),
    [refreshCameraDevices],
  );

  useEffect(() => {
    onDevicesChange?.(cameraDevices);
  }, [cameraDevices, onDevicesChange]);

  useEffect(() => {
    onSelectedDeviceIdChange?.(selectedDeviceId);
  }, [selectedDeviceId, onSelectedDeviceIdChange]);

  useEffect(() => {
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

 

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
    ws.binaryType = "arraybuffer"; // important: receive as ArrayBuffer
    ws.onopen = () => updateConnectionState("connected");
    ws.onmessage = handleWsMessage;
    ws.onerror = () => {
      inferenceInFlightRef.current = false;
      setError("WebSocket connection error.");
    };
    ws.onclose = () => {
      inferenceInFlightRef.current = false;
      updateConnectionState("disconnected");
    };
    wsRef.current = ws;
    return () => closeSocket();
  }, [
    closeSocket,
    handleWsMessage,
    isCameraActive,
    updateConnectionState,
    wsUrl,
  ]);

  // Frame-send loop  unchanged from original, still sends raw JPEG to backend
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
      if (
        sendingRef.current ||
        inferenceInFlightRef.current ||
        ws.bufferedAmount > 1_000_000
      )
        return;
      const scale = 1;
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
              if (socket?.readyState !== WebSocket.OPEN) return;
              try {
                inferenceInFlightRef.current = true;
                socket.send(buffer);
              } catch {
                inferenceInFlightRef.current = false;
                throw new Error("Failed to send frame.");
              }
            })
            .catch(() => setError("Failed to encode frame."))
            .finally(() => {
              sendingRef.current = false;
            });
        },
        "image/jpeg",
        0.92,
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


  const connDot =
    connectionState === "connected"
      ? "bg-[#0052ff]"
      : connectionState === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-[#9a9a9a]";



  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-[#101215] relative">
      {!isCameraActive && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 bg-[#101215]">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-xl">
            <Camera size={28} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white">
              Camera Feed Inactive
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Select camera device to begin real-time action recognition
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div className="flex items-center gap-2 w-full">
              <select
                value={selectedDeviceId}
                onChange={(event) => {
                  manualSelectionRef.current = true;
                  setSelectedDeviceId(event.target.value);
                }}
                className="flex-1 bg-white/10 text-white text-xs border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
              >
                {cameraDevices.length === 0 && (
                  <option value="" className="bg-slate-900 text-white">
                    No cameras found
                  </option>
                )}
                {cameraDevices.map((device, index) => (
                  <option
                    key={device.deviceId}
                    value={device.deviceId}
                    className="bg-slate-900 text-white"
                  >
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={refreshCameraDevices}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh camera list"
              >
                <RefreshCw
                  size={14}
                  className={isDeviceListLoading ? "animate-spin" : ""}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={() => startCamera(selectedDeviceId || undefined)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0052ff] hover:bg-[#0041cc] text-white transition-all shadow-lg shadow-blue-500/25 whitespace-nowrap cursor-pointer"
            >
              <Camera size={14} />
              Open Camera
            </button>
          </div>
        </div>
      )}

      {/* Raw camera feed (hidden, used to capture frames to send) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
      />

      {/* Annotated frame from backend shown when camera is active */}
      <img
        ref={annotatedImgRef}
        alt="Annotated inference"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
          isCameraActive ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Subtle Active Controls (Top Right Corner) */}
      {isCameraActive && (
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 border border-red-500/40 animate-pulse backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-[10px] font-bold text-red-400">REC</span>
            </div>
          )}
          <button
            type="button"
            onClick={stopCamera}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/80 hover:bg-red-600 text-white border border-red-500/40 backdrop-blur-md shadow-lg transition-all cursor-pointer"
          >
            <Camera size={13} />
            Stop Camera
          </button>
        </div>
      )}

      {/* Placeholder shown while waiting for first annotated frame */}
      {isCameraActive && (
        <div
          className="absolute inset-0 flex items-center justify-center text-xs text-white/30 pointer-events-none z-0"
          style={{ display: "none" }}
        />
      )}

      {error && (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl bg-red-950/90 border border-red-700/50 px-3.5 py-2.5 text-xs text-red-200 backdrop-blur-md shadow-xl flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300 hover:text-white font-bold ml-2 text-sm"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
});

RealTimeVideo.displayName = "RealTimeVideo";

export default RealTimeVideo;
