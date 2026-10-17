/**
 * DVM Studio — Reference Player & Visual Viewport Editor
 * Implements DVM profile exact arithmetic, viewport-fit contain/cover,
 * interactive crop manipulation, and timeline event authoring.
 */

// Initial DVM Timeline state (default: portrait-square-landscape scenario)
let currentTimeline = {
  version: 1,
  description: "9:16 -> 1:1 -> 16:9 -> 9:16 on a 1920x1920 square canvas",
  canvas: { width: 1920, height: 1920 },
  events: [
    { start: 0, duration: 3, viewport: { x: 420, y: 0, width: 1080, height: 1920 }, transition: "cut" },
    { start: 3, duration: 3, viewport: { x: 0, y: 0, width: 1920, height: 1920 }, transition: "smooth", transition_duration: 0.5 },
    { start: 6, duration: 3, viewport: { x: 0, y: 420, width: 1920, height: 1080 }, transition: "smooth", transition_duration: 0.5 },
    { start: 9, duration: 3, viewport: { x: 420, y: 0, width: 1080, height: 1920 }, transition: "smooth", transition_duration: 0.5 }
  ]
};

// Playback state
let isPlaying = false;
let currentTime = 0; // seconds
let playbackRate = 1.0;
let isLooping = true;
let activeEventIndex = 0;
let currentMode = "player"; // "player" | "editor"
let fitMode = "contain";    // "contain" | "cover" | "free"
let screenAspect = 16 / 9;

// Synthetic Video & Media Source
let hasLoadedVideo = false;
const videoEl = document.getElementById("media-video");
const stageCanvas = document.getElementById("stage-canvas");
const ctx = stageCanvas.getContext("2d");
let animFrameId = null;
let lastTimestamp = performance.now();

// ---------------------------------------------------------------------------
// Exact DVM Profile Viewport Evaluation Math (spec section D/E)
// ---------------------------------------------------------------------------

function evaluateTimeline(tl, time) {
  const events = tl.events;
  if (!events || events.length === 0) {
    return { x: 0, y: 0, width: tl.canvas.width, height: tl.canvas.height, eventIndex: -1, trans: "none" };
  }

  // Clamp time to timeline bounds
  const totalDuration = events.reduce((sum, e) => sum + Number(e.duration), 0);
  const clampedTime = Math.max(0, Math.min(time, totalDuration));

  let eventIdx = 0;
  let curEvent = events[0];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const s = Number(e.start);
    const d = Number(e.duration);
    if (clampedTime >= s && clampedTime < s + d) {
      eventIdx = i;
      curEvent = e;
      break;
    }
    if (i === events.length - 1 && clampedTime >= s + d) {
      eventIdx = i;
      curEvent = e;
    }
  }

  const s = Number(curEvent.start);
  const vp = curEvent.viewport;

  // Handle cut or first event
  if (curEvent.transition === "cut" || eventIdx === 0) {
    return {
      x: Math.round(vp.x),
      y: Math.round(vp.y),
      width: Math.round(vp.width),
      height: Math.round(vp.height),
      eventIndex: eventIdx,
      trans: "cut"
    };
  }

  // Smooth transition
  const prevVp = events[eventIdx - 1].viewport;
  const transDur = Number(curEvent.transition_duration || 0.5);
  const dt = clampedTime - s;

  if (dt >= transDur) {
    return {
      x: Math.round(vp.x),
      y: Math.round(vp.y),
      width: Math.round(vp.width),
      height: Math.round(vp.height),
      eventIndex: eventIdx,
      trans: "hold"
    };
  }

  // Linear edge interpolation
  const u = dt / transDur;
  const left = Math.round(prevVp.x + (vp.x - prevVp.x) * u);
  const top = Math.round(prevVp.y + (vp.y - prevVp.y) * u);
  const right = Math.round((prevVp.x + prevVp.width) + ((vp.x + vp.width) - (prevVp.x + prevVp.width)) * u);
  const bottom = Math.round((prevVp.y + prevVp.height) + ((vp.y + vp.height) - (prevVp.y + prevVp.height)) * u);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    eventIndex: eventIdx,
    trans: `smooth (${Math.round(u * 100)}%)`
  };
}

