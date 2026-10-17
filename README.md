# DVM Studio — Visual Video Editor & Reference Player

[![Status: Production Ready](https://img.shields.io/badge/Status-Production_Ready-brightgreen.svg)](index.html)
[![Zero Build: No NPM / Vite Needed](https://img.shields.io/badge/Build_Step-Zero_Dependencies-blue.svg)](index.html)
[![Deploy: GitHub Pages Ready](https://img.shields.io/badge/Hosting-GitHub_Pages_1--Click-purple.svg)](https://pages.github.com/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)

> **DVM Studio** is the official web-based authoring editor and reference player for **Dynamic Viewport Media (DVM)**.
> It lets creators visually define time-varying camera crops across a video timeline and simulates dynamic aspect-ratio playback in real time — with **zero build step and zero dependencies**.

---

## 🖥️ Studio Interface Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│  DVM STUDIO  [Load MP4]  [Mode: Editor | Player]  [Aspect: 9:16|1:1|16:9]│
├──────────────────────────────────────────────────────┬─────────────────┤
│                                                      │  LIVE DEBUG HUD │
│                 VIDEO CANVAS VIEWER                  │  • Time: 03.24s │
│                                                      │  • Mode: Contain│
│            ┌────────────────────────────┐            │  • X: 0.125     │
│            │ (8-Point Interactive Crop) │            │  • Y: 0.000     │
│            │  ┌──────────────────────┐  │            │  • W: 0.562     │
│            │  │ Active Dynamic Crop  │  │            │  • H: 1.000     │
│            │  │   [ 9:16 Vertical ]  │  │            │  • Sync: <1ms   │
│            │  └──────────────────────┘  │            │                 │
│            └────────────────────────────┘            │  TRANSITIONS    │
│                                                      │  [ Cut | Smooth]│
├──────────────────────────────────────────────────────┴─────────────────┤
│  TIMELINE & KEYFRAME TRACK                                              │
│  [Play/Pause]  00:00 ───◆─────────────◆──────────────◆─────── 00:30     │
│                         Cut           Smooth         Cut               │
│  [+ Add Keyframe]  [- Remove]  [Export timeline.json]  [Copy dvm mux]   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### 1. Dual Mode Operation
- **Editor Mode**: Interactive 8-point handles let you drag, position, and resize the camera viewport freely across the master video.
- **Reference Player Mode**: Simulates what viewers experience on mobile (9:16), square feeds (1:1), or desktop (16:9) using fluid `contain` or `cover` viewport scaling.

### 2. Scrubbable Keyframe Timeline
- Visual timeline with millisecond-accurate scrubbing.
- Add keyframes anywhere along the video.
- Choose between **Instant Cut** (hard angle switch) and **Smooth** (fluid camera pan and zoom interpolation).

### 3. Live Debug HUD Overlay
- Real-time readout of presentation timestamp (PTS), normalized bounding box coordinates (`[x, y, w, h]`), aspect ratio, and frame synchronization state.

### 4. Built-in Dynamic Test Pattern
- No video file on hand? Click the built-in radar test generator to immediately author and preview dynamic framing against animated coordinate grids.

### 5. Instant 1-Click Export
- Export standard-compliant `timeline.json` ready for muxing.
- Generates the exact `dvm mux` CLI command to embed the camera trajectory into your MP4 in seconds.

---

## ⚡ Instant Setup (Runs Everywhere)

Because DVM Studio is built with modern vanilla HTML5, Canvas, and CSS, it requires **no Node.js, no npm install, and no build pipeline**.

### Option A: Run Locally (5 seconds)
Just double-click [`index.html`](index.html) or open it in Google Chrome, Microsoft Edge, Safari, or Firefox.

### Option B: Deploy Free on GitHub Pages (1 click)
1. Fork or push this repository to your GitHub account.
2. Go to **Settings &rarr; Pages**.
3. Under **Build and deployment &rarr; Branch**, select `main` and `/ (root)`.
4. Click **Save**. Your interactive video editor is live at `https://<your-username>.github.io/dvm-studio/`!

---

## 🎬 Authoring Workflow

```
1. Open Studio ────▶ 2. Load Video ────▶ 3. Set Keyframes ────▶ 4. Export JSON ────▶ 5. Mux with DVM Core
   (in browser)        (MP4 or WebM)        (Draw crop boxes)     (timeline.json)      (Zero re-encode!)
```

### Example Mux Command:
Once you export your `timeline.json` from DVM Studio, run:
```bash
python -m dvm mux my_master_video.mp4 timeline.json final_dvm_video.mp4
```

---

## 🏛️ Part of the DVM Standard

- **Formal Specification**: [`dvm-spec`](https://github.com/mk1mz/dvm-spec)
- **Python Muxer & Engine**: [`dvm-core`](https://github.com/mk1mz/dvm-core)

---

## 📄 License

Licensed under the **Apache License, Version 2.0** (see [`LICENSE`](LICENSE)).
