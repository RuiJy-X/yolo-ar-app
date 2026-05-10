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
    <div className="flex items-center gap-3 ">
      <h1 className="text-4xl font-semibold text-slate-900">
        Real Time Inference
      </h1>
    </div>
    <p className="text-slate-900 tracking-tight leading-relaxed text-md m-8 text-justify">
      The Real-Time Inference page serves as the application's most dynamic
      module, providing immediate situational awareness by bridging your
      hardware's camera feed with a sophisticated two-stage AI pipeline. Upon
      entering the page, the operational workflow begins with Initialization,
      where you must verify and save your model settings in the Configuration
      Panel to ensure the AI uses the correct weights such as the Aerial Model
      for UAV perspectives or the Base Model for general detection before the
      stream begins. Once you click Start Camera, the application activates a
      Live Visualization overlay, rendering color-coded skeletal structures over
      detected individuals to confirm that joints are being tracked accurately
      in real-time. As the system processes the incoming video, per-frame
      results stream into the Inference Logs on the right, detailing specific
      action labels and mathematical confidence scores. A critical safety
      feature of this module is the Waving Alert System, which acts as a
      Distress Signal Protocol; it monitors for "Waving" actions and triggers a
      high-visibility alert if the movement is sustained for 32 consecutive
      frames (approximately 1 second). To ensure no data is lost, the
      application utilizes an Auto-Archiving feature: when the camera is
      stopped, the entire recording and its corresponding inference data are
      automatically packaged and saved to your Home Dashboard, allowing you to
      revisit the session later in the Library for a detailed post-incident
      review.
    </p>
    <br />

    <div className="space-y-6">
      <div className="flex gap-4 p-5 border-l-4 border-orange-500 bg-orange-50/50">
        <ShieldAlert className="text-orange-600 shrink-0" />
        <div>
          <h4 className="font-bold">Waving Alert Protocol</h4>
          <p className="text-sm text-slate-700">
            The system monitors for SOS or distress signals. If a "Waving"
            action is sustained for{" "}
            <strong>32 consecutive frames (WAVE_THRESHOLD = 32)</strong>, a
            visual alert is triggered in the interface.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="p-6 border rounded-xl">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <BarChart3 className="size-5 text-orange-500" /> Operational
            Workflow
          </h3>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-2">
              <strong>1. Preparation:</strong> Configure and save your model
              settings via the Config panel within the page.
            </li>
            <li className="flex gap-2">
              <strong>2. Execution:</strong> Start the camera stream; the
              backend performs inference on the incoming frames.
            </li>
            <li className="flex gap-2">
              <strong>3. Monitoring:</strong> View per-frame logs on the right
              sidebar detailing action labels and confidence levels.
            </li>
            <li className="flex gap-2">
              <strong>4. Finalization:</strong> Upon stopping the camera, the
              recorded footage and inference results are automatically archived
              to the Home page.
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

/* --- Component: Library Documentation --- */
const LibraryDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 ">
      <h1 className="text-4xl font-semibold text-slate-900">Video Library</h1>
    </div>
    <p className="text-slate-900 tracking-tight leading-relaxed text-md m-8 text-justify">
      The Video Library page is a sophisticated analysis environment designed
      for the detailed review and processing of recorded footage. This module
      allows users to upload video files in MP4 or MOV formats and initiate the
      inference process to extract precise action data using the system’s
      dual-stage AI models. The interface is divided into four primary
      functional areas: the Model Configuration panel for setting detection
      parameters, the Video Panel for visual playback, the Logs Panel on the
      right, and the Dynamic Timeline at the base. Once a video is processed,
      the Logs Panel provides an organized summary of detections through
      interactive accordions, including a dedicated section for alerts. Each
      entry within these accordions details the specific time of detection, the
      average confidence score, and the total frame duration of the action;
      clicking on any entry instantly synchronizes the video player to that
      exact moment for verification.
      <br />
      <br />
      Navigational precision is further enhanced by the Timeline Footer, which
      serves as a visual map of all detected activities. The timeline features
      color-coded action tags that allow you to jump to specific events with a
      single click. To facilitate micro-analysis, the timeline includes a Zoom
      tool that stretches the frame view, making even the shortest bursts of
      movement easy to identify and select. Additionally, the Stack/Layer Toggle
      offers two viewing modes: a consolidated "Stacked" view for a high-level
      overview or a "Layered" view that separates the four action categories
      into distinct horizontal tracks. Users can also utilize the Action Filter
      to declutter the timeline by toggling the visibility of specific labels.
      After completing an analysis, the library provides flexible output
      options, enabling you to download the processed video, upload a new file,
      or save the results directly to your Home Dashboard for long-term
      archival.
    </p>
    <br />

    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2">Intelligent Logs</h4>
          <p className="text-xs text-slate-600">
            Logs are grouped into action accordions. Each entry lists the start
            time, average confidence, and total frame count.{" "}
            <strong>Clicking an entry</strong> instantly seeks the video to that
            moment.
          </p>
        </div>
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2">Dynamic Timeline</h4>
          <p className="text-xs text-slate-600">
            Visualize action occurrences over time. Use the{" "}
            <strong>Zoom</strong> tool for micro-analysis or the{" "}
            <strong>Stack/Layer</strong> toggle to visualize multiple action
            tracks simultaneously.
          </p>
        </div>
      </div>
    </div>
  </div>
);