// ---------------------------------------------------------------------------
// Rendering Engine: Dynamic Canvas & Synthetic Video Signal
// ---------------------------------------------------------------------------

function drawSyntheticSignal(ctx, width, height, time) {
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#0e1626");
  grad.addColorStop(1, "#1c2b45");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Moving coordinate grid
  ctx.strokeStyle = "rgba(0, 242, 254, 0.15)";
  ctx.lineWidth = 1;
  const gridSize = 120;
  const offset = (time * 60) % gridSize;

  for (let x = offset; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = offset; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Outer boundary line
  ctx.strokeStyle = "rgba(0, 242, 254, 0.5)";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, width - 8, height - 8);

  // Center crosshair & radar sweep
  const cx = width / 2;
  const cy = height / 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.beginPath();
  ctx.arc(cx, cy, 300, 0, Math.PI * 2);
  ctx.stroke();

  const angle = (time * 2) % (Math.PI * 2);
  ctx.strokeStyle = "#00f2fe";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300);
  ctx.stroke();

  // Resolution & time labels
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`DVM CANVAS ${width}×${height}`, cx, cy - 60);

  ctx.fillStyle = "#00f2fe";
  ctx.font = "32px 'JetBrains Mono', monospace";
  ctx.fillText(`PTS: ${time.toFixed(3)}s`, cx, cy);

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "24px 'Inter', sans-serif";
  ctx.fillText("Dynamic Viewport Reference Pattern", cx, cy + 60);
}

// Offscreen buffer for source media
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d");

// Layout state for editor handles
let editorStageTransform = { dx: 0, dy: 0, scale: 1.0 };

function renderFrame() {
  const cw = currentTimeline.canvas.width;
  const ch = currentTimeline.canvas.height;

  // 1. Render source frame to offscreen canvas
  if (sourceCanvas.width !== cw || sourceCanvas.height !== ch) {
    sourceCanvas.width = cw;
    sourceCanvas.height = ch;
  }

  if (hasLoadedVideo && videoEl.readyState >= 2) {
    sourceCtx.drawImage(videoEl, 0, 0, cw, ch);
  } else {
    drawSyntheticSignal(sourceCtx, cw, ch, currentTime);
  }

  // 2. Compute screen frame dimensions
  const frame = document.getElementById("screen-frame");
  const stageViewport = document.getElementById("stage-viewport");
  const stageRect = stageViewport.getBoundingClientRect();
  const maxW = Math.max(320, stageRect.width - 48);
  const maxH = Math.max(240, stageRect.height - 48);

  let screenW = maxW;
  let screenH = maxW / screenAspect;
  if (screenH > maxH) {
    screenH = maxH;
    screenW = maxH * screenAspect;
  }
  screenW = Math.round(screenW);
  screenH = Math.round(screenH);

  frame.style.width = `${screenW}px`;
  frame.style.height = `${screenH}px`;

  // Internal resolution matches display pixels
  if (stageCanvas.width !== screenW || stageCanvas.height !== screenH) {
    stageCanvas.width = screenW;
    stageCanvas.height = screenH;
  }

  // Clear background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, screenW, screenH);

  // 3. Evaluate active viewport rectangle
  const vp = evaluateTimeline(currentTimeline, currentTime);
  activeEventIndex = vp.eventIndex;
  updateHUD(vp);

  // 4. Render to stageCanvas
  if (currentMode === "editor" || fitMode === "free") {
    // Show full canvas scaled to fit screen frame
    const scale = Math.min(screenW / cw, screenH / ch);
    const dw = Math.round(cw * scale);
    const dh = Math.round(ch * scale);
    const dx = Math.round((screenW - dw) / 2);
    const dy = Math.round((screenH - dh) / 2);

    editorStageTransform = { dx, dy, scale };
    ctx.drawImage(sourceCanvas, 0, 0, cw, ch, dx, dy, dw, dh);
    updateCropBoxUI(vp, dx, dy, scale);
  } else {
    // Reference Player Mode: Viewport-Fit (contain or cover)
    let scale = 1.0;
    if (fitMode === "contain") {
      scale = Math.min(screenW / vp.width, screenH / vp.height);
    } else if (fitMode === "cover") {
      scale = Math.max(screenW / vp.width, screenH / vp.height);
    }

    const dw = Math.round(vp.width * scale);
    const dh = Math.round(vp.height * scale);
    const dx = Math.round((screenW - dw) / 2);
    const dy = Math.round((screenH - dh) / 2);

    ctx.drawImage(
      sourceCanvas,
      vp.x, vp.y, vp.width, vp.height,
      dx, dy, dw, dh
    );
  }
}

