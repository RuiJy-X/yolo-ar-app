import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Battery,
  BatteryCharging,
  BatteryWarning,
  Compass,
  Gauge,
  Info,
  Plane,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Signal,
  Thermometer,
  Wifi,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { InferencePayload } from "@/components/realtime-video";

export type TelloTelemetry = {
  connected: boolean;
  is_flying: boolean;
  battery: number;
  flight_time: number;
  height: number;
  temperature: number;
  pitch: number;
  roll: number;
  yaw: number;
  wifi_snr: number;
  last_error?: string;
};

type TelloDronePanelProps = {
  onInference?: (payload: InferencePayload) => void;
  onFlightFinished?: (annotatedBlob: Blob, sourceBlob: Blob | null) => void;
  onFlightStarted?: () => void;
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

function parseAnnotatedFrame(buffer: ArrayBuffer): {
  payload: InferencePayload & { tello_telemetry?: TelloTelemetry };
  jpegUrl: string;
  blob: Blob;
  rawBlob?: Blob;
} | null {
  if (buffer.byteLength < 4) return null;

  const view = new DataView(buffer);
  const jsonLen = view.getUint32(0, false);
  if (buffer.byteLength < 4 + jsonLen) return null;

  const jsonBytes = new Uint8Array(buffer, 4, jsonLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);

  let payload: InferencePayload & { tello_telemetry?: TelloTelemetry };
  try {
    payload = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const afterJson = 4 + jsonLen;
  const remaining = buffer.byteLength - afterJson;

  // Dual-frame format: [4-byte rawLen][rawJPEG][annotatedJPEG]
  // Single-frame format (webcam): all remaining bytes are the annotated JPEG
  if (remaining > 8) {
    const maybeRawLen = view.getUint32(afterJson, false);
    // Sanity check: rawLen must be reasonable (< remaining - 4, and > 100 bytes for a JPEG)
    if (maybeRawLen > 100 && maybeRawLen < remaining - 4) {
      const rawStart = afterJson + 4;
      const rawBytes = new Uint8Array(buffer, rawStart, maybeRawLen);
      const annotatedStart = rawStart + maybeRawLen;
      const annotatedBytes = new Uint8Array(buffer, annotatedStart);

      // Verify both start with JPEG SOI marker (0xFF 0xD8)
      if (
        rawBytes.length >= 2 && rawBytes[0] === 0xff && rawBytes[1] === 0xd8 &&
        annotatedBytes.length >= 2 && annotatedBytes[0] === 0xff && annotatedBytes[1] === 0xd8
      ) {
        const rawBlob = new Blob([rawBytes], { type: "image/jpeg" });
        const annotatedBlob = new Blob([annotatedBytes], { type: "image/jpeg" });
        const jpegUrl = URL.createObjectURL(annotatedBlob);
        return { payload, jpegUrl, blob: annotatedBlob, rawBlob };
      }
    }
  }

  // Fallback: single-frame format (webcam stream)
  const jpegBytes = new Uint8Array(buffer, afterJson);
  const blob = new Blob([jpegBytes], { type: "image/jpeg" });
  const jpegUrl = URL.createObjectURL(blob);

  return { payload, jpegUrl, blob };
}

export default function TelloDronePanel({
  onInference,
  onFlightFinished,
  onFlightStarted,
  apiBaseUrl = import.meta.env.VITE_ACTION_API_BASE_URL ?? "http://localhost:8000",
  wsBaseUrl = import.meta.env.VITE_ACTION_WS_URL
    ? import.meta.env.VITE_ACTION_WS_URL.replace("/ws/action-recognition", "")
    : "ws://localhost:8000",
}: TelloDronePanelProps) {
  // Telemetry & Connection State
  const [telemetry, setTelemetry] = useState<TelloTelemetry>({
    connected: false,
    is_flying: false,
    battery: 0,
    flight_time: 0,
    height: 0,
    temperature: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    wifi_snr: 0,
  });

  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  // Video & WebSocket Refs
  const streamWsRef = useRef<WebSocket | null>(null);
  const controlWsRef = useRef<WebSocket | null>(null);
  const annotatedImgRef = useRef<HTMLImageElement | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  // Flight Video Recording Refs
  const telloRecorderRef = useRef<MediaRecorder | null>(null);
  const telloChunksRef = useRef<Blob[]>([]);
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const telloSourceRecorderRef = useRef<MediaRecorder | null>(null);
  const telloSourceChunksRef = useRef<Blob[]>([]);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isRecordingRef = useRef(false);
  const wasFlyingRef = useRef(false);
  const lastTelemetryUpdateRef = useRef<number>(0);

  const startTelloRecording = useCallback(() => {
    if (isRecordingRef.current) return;
    telloChunksRef.current = [];
    telloSourceChunksRef.current = [];
    if (!recordCanvasRef.current) {
      recordCanvasRef.current = document.createElement("canvas");
    }
    if (!sourceCanvasRef.current) {
      sourceCanvasRef.current = document.createElement("canvas");
    }
    const canvas = recordCanvasRef.current;
    canvas.width = 640;
    canvas.height = 480;

    const sourceCanvas = sourceCanvasRef.current;
    sourceCanvas.width = 640;
    sourceCanvas.height = 480;

    try {
      const mimeType = pickRecordingMimeType();
      const stream = canvas.captureStream(15);
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) telloChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      telloRecorderRef.current = recorder;

      const sourceStream = sourceCanvas.captureStream(15);
      const sourceRecorder = new MediaRecorder(
        sourceStream,
        mimeType ? { mimeType } : undefined,
      );
      sourceRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) telloSourceChunksRef.current.push(e.data);
      };
      sourceRecorder.start(1000);
      telloSourceRecorderRef.current = sourceRecorder;

      isRecordingRef.current = true;
    } catch {
      // recording optional
    }
  }, []);

  const stopTelloRecording = useCallback(async (): Promise<{
    annotated: Blob;
    source: Blob | null;
  } | null> => {
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;

    const stopRec = (
      rec: MediaRecorder | null,
      chunks: Blob[],
    ): Promise<Blob | null> => {
      if (!rec) return Promise.resolve(null);
      return new Promise((resolve) => {
        rec.onstop = () => {
          const mimeType = rec.mimeType || "video/webm";
          const videoBlob = new Blob(chunks, { type: mimeType });
          resolve(videoBlob);
        };
        rec.stop();
      });
    };

    const [annotatedBlob, sourceBlob] = await Promise.all([
      stopRec(telloRecorderRef.current, telloChunksRef.current),
      stopRec(telloSourceRecorderRef.current, telloSourceChunksRef.current),
    ]);

    telloChunksRef.current = [];
    telloSourceChunksRef.current = [];
    telloRecorderRef.current = null;
    telloSourceRecorderRef.current = null;

    if (!annotatedBlob || annotatedBlob.size === 0) return null;
    return {
      annotated: annotatedBlob,
      source: sourceBlob && sourceBlob.size > 0 ? sourceBlob : null,
    };
  }, []);

  // Monitor flight state transitions (Takeoff / Land)
  useEffect(() => {
    if (telemetry.is_flying && !wasFlyingRef.current) {
      wasFlyingRef.current = true;
      startTelloRecording();
      onFlightStarted?.();
    } else if (!telemetry.is_flying && wasFlyingRef.current) {
      wasFlyingRef.current = false;
      stopTelloRecording().then((res) => {
        if (res && res.annotated) {
          onFlightFinished?.(res.annotated, res.source);
        }
      });
    }
  }, [
    telemetry.is_flying,
    startTelloRecording,
    stopTelloRecording,
    onFlightFinished,
    onFlightStarted,
  ]);

  // Velocity RC state vector
  const rcStateRef = useRef({ lr: 0, fb: 0, ud: 0, yaw: 0 });
  const rcIntervalRef = useRef<number | null>(null);

  // Poll status API periodically
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/tello/status`);
      if (res.ok) {
        const data: TelloTelemetry = await res.json();
        setTelemetry(data);
        if (data.last_error) setErrorMsg(data.last_error);
      }
    } catch {
      // API offline or uninitialized
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 2000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Connect to Drone
  const handleConnectDrone = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/tello/connect`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setTelemetry(data.telemetry);
        startStreamWebSockets();
      } else {
        setErrorMsg(data.message || "Failed to connect to Tello drone.");
      }
    } catch (err: any) {
      setErrorMsg(`Connection error: ${err?.message || err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect Drone
  const handleDisconnectDrone = async () => {
    try {
      stopStreamWebSockets();
      await fetch(`${apiBaseUrl}/api/tello/disconnect`, { method: "POST" });
      setTelemetry((prev) => ({ ...prev, connected: false, is_flying: false }));
    } catch (err: any) {
      setErrorMsg(`Disconnect error: ${err?.message || err}`);
    }
  };

  // Command Helper
  const sendCommand = async (action: string, direction?: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/tello/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, direction }),
      });
      const data = await res.json();
      if (data.telemetry) setTelemetry(data.telemetry);
      if (!data.success) setErrorMsg(data.message);
    } catch (err: any) {
      setErrorMsg(`Command error: ${err?.message || err}`);
    }
  };

  // Stream WebSockets setup
  const startStreamWebSockets = useCallback(() => {
    if (streamWsRef.current) return;

    const streamUrl = `${wsBaseUrl}/ws/tello/stream?quality=75`;
    const controlUrl = `${wsBaseUrl}/ws/tello/control`;

    const wsStream = new WebSocket(streamUrl);
    wsStream.binaryType = "arraybuffer";

    wsStream.onopen = () => setStreamActive(true);
    wsStream.onclose = () => setStreamActive(false);
    wsStream.onerror = () => setStreamActive(false);

    wsStream.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const parsed = parseAnnotatedFrame(event.data);
        if (parsed) {
          if (annotatedImgRef.current) {
            annotatedImgRef.current.src = parsed.jpegUrl;
          }
          if (isRecordingRef.current) {
            if (recordCanvasRef.current) {
              createImageBitmap(parsed.blob)
                .then((bitmap) => {
                  if (recordCanvasRef.current && isRecordingRef.current) {
                    if (
                      recordCanvasRef.current.width !== bitmap.width ||
                      recordCanvasRef.current.height !== bitmap.height
                    ) {
                      recordCanvasRef.current.width = bitmap.width;
                      recordCanvasRef.current.height = bitmap.height;
                    }
                    const ctx = recordCanvasRef.current.getContext("2d");
                    if (ctx) {
                      ctx.drawImage(
                        bitmap,
                        0,
                        0,
                        bitmap.width,
                        bitmap.height,
                      );
                    }
                  }
                  bitmap.close();
                })
                .catch(() => {});
            }

            const rawBlobToDraw = parsed.rawBlob || parsed.blob;
            if (sourceCanvasRef.current) {
              createImageBitmap(rawBlobToDraw)
                .then((bitmap) => {
                  if (sourceCanvasRef.current && isRecordingRef.current) {
                    if (
                      sourceCanvasRef.current.width !== bitmap.width ||
                      sourceCanvasRef.current.height !== bitmap.height
                    ) {
                      sourceCanvasRef.current.width = bitmap.width;
                      sourceCanvasRef.current.height = bitmap.height;
                    }
                    const ctx = sourceCanvasRef.current.getContext("2d");
                    if (ctx) {
                      ctx.drawImage(
                        bitmap,
                        0,
                        0,
                        bitmap.width,
                        bitmap.height,
                      );
                    }
                  }
                  bitmap.close();
                })
                .catch(() => {});
            }
          }
          if (prevUrlRef.current) {
            URL.revokeObjectURL(prevUrlRef.current);
          }
          prevUrlRef.current = parsed.jpegUrl;

          const now = Date.now();
          if (
            parsed.payload.tello_telemetry &&
            now - lastTelemetryUpdateRef.current > 500
          ) {
            lastTelemetryUpdateRef.current = now;
            setTelemetry(parsed.payload.tello_telemetry);
          }
          onInference?.({ ...parsed.payload, frameBlob: parsed.blob });
        }
      } else if (typeof event.data === "string") {
        try {
          const json = JSON.parse(event.data);
          if (json.type === "error") setErrorMsg(json.message);
        } catch {}
      }
    };

    const wsControl = new WebSocket(controlUrl);
    controlWsRef.current = wsControl;

    streamWsRef.current = wsStream;
  }, [wsBaseUrl, onInference]);

  const stopStreamWebSockets = useCallback(() => {
    if (streamWsRef.current) {
      streamWsRef.current.close();
      streamWsRef.current = null;
    }
    if (controlWsRef.current) {
      controlWsRef.current.close();
      controlWsRef.current = null;
    }
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setStreamActive(false);
  }, []);

  useEffect(() => {
    if (telemetry.connected && !streamActive) {
      startStreamWebSockets();
    }
  }, [telemetry.connected, streamActive, startStreamWebSockets]);

  useEffect(() => {
    return () => stopStreamWebSockets();
  }, [stopStreamWebSockets]);

  // Send continuous RC vector
  const sendRC = useCallback((lr: number, fb: number, ud: number, yaw: number) => {
    rcStateRef.current = { lr, fb, ud, yaw };
    if (controlWsRef.current?.readyState === WebSocket.OPEN) {
      controlWsRef.current.send(
        JSON.stringify({
          action: "rc",
          left_right: lr,
          forward_backward: fb,
          up_down: ud,
          yaw: yaw,
        })
      );
    }
  }, []);

  // Keyboard Navigation Handler
  useEffect(() => {
    const active = new Set<string>();

    const updateMovement = () => {
      let lr = 0;
      let fb = 0;
      let ud = 0;
      let yaw = 0;

      const speed = 40;

      if (active.has("KeyW")) fb += speed;
      if (active.has("KeyS")) fb -= speed;
      if (active.has("KeyA")) lr -= speed;
      if (active.has("KeyD")) lr += speed;

      if (active.has("ArrowUp")) ud += speed;
      if (active.has("ArrowDown")) ud -= speed;
      if (active.has("ArrowLeft")) yaw -= speed;
      if (active.has("ArrowRight")) yaw += speed;

      sendRC(lr, fb, ud, yaw);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!telemetry.connected) return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(targetTag)) return;

      if (["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        active.add(e.code);
        setActiveKeys(new Set(active));
        updateMovement();
      } else if (e.code === "Space") {
        e.preventDefault();
        if (telemetry.is_flying) sendCommand("land");
        else sendCommand("takeoff");
      } else if (e.code === "Escape") {
        e.preventDefault();
        sendCommand("emergency");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!telemetry.connected) return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(targetTag)) return;

      if (["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        active.delete(e.code);
        setActiveKeys(new Set(active));
        updateMovement();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [sendRC, telemetry.is_flying, telemetry.connected]);

  // Battery helper
  const getBatteryColor = (bat: number) => {
    if (bat > 50) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    if (bat > 20) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-red-400 bg-red-500/10 border-red-500/30";
  };

  return (
    <div className="relative w-full h-full min-h-[550px] flex-1 flex flex-col rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl text-foreground">
      {/* ── Hero Live Stream Canvas (Fills Entire Frame) ──────────────────── */}
      <img
        ref={annotatedImgRef}
        alt="Tello Live Stream"
        className="w-full h-full object-cover absolute inset-0"
        style={{
          display: streamActive && telemetry.connected ? "block" : "none",
        }}
      />

      {/* ── Offline / Disconnected Overlay ────────────────────────────────── */}
      {(!telemetry.connected || !streamActive) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6 space-y-4 bg-[#0a0b0e] text-white">
          <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-inner">
            <Plane className="w-8 h-8 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">
              Tello Stream Disconnected
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
              Connect your computer's Wi-Fi to the Tello drone AP (
              <code className="text-cyan-400 font-mono">TELLO-XXXXXX</code>) and
              click Connect Drone.
            </p>
          </div>
          <Button
            onClick={handleConnectDrone}
            disabled={isConnecting}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-6 shadow-lg text-xs"
          >
            {isConnecting ? "Establishing UDP Link..." : "Connect Tello Drone"}
          </Button>
        </div>
      )}

      {/* ── Floating Top Telemetry & Status HUD (Docked at Very Top) ──────── */}
      <div className="absolute top-3 left-4 right-4 z-30 flex items-center justify-between gap-3 bg-black/90 backdrop-blur-xl border border-white/15 px-4 py-2 rounded-xl shadow-2xl overflow-x-auto select-none">
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2 shrink-0">
            <Wifi
              className={`w-4 h-4 shrink-0 ${telemetry.connected ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`}
            />
            <span className="text-xs font-bold text-white whitespace-nowrap">
              {telemetry.connected ? "TELLO CONNECTED" : "OFFLINE"}
            </span>
          </div>

          <Badge className="bg-white/10 text-cyan-300 border border-white/10 text-[11px] whitespace-nowrap shrink-0">
            {telemetry.is_flying ? "AIRBORNE" : "LANDED"}
          </Badge>

          {telemetry.connected && streamActive && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] flex items-center space-x-1.5 whitespace-nowrap shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>LIVE ANNOTATED</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-4 text-xs font-semibold text-white shrink-0">
          {/* Battery */}
          <div className="flex items-center space-x-1.5 whitespace-nowrap shrink-0">
            {telemetry.battery <= 20 ? (
              <BatteryWarning className="w-4 h-4 text-red-400 animate-bounce shrink-0" />
            ) : (
              <Battery className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{telemetry.battery}%</span>
          </div>

          {/* Altitude */}
          <div className="flex items-center space-x-1.5 whitespace-nowrap shrink-0">
            <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{(telemetry.height / 100).toFixed(1)}m</span>
          </div>

          {/* Flight Time */}
          <div className="flex items-center space-x-1.5 whitespace-nowrap shrink-0">
            <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
            <span>{telemetry.flight_time}s</span>
          </div>

          {/* Temp */}
          <div className="flex items-center space-x-1.5 whitespace-nowrap shrink-0">
            <Thermometer className="w-4 h-4 text-orange-400 shrink-0" />
            <span>{telemetry.temperature}°C</span>
          </div>

          {/* Connect / Disconnect button */}
          {!telemetry.connected ? (
            <Button
              onClick={handleConnectDrone}
              disabled={isConnecting}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3 shadow whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          ) : (
            <Button
              onClick={handleDisconnectDrone}
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-400 hover:bg-red-500/20 font-semibold text-xs h-7 px-3 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* ── Error Alert Message Banner ────────────────────────────────────── */}
      {errorMsg && (
        <div className="absolute top-16 left-4 right-4 z-30 flex items-center justify-between p-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-xs font-medium backdrop-blur-md shadow-xl">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Floating Flight Control Deck Dock (Bottom Right) ──────────────── */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2.5 bg-black/85 backdrop-blur-xl border border-white/15 p-3.5 rounded-2xl shadow-2xl max-w-[320px] text-white">
        {/* Controls Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <h3 className="text-xs font-bold flex items-center space-x-1.5">
            <Plane className="w-4 h-4 text-cyan-400" />
            <span>Flight Deck</span>
          </h3>
          <Badge
            variant="outline"
            className="text-[9px] border-white/20 text-white/70"
          >
            Keyboard Active
          </Badge>
        </div>

        {/* Takeoff / Land / Stop Buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            onClick={() => sendCommand("takeoff")}
            disabled={!telemetry.connected || telemetry.is_flying}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 shadow"
          >
            Takeoff
          </Button>

          <Button
            onClick={() => sendCommand("land")}
            disabled={!telemetry.connected || !telemetry.is_flying}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 shadow"
          >
            Land
          </Button>

          <Button
            onClick={() => sendCommand("emergency")}
            disabled={!telemetry.connected}
            variant="destructive"
            className="font-bold text-xs h-8 shadow border border-red-500/50"
          >
            <ShieldAlert className="w-3.5 h-3.5 mr-1" />
            Stop
          </Button>
        </div>

        {/* Joysticks Grid */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          {/* Translate W/A/S/D */}
          <div className="flex flex-col items-center bg-white/5 p-2 rounded-xl border border-white/10">
            <span className="text-[9px] font-semibold text-white/70 mb-1">
              Translate (W/A/S/D)
            </span>
            <div className="grid grid-cols-3 gap-1 w-full max-w-[110px]">
              <div />
              <Button
                size="icon"
                variant={activeKeys.has("KeyW") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, 40, 0, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </Button>
              <div />

              <Button
                size="icon"
                variant={activeKeys.has("KeyA") ? "default" : "outline"}
                onMouseDown={() => sendRC(-40, 0, 0, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </Button>

              <Button
                size="icon"
                variant="secondary"
                onClick={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-[9px] font-bold text-white bg-white/15 border-white/20"
              >
                ●
              </Button>

              <Button
                size="icon"
                variant={activeKeys.has("KeyD") ? "default" : "outline"}
                onMouseDown={() => sendRC(40, 0, 0, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>

              <div />
              <Button
                size="icon"
                variant={activeKeys.has("KeyS") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, -40, 0, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </Button>
              <div />
            </div>
          </div>

          {/* Altitude & Yaw */}
          <div className="flex flex-col items-center bg-white/5 p-2 rounded-xl border border-white/10">
            <span className="text-[9px] font-semibold text-white/70 mb-1">
              Alt & Yaw (Arrows)
            </span>
            <div className="grid grid-cols-3 gap-1 w-full max-w-[110px]">
              <div />
              <Button
                size="icon"
                variant={activeKeys.has("ArrowUp") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, 0, 40, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowUp className="w-3.5 h-3.5 text-cyan-400" />
              </Button>
              <div />

              <Button
                size="icon"
                variant={activeKeys.has("ArrowLeft") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, 0, 0, -40)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>

              <Button
                size="icon"
                variant="secondary"
                onClick={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-[9px] font-bold text-white bg-white/15 border-white/20"
              >
                ●
              </Button>

              <Button
                size="icon"
                variant={activeKeys.has("ArrowRight") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, 0, 0, 40)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <RotateCw className="w-3 h-3" />
              </Button>

              <div />
              <Button
                size="icon"
                variant={activeKeys.has("ArrowDown") ? "default" : "outline"}
                onMouseDown={() => sendRC(0, 0, -40, 0)}
                onMouseUp={() => sendRC(0, 0, 0, 0)}
                className="h-7 w-7 text-white border-white/20 bg-white/10 hover:bg-white/20"
              >
                <ArrowDown className="w-3.5 h-3.5 text-amber-400" />
              </Button>
              <div />
            </div>
          </div>
        </div>

        {/* Aerobatic Flips */}
        <div className="pt-0.5">
          <div className="grid grid-cols-4 gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand("flip", "f")}
              disabled={!telemetry.is_flying}
              className="text-[9px] h-6 font-semibold text-white border-white/20 bg-white/5 hover:bg-white/10"
            >
              Flip FWD
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand("flip", "b")}
              disabled={!telemetry.is_flying}
              className="text-[9px] h-6 font-semibold text-white border-white/20 bg-white/5 hover:bg-white/10"
            >
              Flip BWD
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand("flip", "l")}
              disabled={!telemetry.is_flying}
              className="text-[9px] h-6 font-semibold text-white border-white/20 bg-white/5 hover:bg-white/10"
            >
              Flip L
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendCommand("flip", "r")}
              disabled={!telemetry.is_flying}
              className="text-[9px] h-6 font-semibold text-white border-white/20 bg-white/5 hover:bg-white/10"
            >
              Flip R
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