/* --- Component: Config Documentation --- */
const ConfigDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 ">
      <h1 className="text-4xl font-semibold text-slate-900">
        System Configuration
      </h1>
    </div>
    <p className="text-slate-900 tracking-tight leading-relaxed text-md m-8 text-justify">
      The System Configuration section serves as the technical brain of the
      application, providing granular control over the two-stage AI pipeline to
      ensure the model performs optimally for your specific environment. Within
      this module, you can manage the YOLO Model Selection, choosing between the
      Base Model (pre-trained on the COCO-Pose dataset for general human
      detection) and the specialized Aerial Model, which has been fine-tuned
      using the VisDrone dataset specifically for UAV-mounted cameras and
      high-altitude perspectives. For action classification, the InfoGCN Model
      can be toggled between three temporal window settings—16, 32, or 64
      frames—allowing you to prioritize either rapid detection speed or higher
      accuracy for complex movements. Furthermore, the Checkpoint selector
      enables you to switch between different training folds to find the most
      stable performance for your use case.
      <br />
      <br />
      Precision tuning is managed through the Threshold Settings, where you can
      adjust the sensitivity of the action classifier to prevent false positives
      or capture subtle movements. Users can choose between a Global Confidence
      Threshold for uniform detection or a Per-Action Threshold, which allows
      for customized sensitivity levels; for instance, you might set a higher
      sensitivity for critical actions like "Falling" while maintaining a
      stricter threshold for "Waving." Once adjustments are finalized, clicking
      Save on the top right persists these settings across the entire platform,
      ensuring that whether you are analyzing a video in the Library or
      streaming live in the Real-Time module, the AI operates with your exact
      performance specifications.
    </p>
    <br />

    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Cpu className="size-4 text-emerald-500" /> YOLO Model Types
          </h3>
          <div className="p-4 bg-white border rounded-lg space-y-3">
            <div>
              <span className="text-xs font-bold text-foreground uppercase">
                Base Model
              </span>
              <p className="text-sm text-slate-600">
                Ultralytics COCO-Pose model. Standard for general human
                detection.
              </p>
            </div>
            <div className="pt-2 border-t">
              <span className="text-xs font-bold text-primary uppercase">
                Aerial Model
              </span>
              <p className="text-sm text-slate-600">
                Fine-tuned on the VisDrone dataset. Optimized for UAV and
                high-altitude perspectives.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Layers className="size-4 text-emerald-500" /> InfoGCN Configuration
          </h3>
          <div className="p-4 bg-white border rounded-lg">
            <p className="text-sm text-slate-600 mb-2">
              Temporal windows for action recognition:
            </p>
            <div className="flex flex-1 gap-2 my-5 items-center w-full justify-around">
              <span className="flex-1 px-2 py-1 bg-primary rounded text-lg text-white text-center">
                16 Frames
              </span>
              <span className="flex-1 px-2 py-1 bg-primary rounded text-lg text-white text-center ">
                32 Frames
              </span>
              <span className="flex-1 px-2 py-1 bg-primary rounded text-lg text-white text-center">
                64 Frames
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-xl">
        <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
          <Info className="size-4" /> Threshold Tuning
        </h3>
        <p className="text-sm text-emerald-800 leading-relaxed">
          The threshold dictates the sensitivity of the action classifier.
          <strong> Global Confidence</strong> applies a flat requirement across
          all actions, while
          <strong> Per-Action Threshold</strong> allows you to make specific
          detections (like "Falling") more sensitive than others.
          <em>
            {" "}
            Remember to click Save to apply changes to both Real-Time and
            Library modules.
          </em>
        </p>
      </div>
    </div>
  </div>
);

export default HelpPage;