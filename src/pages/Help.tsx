import { useState } from "react";
import AppLayout from "@/applayout";
import {
  Home,
  Camera,
  PlayCircle,
  Settings2,
  ChevronRight,
  Database,
  ShieldAlert,
  BarChart3,
  Cpu,
  Layers,
  Info,
  Wifi,
  ArrowRightLeft,
  Film,
  PieChart,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  Server,
  Target,
  ArrowRight,
  Clock,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionPieChart } from "@/components/Logs";

type TabId = "overview" | "realtime" | "library" | "config" | "api";

const HelpPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const sidebarItems = [
    {
      id: "overview",
      label: "System Architecture & AI Pipeline",
      icon: Cpu,
      badge: "Core AI",
      desc: "End-to-end YOLO + InfoGCN 2-stage pipeline",
    },
    {
      id: "realtime",
      label: "Real-Time Inference & Drone",
      icon: Camera,
      badge: "Live",
      desc: "Webcam, Tello drone, & Waving SOS alerts",
    },
    {
      id: "library",
      label: "Video Library & Deep Analytics",
      icon: PlayCircle,
      badge: "Analytics",
      desc: "Spotlight focus, pie charts, & frame timeline",
    },
    {
      id: "config",
      label: "Model Configuration & Tuning",
      icon: Settings2,
      badge: "Settings",
      desc: "Aerial vs Base YOLO, temporal presets, & thresholds",
    },
    {
      id: "api",
      label: "Backend & Communication Protocols",
      icon: Wifi,
      badge: "FastAPI",
      desc: "WebSocket binary packet & REST job workers",
    },
  ];

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50 w-full">
        {/* Navigation Sidebar */}
        <div className="w-80 border-r border-slate-200 bg-white p-4 space-y-2 shrink-0 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-1.5">
            <div className="px-3 py-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase font-mono">
              System Documentation & Guide
            </div>

            {sidebarItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabId)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3.5 py-3 rounded-xl text-left transition-all",
                    isActive
                      ? "bg-blue-50/90 text-blue-900 shadow-xs border border-blue-200/80"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "p-2 rounded-lg shrink-0 mt-0.5 transition-colors",
                      isActive
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    <item.icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold truncate">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                  {isActive && (
                    <ChevronRight className="size-4 text-blue-600 shrink-0 self-center" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Specs Badge */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-800">
                Action Recognition v2.0
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 space-y-1">
              <div>• Stage 1: YOLOv11-Pose (17 Joints)</div>
              <div>• Stage 2: InfoGCN Graph (12 Joints)</div>
              <div>• Classes: Sit, Stand, Walk, Wave</div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-8 py-8 bg-slate-50/50">
          <div className="max-w-5xl mx-auto space-y-10">
            {activeTab === "overview" && <OverviewDoc />}
            {activeTab === "realtime" && <RealTimeDoc />}
            {activeTab === "library" && <LibraryDoc />}
            {activeTab === "config" && <ConfigDoc />}
            {activeTab === "api" && <WebSocketDoc />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── TAB 1: SYSTEM ARCHITECTURE & AI PIPELINE ──                          */
/* ══════════════════════════════════════════════════════════════════════════ */
const OverviewDoc = () => (
  <div className="space-y-8 animate-in fade-in duration-300">
    {/* Page Header */}
    <div className="space-y-2 border-b border-slate-200 pb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
        <Cpu size={13} />
        <span>Two-Stage AI Framework</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
        System Architecture & AI Pipeline
      </h1>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        The application employs a state-of-the-art dual-stage neural network architecture for human action recognition.
        It decouples spatial person localization from temporal action classification, providing robust, real-time tracking across diverse surveillance, aerial UAV, and stationary camera feeds.
      </p>
    </div>

    {/* Graphic: End-to-End Pipeline Flowchart */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
            <Zap className="size-4 text-amber-500" />
            End-to-End Inference Pipeline
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            How raw camera frames are transformed into action classifications in milliseconds.
          </p>
        </div>
        <span className="text-[11px] font-mono font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
          ~30 FPS Low-Latency Execution
        </span>
      </div>

      {/* Visual Pipeline Nodes */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
        {/* Node 1 */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 flex flex-col justify-between space-y-3 relative group hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              1
            </span>
            <Film className="size-4 text-slate-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Input Frame</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Live Webcam, Tello Drone, or Uploaded MP4 video.
            </p>
          </div>
          <div className="text-[10px] font-mono text-slate-400 bg-white p-1.5 rounded border border-slate-200">
            RGB (1920×1080)
          </div>
        </div>

        {/* Node 2 */}
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 flex flex-col justify-between space-y-3 relative group hover:border-blue-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              2
            </span>
            <Target className="size-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-950">YOLOv11-Pose</h4>
            <p className="text-[11px] text-blue-800 mt-1">
              Detects human bounding boxes & 17 COCO body keypoints.
            </p>
          </div>
          <div className="text-[10px] font-mono text-blue-700 bg-white p-1.5 rounded border border-blue-200">
            Stage 1: Spatial Pose
          </div>
        </div>

        {/* Node 3 */}
        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 flex flex-col justify-between space-y-3 relative group hover:border-indigo-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              3
            </span>
            <Activity className="size-4 text-indigo-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-950">BODY12 & Re-ID</h4>
            <p className="text-[11px] text-indigo-800 mt-1">
              Converts keypoints into 12-joint graph topology + ByteTrack Kalman Re-ID.
            </p>
          </div>
          <div className="text-[10px] font-mono text-indigo-700 bg-white p-1.5 rounded border border-indigo-200">
            Tracking & Re-ID
          </div>
        </div>

        {/* Node 4 */}
        <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 flex flex-col justify-between space-y-3 relative group hover:border-purple-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              4
            </span>
            <Layers className="size-4 text-purple-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-purple-950">InfoGCN GCN</h4>
            <p className="text-[11px] text-purple-800 mt-1">
              Temporal graph convolution over rolling window (16/32/64 frames).
            </p>
          </div>
          <div className="text-[10px] font-mono text-purple-700 bg-white p-1.5 rounded border border-purple-200">
            Stage 2: Spatial-Temporal
          </div>
        </div>

        {/* Node 5 */}
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between space-y-3 relative group hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-mono font-bold text-[11px] flex items-center justify-center">
              5
            </span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-emerald-950">Action Output</h4>
            <p className="text-[11px] text-emerald-800 mt-1">
              EMA-smoothed labels, distress alert triggers, & pie chart stats.
            </p>
          </div>
          <div className="text-[10px] font-mono text-emerald-700 bg-white p-1.5 rounded border border-emerald-200">
            Sit, Stand, Walk, Wave
          </div>
        </div>
      </div>
    </div>

    {/* Section 2: Deep Dive into Stage 1 & Stage 2 with Graphics */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left: Stage 1 YOLOv11 & BODY12 Skeleton */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
            <Target size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Stage 1: YOLOv11-Pose & BODY12 Skeleton
            </h3>
            <span className="text-[11px] text-slate-500">
              Spatial Keypoint Extraction & Skeletal Topology
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed text-justify">
          The first stage uses an Ultralytics YOLOv11-Pose network. For every individual in the camera's field of view, YOLO predicts an object bounding box and 17 COCO-format 2D keypoints (x, y, confidence).
          To eliminate facial noise and match the graph architecture of InfoGCN, these are converted into a standardized <strong>12-Joint Skeletal Graph (BODY12)</strong>.
        </p>

        {/* Graphic: BODY12 Skeleton Diagram */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 flex flex-col items-center justify-center space-y-3 shadow-2xs">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-500">
            12-Joint Graph Node Topology (BODY12)
          </span>

          <svg width="200" height="210" viewBox="0 0 200 210" className="overflow-visible">
            {/* Bones (Lines) */}
            {/* Shoulders */}
            <line x1="80" y1="50" x2="120" y2="50" stroke="#3b82f6" strokeWidth="3" />
            {/* Spine / Torso to Mid Hips */}
            <line x1="100" y1="35" x2="100" y2="50" stroke="#93c5fd" strokeWidth="2" strokeDasharray="3 3" />
            <line x1="100" y1="50" x2="100" y2="105" stroke="#3b82f6" strokeWidth="3" />
            {/* Left Arm */}
            <line x1="80" y1="50" x2="55" y2="85" stroke="#3b82f6" strokeWidth="3" />
            <line x1="55" y1="85" x2="40" y2="120" stroke="#3b82f6" strokeWidth="3" />
            {/* Right Arm */}
            <line x1="120" y1="50" x2="145" y2="85" stroke="#3b82f6" strokeWidth="3" />
            <line x1="145" y1="85" x2="160" y2="120" stroke="#3b82f6" strokeWidth="3" />
            {/* Hips */}
            <line x1="85" y1="105" x2="115" y2="105" stroke="#3b82f6" strokeWidth="3" />
            {/* Left Leg */}
            <line x1="85" y1="105" x2="80" y2="150" stroke="#3b82f6" strokeWidth="3" />
            <line x1="80" y1="150" x2="75" y2="195" stroke="#3b82f6" strokeWidth="3" />
            {/* Right Leg */}
            <line x1="115" y1="105" x2="120" y2="150" stroke="#3b82f6" strokeWidth="3" />
            <line x1="120" y1="150" x2="125" y2="195" stroke="#3b82f6" strokeWidth="3" />

            {/* Joints (Circles) */}
            {/* 0: Nose */}
            <circle cx="100" cy="35" r="5" fill="#d97706" />
            <text x="110" y="38" fill="#b45309" fontSize="9" fontWeight="bold" fontFamily="monospace">0:Nose</text>

            {/* 1,2: Shoulders */}
            <circle cx="80" cy="50" r="4.5" fill="#2563eb" />
            <circle cx="120" cy="50" r="4.5" fill="#2563eb" />

            {/* 3,4: Elbows */}
            <circle cx="55" cy="85" r="4" fill="#2563eb" />
            <circle cx="145" cy="85" r="4" fill="#2563eb" />

            {/* 5,6: Wrists */}
            <circle cx="40" cy="120" r="4" fill="#059669" />
            <circle cx="160" cy="120" r="4" fill="#059669" />
            <text x="168" y="123" fill="#047857" fontSize="8" fontWeight="bold" fontFamily="monospace">Wrists</text>

            {/* 7,8: Hips */}
            <circle cx="85" cy="105" r="4.5" fill="#2563eb" />
            <circle cx="115" cy="105" r="4.5" fill="#2563eb" />

            {/* 9,10: Knees */}
            <circle cx="80" cy="150" r="4" fill="#2563eb" />
            <circle cx="120" cy="150" r="4" fill="#2563eb" />

            {/* 11,12: Ankles */}
            <circle cx="75" cy="195" r="4" fill="#7c3aed" />
            <circle cx="125" cy="195" r="4" fill="#7c3aed" />
            <text x="133" y="198" fill="#6d28d9" fontSize="8" fontWeight="bold" fontFamily="monospace">Ankles</text>
          </svg>

          <div className="text-[10px] text-slate-500 text-center font-mono font-medium">
            12 × 12 Spatial Adjacency Matrix maps bone connectivity
          </div>
        </div>
      </div>

      {/* Right: Stage 2 InfoGCN & Temporal Graph Convolution */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
            <Layers size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Stage 2: InfoGCN Action Classifier
            </h3>
            <span className="text-[11px] text-slate-500">
              Spatial-Temporal Graph Convolutional Network
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed text-justify">
          Instead of analyzing isolated snapshots, human action is fundamentally temporal.
          InfoGCN maintains a rolling sliding buffer of T consecutive skeletal frames (16, 32, or 64 frames).
          It applies graph convolutions across spatial joints while computing temporal convolutions along the time axis to model complex body kinematics.
        </p>

        {/* Graphic: Sliding Window Temporal Buffer */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Sliding Window Temporal Buffer (T frames)</span>
            <span className="font-mono text-purple-600 font-semibold">Stride = 2 frames</span>
          </div>

          {/* Graphical Frame Boxes */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-2">
            {[
              { label: "t-15", opacity: "opacity-40" },
              { label: "t-12", opacity: "opacity-50" },
              { label: "t-8", opacity: "opacity-60" },
              { label: "t-4", opacity: "opacity-75" },
              { label: "t-2", opacity: "opacity-90" },
              { label: "t (now)", opacity: "opacity-100 ring-2 ring-purple-500 bg-purple-50" },
            ].map((f, i) => (
              <div
                key={i}
                className={`flex-1 min-w-[50px] p-2 rounded-lg border border-slate-200 bg-white text-center text-[10px] font-mono font-semibold ${f.opacity}`}
              >
                <div className="text-slate-400">f</div>
                <div className="text-slate-800">{f.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-200 text-xs">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 font-medium">1. Spatial Graph Convolution:</span>
              <span className="font-mono font-bold text-slate-800">Bone Adjacency</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 font-medium">2. Temporal Convolution:</span>
              <span className="font-mono font-bold text-slate-800">Motion Velocity</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 font-medium">3. Exponential Smoothing (EMA):</span>
              <span className="font-mono font-bold text-purple-600">α = 0.75</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── TAB 2: REAL-TIME INFERENCE & DRONE ──                                */
/* ══════════════════════════════════════════════════════════════════════════ */
const RealTimeDoc = () => (
  <div className="space-y-8 animate-in fade-in duration-300">
    <div className="space-y-2 border-b border-slate-200 pb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
        <Radio size={13} />
        <span>Live Video Stream & Drone Control</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
        Real-Time Inference & Distress Detection
      </h1>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        The Real-Time module provides live, continuous situational awareness by streaming browser webcam feeds or Ryze Tello drone video directly into the backend AI pipeline with automated distress signal alerting.
      </p>
    </div>

    {/* Graphic: Distress Alert Protocol (Waving SOS) */}
    <div className="p-6 rounded-2xl border border-amber-200 bg-amber-50/50 shadow-xs space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
          <ShieldAlert size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold text-amber-950">
            Waving Distress Alert Protocol (SOS Trigger)
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            Automated detection of sustained emergency waving gestures.
          </p>
        </div>
      </div>

      <p className="text-xs text-amber-900 leading-relaxed text-justify">
        In search and rescue operations or surveillance, continuous waving is recognized as an active distress call.
        The system maintains a dedicated frame counter for each tracked individual (Person P#ID).
        When a person continuously waves for <strong>32 consecutive frames (~1.0 second at 30 FPS)</strong>, the alert engine instantly triggers high-priority visual alarms, flashes the bounding box, and creates an audit record.
      </p>

      {/* Visual State Machine Diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
        <div className="p-3.5 rounded-xl bg-white border border-amber-200 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Stage A: Initial Waving</span>
            <span className="font-mono text-slate-400">Frame 1–15</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Action labeled as "Waving". Sliding window accumulates confidence scores.
          </p>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 w-1/3" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-white border border-amber-200 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-amber-800">
            <span>Stage B: Sustained Action</span>
            <span className="font-mono text-amber-600">Frame 16–31</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Counter approaches threshold. Temporary noise or drops are filtered by EMA.
          </p>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 w-2/3" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-red-800">
            <span>Stage C: SOS Alert Fired</span>
            <span className="font-mono text-red-600 font-bold">Frame 32+</span>
          </div>
          <p className="text-[11px] text-red-700 font-medium">
            Threshold met! Red alert card logged, sound notification, and session marked.
          </p>
          <div className="h-1.5 w-full bg-red-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-600 w-full" />
          </div>
        </div>
      </div>
    </div>

    {/* Section 2: Ryze Tello Drone & WebRTC Stream */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
            <Radio size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            Ryze Tello Drone Integration
          </h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed text-justify">
          The system directly integrates with Ryze Tello mini UAVs via local Wi-Fi UDP sockets.
          The backend connects to the drone's 720p H.264 video feed over port <code>11111</code>, forwarding decoded frames through the Aerial-tuned YOLOv11 and InfoGCN models in real-time.
        </p>
        <ul className="text-xs text-slate-600 space-y-2">
          <li className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span>Auto-connect to Tello Wi-Fi access point</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span>High-angle aerial pose detection with VisDrone weights</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
            <span>Live battery, temperature, and height telemetry readouts</span>
          </li>
        </ul>
      </div>

      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
            <Database size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            Auto-Archiving & History Packaging
          </h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed text-justify">
          When a live monitoring session is stopped, the application automatically aggregates all per-frame detections, bounding boxes, skeleton keypoints, action classifications, and distress alert events into a single structured session artifact stored in the Home Dashboard for post-incident review.
        </p>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-mono text-[11px]">
          <div className="text-slate-500">Saved Artifact Includes:</div>
          <div className="text-blue-700">• Clean Source Video & Annotated MP4</div>
          <div className="text-purple-700">• Chronological Bounding Box & Pose Logs</div>
          <div className="text-emerald-700">• Action Distribution Donut Charts & Alerts</div>
        </div>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── TAB 3: VIDEO LIBRARY & DEEP ANALYTICS ──                             */
/* ══════════════════════════════════════════════════════════════════════════ */
const LibraryDoc = () => (
  <div className="space-y-8 animate-in fade-in duration-300">
    <div className="space-y-2 border-b border-slate-200 pb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-semibold">
        <PlayCircle size={13} />
        <span>Post-Analysis & Deep Inspection</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
        Video Library & Multi-Tab Analytics
      </h1>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        The Video Library allows operators to upload pre-recorded MP4/MOV footage, execute the full AI pipeline asynchronously, and inspect granular frame metadata, person action histories, and interactive pie charts.
      </p>
    </div>

    {/* Graphic: Spotlight Mode & Video Overlay Toggles */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
            <Eye className="size-4 text-blue-600" />
            Interactive Spotlight Focus & Overlay Controls
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Isolate specific individuals or toggle between raw video and backend annotations.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Spotlight Focus */}
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
          <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
            <Target size={14} className="text-blue-600" />
            <span>1. Person Spotlight Mask</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            Click any person's bounding box directly on the video. The surroundings smoothly dim to 78% black while the focused person remains brightly illuminated through an SVG cutout mask.
          </p>
        </div>

        {/* Card 2: Annotations On/Off */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <Eye size={14} className="text-slate-600" />
            <span>2. Annotations: On / Off</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            Seamlessly switches the video stream between the backend-rendered annotated video and the raw source video without resetting the playback timestamp or pause state.
          </p>
        </div>

        {/* Card 3: Browser Overlay On/Off */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
            <Layers size={14} className="text-slate-600" />
            <span>3. Browser Overlay: On / Off</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed text-justify">
            Hides the frontend-drawn HTML/SVG bounding boxes and tags so operators can watch the video cleanly with only the model's burnt-in visualizations.
          </p>
        </div>
      </div>
    </div>

    {/* Section 2: Tabbed Sidebar Overview & Sample Action Pie Chart */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Tab Navigation Breakdown */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
            <Activity size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900">
            4-Tab Analytics Sidebar
          </h3>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Activity size={12} className="text-blue-600" />
              <span>Tab 1: Action Logs</span>
            </div>
            <p className="text-slate-500">
              Collapsible action accordions and emergency alerts. Click any instance to jump to that timestamp.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Film size={12} className="text-purple-600" />
              <span>Tab 2: Frame Inspector</span>
            </div>
            <p className="text-slate-500">
              Step through individual frames, check waving distress alerts, and view the frame's action pie chart.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Users size={12} className="text-emerald-600" />
              <span>Tab 3: Person Inspector (P#ID)</span>
            </div>
            <p className="text-slate-500">
              Full lifetime action distribution pie chart, current frame confidence scores, and clickable chronological history timeline.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <PieChart size={12} className="text-amber-600" />
              <span>Tab 4: Whole Video Overview</span>
            </div>
            <p className="text-slate-500">
              Session-wide action distribution donut chart and list of all tracked individuals.
            </p>
          </div>
        </div>
      </div>

      {/* Visual Live Interactive Pie Chart Preview */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <PieChart size={16} />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Interactive Action Pie Charts
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Interactive Preview</span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Hover over the chart slices below to inspect action proportions and frame counts:
        </p>

        {/* Live Pie Chart Sample */}
        <ActionPieChart
          data={[
            { action: "Walking", count: 85, avgConfidence: 0.92 },
            { action: "Standing", count: 45, avgConfidence: 0.88 },
            { action: "Sitting", count: 30, avgConfidence: 0.95 },
            { action: "Waving", count: 18, avgConfidence: 0.91 },
          ]}
          size={140}
          donut={true}
        />

        {/* Keyboard Shortcut Note */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Keyboard size={14} className="text-blue-600" />
            <span className="font-bold text-slate-900">Precision Frame Stepping</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <kbd className="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-bold text-slate-800">←</kbd>
            <kbd className="px-2 py-0.5 rounded bg-white border border-slate-300 shadow-2xs font-bold text-slate-800">→</kbd>
            <span className="text-slate-500 font-medium ml-1">1 Frame</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── TAB 4: MODEL CONFIGURATION & TUNING ──                               */
/* ══════════════════════════════════════════════════════════════════════════ */
const ConfigDoc = () => (
  <div className="space-y-8 animate-in fade-in duration-300">
    <div className="space-y-2 border-b border-slate-200 pb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
        <Settings2 size={13} />
        <span>Pipeline Customization & Weights</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
        System Configuration & Model Tuning
      </h1>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        Fine-tune YOLO spatial weights, InfoGCN temporal frame presets, and per-action sensitivity thresholds to optimize inference accuracy for specific camera environments.
      </p>
    </div>

    {/* Section 1: YOLO Model Comparison */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            Preset A
          </span>
          <Cpu className="size-4 text-slate-400" />
        </div>
        <h3 className="text-base font-bold text-slate-900">
          YOLO Base Pose (COCO-Pose)
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed text-justify">
          Standard pre-trained YOLOv11-Pose weights optimized for horizontal, eye-level, and indoor camera angles.
          Best for standard security cameras, webcams, and ground-level monitoring where individuals occupy a large portion of the frame.
        </p>
      </div>

      <div className="p-6 rounded-2xl border border-blue-200 bg-blue-50/50 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold font-mono text-blue-700 bg-blue-200/60 px-2 py-0.5 rounded">
            Preset B (Recommended for Drones)
          </span>
          <Radio className="size-4 text-blue-600" />
        </div>
        <h3 className="text-base font-bold text-blue-950">
          YOLO Aerial Pose (VisDrone Fine-Tuned)
        </h3>
        <p className="text-xs text-blue-900 leading-relaxed text-justify">
          Fine-tuned specifically on high-altitude UAV datasets (VisDrone).
          Robust against extreme top-down angles, small human scale, motion blur, and perspective distortion typical in drone operations.
        </p>
      </div>
    </div>

    {/* Section 2: InfoGCN Temporal Depth Presets */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
          <Layers size={16} />
        </div>
        <h3 className="text-sm font-bold text-slate-900">
          InfoGCN Temporal Window Presets
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-900">Frame_16</span>
            <span className="text-[10px] font-mono text-slate-500">~0.5 sec</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Ultra-fast responsiveness with minimum frame latency. Ideal for rapid reaction detection.
          </p>
          <div className="text-[10px] font-mono text-purple-700 bg-purple-50 p-1.5 rounded">
            EMA α = 0.65
          </div>
        </div>

        <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-purple-950">Frame_32 (Balanced)</span>
            <span className="text-[10px] font-mono text-purple-700">~1.0 sec</span>
          </div>
          <p className="text-[11px] text-purple-900 leading-relaxed">
            Standard balance between temporal stability and response speed. Recommended default.
          </p>
          <div className="text-[10px] font-mono text-purple-800 bg-white p-1.5 rounded border border-purple-200">
            EMA α = 0.75
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-900">Frame_64</span>
            <span className="text-[10px] font-mono text-slate-500">~2.1 sec</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Maximum temporal context. Highest noise resistance against single-frame jitter.
          </p>
          <div className="text-[10px] font-mono text-purple-700 bg-purple-50 p-1.5 rounded">
            EMA α = 0.82
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════ */
/* ── TAB 5: BACKEND & API ARCHITECTURE ──                                 */
/* ══════════════════════════════════════════════════════════════════════════ */
const WebSocketDoc = () => (
  <div className="space-y-8 animate-in fade-in duration-300">
    <div className="space-y-2 border-b border-slate-200 pb-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
        <Server size={13} />
        <span>FastAPI & Real-Time Engine</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
        Backend & Communication Architecture
      </h1>
      <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
        The application is powered by a high-performance Python FastAPI backend (<code>websocket_api.py</code>) that bridges WebSocket streaming for live cameras with background asynchronous REST workers for video file processing.
      </p>
    </div>

    {/* Graphic: WebSocket Binary Protocol */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
          <Wifi size={16} />
        </div>
        <h3 className="text-sm font-bold text-slate-900">
          Real-Time WebSocket Binary Envelope Protocol
        </h3>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed text-justify">
        To minimize JSON string serialization overhead and achieve sub-35ms latencies, real-time responses over <code>/ws/action-recognition</code> utilize a custom binary packet layout:
      </p>

      {/* Packet Layout Diagram */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-3 shadow-2xs">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">
          Binary Response Structure (Endian: Big-Endian)
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-center">
          <div className="p-3 rounded-xl bg-blue-50/90 border border-blue-200 text-blue-950 shadow-2xs">
            <div className="text-[10px] text-blue-600 font-bold">Bytes 0–3 (4 Bytes)</div>
            <div className="font-bold mt-1 text-xs text-blue-900">JSON Length (N)</div>
          </div>
          <div className="p-3 rounded-xl bg-purple-50/90 border border-purple-200 text-purple-950 shadow-2xs">
            <div className="text-[10px] text-purple-600 font-bold">Bytes 4 → (4 + N)</div>
            <div className="font-bold mt-1 text-xs text-purple-900">Detections JSON Block</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 shadow-2xs">
            <div className="text-[10px] text-emerald-600 font-bold">Bytes (4 + N) → End</div>
            <div className="font-bold mt-1 text-xs text-emerald-900">Annotated JPEG Frame</div>
          </div>
        </div>
      </div>
    </div>

    {/* Section 2: REST Endpoints Table */}
    <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-emerald-600" />
          Primary REST API Endpoints
        </h3>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-700 font-mono">Method & Endpoint</th>
              <th className="px-4 py-3 font-bold text-slate-700">Protocol & Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[
              ["WS /ws/action-recognition", "Persistent two-way binary stream for camera frames & real-time inference."],
              ["POST /api/infer-video", "Uploads MP4/MOV and spawns background video processing worker. Returns job_id."],
              ["GET /api/infer-video/{id}/status", "Polls progress percent (0–100%), frame index, and annotated video URL."],
              ["GET /api/config", "Fetches current model parameters, thresholds, and temporal window sizes."],
              ["POST /api/config", "Hot-updates inference settings without server restart."],
              ["GET /api/history", "Lists all saved sessions with timestamp, alerts, and action summaries."],
              ["POST /api/history", "Persists completed video analysis and JSON metadata to local storage."],
            ].map(([endpoint, desc], idx) => (
              <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">{endpoint}</td>
                <td className="px-4 py-2.5 text-slate-600">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default HelpPage;
