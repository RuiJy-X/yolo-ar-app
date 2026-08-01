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
  apiBaseUrl?: string;
  wsBaseUrl?: string;
};

function parseAnnotatedFrame(buffer: ArrayBuffer): {
  payload: InferencePayload & { tello_telemetry?: TelloTelemetry };
  jpegUrl: string;
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

  const jpegBytes = new Uint8Array(buffer, 4 + jsonLen);
  const blob = new Blob([jpegBytes], { type: "image/jpeg" });
  const jpegUrl = URL.createObjectURL(blob);

  return { payload, jpegUrl };
}

export default function TelloDronePanel({
  onInference,
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
          if (prevUrlRef.current) {
            URL.revokeObjectURL(prevUrlRef.current);
          }
          prevUrlRef.current = parsed.jpegUrl;

          if (parsed.payload.tello_telemetry) {
            setTelemetry(parsed.payload.tello_telemetry);
          }
          onInference?.(parsed.payload);
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
  }, [sendRC, telemetry.is_flying]);

  // Battery helper
  const getBatteryColor = (bat: number) => {
    if (bat > 50) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    if (bat > 20) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-red-400 bg-red-500/10 border-red-500/30";
  };

  return (
    <div className="flex flex-col space-y-4 w-full text-foreground">
      {/* ── Top Telemetry HUD & Status Bar ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 bg-card/60 backdrop-blur-md p-3 rounded-xl border border-border/50 shadow-sm">
        {/* Connection Status */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          <Wifi className={`w-4 h-4 ${telemetry.connected ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`} />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Connection</span>
            <span className="text-xs font-bold">
              {telemetry.connected ? "TELLO CONNECTED" : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Battery Indicator */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          {telemetry.battery <= 20 ? (
            <BatteryWarning className="w-4 h-4 text-red-400 animate-bounce" />
          ) : (
            <Battery className="w-4 h-4 text-emerald-400" />
          )}
          <div className="flex flex-col w-full">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Battery</span>
              <span className="text-xs font-bold">{telemetry.battery}%</span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className={`h-full transition-all duration-500 ${
                  telemetry.battery > 50 ? "bg-emerald-500" : telemetry.battery > 20 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, telemetry.battery))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Altitude / Height */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          <Gauge className="w-4 h-4 text-cyan-400" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Altitude</span>
            <span className="text-xs font-bold">
              {telemetry.height} cm <span className="text-[10px] text-muted-foreground">({(telemetry.height / 100).toFixed(1)}m)</span>
            </span>
          </div>
        </div>

        {/* Flight Time */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          <Zap className="w-4 h-4 text-yellow-400" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Flight Time</span>
            <span className="text-xs font-bold">{telemetry.flight_time}s</span>
          </div>
        </div>

        {/* Temperature */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          <Thermometer className="w-4 h-4 text-orange-400" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Temperature</span>
            <span className="text-xs font-bold">{telemetry.temperature}°C</span>
          </div>
        </div>

        {/* Attitude (Pitch / Roll / Yaw) */}
        <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-background/50 border border-border/40">
          <Compass className="w-4 h-4 text-indigo-400" />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">P / R / Y</span>
            <span className="text-xs font-mono font-semibold">
              {telemetry.pitch}° / {telemetry.roll}° / {telemetry.yaw}°
            </span>
          </div>
        </div>

        {/* Action Connect/Disconnect */}
        <div className="flex items-center justify-end p-1">
          {!telemetry.connected ? (
            <Button
              onClick={handleConnectDrone}
              disabled={isConnecting}
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 shadow-md"
            >
              {isConnecting ? "Connecting..." : "Connect Drone"}
            </Button>
          ) : (
            <Button
              onClick={handleDisconnectDrone}
              variant="outline"
              size="sm"
              className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 font-semibold text-xs h-9"
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert Message */}
      {errorMsg && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* ── Main Stream View + Flight Control Panel Grid ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Live Annotated Stream Window (2 cols) */}
        <div className="lg:col-span-2 relative bg-black/90 rounded-2xl overflow-hidden border border-border/60 shadow-xl flex items-center justify-center min-h-[380px]">
          {/* Live Frame Image */}
          <img
            ref={annotatedImgRef}
            alt="Tello Live Stream"
            className="w-full h-full object-contain max-h-[500px]"
            style={{ display: streamActive && telemetry.connected ? "block" : "none" }}
          />

          {/* Offline / Connect Prompt Overlay */}
          {(!telemetry.connected || !streamActive) && (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <Plane className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Tello Stream Disconnected</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect your computer's Wi-Fi to the Tello drone AP (<code className="text-cyan-400">TELLO-XXXXXX</code>) and click Connect Drone.
                </p>
              </div>
              <Button
                onClick={handleConnectDrone}
                disabled={isConnecting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 shadow-lg"
              >
                {isConnecting ? "Establishing UDP Link..." : "Connect Tello Drone"}
              </Button>
            </div>
          )}

          {/* Stream Overlay HUD Header */}
          {telemetry.connected && streamActive && (
            <div className="absolute top-3 left-3 right-3 flex justify-between items-center pointer-events-none">
              <Badge className="bg-black/60 backdrop-blur-md text-emerald-400 border border-emerald-500/40 px-2.5 py-1 text-xs flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>LIVE ANNOTATED FEED</span>
              </Badge>

              <Badge className="bg-black/60 backdrop-blur-md text-cyan-300 border border-cyan-500/40 text-xs">
                {telemetry.is_flying ? "AIRBORNE" : "LANDED"}
              </Badge>
            </div>
          )}
        </div>

        {/* Right Column: Drone Controls & Virtual Joysticks (1 col) */}
        <div className="flex flex-col space-y-4 bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-border/50 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <h3 className="text-sm font-bold flex items-center space-x-2">
              <Plane className="w-4 h-4 text-primary" />
              <span>Flight Control Deck</span>
            </h3>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              Keyboard: Active
            </Badge>
          </div>

          {/* Primary Takeoff / Land / Emergency Bar */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => sendCommand("takeoff")}
              disabled={!telemetry.connected || telemetry.is_flying}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 shadow"
            >
              Takeoff
            </Button>

            <Button
              onClick={() => sendCommand("land")}
              disabled={!telemetry.connected || !telemetry.is_flying}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-10 shadow"
            >
              Land
            </Button>

            <Button
              onClick={() => sendCommand("emergency")}
              disabled={!telemetry.connected}
              variant="destructive"
              className="font-bold text-xs h-10 shadow-lg border border-red-500/50"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1" />
              Stop
            </Button>
          </div>

          {/* Movement Joysticks Section */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Translational D-Pad (Pitch / Roll) */}
            <div className="flex flex-col items-center bg-background/40 p-3 rounded-xl border border-border/30">
              <span className="text-[10px] font-semibold text-muted-foreground mb-2">Translate (W/A/S/D)</span>
              <div className="grid grid-cols-3 gap-1.5 w-full max-w-[130px]">
                <div />
                <Button
                  size="icon"
                  variant={activeKeys.has("KeyW") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, 40, 0, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <div />

                <Button
                  size="icon"
                  variant={activeKeys.has("KeyA") ? "default" : "outline"}
                  onMouseDown={() => sendRC(-40, 0, 0, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8 text-[10px] font-bold"
                >
                  ●
                </Button>

                <Button
                  size="icon"
                  variant={activeKeys.has("KeyD") ? "default" : "outline"}
                  onMouseDown={() => sendRC(40, 0, 0, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <div />
                <Button
                  size="icon"
                  variant={activeKeys.has("KeyS") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, -40, 0, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                >
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <div />
              </div>
            </div>

            {/* Altitude / Yaw D-Pad (Arrows) */}
            <div className="flex flex-col items-center bg-background/40 p-3 rounded-xl border border-border/30">
              <span className="text-[10px] font-semibold text-muted-foreground mb-2">Altitude & Yaw</span>
              <div className="grid grid-cols-3 gap-1.5 w-full max-w-[130px]">
                <div />
                <Button
                  size="icon"
                  variant={activeKeys.has("ArrowUp") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, 0, 40, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                  title="Ascend (Up Arrow)"
                >
                  <ArrowUp className="w-4 h-4 text-cyan-400" />
                </Button>
                <div />

                <Button
                  size="icon"
                  variant={activeKeys.has("ArrowLeft") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, 0, 0, -40)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                  title="Turn Left (Left Arrow)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>

                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8 text-[10px] font-bold"
                >
                  ●
                </Button>

                <Button
                  size="icon"
                  variant={activeKeys.has("ArrowRight") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, 0, 0, 40)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                  title="Turn Right (Right Arrow)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>

                <div />
                <Button
                  size="icon"
                  variant={activeKeys.has("ArrowDown") ? "default" : "outline"}
                  onMouseDown={() => sendRC(0, 0, -40, 0)}
                  onMouseUp={() => sendRC(0, 0, 0, 0)}
                  className="h-8 w-8"
                  title="Descend (Down Arrow)"
                >
                  <ArrowDown className="w-4 h-4 text-amber-400" />
                </Button>
                <div />
              </div>
            </div>
          </div>

          {/* Aerobatic Flips */}
          <div className="pt-2">
            <span className="text-[10px] font-semibold text-muted-foreground block mb-1.5">Acrobatic Flips</span>
            <div className="grid grid-cols-4 gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendCommand("flip", "f")}
                disabled={!telemetry.is_flying}
                className="text-[10px] h-7 font-semibold"
              >
                Flip FWD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendCommand("flip", "b")}
                disabled={!telemetry.is_flying}
                className="text-[10px] h-7 font-semibold"
              >
                Flip BWD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendCommand("flip", "l")}
                disabled={!telemetry.is_flying}
                className="text-[10px] h-7 font-semibold"
              >
                Flip LEFT
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendCommand("flip", "r")}
                disabled={!telemetry.is_flying}
                className="text-[10px] h-7 font-semibold"
              >
                Flip RIGHT
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