function updateHUD(vp) {
  document.getElementById("hud-pts").textContent = `${currentTime.toFixed(3)}s`;
  document.getElementById("hud-event").textContent = `#${vp.eventIndex + 1} (${vp.trans})`;
  document.getElementById("hud-rect").textContent = `[${vp.x}, ${vp.y}, ${vp.width}, ${vp.height}]`;
  const ratio = (vp.width / vp.height).toFixed(2);
  document.getElementById("hud-render").textContent = `${vp.width}×${vp.height} (${ratio}:1)`;
}

// ---------------------------------------------------------------------------
// Editor Mode: Interactive Crop Box Manipulation
// ---------------------------------------------------------------------------

function updateCropBoxUI(vp, dx, dy, scale) {
  const cropBox = document.getElementById("crop-box");
  cropBox.style.left = `${dx + vp.x * scale}px`;
  cropBox.style.top = `${dy + vp.y * scale}px`;
  cropBox.style.width = `${vp.width * scale}px`;
  cropBox.style.height = `${vp.height * scale}px`;
  document.getElementById("crop-tag").textContent = `${vp.width}×${vp.height}`;
}

// Handle dragging crop box & resize handles
let isDraggingCrop = false;
let isResizingHandle = null;
let dragStartX = 0, dragStartY = 0;
let initialRect = null;

const cropBoxEl = document.getElementById("crop-box");

cropBoxEl.addEventListener("mousedown", (e) => {
  if (currentMode !== "editor") return;
  const handle = e.target.getAttribute("data-handle");
  const curEvent = currentTimeline.events[activeEventIndex];
  if (!curEvent) return;

  dragStartX = e.clientX;
  dragStartY = e.clientY;
  initialRect = { ...curEvent.viewport };

  if (handle) {
    isResizingHandle = handle;
  } else {
    isDraggingCrop = true;
  }
  e.stopPropagation();
});

window.addEventListener("mousemove", (e) => {
  if (!isDraggingCrop && !isResizingHandle) return;
  const curEvent = currentTimeline.events[activeEventIndex];
  if (!curEvent) return;

  const scale = editorStageTransform.scale || 1.0;
  const dx = (e.clientX - dragStartX) / scale;
  const dy = (e.clientY - dragStartY) / scale;

  const cw = currentTimeline.canvas.width;
  const ch = currentTimeline.canvas.height;

  if (isDraggingCrop) {
    let newX = Math.round(initialRect.x + dx);
    let newY = Math.round(initialRect.y + dy);
    newX = Math.max(0, Math.min(newX, cw - initialRect.width));
    newY = Math.max(0, Math.min(newY, ch - initialRect.height));
    curEvent.viewport.x = newX;
    curEvent.viewport.y = newY;
  } else if (isResizingHandle) {
    let r = { ...initialRect };
    if (isResizingHandle.includes("e")) r.width = Math.max(64, Math.min(initialRect.width + dx, cw - r.x));
    if (isResizingHandle.includes("s")) r.height = Math.max(64, Math.min(initialRect.height + dy, ch - r.y));
    if (isResizingHandle.includes("w")) {
      const nw = Math.max(64, initialRect.width - dx);
      r.x = Math.max(0, initialRect.x + (initialRect.width - nw));
      r.width = nw;
    }
    if (isResizingHandle.includes("n")) {
      const nh = Math.max(64, initialRect.height - dy);
      r.y = Math.max(0, initialRect.y + (initialRect.height - nh));
      r.height = nh;
    }
    curEvent.viewport = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  }

  updateInspectorInputs();
  renderTimelineBlocks();
  renderFrame();
});

