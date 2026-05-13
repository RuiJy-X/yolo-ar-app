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
  Wifi,
  ArrowRightLeft,
  PackageOpen,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "home" | "realtime" | "library" | "config" | "websocket";

const HelpPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const sidebarItems = [
    { id: "home", label: "Home Dashboard", icon: Home },
    { id: "realtime", label: "Real-Time Inference", icon: Camera },
    { id: "library", label: "Video Library", icon: PlayCircle },
    { id: "config", label: "System Configuration", icon: Settings2 },
    { id: "websocket", label: "Backend & API", icon: Wifi },
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
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <item.icon
                className={cn(
                  "size-5",
                  activeTab === item.id ? "text-blue-600" : "text-slate-400",
                )}
              />
              {item.label}
              {activeTab === item.id && (
                <ChevronRight className="ml-auto size-4" />
              )}
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
            {activeTab === "websocket" && <WebSocketDoc />}
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
      The Home Page serves as the primary gateway and administrative hub of the
      application, designed to organize and manage your historical video data.
      This page maintains a comprehensive record of all past sessions, where
      analyzed videos are stored alongside their respective inference logs and
      summaries. To facilitate efficient data retrieval, the interface includes
      a robust Date Filter, allowing you to isolate recordings from specific
      mission dates or events. From this dashboard, you can interact with your
      data in several ways: you can open any entry directly in the Library View
      to perform a deep-dive analysis of detected actions, or perform workspace
      maintenance by deleting individual records or clearing the entire history.
      Positioned prominently at the top of the page are two primary navigation
      buttons, providing immediate access to the Library for new video uploads
      or the Real-Time module for live camera monitoring.
    </p>
    <br />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 border border-black/40 rounded-xl bg-slate-50">
        <div className="flex gap-2">
          <Database className="text-blue-500 mb-3" />
          <h3 className="font-semibold mb-2">Data Management</h3>
        </div>
        <p className="text-sm text-slate-900">
          Review all stored video sessions alongside their generated summaries.
          You can open specific entries for deep-dive analysis or perform
          maintenance by deleting individual or bulk items.
        </p>
      </div>
      <div className="p-6 border border-black/40 rounded-xl bg-slate-50">
        <div className="flex gap-2">
          <History className="text-blue-500 mb-3" />
          <h3 className="font-semibold mb-2">Historical Filters</h3>
        </div>
        <p className="text-sm text-slate-900">
          Locate specific recording sessions using the date filter. This is
          essential for auditing actions recorded across different mission
          dates.
        </p>
      </div>
    </div>
    <div></div>
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

/* --- Component: WebSocket & Backend API Documentation --- */
const WebSocketDoc = () => (
  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3">
      <h1 className="text-4xl font-semibold text-slate-900">
        Backend &amp; API Architecture
      </h1>
    </div>
    <p className="text-slate-900 tracking-tight leading-relaxed text-md m-8 text-justify">
      The backend is a FastAPI server (<code>websocket_api.py</code>) that runs
      locally alongside the frontend. It owns the AI models, manages all
      inference work, and exposes its capabilities through two complementary
      communication channels: a persistent WebSocket connection for real-time
      frame-by-frame analysis, and a conventional HTTP REST API for everything
      else — uploading videos, polling job progress, managing history, and
      adjusting configuration. On startup, the server initializes the full{" "}
      <strong>ActionRecognitionPipeline</strong>, which loads both the YOLO
      pose-detection model and the InfoGCN action-classification model into
      memory (on GPU if available, otherwise CPU) so they are ready to serve
      requests immediately.
    </p>

    <br />

    {/* Section 1: WebSocket */}
    <div className="space-y-4 mb-10">
      <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <Wifi className="size-6 text-blue-500" /> Real-Time WebSocket Channel
      </h2>
      <p className="text-slate-700 leading-relaxed text-justify">
        The Real-Time Inference page communicates with the backend exclusively
        over a WebSocket connection established at{" "}
        <code className="bg-black px-1 rounded">
          ws://…/ws/action-recognition
        </code>
        . Unlike a regular HTTP request that opens, sends data, and closes, a
        WebSocket keeps a single persistent two-way tunnel open for the entire
        duration of the camera session. This means the frontend can push camera
        frames to the server continuously and receive annotated responses back
        without the overhead of repeatedly opening new connections.
      </p>
      <p className="text-slate-700 leading-relaxed text-justify">
        Each frame captured from the browser's camera is sent to the server
        either as raw binary JPEG bytes or as a JSON text message containing a
        Base64-encoded image (
        <code>{`{"type":"frame","image":"<base64>"}`}</code>). The server also
        accepts a lightweight <code>{`{"type":"ping"}`}</code> message to keep
        the connection alive during idle moments, responding with a
        corresponding <code>{`{"type":"pong"}`}</code>. An optional{" "}
        <code>?quality=72</code> query parameter on the connection URL lets the
        frontend control the JPEG compression level of annotated frames sent
        back, balancing image fidelity against bandwidth.
      </p>

      <div className="p-5 border-l-4 border-blue-500 bg-blue-50/50 space-y-2">
        <h4 className="font-bold text-blue-900 flex items-center gap-2">
          <ArrowRightLeft className="size-4" /> Per-Frame Inference Flow
        </h4>
        <p className="text-sm text-slate-700 leading-relaxed">
          Once a frame arrives, the backend runs it through the two-stage
          pipeline synchronously in a background thread so the async server loop
          is never blocked. First, the YOLO pose model detects every visible
          person and extracts 17 body keypoints in COCO format. Those 17
          keypoints are then remapped to the 12-joint skeleton format (
          <strong>BODY12</strong>) that the InfoGCN model was trained on. Each
          detected person is assigned a persistent <strong>track ID</strong>{" "}
          using Intersection-over-Union (IoU) bounding-box matching across
          frames, so the same individual keeps the same ID even as they move
          around the scene.
        </p>
        <p className="text-sm text-slate-700 leading-relaxed">
          For each tracked person, their keypoints are appended to a rolling
          sliding window (16, 32, or 64 frames depending on the active model
          preset). The InfoGCN model reads this entire window on every inference
          stride and outputs a probability distribution across the four action
          classes: <strong>sitting</strong>, <strong>standing</strong>,{" "}
          <strong>waving</strong>, and <strong>walking</strong>. To reduce
          jitter between frames, the raw probabilities are smoothed using an
          exponential moving average (EMA) before the highest-scoring class is
          selected as the final prediction. If the winning confidence is below
          the configured threshold, the label is reported as "Unknown" rather
          than making a low-quality guess.
        </p>
        <p className="text-sm text-slate-700 leading-relaxed">
          After inference, the server draws color-coded bounding boxes, skeletal
          overlays, and label captions directly onto the frame using OpenCV. The
          annotated image is then JPEG-encoded and packed into a binary
          response: a 4-byte big-endian header carries the byte-length of a JSON
          metadata block, followed by the JSON itself (containing person IDs,
          action labels, confidence scores, bounding boxes, and per-joint
          keypoint coordinates), and finally the raw JPEG bytes of the annotated
          frame. The frontend unpacks this binary envelope, displays the
          annotated image in the video canvas, and routes the JSON metadata to
          the inference log panel.
        </p>
      </div>
    </div>

    {/* Section 2: Video Inference REST */}
    <div className="space-y-4 mb-10">
      <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <Film className="size-6 text-purple-500" /> Video Inference via HTTP
        (Library Mode)
      </h2>
      <p className="text-slate-700 leading-relaxed text-justify">
        When processing a pre-recorded video in the Library, the frontend uses
        standard HTTP rather than a WebSocket. The workflow is deliberately
        asynchronous: the video file is first uploaded to{" "}
        <code className="bg-black px-1 rounded">POST /api/infer-video</code>,
        which immediately returns a unique <strong>job ID</strong> and queues
        the work in a background thread. The frontend then polls{" "}
        <code className="bg-black px-1 rounded">
          GET /api/infer-video/{"{job_id}"}/status
        </code>{" "}
        at regular intervals to track progress, receiving incremental updates
        such as the current frame index, total frame count, and a human-readable
        phase message like "Running pose + action inference…". This
        polling-based design keeps the UI responsive and the progress bar
        accurate without tying up a WebSocket for what may be a minutes-long
        operation.
      </p>
      <p className="text-slate-700 leading-relaxed text-justify">
        Internally the video pipeline runs two parallel background threads: one
        thread reads and decodes frames from the uploaded file, and a second
        thread immediately consumes those decoded frames to run YOLO detection
        and InfoGCN inference. The same track-ID assignment and EMA smoothing
        logic used in real-time mode is applied here, but with slightly more
        permissive confidence thresholds to accommodate the wider variety of
        camera angles found in recorded footage. Annotated frames are written to
        an output video file as they are produced. Once the job completes, the
        output video is transcoded to a browser-compatible H.264 MP4 (using
        FFmpeg if available, falling back to an OpenCV writer), and the status
        payload is updated with download and streaming URLs that the frontend
        can present directly in the video player.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <PackageOpen className="size-4 text-purple-500" /> Job Status Fields
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Each status response includes <strong>status</strong> (queued /
            processing / completed / failed), <strong>progress_percent</strong>{" "}
            (0–100), <strong>progress_message</strong> (a plain-English phase
            description), <strong>frame_index</strong>, and{" "}
            <strong>total_frames</strong>. On completion it also contains a{" "}
            <strong>result</strong> object with the annotated video URL,
            download URL, source preview URL, and full analysis summary.
          </p>
        </div>
        <div className="p-4 border rounded-lg shadow-sm">
          <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Database className="size-4 text-purple-500" /> Analysis Summary
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            After all frames are processed, the backend automatically computes a{" "}
            <strong>grouped_detections</strong> map (detections organized by
            action label), an <strong>action_confidence_scores</strong> dict,
            summary metrics (YOLO precision/recall, InfoGCN accuracy, mAP), and
            an <strong>alert_events</strong> list marking any sustained waving
            sequences that crossed the distress threshold.
          </p>
        </div>
      </div>
    </div>

    {/* Section 3: REST API Reference */}
    <div className="space-y-4 mb-10">
      <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <ArrowRightLeft className="size-6 text-emerald-500" /> REST API
        Reference
      </h2>
      <p className="text-slate-700 leading-relaxed text-justify">
        Beyond the WebSocket and video-inference endpoints, the backend exposes
        a set of REST endpoints that the frontend calls for configuration and
        data management. These calls are ordinary fetch/JSON requests and
        require no persistent connection.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">
                Method &amp; Path
              </th>
              <th className="px-4 py-3 font-semibold text-slate-700">
                Purpose
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[
              [
                "GET /health",
                "Confirms the server is running and returns the active device (CPU/GPU) and loaded model name.",
              ],
              [
                "GET /api/config",
                "Returns all current pipeline settings: window size, EMA alpha, YOLO model choice, confidence thresholds, and the full list of available actions.",
              ],
              [
                "POST /api/config",
                "Applies updated settings to the live pipeline. Changes take effect immediately for both real-time and library inference without restarting.",
              ],
              [
                "GET /api/models",
                "Lists all InfoGCN checkpoint files found in the results/ directory alongside the currently active model name.",
              ],
              [
                "POST /api/models/active",
                "Hot-swaps the active InfoGCN model. The server applies the matching frame-window preset (16/32/64) before loading the new weights so inference remains consistent.",
              ],
              [
                "POST /api/infer-video",
                "Accepts an uploaded video file and starts a background inference job. Returns a job_id immediately.",
              ],
              [
                "GET /api/infer-video/{job_id}/status",
                "Polls the progress of a running video job. Returns status, percent complete, current frame, and — when done — result URLs.",
              ],
              [
                "POST /analyze-video",
                "Accepts a pre-built detections log and summary metrics and returns a structured analysis response (grouped detections, alert events, confidence scores).",
              ],
              [
                "GET /api/history",
                "Returns a list of all saved history entries sorted by creation date (newest first).",
              ],
              [
                "POST /api/history",
                "Saves a completed analysis — copying the annotated video and source preview into a permanent history directory with associated metadata and analysis JSON.",
              ],
              [
                "GET /api/history/{entry_id}",
                "Returns full detail for a single history entry including the complete analysis JSON.",
              ],
              [
                "DELETE /api/history/{entry_id}",
                "Permanently deletes a single history entry and its associated files.",
              ],
              ["DELETE /api/history", "Clears all history entries at once."],
            ].map(([method, desc]) => (
              <tr key={method} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs text-blue-700 whitespace-nowrap align-top">
                  {method}
                </td>
                <td className="px-4 py-3 text-slate-600 align-top">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Section 4: Model presets */}
    <div className="space-y-4 mb-4">
      <h2 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
        <Layers className="size-6 text-orange-500" /> Frame-Window Presets &amp;
        EMA Smoothing
      </h2>
      <p className="text-slate-700 leading-relaxed text-justify">
        The backend ships with three named presets — Frame_16, Frame_32, and
        Frame_64 — that control the temporal depth of every inference pass.
        Selecting a preset via the model selector does more than just swap
        weights: it simultaneously updates the sliding-window size, the minimum
        number of frames required before a prediction is attempted, the
        inference stride (how often the model runs relative to the frame rate),
        the EMA smoothing alpha, and both the real-time and video YOLO
        confidence thresholds. All these values are applied atomically to the
        live pipeline before the new model weights are loaded, ensuring the
        checkpoint's training configuration and the runtime configuration always
        stay in sync.
      </p>
      <p className="text-slate-700 leading-relaxed text-justify">
        The EMA alpha value deserves special mention because it directly shapes
        how "sticky" the displayed action label feels to the end user. A higher
        alpha (like Frame_64's 0.82) gives more weight to the historical
        average, producing very stable labels that resist single-frame noise at
        the cost of slightly slower reaction to a genuine action change. A lower
        alpha (Frame_16's 0.65) reacts more quickly to new detections but may
        flicker more noticeably between classes. Tuning this alongside the
        action confidence threshold gives operators precise control over the
        trade-off between responsiveness and stability for their specific
        operational environment.
      </p>

      <div className="p-5 bg-orange-50 border border-orange-100 rounded-xl">
        <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
          <Info className="size-4" /> Track Identity &amp; Missed-Frame
          Tolerance
        </h4>
        <p className="text-sm text-orange-800 leading-relaxed">
          Each detected person is tracked across frames using IoU bounding-box
          matching. If a person temporarily disappears from the frame — due to
          occlusion, motion blur, or a low-confidence detection — the track is
          kept alive for up to <strong>15 frames</strong> in real-time mode and{" "}
          <strong>24 frames</strong> in video mode before being discarded. This
          tolerance prevents spurious track splits when someone briefly passes
          behind an obstacle, ensuring that action labels accumulated before the
          disappearance are not thrown away and the track ID remains consistent
          when the person reappears.
        </p>
      </div>
    </div>
  </div>
);

export default HelpPage;
