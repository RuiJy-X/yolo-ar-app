# Skysight — product and brand study

## UI fidelity revision

The revised MP4 replaces all canvas-drawn app screens with direct recordings of the unmodified React application at a native 1440 × 810 viewport. The presentation still exports at 1920 × 1080 with camera moves. No controls, icons, typography, action colors, log layouts, charts, spacing, or drone panels are redrawn. The actual Logs cards, layered timeline, frame inspector, Person and Overview panes, Save Project dialog, webcam UI, and Tello telemetry / Flight Deck appear as rendered by the app.

The recorded analysis uses saved session `038728dc07d4459e824121ce30ae65c6`. Its actual video and detection JSON supply the footage and analysis. The live section replays the same session through the real webcam and Tello components, with demonstration flight telemetry, and is labeled “Recorded feed replay.” All API and WebSocket calls are intercepted in the capture browser. The actual source and saved sessions remain unchanged. The earlier illustration and blue-only simplification described below have been superseded by this revision.

60 seconds · 1920 × 1080 · 16:9 · 30 fps review copy · synthesized music at 104 BPM.

The central message: turn recorded footage into actions you can inspect, with live camera and drone monitoring in the same application. Recorded analysis receives the most screen time, with particular emphasis on logs and the timeline, as requested.

## Brand sources

- `src/assets/skysightlogo.png`: supplied transparent blue drone emblem with red rotors and medical cross. Preserve its colors and proportions.
- `src/assets/skysightbrand.png`: supplied SKY SIGHT wordmark, deep blue letters and red overhead stroke. Preserve unchanged.
- `src/index.css`: interface primary `#0052FF`, deep `#0041CC`, soft `#5D85FF`; canvas `#F8FBFF`, soft canvas `#EDF4FF`; ink `#171717`; hairline `#D9E3F2`. Inter Variable is the app font.
- Asset pixels differ from the interface palette: emblem blue is approximately `#005B92`, wordmark approximately `#004679`, red approximately `#E3232E`. Use the original images, not recolored substitutes. The interface blue is the single motion accent; the supplied logo retains its red.

## Product evidence

- `package.json`: offline action recognition desktop application.
- `src/components/navbar.tsx`: Home, Library, Realtime, Settings, Help; Realtime modes Webcam and Drone View.
- `src/pages/Library.tsx`: video left, analysis/logs right, timeline below.
- `src/pages/library/video-panel.tsx`: Video Analysis; Upload Video, Analyze, Re-analyze, Download, Save; raw/annotated views.
- `src/components/Logs.tsx`: Logs, Frame, Person, Overview; per-person episodes and whole-video distribution.
- `src/pages/library/timeline-footer.tsx`: playback, zoom, layers, action filtering, scrubbing, click-to-seek action segments.
- `src/pages/library/person-detail-dialog.tsx`: Person details, Top Action, Confidence, Action Probabilities.
- `src/pages/library/action-colors.ts`: Standing, Walking, Sitting, Waving. The animation simplifies chart colors to tints of interface blue to retain one motion accent.
- `src/pages/RealTime.tsx` and `src/components/RealTimeLogs.tsx`: inference logs, live camera, drone stream, saved sessions, Waving Alert Detected.
- `src/components/tello-drone-panel.tsx`: Tello stream and connection UI.
- Existing graphify graph queried with source vocabulary: skysight, logo, upload, recognition, timeline, person, realtime, tello. Current source verified the presentation details.

No performance, accuracy, rescue outcome, customer, or adoption claims. No invented public URL or offer. The closing descriptor is factual product copy, not an attributed official slogan.

## Script / beat sheet

| Time | Exact text or interface moment | Sound |
|---|---|---|
| 0–1.8 | Introducing | warm piano onset |
| 1.8–5 | Original emblem and wordmark on pale blue silk | soft chord bloom |
| 5–8 | Understand the action in every frame. | gentle push whoosh |
| 8–11 | Video Analysis → Upload Video → courtyard.mp4 → Analyze | cursor clicks |
| 11–14 | Analysis progress, then annotated illustrative footage | soft processing ticks |
| 14–19 | Camera glides to Logs; person/action/timestamp rows populate; pulls back to app | completed-row ticks |
| 19–22 | Find the moment. Follow the person. | gentle push whoosh |
| 22–27 | Timeline action segments reveal; cursor scrubs and selects Waving | soft click |
| 27–32 | Person #02 selected; camera rides to Person pane with action history and probability bars | soft click, reveal tick |
| 32–36 | Pull back to full analysis screen; Save becomes Saved | soft confirmation |
| 36–40 | See it live. Stay aware. | music lift |
| 40–44 | Realtime → Webcam, live illustrative frame and Inference Logs | quiet live ticks |
| 44–48 | Realtime menu → Drone View; Tello stream and logs | soft cursor clicks |
| 48–52 | Waving Alert Detected; camera glides across alert and matching log | gentle double chime |
| 52–57 | From footage to insight. | warm sustained resolve |
| 57–60 | Original emblem + wordmark. Offline action recognition. | final chime |

## Review notes

The UI is rebuilt as vector artwork based on the source, simplified and enlarged for video. The courtyard and people are animated illustrations, not captured inference. A visible “Illustrative demo” label accompanies UI footage. File names, person IDs, times, log entries, and relative bars are sample content. Analysis progress is an illustrative UI event, not a speed claim. Live scenes depict supported modes without connecting to a camera or commanding a drone.

Deliver the review MP4, silent MP4, self-contained HTML, contact sheet, and source/renderer. After review, render the approved motion-blurred master at 60 fps / four subframes. Alternative direction: a more field-focused version that opens on the drone feed, then follows a waving event into recorded analysis.