window.addEventListener("mouseup", () => {
  isDraggingCrop = false;
  isResizingHandle = null;
});

// ---------------------------------------------------------------------------
// Timeline Ruler & Event Blocks
// ---------------------------------------------------------------------------

function getTotalTimelineDuration() {
  return currentTimeline.events.reduce((sum, e) => sum + Number(e.duration), 0) || 12;
}

function renderTimelineBlocks() {
  const container = document.getElementById("timeline-blocks");
  container.innerHTML = "";
  const total = getTotalTimelineDuration();

  currentTimeline.events.forEach((ev, idx) => {
    const s = Number(ev.start);
    const d = Number(ev.duration);
    const leftPct = (s / total) * 100;
    const widthPct = (d / total) * 100;

    const block = document.createElement("div");
    block.className = `timeline-block ${idx === activeEventIndex ? "active" : ""}`;
    block.style.left = `${leftPct}%`;
    block.style.width = `${widthPct}%`;

    const ar = (ev.viewport.width / ev.viewport.height).toFixed(2);
    block.innerHTML = `<span>#${idx + 1} (${ev.transition}) ${ev.viewport.width}×${ev.viewport.height}</span>`;

    block.addEventListener("click", (e) => {
      seekTo(s);
      activeEventIndex = idx;
      updateInspectorInputs();
      renderTimelineBlocks();
      renderEventsList();
      e.stopPropagation();
    });

    container.appendChild(block);
  });

  document.getElementById("event-count-badge").textContent = `${currentTimeline.events.length} events`;
  document.getElementById("tab-count").textContent = currentTimeline.events.length;
}

