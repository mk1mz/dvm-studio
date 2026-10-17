# DVM Studio — Visual Video Editor & Reference Player

> The official web-based authoring editor and reference player for **Dynamic Viewport Media (DVM)**.
> Zero build step, zero dependencies — runs directly in any modern web browser or via GitHub Pages.

---

## Live Demo & GitHub Pages Deployment

To deploy this web editor for free with a public URL:
1. Push this repository to GitHub.
2. Go to **Settings &rarr; Pages**.
3. Under **Branch**, select `main` and `/ (root)`, then click **Save**.
4. Your DVM Studio is instantly live at `https://<your-username>.github.io/<your-repo-name>/`!

Or run locally by opening `index.html` in your browser.

---

## Features

- **Reference Player Mode:**
  - Viewport-fit scaling (`contain` and `cover`) across simulated mobile (9:16), square (1:1), desktop (16:9), and ultrawide (21:9) displays.
  - Real-time Debug HUD Overlay: displays presentation timestamp (PTS), active event state, target rectangle coordinates, aspect ratio, and frame sync.
- **Visual Timeline Editor Mode:**
  - Interactive 8-point draggable & resizable crop viewport overlay directly on your video.
  - Quick aspect ratio chips: `9:16`, `1:1`, `16:9`, `4:5`, and `Custom`.
- **Keyframe Track:**
  - Visual scrubber with timeline ruler and colored event blocks.
  - Add keyframes, tune transitions (`cut` vs `smooth`), and set transition durations.
- **Built-in Dynamic Test Pattern:**
  - Integrated radar sweep & moving coordinate test generator for instant testing without video files.
- **Real Video Support:**
  - Drag and drop or load any MP4 or WebM video from your device.
- **One-Click Export:**
  - Download standard-compliant `dvm-timeline.json`.
  - Ready-to-copy `dvm mux` CLI command line string.

---

## License

Licensed under the Apache License, Version 2.0 (see [`LICENSE`](LICENSE)).
