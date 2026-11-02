# Skysight product explainer

**UI revision:** `demo.html` now embeds direct recordings of the unmodified application. The original canvas-drawn UI has been replaced. Actual app fonts, action colors, icons, log cards, layered timeline, frame details, Person and Overview tabs, Save Project dialog, webcam controls, and Tello HUD / Flight Deck are preserved. `skysight-actual-ui.mp4` is the revised export; `skysight-review.mp4` is updated to the same revision after validation.

- `skysight-review.mp4`: 60-second 1920 × 1080, 30 fps review copy with original synthesized music and small sound effects.
- `skysight-review_silent.mp4`: matching silent copy.
- `demo.html`: self-contained, offline HTML with the original logos and embedded Inter font. Open it in a browser, press Play, or scrub the timeline.
- `check.png`: visual contact sheet.
- `BRIEF.md`: brand study, source references, complete timed script, and illustrative-content notes.
- `qa.json`: browser, font, seeking, and preview checks.
- `demo.template.html`, `build.py`, `render.mjs`: editable source and renderer.

The largest portion of the demo is recorded-video analysis, especially logs, action timeline selection, and person details. Webcam and Tello Drone View are both featured. The source is the real saved session `038728dc07d4459e824121ce30ae65c6`, including its video, keypoints, probabilities, and detection results. Live views replay those recorded results through the real components; flight telemetry is sample data. The output labels this section “Recorded feed replay.” No physical camera or drone was accessed and no saved analysis was overwritten.

`actual-ui/capture-evidence.json` records native app screen text, the capture viewport, routes intercepted in the capture browser, and browser errors. `actual-ui/*.png` are unmodified app screenshots. `capture-app.mjs` and `app-transport.mjs` reproduce the captures against Vite at `http://127.0.0.1:5174`. `build-actual-ui.py` embeds the recordings into the self-contained HTML. It retains the title, branding, and music from `demo.template.html` and strips that template's canvas-drawn UI entirely.

## Rebuild and render

From this folder:

```powershell
python build.py
npm install
# If using an existing Chromium installation, set its executable:
$env:CHROMIUM_PATH = 'C:\Users\User\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe'
# Otherwise: npx playwright install chromium
node verify.mjs
node render.mjs demo.html check.png --stills 0.8,3.2,6.7,8.8,10.7,12.5,15.4,18.1,20.8,23.0,24.5,26.4,29.6,33.9,35.1,38.2,41.5,44.7,46.3,49.8,55.3,58.8
node render.mjs demo.html skysight-review.mp4 30 1 4
```

`ffmpeg` must be on PATH. `build.py` embeds assets from this repository and reconstructs the renderer from the installed explainer-default skill. No dependency or application-source changes are needed in the main project.

After the review changes are settled, render the 60 fps master with four motion-blur subframes:

```powershell
node render.mjs demo.html skysight-final.mp4 60 4 8
```

The preview audio is generated once per browser session; its first Play can take a moment. The renderer waits for both logos and the font to load. Seeking is independent of previous times. QA permits at most one 8-bit channel level of Chromium hairline antialiasing variation; timing, geometry, text, and color changes fail that check.

Alternative direction: open on the live drone feed and follow a waving alert into recorded analysis.
