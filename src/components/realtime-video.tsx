import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

// Body12 bone connections (matching backend BODY12_BONES)
const BODY12_BONES: [number, number][] = [
  [0, 1],
  [0, 2],
  [2, 4],
  [1, 3],
  [3, 5],
  [0, 6],
  [1, 7],
  [6, 7],
  [6, 8],
  [8, 10],
  [7, 9],
  [9, 11],
];

const VISIBILITY_THRESH = 0.2;

// Deterministic per-track colour — matches backend track_color()
function trackColor(trackId: number): string {
  const r = ((37 * trackId) % 200) + 30;
  const g = ((17 * trackId) % 200) + 30;
  const b = ((29 * trackId) % 200) + 30;
  return `rgb(${r},${g},${b})`;
}

export type Keypoint = {
  id: number;
  x: number;
  y: number;
  confidence: number;
};

export type PersonDetection = {
  person_id: number;
  action: { label: string; confidence: number };
  bbox: [number, number, number, number];
  keypoints: Keypoint[];
};

export type InferencePayload = {
  type: string;
  frame_index?: number;
  /** Multi-person detections (new field from updated backend) */
  persons?: PersonDetection[];
  /** Legacy single-person fields — kept for backwards compatibility */
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
};

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function buildCoordMapper(
  video: HTMLVideoElement,
  displayW: number,
  displayH: number,
) {
  const srcW = Math.min(640, video.videoWidth);
  const srcH = video.videoHeight * (srcW / video.videoWidth);

  const videoAspect = srcW / srcH;
  const displayAspect = displayW / displayH;

  let renderW: number, renderH: number, offsetX: number, offsetY: number;
  if (videoAspect > displayAspect) {
    renderH = displayH;
    renderW = displayH * videoAspect;
    offsetX = (displayW - renderW) / 2;
    offsetY = 0;
  } else {
    renderW = displayW;
    renderH = displayW / videoAspect;
    offsetX = 0;
    offsetY = (displayH - renderH) / 2;
  }

  const scaleX = renderW / srcW;
  const scaleY = renderH / srcH;

  return (x: number, y: number): [number, number] => [
    offsetX + x * scaleX,
    offsetY + y * scaleY,
  ];
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  person: PersonDetection,
  toDisplay: (x: number, y: number) => [number, number],
) {
  const color = trackColor(person.person_id);
  const label = person.action?.label ?? "Unknown";
  const confidence = person.action?.confidence ?? 0;
  const isKnown = label !== "Unknown" && label !== "No person detected";

  const [bx1, by1, bx2, by2] = person.bbox;
  const [dx1, dy1] = toDisplay(bx1, by1);
  const [dx2, dy2] = toDisplay(bx2, by2);

  // Bounding box
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeRect(dx1, dy1, dx2 - dx1, dy2 - dy1);
  ctx.shadowBlur = 0;

  // Label pill
  const pillText = isKnown
    ? `ID ${person.person_id} · ${label}  ${(confidence * 100).toFixed(1)}%`
    : `ID ${person.person_id} · ${label}`;
  ctx.font = "bold 12px 'ui-monospace', monospace";
  const textW = ctx.measureText(pillText).width;
  const pillPad = 6;
  const pillH = 22;
  const pillY = Math.max(0, dy1 - pillH - 4);

  // Pill background uses the track colour at reduced opacity
  ctx.fillStyle = color.replace("rgb(", "rgba(").replace(")", ",0.82)");
  ctx.beginPath();
  ctx.roundRect(dx1, pillY, textW + pillPad * 2, pillH, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(pillText, dx1 + pillPad, pillY + 15);

  // Skeleton — bones
  const kpts = person.keypoints ?? [];
  ctx.lineWidth = 2;
  for (const [src, dst] of BODY12_BONES) {
    const a = kpts[src];
    const b = kpts[dst];
    if (!a || !b) continue;
    if (a.confidence < VISIBILITY_THRESH || b.confidence < VISIBILITY_THRESH)
      continue;
    const [ax, ay] = toDisplay(a.x, a.y);
    const [bx, by] = toDisplay(b.x, b.y);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(250,204,21,0.85)";
    ctx.shadowColor = "rgba(250,204,21,0.45)";
    ctx.shadowBlur = 4;
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Skeleton — joints
  for (const kpt of kpts) {
    if (kpt.confidence < VISIBILITY_THRESH) continue;
    const [kx, ky] = toDisplay(kpt.x, kpt.y);
    ctx.beginPath();
    ctx.arc(kx, ky, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250,204,21,1)";
    ctx.shadowColor = "rgba(250,204,21,0.6)";
    ctx.shadowBlur = 6;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawOverlay(
  overlayCanvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  payload: InferencePayload,
) {
  const ctx = overlayCanvas.getContext("2d");
  if (!ctx) return;

  const displayW = video.clientWidth;
  const displayH = video.clientHeight;
  if (overlayCanvas.width !== displayW || overlayCanvas.height !== displayH) {
    overlayCanvas.width = displayW;
    overlayCanvas.height = displayH;
  }

  ctx.clearRect(0, 0, displayW, displayH);

  const toDisplay = buildCoordMapper(video, displayW, displayH);

  // ── Multi-person path (new backend) ──────────────────────────────────────
  if (payload.persons && payload.persons.length > 0) {
    for (const person of payload.persons) {
      drawPerson(ctx, person, toDisplay);
    }
    return;
  }

  // ── Legacy single-person fallback ────────────────────────────────────────
  if (!payload.detection || !payload.bbox) return;

  const syntheticPerson: PersonDetection = {
    person_id: 1,
    action: {
      label: payload.action?.label ?? "Unknown",
      confidence: payload.action?.confidence ?? 0,
    },
    bbox: payload.bbox,
    keypoints: payload.keypoints ?? [],
  };
  drawPerson(ctx, syntheticPerson, toDisplay);
}

// ─── Component ────────────────────────────────────────────────────────────────

const RealTimeVideo = ({
  isCameraActive,
  setIsCameraActive,
  onInference,
  onConnectionStateChange,
  onCameraLabelChange,
}: RealTimeVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendIntervalRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const latestPayloadRef = useRef<InferencePayload | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("No camera selected");
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  const wsUrl =
    import.meta.env.VITE_ACTION_WS_URL ??
    "ws://localhost:8000/ws/action-recognition";

  // Helper to update connection state and notify parent
  const updateConnectionState = useCallback(
    (state: "disconnected" | "connecting" | "connected") => {
      setConnectionState(state);
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange],
  );

  // Helper to update camera label and notify parent
  const updateCameraLabel = useCallback(
    (label: string) => {
      setCameraLabel(label);
      onCameraLabelChange?.(label);
    },
    [onCameraLabelChange],
  );

  const startOverlayLoop = useCallback(() => {
    const loop = () => {
      const video = videoRef.current;
      const canvas = overlayRef.current;
      const payload = latestPayloadRef.current;
      if (video && canvas && payload) {
        drawOverlay(canvas, video, payload);
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  const stopOverlayLoop = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const canvas = overlayRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        video.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        });
      });
    }
    await video.play();
  }, []);

  const stopFrameLoop = useCallback(() => {
    if (sendIntervalRef.current !== null) {
      window.clearInterval(sendIntervalRef.current);
      sendIntervalRef.current = null;
    }
    sendingRef.current = false;
  }, []);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    updateConnectionState("disconnected");
  }, [updateConnectionState]);

  const openCameraStream = useCallback(
    async (deviceId?: string): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      }),
    [],
  );

  const pickPreferredCameraId = useCallback(async (): Promise<
    string | null
  > => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    const preferred = videoInputs.find((d) =>
      d.label.toLowerCase().includes("droidcam"),
    );
    return preferred?.deviceId ?? null;
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support camera capture APIs.");
      }

      let stream = await openCameraStream();
      const fallbackTrack = stream.getVideoTracks()[0];
      const preferredDeviceId = await pickPreferredCameraId();
      const currentDeviceId = fallbackTrack?.getSettings().deviceId;

      if (preferredDeviceId && preferredDeviceId !== currentDeviceId) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await openCameraStream(preferredDeviceId);
      }

      const selectedTrack = stream.getVideoTracks()[0];
      updateCameraLabel(selectedTrack?.label || "Unknown camera");
      streamRef.current = stream;
      await attachStreamToVideo(stream);

      const preview = videoRef.current;
      if (preview && preview.videoWidth === 0 && preview.videoHeight === 0) {
        throw new Error(
          "Camera opened but no frames were received. If using DroidCam, ensure no other app is locking the stream.",
        );
      }

      setIsCameraActive(true);
    } catch (err) {
      setError(
        "Error accessing camera: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const stopCamera = () => {
    stopFrameLoop();
    stopOverlayLoop();
    closeSocket();
    latestPayloadRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    updateCameraLabel("No camera selected");
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !streamRef.current) return;
    attachStreamToVideo(streamRef.current).catch((err) => {
      setError(
        "Camera stream started but playback failed: " +
          (err instanceof Error ? err.message : String(err)),
      );
    });
  }, [attachStreamToVideo, isCameraActive]);

  useEffect(() => {
    if (!isCameraActive || !streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) {
      setError("No video track found on camera stream.");
      return;
    }
    const onEnded = () => {
      setError("Camera stream ended unexpectedly.");
      stopCamera();
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [isCameraActive]);

  useEffect(() => {
    if (!isCameraActive) {
      closeSocket();
      return;
    }

    updateConnectionState("connecting");
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => updateConnectionState("connected");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as InferencePayload;
        latestPayloadRef.current = payload;
        onInference?.(payload);
      } catch {
        setError("Backend response could not be parsed.");
      }
    };

    ws.onerror = () => setError("WebSocket connection error.");
    ws.onclose = () => updateConnectionState("disconnected");

    wsRef.current = ws;
    return () => closeSocket();
  }, [closeSocket, isCameraActive, onInference, wsUrl]);

  useEffect(() => {
    if (!isCameraActive) {
      stopFrameLoop();
      return;
    }

    const sendFrame = () => {
      const ws = wsRef.current;
      const video = videoRef.current;
      if (
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        !video ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
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
              if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(buffer);
              }
            })
            .catch(() => setError("Failed to encode frame before sending."))
            .finally(() => {
              sendingRef.current = false;
            });
        },
        "image/jpeg",
        0.72,
      );
    };

    sendIntervalRef.current = window.setInterval(sendFrame, 150);
    return () => stopFrameLoop();
  }, [isCameraActive, stopFrameLoop]);

  useEffect(() => {
    if (isCameraActive) {
      startOverlayLoop();
    } else {
      stopOverlayLoop();
    }
    return () => stopOverlayLoop();
  }, [isCameraActive, startOverlayLoop, stopOverlayLoop]);

  useEffect(() => {
    return () => {
      stopFrameLoop();
      stopOverlayLoop();
      closeSocket();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [closeSocket, stopFrameLoop, stopOverlayLoop]);

  

  return (
    <div className="content-stretch flex flex-col h-full w-full items-stretch justify-center rounded-lg relative">
      <div className="relative w-full h-full rounded-lg bg-black overflow-hidden">
        {/* Start camera overlay */}
        {!isCameraActive && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <Button onClick={startCamera}>
              <Camera /> Open Camera
            </Button>
          </div>
        )}

        {/* Live video */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity ${
            isCameraActive
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
        />

        {/* Inference overlay canvas */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Stop button */}
        {isCameraActive && (
          <div className="absolute top-4 right-4 z-20">
            <Button
              variant="destructive"
              className="bg-red-500 hover:bg-red-600 text-white font-heading font-semibold"
              onClick={stopCamera}
            >
              <Camera /> Stop Camera
            </Button>
          </div>
        )}

        {error && (
          <div className="absolute bottom-4 left-4 right-4 z-20 rounded-md bg-red-500/80 px-3 py-2 text-sm text-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default RealTimeVideo;