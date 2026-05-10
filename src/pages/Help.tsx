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
  History,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "home" | "realtime" | "library" | "config";

const HelpPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const sidebarItems = [
    { id: "home", label: "Home Dashboard", icon: Home },
    { id: "realtime", label: "Real-Time Inference", icon: Camera },
    { id: "library", label: "Video Library", icon: PlayCircle },
    { id: "config", label: "System Configuration", icon: Settings2 },
  ];

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-64px)]  overflow-hidden bg-slate-50 w-full h-full">
        {/* Navigation Sidebar */}
        <div className="w-72 border-r border-r-slate-300 bg-white p-4 space-y-2 flex-shrink-0">
          <div className="px-4 py-2 text-xs font-semibold text-foreground/80 uppercase font-heading">
            Documentation
          </div>
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as TabId)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ",
                activeTab === item.id
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <item.icon className={cn("size-5", activeTab === item.id ? "text-blue-600" : "text-slate-400")} />
              {item.label}
              {activeTab === item.id && <ChevronRight className="ml-auto size-4" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-8 py-6 bg-white">
          <div className=" mx-auto space-y-10">
            {activeTab === "home" && <HomeDoc />}
            {activeTab === "realtime" && <RealTimeDoc />}
            {activeTab === "library" && <LibraryDoc />}
            {activeTab === "config" && <ConfigDoc />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

/* --- Component: Home Documentation --- */
const HomeDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 ">
      <h1 className="text-4xl font-semibold text-slate-900">Home Dashboard</h1>
    </div>
    <p className="text-slate-900 tracking-tight leading-relaxed text-md m-8 text-justify">
      The Home Page serves as the primary gateway and administrative hub of the application, designed to organize and manage your historical video data. This page maintains a comprehensive record of all past sessions, where analyzed videos are stored alongside their respective inference logs and summaries. To facilitate efficient data retrieval, the interface includes a robust Date Filter, allowing you to isolate recordings from specific mission dates or events. From this dashboard, you can interact with your data in several ways: you can open any entry directly in the Library View to perform a deep-dive analysis of detected actions, or perform workspace maintenance by deleting individual records or clearing the entire history. Positioned prominently at the top of the page are two primary navigation buttons, providing immediate access to the Library for new video uploads or the Real-Time module for live camera monitoring.
    </p>
        <br />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 border border-black/40 rounded-xl bg-slate-50">
        <div className="flex gap-2">
            <Database className="text-blue-500 mb-3" />
            <h3 className="font-semibold mb-2">Data Management</h3>
        </div>
        <p className="text-sm text-slate-900">Review all stored video sessions alongside their generated summaries. You can open specific entries for deep-dive analysis or perform maintenance by deleting individual or bulk items.</p>
      </div>
      <div className="p-6 border border-black/40 rounded-xl bg-slate-50">
        <div className="flex gap-2">
            <History className="text-blue-500 mb-3" />
            <h3 className="font-semibold mb-2">Historical Filters</h3>
        </div>
        <p className="text-sm text-slate-900">Locate specific recording sessions using the date filter. This is essential for auditing actions recorded across different mission dates.</p>
      </div>
    </div>
    <div>
        
    </div>
  </div>
);

/* --- Component: Real-Time Documentation --- */
const RealTimeDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-orange-100 p-3 rounded-2xl"><Camera className="text-orange-600 size-8" /></div>
      <h1 className="text-3xl font-bold text-slate-900">Real-Time Inference</h1>
    </div>
    <p className="text-slate-600 leading-relaxed text-lg mb-8">
      Leverage live camera streams for immediate action detection. This module bridges the gap between raw video capture and instant AI interpretation.
    </p>

    <div className="space-y-6">
      <div className="flex gap-4 p-5 border-l-4 border-orange-500 bg-orange-50/50">
        <ShieldAlert className="text-orange-600 shrink-0" />
        <div>
          <h4 className="font-bold">Waving Alert Protocol</h4>
          <p className="text-sm text-slate-700">The system monitors for SOS or distress signals. If a "Waving" action is sustained for <strong>64 consecutive frames</strong>, a visual alert is triggered in the interface.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-6 border rounded-xl">
          <h3 className="font-bold mb-3 flex items-center gap-2"><BarChart3 className="size-5 text-orange-500" /> Operational Workflow</h3>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-2"><strong>1. Preparation:</strong> Configure and save your model settings via the Config panel within the page.</li>
            <li className="flex gap-2"><strong>2. Execution:</strong> Start the camera stream; the backend performs inference on the incoming frames.</li>
            <li className="flex gap-2"><strong>3. Monitoring:</strong> View per-frame logs on the right sidebar detailing action labels and confidence levels.</li>
            <li className="flex gap-2"><strong>4. Finalization:</strong> Upon stopping the camera, the recorded footage and inference results are automatically archived to the Home page.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

/* --- Component: Library Documentation --- */
const LibraryDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-purple-100 p-3 rounded-2xl"><PlayCircle className="text-purple-600 size-8" /></div>
      <h1 className="text-3xl font-bold text-slate-900">Video Library</h1>
    </div>
    <p className="text-slate-600 leading-relaxed mb-8">
      A sophisticated analysis suite designed for post-incident review and detailed video scrubbing.
    </p>

    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2">Intelligent Logs</h4>
          <p className="text-xs text-slate-600">Logs are grouped into action accordions. Each entry lists the start time, average confidence, and total frame count. <strong>Clicking an entry</strong> instantly seeks the video to that moment.</p>
        </div>
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2">Dynamic Timeline</h4>
          <p className="text-xs text-slate-600">Visualize action occurrences over time. Use the <strong>Zoom</strong> tool for micro-analysis or the <strong>Stack/Layer</strong> toggle to visualize multiple action tracks simultaneously.</p>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-6 rounded-2xl">
        <h3 className="text-sm font-semibold uppercase text-slate-400 mb-4 tracking-widest">Key Navigation Features</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="space-y-1"><div className="text-blue-400 font-bold">Zoom</div><div className="text-[10px]">Stretches frames</div></div>
          <div className="space-y-1"><div className="text-blue-400 font-bold">Next Frame</div><div className="text-[10px]">Precision seek</div></div>
          <div className="space-y-1"><div className="text-blue-400 font-bold">Layers</div><div className="text-[10px]">Split action tracks</div></div>
          <div className="space-y-1"><div className="text-blue-400 font-bold">Filters</div><div className="text-[10px]">Toggle visibility</div></div>
        </div>
      </div>
    </div>
  </div>
);

