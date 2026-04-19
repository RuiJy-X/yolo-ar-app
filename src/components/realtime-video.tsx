import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

export type InferencePayload = {
  type: string;
  frame_index?: number;
  detection?: boolean;
  timing_ms?: number;
  message?: string;
  action?: {
    label?: string;
    confidence?: number;
  };
};

type RealTimeVideoProps = {
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  onInference?: (payload: InferencePayload) => void;
};

const RealTimeVideo = ({
  isCameraActive,
  setIsCameraActive,
  onInference,
}: RealTimeVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sendIntervalRef = useRef<number | null>(null);
  const sendingRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("No camera selected");
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  const wsUrl =
    import.meta.env.VITE_ACTION_WS_URL ??
    "ws://localhost:8000/ws/action-recognition";

  const attachStreamToVideo = useCallback(async (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => {
        const onLoadedMetadata = () => resolve();
        video.addEventListener("loadedmetadata", onLoadedMetadata, {
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
    setConnectionState("disconnected");
  }, []);

  const openCameraStream = useCallback(
    async (deviceId?: string): Promise<MediaStream> => {
      return navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
            }
          : true,
        audio: false,
      });
    },
    [],
  );

  const pickPreferredCameraId = useCallback(async (): Promise<
    string | null
  > => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(
      (device) => device.kind === "videoinput",
    );

    const preferred = videoInputs.find((device) =>
      device.label.toLowerCase().includes("droidcam"),
    );

    return preferred?.deviceId ?? null;
  }, []);

  const startCamera = async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support camera capture APIs.");
      }

      // First open any camera to unlock device labels on browsers that hide them.
      let stream = await openCameraStream();
      const fallbackTrack = stream.getVideoTracks()[0];

      const preferredDeviceId = await pickPreferredCameraId();
      const currentDeviceId = fallbackTrack?.getSettings().deviceId;

      if (preferredDeviceId && preferredDeviceId !== currentDeviceId) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await openCameraStream(preferredDeviceId);
      }

      const selectedTrack = stream.getVideoTracks()[0];
      setCameraLabel(selectedTrack?.label || "Unknown camera");

      streamRef.current = stream;
      await attachStreamToVideo(stream);

      // If the stream starts but no dimensions are produced, surface a direct hint.
      const preview = videoRef.current;
      if (preview && preview.videoWidth === 0 && preview.videoHeight === 0) {
        throw new Error(
          "Camera opened but no frames were received. If using DroidCam, ensure no other app is locking the stream and restart the DroidCam client.",
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
    closeSocket();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraLabel("No camera selected");

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
    if (!isCameraActive || !streamRef.current) {
      return;
    }

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) {
      setError("No video track was found on the camera stream.");
      return;
    }

    const onEnded = () => {
      setError("Camera stream ended unexpectedly.");
      stopCamera();
    };

    track.addEventListener("ended", onEnded);

    return () => {
      track.removeEventListener("ended", onEnded);
    };
  }, [isCameraActive]);

  useEffect(() => {
    if (!isCameraActive) {
      closeSocket();
      return;
    }

    setConnectionState("connecting");
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnectionState("connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as InferencePayload;
        onInference?.(payload);
      } catch {
        setError("Backend response could not be parsed.");
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error.");
    };

    ws.onclose = () => {
      setConnectionState("disconnected");
    };

    wsRef.current = ws;

    return () => {
      closeSocket();
    };
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
      ) {
        return;
      }

      if (sendingRef.current || ws.bufferedAmount > 1_000_000) {
        return;
      }

      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const width = Math.max(2, Math.floor(video.videoWidth * scale));
      const height = Math.max(2, Math.floor(video.videoHeight * scale));

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        return;
      }

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
            .catch(() => {
              setError("Failed to encode frame before sending.");
            })
            .finally(() => {
              sendingRef.current = false;
            });
        },
        "image/jpeg",
        0.72,
      );
    };

    sendIntervalRef.current = window.setInterval(sendFrame, 150);

    return () => {
      stopFrameLoop();
    };
  }, [isCameraActive, stopFrameLoop]);

  useEffect(() => {
    return () => {
      stopFrameLoop();
      closeSocket();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [closeSocket, stopFrameLoop]);

  const connectionColor =
    connectionState === "connected"
      ? "bg-emerald-500"
      : connectionState === "connecting"
        ? "bg-amber-500"
        : "bg-zinc-500";

  return (
    <div className="content-stretch flex flex-col h-full w-full items-stretch justify-center rounded-lg relative">
      <div className="relative w-full h-full rounded-lg bg-black overflow-hidden">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">
          <span className={`h-2.5 w-2.5 rounded-full ${connectionColor}`} />
          Socket: {connectionState}
        </div>
        <div className="absolute left-4 top-14 z-10 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white max-w-[70%] truncate">
          Camera: {cameraLabel}
        </div>

        {/* Button overlay */}
        {!isCameraActive && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <Button onClick={startCamera}>
              {" "}
              <Camera /> Open Camera
            </Button>
          </div>
        )}
        {/* Video element */}
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
        {isCameraActive && (
          <div className="absolute top-4 right-4">
            <Button
              variant="destructive"
              className="bg-red-500 hover:bg-red-600 text-white font-heading font-semibold"
              onClick={stopCamera}
            >
              {" "}
              <Camera /> Stop Camera
            </Button>
          </div>
        )}

        {error && (
          <div className="absolute bottom-4 left-4 right-4 rounded-md bg-red-500/80 px-3 py-2 text-sm text-white">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default RealTimeVideo;