function updatePlayheadUI() {
  const total = getTotalTimelineDuration();
  const pct = Math.min(100, Math.max(0, (currentTime / total) * 100));
  document.getElementById("timeline-playhead").style.left = `${pct}%`;

  const curSec = formatTime(currentTime);
  const totSec = formatTime(total);
  document.getElementById("time-display").textContent = `${curSec} / ${totSec}`;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(3);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Playback Transport Loop
// ---------------------------------------------------------------------------

function play() {
  isPlaying = true;
  document.getElementById("play-icon").innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  lastTimestamp = performance.now();
  if (hasLoadedVideo) videoEl.play();
}

function pause() {
  isPlaying = false;
  document.getElementById("play-icon").innerHTML = '<path d="M8 5v14l11-7z"/>';
  if (hasLoadedVideo) videoEl.pause();
}

function togglePlay() {
  if (isPlaying) pause(); else play();
}

function seekTo(targetTime) {
  const total = getTotalTimelineDuration();
  currentTime = Math.max(0, Math.min(targetTime, total));
  if (hasLoadedVideo) {
    videoEl.currentTime = currentTime;
  }
  updatePlayheadUI();
  renderFrame();
}

function stepFrame(delta) {
  pause();
  const frameDur = 1 / 30; // 30 fps
  seekTo(currentTime + delta * frameDur);
}

function animationLoop(timestamp) {
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  if (isPlaying) {
    if (hasLoadedVideo) {
      currentTime = videoEl.currentTime;
      if (videoEl.ended) {
        if (isLooping) {
          videoEl.currentTime = 0;
          videoEl.play();
        } else {
          pause();
        }
      }
    } else {
      currentTime += dt * playbackRate;
      const total = getTotalTimelineDuration();
      if (currentTime >= total) {
        if (isLooping) {
          currentTime = 0;
        } else {
          currentTime = total;
          pause();
        }
      }
    }
    updatePlayheadUI();
  }

  renderFrame();
  animFrameId = requestAnimationFrame(animationLoop);
}

// ---------------------------------------------------------------------------
// Inspector & UI Synchronizer
// ---------------------------------------------------------------------------

function updateInspectorInputs() {
  const curEvent = currentTimeline.events[activeEventIndex] || currentTimeline.events[0];
  if (!curEvent) return;

  document.getElementById("inp-canvas-w").value = currentTimeline.canvas.width;
  document.getElementById("inp-canvas-h").value = currentTimeline.canvas.height;

  document.getElementById("inp-rect-x").value = curEvent.viewport.x;
  document.getElementById("inp-rect-y").value = curEvent.viewport.y;
  document.getElementById("inp-rect-w").value = curEvent.viewport.width;
  document.getElementById("inp-rect-h").value = curEvent.viewport.height;

  document.getElementById("inp-transition-type").value = curEvent.transition;
  document.getElementById("inp-trans-dur").value = curEvent.transition_duration || 0.5;

  const transDurField = document.getElementById("field-trans-dur");
  transDurField.style.display = (curEvent.transition === "smooth") ? "flex" : "none";

  // Update JSON view
  document.getElementById("json-code-view").value = JSON.stringify(currentTimeline, null, 2);
}

function applyInspectorChanges() {
  const curEvent = currentTimeline.events[activeEventIndex];
  if (!curEvent) return;

  curEvent.viewport.x = parseInt(document.getElementById("inp-rect-x").value, 10) || 0;
  curEvent.viewport.y = parseInt(document.getElementById("inp-rect-y").value, 10) || 0;
  curEvent.viewport.width = parseInt(document.getElementById("inp-rect-w").value, 10) || 100;
  curEvent.viewport.height = parseInt(document.getElementById("inp-rect-h").value, 10) || 100;

  curEvent.transition = document.getElementById("inp-transition-type").value;
  if (curEvent.transition === "smooth") {
    curEvent.transition_duration = parseFloat(document.getElementById("inp-trans-dur").value) || 0.5;
  } else {
    delete curEvent.transition_duration;
  }

  currentTimeline.canvas.width = parseInt(document.getElementById("inp-canvas-w").value, 10) || 1920;
  currentTimeline.canvas.height = parseInt(document.getElementById("inp-canvas-h").value, 10) || 1920;

  renderTimelineBlocks();
  renderEventsList();
  renderFrame();
  document.getElementById("json-code-view").value = JSON.stringify(currentTimeline, null, 2);
}

function renderEventsList() {
  const container = document.getElementById("events-list-container");
  container.innerHTML = "";

  currentTimeline.events.forEach((ev, idx) => {
    const card = document.createElement("div");
    card.className = `event-card ${idx === activeEventIndex ? "active" : ""}`;
    card.innerHTML = `
      <div class="event-card-header">
        <span>#${idx + 1} &bull; ${ev.transition.toUpperCase()}</span>
        <span>${ev.start}s - ${Number(ev.start) + Number(ev.duration)}s (${ev.duration}s)</span>
      </div>
      <div class="event-card-body">
        [x:${ev.viewport.x}, y:${ev.viewport.y}, w:${ev.viewport.width}, h:${ev.viewport.height}]
      </div>
    `;

    card.addEventListener("click", () => {
      seekTo(Number(ev.start));
      activeEventIndex = idx;
      updateInspectorInputs();
      renderTimelineBlocks();
      renderEventsList();
    });

    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Event Listeners & Setup
// ---------------------------------------------------------------------------

function setupEventListeners() {
  // Mode switcher
  const btnPlayer = document.getElementById("btn-mode-player");
  const btnEditor = document.getElementById("btn-mode-editor");
  const appContainer = document.querySelector(".app-container");

  btnPlayer.addEventListener("click", () => {
    currentMode = "player";
    btnPlayer.classList.add("active");
    btnEditor.classList.remove("active");
    appContainer.classList.remove("mode-editor");
    renderFrame();
  });

  btnEditor.addEventListener("click", () => {
    currentMode = "editor";
    btnEditor.classList.add("active");
    btnPlayer.classList.remove("active");
    appContainer.classList.add("mode-editor");
    renderFrame();
  });

  // Fit mode pills
  document.querySelectorAll("#fit-mode-group .pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#fit-mode-group .pill-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      fitMode = btn.getAttribute("data-fit");
      renderFrame();
    });
  });

  // Screen Aspect Select
  document.getElementById("screen-aspect-select").addEventListener("change", (e) => {
    const [w, h] = e.target.value.split("/").map(Number);
    screenAspect = w / h;
    renderFrame();
  });

  // Debug HUD Toggle
  document.getElementById("toggle-debug-overlay").addEventListener("change", (e) => {
    document.getElementById("debug-hud").style.display = e.target.checked ? "flex" : "none";
  });

  // Transport Controls
  document.getElementById("btn-play-pause").addEventListener("click", togglePlay);
  document.getElementById("btn-step-back").addEventListener("click", () => stepFrame(-1));
  document.getElementById("btn-step-fwd").addEventListener("click", () => stepFrame(1));

  document.getElementById("rate-select").addEventListener("change", (e) => {
    playbackRate = parseFloat(e.target.value);
    if (hasLoadedVideo) videoEl.playbackRate = playbackRate;
  });

  document.getElementById("btn-loop").addEventListener("click", () => {
    isLooping = !isLooping;
    document.getElementById("btn-loop").style.color = isLooping ? "var(--accent-cyan)" : "var(--text-muted)";
  });

  // Timeline Scrubber Click & Drag
  const trackArea = document.getElementById("timeline-track-area");
  let isScrubbing = false;

  function handleScrub(e) {
    const rect = trackArea.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * getTotalTimelineDuration());
  }

  trackArea.addEventListener("mousedown", (e) => {
    isScrubbing = true;
    handleScrub(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (isScrubbing) handleScrub(e);
  });
  window.addEventListener("mouseup", () => {
    isScrubbing = false;
  });

  // Aspect ratio chips in inspector
  document.querySelectorAll(".aspect-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".aspect-chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const aspectStr = chip.getAttribute("data-aspect");
      if (aspectStr === "free") return;

      const [wRatio, hRatio] = aspectStr.split("/").map(Number);
      const curEvent = currentTimeline.events[activeEventIndex];
      if (!curEvent) return;

      const targetH = curEvent.viewport.height;
      const targetW = Math.round((targetH * wRatio) / hRatio);
      curEvent.viewport.width = Math.min(targetW, currentTimeline.canvas.width - curEvent.viewport.x);

      updateInspectorInputs();
      renderFrame();
    });
  });

  // Inspector input change listeners
  ["inp-canvas-w", "inp-canvas-h", "inp-rect-x", "inp-rect-y", "inp-rect-w", "inp-rect-h", "inp-transition-type", "inp-trans-dur"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyInspectorChanges);
  });

  // Center viewport button
  document.getElementById("btn-center-viewport").addEventListener("click", () => {
    const curEvent = currentTimeline.events[activeEventIndex];
    if (!curEvent) return;
    const cw = currentTimeline.canvas.width;
    const ch = currentTimeline.canvas.height;
    curEvent.viewport.x = Math.round((cw - curEvent.viewport.width) / 2);
    curEvent.viewport.y = Math.round((ch - curEvent.viewport.height) / 2);
    updateInspectorInputs();
    renderFrame();
  });

  // Add Keyframe / Event button
  document.getElementById("btn-add-event").addEventListener("click", () => {
    const events = currentTimeline.events;
    const curSec = Math.round(currentTime * 10) / 10;
    const defaultDur = 3;

    // Adjust previous event end if inserting
    const newEvent = {
      start: curSec,
      duration: defaultDur,
      viewport: { ...events[events.length - 1].viewport },
      transition: "smooth",
      transition_duration: 0.5
    };

    events.push(newEvent);
    // Re-sort and make contiguous
    rebalanceEventsContiguous();
    activeEventIndex = events.length - 1;
    renderTimelineBlocks();
    renderEventsList();
    updateInspectorInputs();
    renderFrame();
  });

  // Tabs switching in sidebar
  document.querySelectorAll(".sidebar-tabs .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sidebar-tabs .tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.getAttribute("data-tab")}`).classList.add("active");
    });
  });

  // Presets dropdown
  const presetsBtn = document.getElementById("btn-presets");
  const presetsMenu = document.getElementById("presets-menu");

  presetsBtn.addEventListener("click", (e) => {
    presetsBtn.parentElement.classList.toggle("open");
    e.stopPropagation();
  });

  window.addEventListener("click", () => {
    presetsBtn.parentElement.classList.remove("open");
  });

  presetsMenu.querySelectorAll("a").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      loadPreset(item.getAttribute("data-preset"));
    });
  });

  // Video File Upload
  document.getElementById("video-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      videoEl.src = url;
      videoEl.load();
      videoEl.onloadedmetadata = () => {
        hasLoadedVideo = true;
        currentTimeline.canvas.width = videoEl.videoWidth;
        currentTimeline.canvas.height = videoEl.videoHeight;
        seekTo(0);
        updateInspectorInputs();
        renderFrame();
      };
    }
  });

  // Test Pattern button
  document.getElementById("btn-load-synthetic").addEventListener("click", () => {
    hasLoadedVideo = false;
    currentTimeline.canvas.width = 1920;
    currentTimeline.canvas.height = 1920;
    seekTo(0);
    updateInspectorInputs();
    renderFrame();
  });

  // Export JSON and Download
  document.getElementById("btn-export-json").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="export"]').click();
  });

  document.getElementById("btn-copy-json").addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify(currentTimeline, null, 2)).then(() => {
      const btn = document.getElementById("btn-copy-json");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy JSON"; }, 2000);
    });
  });

  document.getElementById("btn-download-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(currentTimeline, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dvm-timeline.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

function rebalanceEventsContiguous() {
  const events = currentTimeline.events;
  events.sort((a, b) => Number(a.start) - Number(b.start));
  let cur = 0;
  for (let i = 0; i < events.length; i++) {
    events[i].start = cur;
    cur += Number(events[i].duration);
    if (i === 0) events[i].transition = "cut";
  }
}

function loadPreset(name) {
  if (name === "portrait-square-landscape") {
    currentTimeline = {
      version: 1,
      description: "9:16 -> 1:1 -> 16:9 -> 9:16 on a 1920x1920 square canvas",
      canvas: { width: 1920, height: 1920 },
      events: [
        { start: 0, duration: 3, viewport: { x: 420, y: 0, width: 1080, height: 1920 }, transition: "cut" },
        { start: 3, duration: 3, viewport: { x: 0, y: 0, width: 1920, height: 1920 }, transition: "smooth", transition_duration: 0.5 },
        { start: 6, duration: 3, viewport: { x: 0, y: 420, width: 1920, height: 1080 }, transition: "smooth", transition_duration: 0.5 },
        { start: 9, duration: 3, viewport: { x: 420, y: 0, width: 1080, height: 1920 }, transition: "smooth", transition_duration: 0.5 }
      ]
    };
  } else if (name === "era-cuts") {
    currentTimeline = {
      version: 1,
      description: "Historical aspect ratios: 4:3 silent -> 1.85:1 theatrical -> 2.39:1 scope",
      canvas: { width: 1920, height: 1080 },
      events: [
        { start: 0, duration: 4, viewport: { x: 240, y: 0, width: 1440, height: 1080 }, transition: "cut" },
        { start: 4, duration: 4, viewport: { x: 0, y: 21, width: 1920, height: 1038 }, transition: "cut" },
        { start: 8, duration: 4, viewport: { x: 0, y: 138, width: 1920, height: 804 }, transition: "cut" }
      ]
    };
  } else if (name === "slow-push-in") {
    currentTimeline = {
      version: 1,
      description: "Continuous 10 s slow zoom from full 1080p canvas to a 720p region",
      canvas: { width: 1920, height: 1080 },
      events: [
        { start: 0, duration: 2, viewport: { x: 0, y: 0, width: 1920, height: 1080 }, transition: "cut" },
        { start: 2, duration: 10, viewport: { x: 320, y: 180, width: 1280, height: 720 }, transition: "smooth", transition_duration: 10 }
      ]
    };
  }
  activeEventIndex = 0;
  seekTo(0);
  renderTimelineBlocks();
  renderEventsList();
  updateInspectorInputs();
  renderFrame();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  renderTimelineBlocks();
  renderEventsList();
  updateInspectorInputs();
  animFrameId = requestAnimationFrame(animationLoop);
});