/* --- Component: Config Documentation --- */
const ConfigDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 mb-6">
      <div className="bg-emerald-100 p-3 rounded-2xl"><Settings2 className="text-emerald-600 size-8" /></div>
      <h1 className="text-3xl font-bold text-slate-900">System Configuration</h1>
    </div>
    
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h3 className="font-bold flex items-center gap-2"><Cpu className="size-4 text-emerald-500" /> YOLO Model Types</h3>
          <div className="p-4 bg-white border rounded-lg space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase">Base Model</span>
              <p className="text-sm text-slate-600">Ultralytics COCO-Pose model. Standard for general human detection.</p>
            </div>
            <div className="pt-2 border-t">
              <span className="text-xs font-bold text-emerald-600 uppercase">Aerial Model</span>
              <p className="text-sm text-slate-600">Fine-tuned on the VisDrone dataset. Optimized for UAV and high-altitude perspectives.</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold flex items-center gap-2"><Layers className="size-4 text-emerald-500" /> InfoGCN Configuration</h3>
          <div className="p-4 bg-white border rounded-lg">
            <p className="text-sm text-slate-600 mb-2">Select the temporal window for action recognition:</p>
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-100 rounded text-xs">16 Frames</span>
              <span className="px-2 py-1 bg-slate-100 rounded text-xs">32 Frames</span>
              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">64 Frames</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Checkpoint selection allows switching between different training folds.</p>
          </div>
        </section>
      </div>

      <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-xl">
        <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2"><Info className="size-4" /> Threshold Tuning</h3>
        <p className="text-sm text-emerald-800 leading-relaxed">
          The threshold dictates the sensitivity of the action classifier. 
          <strong> Global Confidence</strong> applies a flat requirement across all actions, while 
          <strong> Per-Action Threshold</strong> allows you to make specific detections (like "Falling") more sensitive than others. 
          <em> Remember to click Save to apply changes to both Real-Time and Library modules.</em>
        </p>
      </div>
    </div>
  </div>
);

export default HelpPage;