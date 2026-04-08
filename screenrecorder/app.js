const el = {
  countdownSeconds: document.getElementById("countdownSeconds"),
  webcamShape: document.getElementById("webcamShape"),
  webcamSize: document.getElementById("webcamSize"),
  outputResolution: document.getElementById("outputResolution"),
  outputQualityHint: document.getElementById("outputQualityHint"),
  includeWebcam: document.getElementById("includeWebcam"),
  includeMic: document.getElementById("includeMic"),
  includeSystemAudio: document.getElementById("includeSystemAudio"),
  faceCrop: document.getElementById("faceCrop"),
  faceCropInfoBtn: document.getElementById("faceCropInfoBtn"),
  faceCropHelpModal: document.getElementById("faceCropHelpModal"),
  faceCropHelpClose: document.getElementById("faceCropHelpClose"),
  faceCropStatus: document.getElementById("faceCropStatus"),
  autoGainControl: document.getElementById("autoGainControl"),
  noiseSuppression: document.getElementById("noiseSuppression"),
  echoCancellation: document.getElementById("echoCancellation"),
  autoSkipSilence: document.getElementById("autoSkipSilence"),
  silenceSeconds: document.getElementById("silenceSeconds"),
  silenceThreshold: document.getElementById("silenceThreshold"),
  silenceThresholdValue: document.getElementById("silenceThresholdValue"),
  enableTranscription: document.getElementById("enableTranscription"),
  transcriptionLang: document.getElementById("transcriptionLang"),
  cameraDevice: document.getElementById("cameraDevice"),
  micDevice: document.getElementById("micDevice"),
  refreshDevicesBtn: document.getElementById("refreshDevicesBtn"),
  deviceHint: document.getElementById("deviceHint"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  restartBtn: document.getElementById("restartBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusPill: document.getElementById("statusPill"),
  timerText: document.getElementById("timerText"),
  supportHint: document.getElementById("supportHint"),
  previewCanvas: document.getElementById("previewCanvas"),
  countdownOverlay: document.getElementById("countdownOverlay"),
  showScreenBtn: document.getElementById("showScreenBtn"),
  showCameraBtn: document.getElementById("showCameraBtn"),
  downloadsPanel: document.getElementById("downloadsPanel"),
  downloadList: document.getElementById("downloadList"),
  transcriptPanel: document.getElementById("transcriptPanel"),
  transcriptFeed: document.getElementById("transcriptFeed"),
  downloadTranscriptBtn: document.getElementById("downloadTranscriptBtn")
};

const ctx = el.previewCanvas.getContext("2d", { alpha: false });
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const defaultDocumentTitle = document.title;
const SETTINGS_STORAGE_KEY = "vdo-screenrecorder-settings-v1";
const OUTPUT_RESOLUTION_PRESETS = {
  "1280x720": { width: 1280, height: 720, label: "HD 720p" },
  "1920x1080": { width: 1920, height: 1080, label: "Full HD 1080p" },
  "2560x1440": { width: 2560, height: 1440, label: "QHD 1440p" },
  "3840x2160": { width: 3840, height: 2160, label: "UHD 4K" }
};
const CHECKBOX_SETTING_IDS = [
  "includeWebcam",
  "includeMic",
  "includeSystemAudio",
  "faceCrop",
  "autoGainControl",
  "noiseSuppression",
  "echoCancellation",
  "autoSkipSilence",
  "enableTranscription"
];
const VALUE_SETTING_IDS = [
  "countdownSeconds",
  "webcamShape",
  "webcamSize",
  "outputResolution",
  "silenceSeconds",
  "silenceThreshold",
  "transcriptionLang"
];
const isChromiumFamilyBrowser = detectChromiumFamilyBrowser();

const state = {
  phase: "idle",
  displayStream: null,
  webcamStream: null,
  micStream: null,
  audioMixContext: null,
  uiAudioContext: null,
  mixedDestination: null,
  mediaRecorder: null,
  outputStream: null,
  canvasTrack: null,
  chunks: [],
  renderHandle: 0,
  timerHandle: 0,
  phaseTransitionToken: 0,
  countdownRemaining: 0,
  cancelCountdown: false,
  isStopping: false,
  isRestarting: false,
  isRecordingStarting: false,
  mediaRecorderSupported: "MediaRecorder" in window,
  autoPauseActive: false,
  preparedOptions: null,
  preparedInputSignature: "",
  applyingInputChanges: false,
  pendingInputChangeApply: false,
  displayVideo: createVideoElement(),
  webcamVideo: createVideoElement(),
  mimeType: "",
  previewMode: "screen",
  renderClock: {
    frameIntervalMs: 1000 / 30,
    lastFrameAt: 0,
    keepAliveSource: null,
    keepAliveGain: null,
    keepAliveProcessor: null
  },
  timing: {
    startedAt: 0,
    pausedAt: 0,
    pausedTotal: 0
  },
  overlay: {
    x: 0.72,
    y: 0.69,
    width: 320,
    height: 180,
    dragActive: false,
    dragOffsetX: 0,
    dragOffsetY: 0
  },
  faceDetector: null,
  faceTickHandle: 0,
  faceDetectBusy: false,
  faceTarget: {
    cx: 0.5,
    cy: 0.5,
    scale: 1,
    lastSeenAt: 0
  },
  silenceMonitor: {
    context: null,
    source: null,
    analyser: null,
    buffer: null,
    raf: 0,
    silenceSinceMs: 0,
    currentSkipStartMs: 0,
    segments: []
  },
  transcript: {
    supported: Boolean(SpeechRecognitionCtor),
    recognition: null,
    shouldRestart: false,
    active: false,
    entries: [],
    interimText: ""
  },
  sessionExports: {
    transcriptText: "",
    transcriptFilename: ""
  },
  persistedSettings: {
    cameraDeviceId: "",
    micDeviceId: "",
    previewMode: "screen"
  }
};

init();

function init() {
  loadSettingsFromStorage();
  wireEvents();
  applyConstraintSupport();
  applyOutputResolutionSelection({ redraw: false });
  updateOutputQualityHint();
  syncMicDependentControls();
  updateFaceCropStatus();
  updateThresholdLabel();
  setPhase("idle", "Idle");
  drawIdleSlate();
  updatePreviewModeButtons();
  renderFrame();
  renderTranscriptFeed();
  toggleTranscriptPanel();
  refreshDeviceSelectors({ requestAccess: false, silent: true });
}

function wireEvents() {
  el.startBtn.addEventListener("click", startSession);
  el.pauseBtn.addEventListener("click", togglePause);
  el.restartBtn.addEventListener("click", restartTake);
  el.stopBtn.addEventListener("click", stopSession);
  el.downloadTranscriptBtn.addEventListener("click", downloadTranscriptFromLastSession);
  el.showScreenBtn.addEventListener("click", () => setPreviewMode("screen"));
  el.showCameraBtn.addEventListener("click", () => setPreviewMode("camera"));
  el.outputResolution.addEventListener("change", () => {
    applyOutputResolutionSelection();
    updateOutputQualityHint();
    if (state.phase === "staged" || state.phase === "ready") {
      const preset = getOutputResolutionPreset(el.outputResolution.value);
      el.supportHint.textContent = "Output set to " + preset.label + ".";
    }
  });

  el.silenceThreshold.addEventListener("input", updateThresholdLabel);
  el.enableTranscription.addEventListener("change", () => {
    toggleTranscriptPanel();
  });
  el.includeMic.addEventListener("change", () => {
    syncMicDependentControls();
    handleStagedInputSelectionChange();
  });
  el.includeWebcam.addEventListener("change", () => {
    syncMicDependentControls();
    updateFaceCropStatus();
    handleStagedInputSelectionChange();
  });
  el.faceCrop.addEventListener("change", () => {
    updateFaceCropStatus();
    startFaceDetectionIfEnabled();
  });

  el.cameraDevice.addEventListener("change", () => {
    handleStagedInputSelectionChange();
  });
  el.micDevice.addEventListener("change", () => {
    handleStagedInputSelectionChange();
  });

  el.refreshDevicesBtn.addEventListener("click", async () => {
    await refreshDeviceSelectors({ requestAccess: true, silent: false });
  });

  el.faceCropInfoBtn.addEventListener("click", openFaceCropHelp);
  el.faceCropHelpClose.addEventListener("click", closeFaceCropHelp);
  el.faceCropHelpModal.addEventListener("click", (event) => {
    if (event.target === el.faceCropHelpModal) {
      closeFaceCropHelp();
    }
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshDeviceSelectors({ requestAccess: false, silent: true });
    });
  }

  el.previewCanvas.addEventListener("pointerdown", onPointerDown);
  el.previewCanvas.addEventListener("pointermove", onPointerMove);
  el.previewCanvas.addEventListener("pointerup", onPointerUp);
  el.previewCanvas.addEventListener("pointercancel", onPointerUp);

  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !el.faceCropHelpModal.classList.contains("hidden")) {
      event.preventDefault();
      closeFaceCropHelp();
      return;
    }
    if (event.code === "Space" && (state.phase === "recording" || state.phase === "paused")) {
      event.preventDefault();
      togglePause();
    }
    if (event.code === "Escape" && state.phase !== "idle") {
      event.preventDefault();
      stopSession();
    }
  });

  bindSettingsPersistence();
}

function createVideoElement() {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  return video;
}

function detectChromiumFamilyBrowser() {
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length) {
    const brandText = brands.map((entry) => entry?.brand || "").join(" ");
    return /Chrom(e|ium)|Microsoft Edge|Opera/i.test(brandText) && !/Firefox/i.test(brandText);
  }

  const ua = navigator.userAgent || "";
  return /(Chrome|Chromium|Edg|OPR|CriOS)\//i.test(ua) && !/Firefox\//i.test(ua);
}

function loadSettingsFromStorage() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  for (const id of CHECKBOX_SETTING_IDS) {
    if (!el[id] || typeof parsed[id] !== "boolean") {
      continue;
    }
    el[id].checked = parsed[id];
  }

  for (const id of VALUE_SETTING_IDS) {
    if (!el[id] || (typeof parsed[id] !== "string" && typeof parsed[id] !== "number")) {
      continue;
    }
    el[id].value = String(parsed[id]);
  }

  if (typeof parsed.outputResolution === "string" && OUTPUT_RESOLUTION_PRESETS[parsed.outputResolution]) {
    el.outputResolution.value = parsed.outputResolution;
  } else {
    el.outputResolution.value = "1920x1080";
  }

  if (typeof parsed.previewMode === "string" && (parsed.previewMode === "screen" || parsed.previewMode === "camera")) {
    state.previewMode = parsed.previewMode;
    state.persistedSettings.previewMode = parsed.previewMode;
  }

  if (typeof parsed.cameraDeviceId === "string") {
    state.persistedSettings.cameraDeviceId = parsed.cameraDeviceId;
  }
  if (typeof parsed.micDeviceId === "string") {
    state.persistedSettings.micDeviceId = parsed.micDeviceId;
  }
}

function collectSettingsForStorage() {
  const settings = {};

  for (const id of CHECKBOX_SETTING_IDS) {
    if (el[id]) {
      settings[id] = Boolean(el[id].checked);
    }
  }

  for (const id of VALUE_SETTING_IDS) {
    if (el[id]) {
      settings[id] = String(el[id].value);
    }
  }

  const cameraHasResolvedOptions = Boolean(el.cameraDevice && el.cameraDevice.options.length > 1);
  const micHasResolvedOptions = Boolean(el.micDevice && el.micDevice.options.length > 1);
  settings.cameraDeviceId = cameraHasResolvedOptions ? el.cameraDevice.value : state.persistedSettings.cameraDeviceId || "";
  settings.micDeviceId = micHasResolvedOptions ? el.micDevice.value : state.persistedSettings.micDeviceId || "";
  settings.previewMode = state.previewMode;
  return settings;
}

function saveSettingsToStorage() {
  try {
    const settings = collectSettingsForStorage();
    state.persistedSettings.cameraDeviceId = settings.cameraDeviceId;
    state.persistedSettings.micDeviceId = settings.micDeviceId;
    state.persistedSettings.previewMode = settings.previewMode;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // no-op
  }
}

function bindSettingsPersistence() {
  const persistOnChangeIds = [...CHECKBOX_SETTING_IDS, ...VALUE_SETTING_IDS, "cameraDevice", "micDevice"];
  for (const id of persistOnChangeIds) {
    const control = el[id];
    if (!control) {
      continue;
    }
    control.addEventListener("change", saveSettingsToStorage);
  }

  for (const id of ["webcamSize", "silenceThreshold"]) {
    const control = el[id];
    if (!control) {
      continue;
    }
    control.addEventListener("input", saveSettingsToStorage);
  }
}

function updateThresholdLabel() {
  el.silenceThresholdValue.textContent = el.silenceThreshold.value + " dB";
}

function updateFaceCropStatus() {
  if (!("FaceDetector" in window)) {
    el.faceCropStatus.textContent = "Auto Face Crop is unavailable in this browser build. Hover or click ? for setup tips.";
    return;
  }

  if (!el.includeWebcam.checked) {
    el.faceCropStatus.textContent = "Enable Webcam first, then toggle Auto Face Crop.";
    return;
  }

  if (!el.faceCrop.checked) {
    el.faceCropStatus.textContent = "Auto Face Crop is available. Turn it on to keep webcam framing face-focused.";
    return;
  }

  if (!state.webcamStream || !state.faceDetector) {
    el.faceCropStatus.textContent = "Auto Face Crop enabled. Prepare sources to start face tracking.";
    return;
  }

  const seenRecently = Date.now() - state.faceTarget.lastSeenAt < 1200;
  if (seenRecently) {
    el.faceCropStatus.textContent = "Auto Face Crop active: tracking your face.";
  } else {
    el.faceCropStatus.textContent = "Auto Face Crop active: searching for a face. Keep your face well lit and mostly in frame.";
  }
}

function openFaceCropHelp() {
  el.faceCropHelpModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  el.faceCropHelpClose.focus();
}

function closeFaceCropHelp() {
  el.faceCropHelpModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  el.faceCropInfoBtn.focus();
}

function syncMicDependentControls() {
  const captureOptionsLocked =
    state.phase === "recording" ||
    state.phase === "paused" ||
    state.phase === "ready" ||
    state.isRecordingStarting ||
    state.isRestarting;
  const micDisabled = !el.includeMic.checked || captureOptionsLocked;
  const camDisabled = !el.includeWebcam.checked || captureOptionsLocked;

  el.includeWebcam.disabled = captureOptionsLocked;
  el.includeMic.disabled = captureOptionsLocked;
  el.includeSystemAudio.disabled = captureOptionsLocked;
  el.faceCrop.disabled = !("FaceDetector" in window) || !el.includeWebcam.checked || captureOptionsLocked;
  el.refreshDevicesBtn.disabled = captureOptionsLocked || !navigator.mediaDevices?.enumerateDevices;

  el.autoSkipSilence.disabled = micDisabled;
  el.silenceSeconds.disabled = micDisabled;
  el.silenceThreshold.disabled = micDisabled;
  el.micDevice.disabled = micDisabled;
  el.cameraDevice.disabled = camDisabled;

  if (!state.transcript.supported) {
    el.enableTranscription.disabled = true;
    el.transcriptionLang.disabled = true;
  } else {
    el.enableTranscription.disabled = micDisabled;
    el.transcriptionLang.disabled = micDisabled;
  }

  if (!el.includeMic.checked) {
    el.enableTranscription.checked = false;
    el.autoSkipSilence.checked = false;
  }

  if (!el.includeWebcam.checked && state.previewMode === "camera") {
    state.previewMode = "screen";
  }

  updatePreviewModeButtons();
  toggleTranscriptPanel();
  saveSettingsToStorage();
}

async function refreshDeviceSelectors({ requestAccess = false, silent = false } = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    el.cameraDevice.disabled = true;
    el.micDevice.disabled = true;
    el.refreshDevicesBtn.disabled = true;
    if (!silent) {
      el.deviceHint.textContent = "Device listing is not available in this browser.";
    }
    return;
  }

  if (requestAccess) {
    try {
      await requestTemporaryMediaAccessForLabels();
    } catch (error) {
      console.warn("Temporary media access failed:", error);
      if (!silent) {
        el.deviceHint.textContent = "Permission prompt failed. Showing currently detectable devices.";
      }
    }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameraDevices = devices.filter((device) => device.kind === "videoinput");
    const micDevices = devices.filter((device) => device.kind === "audioinput");

    const selectedCamera = el.cameraDevice.value || state.persistedSettings.cameraDeviceId;
    const selectedMic = el.micDevice.value || state.persistedSettings.micDeviceId;

    populateDeviceSelect(el.cameraDevice, cameraDevices, "Default camera", selectedCamera, "Camera");
    populateDeviceSelect(el.micDevice, micDevices, "Default microphone", selectedMic, "Microphone");

    const hasVisibleLabels = [...cameraDevices, ...micDevices].some((device) => Boolean(device.label));
    if (!cameraDevices.length && !micDevices.length) {
      el.deviceHint.textContent = "No camera or microphone devices detected.";
    } else if (!hasVisibleLabels) {
      el.deviceHint.textContent = "Device names are hidden until access is granted. Click Refresh and allow access.";
    } else {
      el.deviceHint.textContent = "Detected " + cameraDevices.length + " camera(s) and " + micDevices.length + " microphone(s).";
    }

    syncMicDependentControls();
    saveSettingsToStorage();
  } catch (error) {
    console.warn("Device enumeration failed:", error);
    if (!silent) {
      el.deviceHint.textContent = "Could not list devices. Check browser permissions and try Refresh.";
    }
  }
}

async function requestTemporaryMediaAccessForLabels() {
  const wantsVideo = el.includeWebcam.checked;
  const wantsAudio = el.includeMic.checked;

  // Request at least one media type so labels can be revealed, preferring camera as neutral fallback.
  const requestVideo = wantsVideo || !wantsAudio;
  const requestAudio = wantsAudio;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: requestVideo,
    audio: requestAudio
  });

  stopStream(stream);
}

function populateDeviceSelect(selectEl, devices, defaultLabel, selectedValue, fallbackPrefix) {
  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  selectEl.append(defaultOption);

  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || fallbackPrefix + " " + (index + 1);
    selectEl.append(option);
  });

  if (selectedValue && devices.some((device) => device.deviceId === selectedValue)) {
    selectEl.value = selectedValue;
  } else {
    selectEl.value = "";
  }
}

function applyConstraintSupport() {
  const hints = [];
  const supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() || {};

  for (const pair of [
    ["autoGainControl", "Auto gain control unavailable in this browser"],
    ["noiseSuppression", "Noise suppression unavailable in this browser"],
    ["echoCancellation", "Echo cancellation unavailable in this browser"]
  ]) {
    const [key, label] = pair;
    if (!supportedConstraints[key]) {
      el[key].checked = false;
      el[key].disabled = true;
      hints.push(label);
    }
  }

  state.mediaRecorderSupported = "MediaRecorder" in window;
  if (!state.mediaRecorderSupported) {
    hints.push("MediaRecorder is not available.");
    el.startBtn.disabled = true;
  }

  if (!("FaceDetector" in window)) {
    el.faceCrop.checked = false;
    el.faceCrop.disabled = true;
    hints.push("Face auto-crop needs FaceDetector support (currently best in Chromium browsers).");
  }

  if (!state.transcript.supported) {
    el.enableTranscription.checked = false;
    el.enableTranscription.disabled = true;
    el.transcriptionLang.disabled = true;
    hints.push("Live transcription needs SpeechRecognition support in this browser.");
  }

  if (!navigator.mediaDevices?.enumerateDevices) {
    el.refreshDevicesBtn.disabled = true;
    el.cameraDevice.disabled = true;
    el.micDevice.disabled = true;
    hints.push("Input device selection is unavailable in this browser.");
  }

  if (!isChromiumFamilyBrowser) {
    hints.push("System audio capture may be limited outside Chromium browsers.");
  }

  if (hints.length) {
    el.supportHint.textContent = hints.join(" ");
  }

  updateFaceCropStatus();
  saveSettingsToStorage();
}

function clearRunAnalysisState() {
  state.silenceMonitor.segments = [];
  state.silenceMonitor.silenceSinceMs = 0;
  state.silenceMonitor.currentSkipStartMs = 0;
  state.transcript.entries = [];
  state.transcript.interimText = "";
  state.sessionExports.transcriptText = "";
  state.sessionExports.transcriptFilename = "";
  el.downloadTranscriptBtn.disabled = true;
  renderTranscriptFeed();
  toggleTranscriptPanel();
}

function getInputSignature(options) {
  return JSON.stringify({
    includeWebcam: options.includeWebcam,
    includeMic: options.includeMic,
    includeSystemAudio: options.includeSystemAudio,
    cameraDeviceId: options.cameraDeviceId || "",
    micDeviceId: options.micDeviceId || "",
    autoGainControl: options.autoGainControl,
    noiseSuppression: options.noiseSuppression,
    echoCancellation: options.echoCancellation
  });
}

function nextPhaseTransitionToken() {
  state.phaseTransitionToken += 1;
  return state.phaseTransitionToken;
}

function isPhaseTransitionTokenCurrent(token) {
  return token === state.phaseTransitionToken;
}

function didSystemAudioSelectionChange(previousOptions, nextOptions) {
  if (!previousOptions) {
    return false;
  }
  return Boolean(previousOptions.includeSystemAudio) !== Boolean(nextOptions.includeSystemAudio);
}

function buildDisplayConstraints(options, { includeExtended = true } = {}) {
  const outputPreset = getOutputResolutionPreset(options.outputResolution);
  const constraints = {
    video: {
      width: { ideal: outputPreset.width },
      height: { ideal: outputPreset.height },
      aspectRatio: { ideal: outputPreset.width / outputPreset.height },
      frameRate: { ideal: 30, max: 60 },
      cursor: "always"
    },
    audio: options.includeSystemAudio
  };

  if (includeExtended && isChromiumFamilyBrowser) {
    constraints.systemAudio = options.includeSystemAudio ? "include" : "exclude";
    constraints.surfaceSwitching = "include";
  }

  return constraints;
}

async function refreshDisplayCapture(options) {
  const preferredConstraints = buildDisplayConstraints(options);
  let nextDisplayStream;
  try {
    nextDisplayStream = await navigator.mediaDevices.getDisplayMedia(preferredConstraints);
  } catch (error) {
    const shouldRetryWithoutExtendedConstraints =
      isChromiumFamilyBrowser && isDisplayConstraintCompatibilityError(error);
    if (!shouldRetryWithoutExtendedConstraints) {
      throw error;
    }

    console.warn("Retrying display capture with baseline constraints:", error);
    nextDisplayStream = await navigator.mediaDevices.getDisplayMedia(
      buildDisplayConstraints(options, { includeExtended: false })
    );
  }
  const displayTrack = nextDisplayStream.getVideoTracks()[0];
  if (!displayTrack) {
    stopStream(nextDisplayStream);
    throw new Error("Display video track missing.");
  }

  displayTrack.addEventListener("ended", () => {
    if (state.phase !== "idle") {
      stopSession();
    }
  });

  const previousDisplayStream = state.displayStream;
  state.displayStream = nextDisplayStream;
  state.displayVideo.srcObject = new MediaStream(state.displayStream.getVideoTracks());
  await safePlay(state.displayVideo);
  stopStream(previousDisplayStream);
}

async function syncPreparedCaptureSelection(options) {
  const displayRefreshed = didSystemAudioSelectionChange(state.preparedOptions, options);
  if (displayRefreshed) {
    await refreshDisplayCapture(options);
  }

  await applyUserMediaSelection(options, { updateHint: false });
  state.preparedOptions = options;
  state.preparedInputSignature = getInputSignature(options);
  return { displayRefreshed };
}

async function handleStagedInputSelectionChange() {
  if (state.phase !== "staged" && state.phase !== "ready") {
    return;
  }

  await applyPreparedInputChanges(getOptions());
}

async function applyPreparedInputChanges(options) {
  if (state.phase !== "staged" && state.phase !== "ready") {
    return;
  }

  if (state.applyingInputChanges) {
    state.pendingInputChangeApply = true;
    return;
  }

  const transitionToken = nextPhaseTransitionToken();
  state.applyingInputChanges = true;
  setPhase("ready", "Updating");

  try {
    const result = await syncPreparedCaptureSelection(options);
    if (!isPhaseTransitionTokenCurrent(transitionToken) || state.phase !== "ready") {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }
    if (!state.renderHandle) {
      startRenderLoop();
    }
    setPhase("staged", "Ready");
    el.supportHint.textContent = result.displayRefreshed
      ? "Display source refreshed to apply system audio changes. Adjust webcam placement, then click Start Recording."
      : "Inputs updated. Adjust webcam placement, then click Start Recording.";
  } catch (error) {
    if (!isPhaseTransitionTokenCurrent(transitionToken) || state.phase === "idle") {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }
    reportError(error);
    setPhase("staged", "Ready");
  } finally {
    state.applyingInputChanges = false;
    if (state.pendingInputChangeApply && isPhaseTransitionTokenCurrent(transitionToken) && (state.phase === "staged" || state.phase === "ready")) {
      state.pendingInputChangeApply = false;
      await applyPreparedInputChanges(getOptions());
    } else if (state.phase === "idle") {
      state.pendingInputChangeApply = false;
    }
  }
}

async function startSession() {
  if (state.phase === "idle") {
    await prepareSession();
    return;
  }

  if (state.phase === "staged") {
    await beginRecordingSession();
  }
}

async function prepareSession() {
  const transitionToken = nextPhaseTransitionToken();
  state.cancelCountdown = false;
  clearRunAnalysisState();
  setPhase("ready", "Preparing");

  try {
    const options = getOptions();
    applyOutputResolutionSelection({ redraw: false });
    state.preparedOptions = options;
    state.preparedInputSignature = getInputSignature(options);
    await acquireStreams(options);
    if (!isPhaseTransitionTokenCurrent(transitionToken) || state.phase !== "ready") {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }
    await startFaceDetectionIfEnabled();
    if (!isPhaseTransitionTokenCurrent(transitionToken) || state.phase !== "ready") {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }
    startRenderLoop();
    if (!isPhaseTransitionTokenCurrent(transitionToken) || state.phase !== "ready") {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }

    setPhase("staged", "Ready");
    el.supportHint.textContent = "Adjust webcam placement in preview, then click Start Recording.";
  } catch (error) {
    if (!isPhaseTransitionTokenCurrent(transitionToken)) {
      if (state.phase === "idle") {
        await teardownSession({ keepDownloads: true });
      }
      return;
    }
    if (!isCancellation(error)) {
      reportError(error);
    }
    await teardownSession({ keepDownloads: true });
    setPhase("idle", "Idle");
  }
}

async function beginRecordingSession() {
  if (state.phase !== "staged" || state.isRecordingStarting) {
    return;
  }

  state.isRecordingStarting = true;
  setPhase("ready", "Starting");

  try {
    const options = getOptions();
    applyOutputResolutionSelection({ redraw: false });
    const inputSignature = getInputSignature(options);
    if (inputSignature !== state.preparedInputSignature) {
      await syncPreparedCaptureSelection(options);
    }

    if (options.countdownSeconds > 0) {
      await runCountdown(options.countdownSeconds);
    }

    if (state.cancelCountdown) {
      throw new Error("Recording canceled");
    }

    await startRecorder();
    setPhase("recording", "Recording");
    startClock();

    await startTranscriptionIfEnabled(options);
    await startSilenceMonitorIfEnabled(options);
  } catch (error) {
    if (!isCancellation(error)) {
      reportError(error);
    }
    if (state.phase !== "idle" && !state.isStopping) {
      state.isRecordingStarting = false;
      await teardownSession({ keepDownloads: true });
      setPhase("idle", "Idle");
    }
  } finally {
    state.isRecordingStarting = false;
  }
}

async function acquireStreams(options) {
  await refreshDisplayCapture(options);

  try {
    await applyUserMediaSelection(options, { updateHint: false });
  } catch (error) {
    console.warn("User media unavailable, continuing without webcam/mic:", error);
    el.supportHint.textContent = "Camera/microphone unavailable. Continuing with screen-only capture.";
    if (state.previewMode === "camera") {
      state.previewMode = "screen";
      updatePreviewModeButtons();
    }
  }

  state.displayVideo.srcObject = new MediaStream(state.displayStream.getVideoTracks());
  await safePlay(state.displayVideo);

  if (state.webcamStream) {
    state.webcamVideo.srcObject = new MediaStream(state.webcamStream.getVideoTracks());
    await safePlay(state.webcamVideo);
  } else {
    state.webcamVideo.srcObject = null;
  }

  state.overlay.x = 0.72;
  state.overlay.y = 0.69;
  resetFaceTarget();
}

async function applyUserMediaSelection(options, { updateHint = false } = {}) {
  const needsUserMedia = options.includeWebcam || options.includeMic;
  if (!needsUserMedia) {
    stopStream(state.webcamStream);
    stopStream(state.micStream);
    state.webcamStream = null;
    state.micStream = null;
    state.webcamVideo.srcObject = null;
    stopFaceDetection();
    resetFaceTarget();
    return;
  }

  const userStream = await requestUserMediaForOptions(options);
  const webcamTrack = userStream.getVideoTracks()[0] || null;
  const micTrack = userStream.getAudioTracks()[0] || null;

  const prevWebcam = state.webcamStream;
  const prevMic = state.micStream;

  state.webcamStream = webcamTrack ? new MediaStream([webcamTrack]) : null;
  state.micStream = micTrack ? new MediaStream([micTrack]) : null;

  stopStream(prevWebcam);
  stopStream(prevMic);

  if (state.webcamStream) {
    state.webcamVideo.srcObject = new MediaStream(state.webcamStream.getVideoTracks());
    await safePlay(state.webcamVideo);
    await startFaceDetectionIfEnabled();
  } else {
    state.webcamVideo.srcObject = null;
    stopFaceDetection();
    resetFaceTarget();
  }

  if (!state.webcamStream && state.previewMode === "camera") {
    state.previewMode = "screen";
  }
  updatePreviewModeButtons();

  await refreshDeviceSelectors({ requestAccess: false, silent: true });

  if (updateHint) {
    el.supportHint.textContent = "Inputs updated. Adjust webcam placement, then click Start Recording.";
  }
}

async function requestUserMediaForOptions(options) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: options.includeWebcam ? buildVideoConstraints(options) : false,
      audio: options.includeMic ? buildMicConstraints(options) : false
    });
  } catch (error) {
    const selectedDeviceFailed =
      (options.cameraDeviceId || options.micDeviceId) &&
      (error?.name === "OverconstrainedError" || error?.name === "NotFoundError");

    if (!selectedDeviceFailed) {
      throw error;
    }

    el.deviceHint.textContent = "Selected device unavailable. Falling back to default inputs.";
    return navigator.mediaDevices.getUserMedia({
      video: options.includeWebcam ? buildVideoConstraints({ ...options, cameraDeviceId: "" }) : false,
      audio: options.includeMic ? buildMicConstraints({ ...options, micDeviceId: "" }) : false
    });
  }
}

function buildVideoConstraints(options) {
  const constraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 }
  };

  if (options.cameraDeviceId) {
    constraints.deviceId = { exact: options.cameraDeviceId };
  }

  return constraints;
}

function buildMicConstraints(options) {
  const constraints = {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 }
  };

  if (!el.echoCancellation.disabled) {
    constraints.echoCancellation = options.echoCancellation;
  }
  if (!el.noiseSuppression.disabled) {
    constraints.noiseSuppression = options.noiseSuppression;
  }
  if (!el.autoGainControl.disabled) {
    constraints.autoGainControl = options.autoGainControl;
  }
  if (options.micDeviceId) {
    constraints.deviceId = { exact: options.micDeviceId };
  }
  return constraints;
}

async function safePlay(video) {
  try {
    await video.play();
  } catch (error) {
    if (error?.name !== "AbortError") {
      throw error;
    }
  }
}

async function runCountdown(seconds) {
  el.countdownOverlay.classList.remove("hidden");
  state.countdownRemaining = seconds;
  updateDocumentTitle();
  for (let n = seconds; n >= 1; n -= 1) {
    state.countdownRemaining = n;
    updateDocumentTitle();
    if (state.cancelCountdown) {
      el.countdownOverlay.classList.add("hidden");
      state.countdownRemaining = 0;
      updateDocumentTitle();
      throw new Error("Countdown canceled");
    }
    el.countdownOverlay.textContent = String(n);
    await beep(840, 120);
    await sleep(900);
  }

  el.countdownOverlay.textContent = "REC";
  await beep(1040, 90);
  await sleep(100);
  await beep(1240, 100);
  await sleep(240);
  el.countdownOverlay.classList.add("hidden");
  state.countdownRemaining = 0;
  updateDocumentTitle();
}

async function beep(frequency, durationMs) {
  const audioContext = await getUiAudioContext();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + durationMs / 1000 + 0.03);
}

async function getUiAudioContext() {
  if (!state.uiAudioContext || state.uiAudioContext.state === "closed") {
    state.uiAudioContext = new AudioContext();
  }
  if (state.uiAudioContext.state === "suspended") {
    await state.uiAudioContext.resume();
  }
  return state.uiAudioContext;
}

async function startRecorder() {
  state.chunks = [];
  state.outputStream = await buildOutputStream();
  renderFrameForPipeline(true);

  state.mimeType = pickMimeType();
  const recorderOptions = {};
  if (state.mimeType) {
    recorderOptions.mimeType = state.mimeType;
  }
  recorderOptions.videoBitsPerSecond = estimateVideoBitrate(el.previewCanvas.width, el.previewCanvas.height);
  if (state.outputStream.getAudioTracks().length) {
    recorderOptions.audioBitsPerSecond = 160000;
  }

  try {
    state.mediaRecorder = new MediaRecorder(state.outputStream, recorderOptions);
  } catch (error) {
    console.warn("Recorder bitrate options unsupported, falling back:", error);
    const fallbackOptions = state.mimeType ? { mimeType: state.mimeType } : undefined;
    state.mediaRecorder = new MediaRecorder(state.outputStream, fallbackOptions);
  }

  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };
  state.mediaRecorder.start(1000);
}

async function buildOutputStream() {
  // Use manual frame requests so audio callbacks can keep video frames flowing in background tabs.
  const canvasStream = el.previewCanvas.captureStream(0);
  const canvasTrack = canvasStream.getVideoTracks()[0] || null;
  const tracks = [];
  if (canvasTrack) {
    tracks.push(canvasTrack);
  }

  const mixContext = new AudioContext();
  if (mixContext.state === "suspended") {
    await mixContext.resume();
  }
  const destination = mixContext.createMediaStreamDestination();
  let hasMixedAudio = false;
  if (state.micStream?.getAudioTracks().length) {
    const micSource = mixContext.createMediaStreamSource(state.micStream);
    const micCompressor = mixContext.createDynamicsCompressor();
    const micGain = mixContext.createGain();

    micCompressor.threshold.value = -28;
    micCompressor.knee.value = 18;
    micCompressor.ratio.value = 3;
    micCompressor.attack.value = 0.01;
    micCompressor.release.value = 0.2;
    micGain.gain.value = 1.1;

    micSource.connect(micCompressor).connect(micGain).connect(destination);
    hasMixedAudio = true;
  }

  if (state.displayStream?.getAudioTracks().length) {
    const displayAudioStream = new MediaStream(state.displayStream.getAudioTracks());
    const displaySource = mixContext.createMediaStreamSource(displayAudioStream);
    const displayGain = mixContext.createGain();
    displayGain.gain.value = 0.9;
    displaySource.connect(displayGain).connect(destination);
    hasMixedAudio = true;
  }

  startAudioRenderHeartbeat(mixContext, hasMixedAudio ? destination : mixContext.destination);

  if (hasMixedAudio) {
    const mixedTrack = destination.stream.getAudioTracks()[0] || null;
    if (mixedTrack) {
      tracks.push(mixedTrack);
    }
  }

  state.audioMixContext = mixContext;
  state.mixedDestination = destination;
  state.canvasTrack = canvasTrack;

  return new MediaStream(tracks);
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  for (const type of [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ]) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

async function togglePause() {
  if (!state.mediaRecorder) {
    return;
  }

  if (state.phase === "recording") {
    pauseRecorder({ automatic: false, reason: "Paused by user." });
    return;
  }

  if (state.phase === "paused") {
    if (state.autoPauseActive) {
      finishCurrentSilenceSegment();
    }
    resumeRecorder({ automatic: false });
  }
}

async function resetCurrentTake({ keepDownload }) {
  if (state.timing.pausedAt) {
    state.timing.pausedTotal += Date.now() - state.timing.pausedAt;
    state.timing.pausedAt = 0;
  }

  if (state.autoPauseActive) {
    finishCurrentSilenceSegment();
    state.autoPauseActive = false;
  }

  await stopTranscription();
  finishCurrentSilenceSegment();
  stopSilenceMonitor();

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve();
      };

      state.mediaRecorder.addEventListener("stop", done, { once: true });
      try {
        state.mediaRecorder.stop();
      } catch {
        done();
      }
      setTimeout(done, 1800);
    });
  }

  if (keepDownload && state.chunks.length > 0) {
    addDownloadItem();
  }

  stopClock();
  clearCountdown();
  stopStream(state.outputStream);
  state.outputStream = null;
  state.canvasTrack = null;
  state.mediaRecorder = null;
  state.chunks = [];
  state.mimeType = "";

  stopAudioRenderHeartbeat();
  if (state.audioMixContext && state.audioMixContext.state !== "closed") {
    await state.audioMixContext.close();
  }
  state.audioMixContext = null;
  state.mixedDestination = null;
}

async function restartTake() {
  if ((state.phase !== "recording" && state.phase !== "paused") || state.isStopping || state.isRestarting) {
    return;
  }

  state.cancelCountdown = false;
  state.isRestarting = true;
  setPhase("ready", "Restarting");

  try {
    await resetCurrentTake({ keepDownload: false });
    clearRunAnalysisState();

    const options = getOptions();
    if (options.countdownSeconds > 0) {
      await runCountdown(options.countdownSeconds);
    }

    if (state.cancelCountdown) {
      throw new Error("Recording canceled");
    }

    await startRecorder();
    setPhase("recording", "Recording");
    startClock();

    await startTranscriptionIfEnabled(options);
    await startSilenceMonitorIfEnabled(options);
    el.supportHint.textContent = "Restarted take. Sources stayed connected.";
  } catch (error) {
    const canceled = isCancellation(error);
    if (!canceled) {
      reportError(error);
      if (state.phase !== "idle") {
        try {
          await resetCurrentTake({ keepDownload: false });
        } catch (cleanupError) {
          console.warn("Restart cleanup failed:", cleanupError);
        }
      }
    }
    if (state.phase !== "idle") {
      setPhase("staged", "Ready");
      if (canceled) {
        el.supportHint.textContent = "Restart canceled. Sources are still ready.";
      }
    }
  } finally {
    state.isRestarting = false;
    if (state.phase === "recording") {
      setPhase("recording", "Recording");
    } else if (state.phase === "paused") {
      setPhase("paused", "Paused");
    } else if (state.phase === "staged") {
      setPhase("staged", "Ready");
    } else if (state.phase === "idle") {
      setPhase("idle", "Idle");
    }
  }
}

async function stopSession() {
  if (state.phase === "idle" || state.isStopping) {
    return;
  }
  nextPhaseTransitionToken();
  state.cancelCountdown = true;
  state.isStopping = true;

  try {
    if (state.timing.pausedAt) {
      state.timing.pausedTotal += Date.now() - state.timing.pausedAt;
      state.timing.pausedAt = 0;
    }

    if (state.autoPauseActive) {
      finishCurrentSilenceSegment();
      state.autoPauseActive = false;
    }

    if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) {
            return;
          }
          resolved = true;
          resolve();
        };

        state.mediaRecorder.addEventListener("stop", done, { once: true });
        try {
          state.mediaRecorder.stop();
        } catch {
          done();
        }
        setTimeout(done, 1800);
      });
    }

    await stopTranscription();

    if (state.chunks.length > 0) {
      addDownloadItem();
    }
  } finally {
    await teardownSession({ keepDownloads: true });
    setPhase("idle", "Idle");
    state.isStopping = false;
  }
}

function addDownloadItem() {
  const mimeType = state.mimeType || "video/webm";
  const blob = new Blob(state.chunks, { type: mimeType });
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `screenrecord-${stamp}.${ext}`;

  const item = document.createElement("li");
  item.className = "download-item";
  const sizeMb = `${(blob.size / (1024 * 1024)).toFixed(1)} MB`;

  const links = document.createElement("div");
  links.className = "download-links";

  const videoLink = document.createElement("a");
  videoLink.href = url;
  videoLink.download = filename;
  videoLink.textContent = filename;
  links.append(videoLink);

  const transcriptText = buildTranscriptExportText(filename);
  if (transcriptText) {
    state.sessionExports.transcriptText = transcriptText;
    state.sessionExports.transcriptFilename = filename.replace(/\.[a-z0-9]+$/i, ".txt");

    const transcriptBlob = new Blob([transcriptText], { type: "text/plain;charset=utf-8" });
    const transcriptUrl = URL.createObjectURL(transcriptBlob);
    const transcriptLink = document.createElement("a");
    transcriptLink.href = transcriptUrl;
    transcriptLink.download = state.sessionExports.transcriptFilename;
    transcriptLink.textContent = "Transcript";
    links.append(transcriptLink);

    el.downloadTranscriptBtn.disabled = false;
    toggleTranscriptPanel(true);
  }

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = sizeMb;

  item.append(links, meta);
  el.downloadList.prepend(item);
  el.downloadsPanel.classList.remove("hidden");
}

async function teardownSession({ keepDownloads }) {
  stopClock();
  stopRenderLoop();
  stopFaceDetection();
  clearCountdown();

  finishCurrentSilenceSegment();
  stopSilenceMonitor();
  await stopTranscription();

  stopStream(state.displayStream);
  stopStream(state.webcamStream);
  stopStream(state.micStream);
  stopStream(state.outputStream);

  state.displayStream = null;
  state.webcamStream = null;
  state.micStream = null;
  state.outputStream = null;
  state.canvasTrack = null;
  state.mediaRecorder = null;
  state.chunks = [];
  state.mimeType = "";
  state.autoPauseActive = false;
  state.preparedOptions = null;
  state.preparedInputSignature = "";
  state.applyingInputChanges = false;
  state.pendingInputChangeApply = false;

  state.displayVideo.srcObject = null;
  state.webcamVideo.srcObject = null;

  stopAudioRenderHeartbeat();
  if (state.audioMixContext && state.audioMixContext.state !== "closed") {
    await state.audioMixContext.close();
  }
  state.audioMixContext = null;
  state.mixedDestination = null;

  if (state.uiAudioContext && state.uiAudioContext.state !== "closed") {
    await state.uiAudioContext.close();
  }
  state.uiAudioContext = null;

  if (!keepDownloads) {
    el.downloadList.innerHTML = "";
    el.downloadsPanel.classList.add("hidden");
  }

  drawIdleSlate();
}

function stopStream(stream) {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function startRenderLoop() {
  stopRenderLoop();
  state.renderClock.lastFrameAt = 0;
  const draw = () => {
    renderFrameForPipeline();
    state.renderHandle = requestAnimationFrame(draw);
  };
  renderFrameForPipeline(true);
  state.renderHandle = requestAnimationFrame(draw);
}

function stopRenderLoop() {
  if (state.renderHandle) {
    cancelAnimationFrame(state.renderHandle);
  }
  state.renderHandle = 0;
}

function renderFrameForPipeline(force = false) {
  const now = performance.now();
  if (!force && now - state.renderClock.lastFrameAt < state.renderClock.frameIntervalMs) {
    return;
  }

  renderFrame();
  requestCanvasFrame();
  state.renderClock.lastFrameAt = now;
}

function requestCanvasFrame() {
  if (state.canvasTrack?.requestFrame) {
    state.canvasTrack.requestFrame();
  }
}

function renderFrame() {
  const cw = el.previewCanvas.width;
  const ch = el.previewCanvas.height;

  ctx.fillStyle = "#060b10";
  ctx.fillRect(0, 0, cw, ch);

  if (state.previewMode === "camera") {
    drawCameraFullscreen(cw, ch);
  } else {
    drawDisplayTrack(cw, ch);
    drawWebcamOverlay(cw, ch);
  }
  drawRecordingBadge(cw);
}

function drawDisplayTrack(cw, ch) {
  const video = state.displayVideo;
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    drawIdleSlate();
    return;
  }

  const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const x = (cw - width) / 2;
  const y = (ch - height) / 2;

  ctx.fillStyle = "#02040a";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(video, x, y, width, height);
}

function drawCameraFullscreen(cw, ch) {
  const video = state.webcamVideo;
  if (!state.webcamStream || !video || video.readyState < 2 || !el.includeWebcam.checked) {
    drawDisplayTrack(cw, ch);
    return;
  }

  const source = getWebcamCropRect(video.videoWidth, video.videoHeight, cw / ch);
  ctx.drawImage(video, source.sx, source.sy, source.sw, source.sh, 0, 0, cw, ch);
}

function drawWebcamOverlay(cw, ch) {
  const video = state.webcamVideo;
  if (!state.webcamStream || !video || video.readyState < 2 || !el.includeWebcam.checked) {
    return;
  }

  const shape = el.webcamShape.value;
  const sizePct = Number(el.webcamSize.value) / 100;
  const webcamAspect = video.videoWidth / video.videoHeight || 16 / 9;
  const width = Math.round(cw * sizePct);
  const isCircle = shape === "circle";
  const isRoundedSquare = shape === "rounded-square";
  const height = isCircle || isRoundedSquare ? width : Math.round(width / webcamAspect);
  const uiScale = Math.max(1, cw / 1280);
  const cornerRadius = isCircle ? width / 2 : Math.min(28 * uiScale, width * 0.16, height * 0.16);
  const faceCropEnabled = el.faceCrop.checked && Boolean(state.faceDetector);
  const trackingActive = faceCropEnabled && Date.now() - state.faceTarget.lastSeenAt < 1200;

  const clamped = clampOverlayPosition(state.overlay.x, state.overlay.y, width, height, cw, ch);
  state.overlay.x = clamped.x;
  state.overlay.y = clamped.y;
  state.overlay.width = width;
  state.overlay.height = height;

  const x = Math.round(state.overlay.x * cw);
  const y = Math.round(state.overlay.y * ch);

  const source = getWebcamCropRect(video.videoWidth, video.videoHeight, width / height);
  const path = new Path2D();
  drawRoundedPath(path, x, y, width, height, cornerRadius);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(12, 18, 28, 0.4)";
  ctx.fill(path);
  ctx.restore();

  ctx.save();
  ctx.clip(path);
  ctx.drawImage(video, source.sx, source.sy, source.sw, source.sh, x, y, width, height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = faceCropEnabled
    ? trackingActive
      ? "rgba(88, 208, 95, 0.95)"
      : "rgba(244, 201, 96, 0.95)"
    : "rgba(88, 208, 95, 0.95)";
  ctx.lineWidth = 3 * uiScale;
  ctx.stroke(path);
  if (shape !== "circle") {
    ctx.fillStyle = "rgba(76, 182, 255, 0.9)";
    const accentInset = Math.max(2, Math.round(2 * uiScale));
    const accentHeight = Math.max(4, Math.round(5 * uiScale));
    ctx.fillRect(x + accentInset, y + accentInset, width - accentInset * 2, accentHeight);
  }

  if (faceCropEnabled && width >= 92 * uiScale && height >= 48 * uiScale) {
    const badgeText = trackingActive ? "Face Lock" : "Face Search";
    ctx.font = `600 ${Math.round(11 * uiScale)}px "IBM Plex Mono", monospace`;
    const textWidth = Math.ceil(ctx.measureText(badgeText).width);
    const badgeWidth = Math.min(width - Math.round(12 * uiScale), textWidth + Math.round(16 * uiScale));
    const badgeHeight = Math.round(20 * uiScale);
    const badgeX = x + Math.round(8 * uiScale);
    const badgeY = y + height - badgeHeight - Math.round(8 * uiScale);

    ctx.fillStyle = trackingActive ? "rgba(11, 44, 18, 0.88)" : "rgba(56, 41, 8, 0.9)";
    ctx.strokeStyle = trackingActive ? "rgba(114, 246, 136, 0.95)" : "rgba(255, 214, 122, 0.95)";
    ctx.lineWidth = 1.2 * uiScale;
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, Math.round(8 * uiScale));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = trackingActive ? "#b8ffc4" : "#ffe1a2";
    ctx.fillText(badgeText, badgeX + Math.round(8 * uiScale), badgeY + Math.round(14 * uiScale));
  }
  ctx.restore();
}

function getWebcamCropRect(videoW, videoH, targetAspect) {
  const autoCropEnabled = el.faceCrop.checked && state.faceDetector;
  let scale = state.faceTarget.scale;
  let cx = state.faceTarget.cx;
  let cy = state.faceTarget.cy;

  if (!autoCropEnabled) {
    scale = 1;
    cx = 0.5;
    cy = 0.5;
  }

  let sw = Math.max(1, Math.min(videoW, videoW * scale));
  let sh = sw / targetAspect;
  if (sh > videoH) {
    sh = videoH;
    sw = sh * targetAspect;
  }

  let sx = cx * videoW - sw / 2;
  let sy = cy * videoH - sh / 2;
  sx = clamp(sx, 0, videoW - sw);
  sy = clamp(sy, 0, videoH - sh);

  return { sx, sy, sw, sh };
}

function drawRoundedPath(path, x, y, width, height, radius) {
  if (radius >= width / 2 && radius >= height / 2) {
    path.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
    return;
  }

  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
}

function drawRecordingBadge(cw) {
  if (state.phase !== "recording" && state.phase !== "paused") {
    return;
  }

  const uiScale = Math.max(1, cw / 1280);
  const elapsed = getElapsedMs();
  const label = formatTime(elapsed);
  const x = Math.round(18 * uiScale);
  const y = Math.round(18 * uiScale);
  const width = Math.round(120 * uiScale);
  const height = Math.round(38 * uiScale);

  ctx.save();
  ctx.fillStyle = "rgba(5, 10, 14, 0.78)";
  ctx.strokeStyle = "rgba(151, 172, 183, 0.35)";
  ctx.lineWidth = 1 * uiScale;
  roundRect(ctx, x, y, width, height, Math.round(10 * uiScale));
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = state.phase === "recording" ? "#ec5f5f" : "#4cb6ff";
  ctx.arc(x + Math.round(16 * uiScale), y + Math.round(19 * uiScale), 6 * uiScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eaf1ff";
  ctx.font = `600 ${Math.round(16 * uiScale)}px "IBM Plex Mono", monospace`;
  ctx.fillText(label, x + Math.round(28 * uiScale), y + Math.round(24 * uiScale));
  ctx.restore();

  if (cw < 680) {
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 16, 0.45)";
    ctx.fillRect(0, 0, cw, 1);
    ctx.restore();
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawIdleSlate() {
  const cw = el.previewCanvas.width;
  const ch = el.previewCanvas.height;
  const uiScale = Math.max(1, cw / 1280);
  ctx.fillStyle = "#060b10";
  ctx.fillRect(0, 0, cw, ch);

  ctx.strokeStyle = "rgba(39, 56, 66, 0.45)";
  ctx.lineWidth = 1 * uiScale;
  for (let x = 0; x < cw; x += Math.round(64 * uiScale)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ch);
    ctx.stroke();
  }
  for (let y = 0; y < ch; y += Math.round(64 * uiScale)) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cw, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(88, 208, 95, 0.16)";
  ctx.fillRect(0, ch - Math.round(44 * uiScale), cw, Math.round(44 * uiScale));

  ctx.fillStyle = "rgba(231, 240, 245, 0.96)";
  ctx.font = `700 ${Math.round(36 * uiScale)}px "Chakra Petch", sans-serif`;
  ctx.fillText("Ready to Record", Math.round(48 * uiScale), ch / 2 - Math.round(10 * uiScale));

  ctx.fillStyle = "rgba(151, 172, 183, 0.95)";
  ctx.font = `500 ${Math.round(22 * uiScale)}px "Chakra Petch", sans-serif`;
  ctx.fillText("Choose screen, window, or tab to begin.", Math.round(48 * uiScale), ch / 2 + Math.round(28 * uiScale));
}

function startClock() {
  state.timing.startedAt = Date.now();
  state.timing.pausedAt = 0;
  state.timing.pausedTotal = 0;
  stopClock();
  state.timerHandle = setInterval(() => {
    el.timerText.textContent = formatTime(getElapsedMs());
    updateDocumentTitle();
  }, 200);
  updateDocumentTitle();
}

function stopClock() {
  if (state.timerHandle) {
    clearInterval(state.timerHandle);
  }
  state.timerHandle = 0;
  el.timerText.textContent = "00:00";
  updateDocumentTitle();
}

function getElapsedMs() {
  if (!state.timing.startedAt) {
    return 0;
  }
  const anchor = state.phase === "paused" ? state.timing.pausedAt : Date.now();
  return Math.max(0, anchor - state.timing.startedAt - state.timing.pausedTotal);
}

function setPhase(phase, label) {
  state.phase = phase;
  el.statusPill.textContent = label;
  el.statusPill.className = `pill ${phaseToPillClass(phase)}`;

  const startDisabled =
    !state.mediaRecorderSupported ||
    phase === "ready" ||
    phase === "recording" ||
    phase === "paused" ||
    state.isRecordingStarting ||
    state.isRestarting;
  const stopDisabled = phase === "idle";
  const pauseDisabled = !(phase === "recording" || phase === "paused") || state.isRestarting;
  const restartDisabled = !(phase === "recording" || phase === "paused") || state.isRestarting;

  el.startBtn.disabled = startDisabled;
  el.stopBtn.disabled = stopDisabled;
  el.pauseBtn.disabled = pauseDisabled;
  el.restartBtn.disabled = restartDisabled;
  el.pauseBtn.textContent = phase === "paused" ? "Resume" : "Pause";
  el.restartBtn.textContent = state.isRestarting ? "Restarting..." : "Restart Take";
  el.outputResolution.disabled = phase === "recording" || phase === "paused" || phase === "ready";

  if (phase === "idle") {
    el.startBtn.textContent = "Prepare Sources";
  } else if (phase === "staged") {
    el.startBtn.textContent = "Start Recording";
  } else if (phase === "ready") {
    el.startBtn.textContent = "Preparing...";
  }

  syncMicDependentControls();
  updateDocumentTitle();
}

function phaseToPillClass(phase) {
  if (phase === "recording") {
    return "pill-recording";
  }
  if (phase === "paused") {
    return "pill-paused";
  }
  if (phase === "ready" || phase === "staged") {
    return "pill-ready";
  }
  return "pill-idle";
}

function getOptions() {
  return {
    countdownSeconds: Number(el.countdownSeconds.value),
    outputResolution: el.outputResolution.value,
    includeWebcam: el.includeWebcam.checked,
    includeMic: el.includeMic.checked,
    includeSystemAudio: el.includeSystemAudio.checked,
    autoGainControl: el.autoGainControl.checked,
    noiseSuppression: el.noiseSuppression.checked,
    echoCancellation: el.echoCancellation.checked,
    autoSkipSilence: el.autoSkipSilence.checked,
    silenceSeconds: Number(el.silenceSeconds.value),
    silenceThreshold: Number(el.silenceThreshold.value),
    enableTranscription: el.enableTranscription.checked,
    transcriptionLang: el.transcriptionLang.value,
    cameraDeviceId: el.cameraDevice.value,
    micDeviceId: el.micDevice.value
  };
}

function getOutputResolutionPreset(value) {
  return OUTPUT_RESOLUTION_PRESETS[value] || OUTPUT_RESOLUTION_PRESETS["1920x1080"];
}

function applyOutputResolutionSelection({ redraw = true } = {}) {
  const preset = getOutputResolutionPreset(el.outputResolution.value);
  el.previewCanvas.width = preset.width;
  el.previewCanvas.height = preset.height;

  const clamped = clampOverlayPosition(
    state.overlay.x,
    state.overlay.y,
    state.overlay.width,
    state.overlay.height,
    preset.width,
    preset.height
  );
  state.overlay.x = clamped.x;
  state.overlay.y = clamped.y;
  state.renderClock.lastFrameAt = 0;

  if (redraw) {
    renderFrame();
    requestCanvasFrame();
  }
}

function estimateVideoBitrate(width, height) {
  const basePixels = 1280 * 720;
  const targetPixels = Math.max(basePixels, width * height);
  const scaled = 8_000_000 * (targetPixels / basePixels);
  return Math.round(clamp(scaled, 8_000_000, 45_000_000));
}

function updateOutputQualityHint() {
  if (!el.outputQualityHint) {
    return;
  }

  const preset = getOutputResolutionPreset(el.outputResolution.value);
  const mbps = (estimateVideoBitrate(preset.width, preset.height) / 1_000_000).toFixed(1);
  el.outputQualityHint.textContent = preset.label + " at about " + mbps + " Mbps video target bitrate.";
}

function onPointerDown(event) {
  if (state.previewMode !== "screen") {
    return;
  }

  if (!state.webcamStream) {
    return;
  }

  const point = pointerToCanvas(event);
  const left = state.overlay.x * el.previewCanvas.width;
  const top = state.overlay.y * el.previewCanvas.height;
  const right = left + state.overlay.width;
  const bottom = top + state.overlay.height;
  if (point.x < left || point.x > right || point.y < top || point.y > bottom) {
    return;
  }

  state.overlay.dragActive = true;
  state.overlay.dragOffsetX = point.x - left;
  state.overlay.dragOffsetY = point.y - top;
  el.previewCanvas.classList.add("dragging");
  el.previewCanvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!state.overlay.dragActive) {
    return;
  }

  const point = pointerToCanvas(event);
  const canvasWidth = el.previewCanvas.width;
  const canvasHeight = el.previewCanvas.height;
  let nextX = (point.x - state.overlay.dragOffsetX) / canvasWidth;
  let nextY = (point.y - state.overlay.dragOffsetY) / canvasHeight;
  const clamped = clampOverlayPosition(
    nextX,
    nextY,
    state.overlay.width,
    state.overlay.height,
    canvasWidth,
    canvasHeight
  );
  state.overlay.x = clamped.x;
  state.overlay.y = clamped.y;
}

function onPointerUp(event) {
  if (!state.overlay.dragActive) {
    return;
  }
  state.overlay.dragActive = false;
  el.previewCanvas.classList.remove("dragging");
  try {
    el.previewCanvas.releasePointerCapture(event.pointerId);
  } catch {
    // no-op
  }
}

function pointerToCanvas(event) {
  const rect = el.previewCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (el.previewCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (el.previewCanvas.height / rect.height)
  };
}

function clampOverlayPosition(x, y, width, height, canvasWidth, canvasHeight) {
  const margin = 10;
  const maxX = Math.max(margin, canvasWidth - width - margin) / canvasWidth;
  const maxY = Math.max(margin, canvasHeight - height - margin) / canvasHeight;
  return {
    x: clamp(x, margin / canvasWidth, maxX),
    y: clamp(y, margin / canvasHeight, maxY)
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(min).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setPreviewMode(mode) {
  const wantsCamera = mode === "camera";
  if (wantsCamera && !el.includeWebcam.checked) {
    el.supportHint.textContent = "Enable Webcam to use Camera Fullscreen mode.";
    state.previewMode = "screen";
  } else {
    state.previewMode = wantsCamera ? "camera" : "screen";
  }

  updatePreviewModeButtons();
  renderFrame();
  requestCanvasFrame();
  saveSettingsToStorage();
}

function updatePreviewModeButtons() {
  if (!el.showScreenBtn || !el.showCameraBtn) {
    return;
  }

  const cameraSelectable = el.includeWebcam.checked;
  el.showCameraBtn.disabled = !cameraSelectable;
  el.showScreenBtn.classList.toggle("mode-active", state.previewMode === "screen");
  el.showCameraBtn.classList.toggle("mode-active", state.previewMode === "camera");
}

function startAudioRenderHeartbeat(mixContext, sinkNode) {
  stopAudioRenderHeartbeat();
  if (!mixContext || !sinkNode || typeof mixContext.createScriptProcessor !== "function") {
    return;
  }

  // WebAudio callbacks remain active even when RAF is throttled, so they can drive background frame commits.
  const keepAliveSource = mixContext.createOscillator();
  const keepAliveGain = mixContext.createGain();
  const keepAliveProcessor = mixContext.createScriptProcessor(1024, 1, 1);

  keepAliveSource.type = "sine";
  keepAliveSource.frequency.value = 23;
  keepAliveGain.gain.value = 0;

  keepAliveSource.connect(keepAliveGain);
  keepAliveGain.connect(keepAliveProcessor);
  keepAliveProcessor.connect(sinkNode);

  keepAliveProcessor.onaudioprocess = () => {
    if (state.phase === "idle") {
      return;
    }
    renderFrameForPipeline();
  };

  keepAliveSource.start();
  state.renderClock.keepAliveSource = keepAliveSource;
  state.renderClock.keepAliveGain = keepAliveGain;
  state.renderClock.keepAliveProcessor = keepAliveProcessor;
}

function stopAudioRenderHeartbeat() {
  const source = state.renderClock.keepAliveSource;
  const gain = state.renderClock.keepAliveGain;
  const processor = state.renderClock.keepAliveProcessor;

  if (processor) {
    processor.onaudioprocess = null;
    processor.disconnect();
  }
  if (gain) {
    gain.disconnect();
  }
  if (source) {
    try {
      source.stop();
    } catch {
      // no-op
    }
    source.disconnect();
  }

  state.renderClock.keepAliveSource = null;
  state.renderClock.keepAliveGain = null;
  state.renderClock.keepAliveProcessor = null;
}

function clearCountdown() {
  el.countdownOverlay.classList.add("hidden");
  el.countdownOverlay.textContent = "";
  state.countdownRemaining = 0;
  updateDocumentTitle();
}

function updateDocumentTitle() {
  const appTitle = "VDO.Ninja Screen Recorder";

  if (state.countdownRemaining > 0) {
    document.title = "Starting in " + state.countdownRemaining + " | " + appTitle;
    return;
  }

  if (state.phase === "recording") {
    document.title = "🔴 REC " + formatTime(getElapsedMs()) + " | " + appTitle;
    return;
  }

  if (state.phase === "paused") {
    document.title = "⏸ PAUSED " + formatTime(getElapsedMs()) + " | " + appTitle;
    return;
  }

  if (state.phase === "staged") {
    document.title = "Ready to Record | " + appTitle;
    return;
  }

  if (state.phase === "ready") {
    document.title = "Preparing Sources | " + appTitle;
    return;
  }

  document.title = defaultDocumentTitle;
}

function reportError(error) {
  console.error(error);
  let detail = "Capture failed.";
  if (error?.name === "NotAllowedError") {
    detail = "Permissions denied or picker canceled.";
  } else if (error?.name === "NotReadableError") {
    detail = "Capture device is busy.";
  } else if (error?.message) {
    detail = error.message;
  }
  el.supportHint.textContent = detail;
}

function isCancellation(error) {
  return error?.name === "AbortError" || error?.message === "Recording canceled" || state.cancelCountdown;
}

function isDisplayConstraintCompatibilityError(error) {
  if (!error) {
    return false;
  }

  if (error.name === "TypeError" || error.name === "OverconstrainedError") {
    return true;
  }

  const message = String(error.message || "");
  return /(constraint|unsupported|not supported|systemaudio|surfaceswitching)/i.test(message);
}

async function startFaceDetectionIfEnabled() {
  stopFaceDetection();
  if (!el.faceCrop.checked || !state.webcamStream || !("FaceDetector" in window)) {
    state.faceDetector = null;
    updateFaceCropStatus();
    return;
  }
  state.faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
  updateFaceCropStatus();
  tickFaceDetection();
}

function stopFaceDetection() {
  if (state.faceTickHandle) {
    clearTimeout(state.faceTickHandle);
  }
  state.faceTickHandle = 0;
  state.faceDetectBusy = false;
  state.faceDetector = null;
  resetFaceTarget();
  updateFaceCropStatus();
}

function resetFaceTarget() {
  state.faceTarget.cx = 0.5;
  state.faceTarget.cy = 0.5;
  state.faceTarget.scale = 1;
  state.faceTarget.lastSeenAt = 0;
}

function tickFaceDetection() {
  if (!state.faceDetector || !el.faceCrop.checked || !state.webcamStream) {
    updateFaceCropStatus();
    return;
  }
  state.faceTickHandle = setTimeout(async () => {
    if (state.faceDetectBusy || !state.faceDetector) {
      updateFaceCropStatus();
      tickFaceDetection();
      return;
    }

    const video = state.webcamVideo;
    if (!video || video.readyState < 2) {
      updateFaceCropStatus();
      tickFaceDetection();
      return;
    }

    state.faceDetectBusy = true;
    try {
      const faces = await state.faceDetector.detect(video);
      const hit = faces?.[0]?.boundingBox;
      if (hit) {
        const tx = (hit.x + hit.width / 2) / video.videoWidth;
        const ty = (hit.y + hit.height / 2) / video.videoHeight;
        const targetScale = clamp((hit.width / video.videoWidth) * 2.35, 0.34, 1);
        state.faceTarget.cx = lerp(state.faceTarget.cx, tx, 0.22);
        state.faceTarget.cy = lerp(state.faceTarget.cy, ty, 0.22);
        state.faceTarget.scale = lerp(state.faceTarget.scale, targetScale, 0.2);
        state.faceTarget.lastSeenAt = Date.now();
      } else if (Date.now() - state.faceTarget.lastSeenAt > 1200) {
        state.faceTarget.scale = lerp(state.faceTarget.scale, 1, 0.08);
        state.faceTarget.cx = lerp(state.faceTarget.cx, 0.5, 0.08);
        state.faceTarget.cy = lerp(state.faceTarget.cy, 0.5, 0.08);
      }
    } catch (error) {
      console.warn("Face detection failed:", error);
    } finally {
      state.faceDetectBusy = false;
      updateFaceCropStatus();
      tickFaceDetection();
    }
  }, 360);
}

function pauseRecorder({ automatic, reason }) {
  if (!state.mediaRecorder || state.mediaRecorder.state !== "recording") {
    return;
  }

  state.mediaRecorder.pause();
  state.autoPauseActive = Boolean(automatic);
  state.timing.pausedAt = Date.now();
  state.transcript.interimText = "";
  renderTranscriptFeed();
  setPhase("paused", automatic ? "Silence Skip" : "Paused");

  if (reason) {
    el.supportHint.textContent = reason;
  }
}

function resumeRecorder({ automatic }) {
  if (!state.mediaRecorder || state.mediaRecorder.state !== "paused") {
    return;
  }
  if (automatic && !state.autoPauseActive) {
    return;
  }

  state.mediaRecorder.resume();
  if (state.timing.pausedAt) {
    state.timing.pausedTotal += Date.now() - state.timing.pausedAt;
    state.timing.pausedAt = 0;
  }

  state.autoPauseActive = false;
  setPhase("recording", "Recording");
}

async function startSilenceMonitorIfEnabled(options) {
  stopSilenceMonitor();
  if (!options.autoSkipSilence) {
    return;
  }

  if (!state.micStream?.getAudioTracks().length) {
    el.supportHint.textContent = "Auto skip silence requires microphone input.";
    return;
  }

  const monitorContext = new AudioContext();
  if (monitorContext.state === "suspended") {
    await monitorContext.resume();
  }

  const source = monitorContext.createMediaStreamSource(state.micStream);
  const analyser = monitorContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);

  state.silenceMonitor.context = monitorContext;
  state.silenceMonitor.source = source;
  state.silenceMonitor.analyser = analyser;
  state.silenceMonitor.buffer = new Float32Array(analyser.fftSize);
  state.silenceMonitor.silenceSinceMs = 0;
  state.silenceMonitor.currentSkipStartMs = 0;

  const poll = () => {
    if (state.phase === "idle" || !state.silenceMonitor.analyser) {
      return;
    }

    const thresholdDb = Number(el.silenceThreshold.value);
    const silenceWindowMs = Number(el.silenceSeconds.value) * 1000;
    const nowMs = performance.now();

    state.silenceMonitor.analyser.getFloatTimeDomainData(state.silenceMonitor.buffer);
    const db = calculateRmsDb(state.silenceMonitor.buffer);

    if (db < thresholdDb) {
      if (!state.silenceMonitor.silenceSinceMs) {
        state.silenceMonitor.silenceSinceMs = nowMs;
      }

      const silenceFor = nowMs - state.silenceMonitor.silenceSinceMs;
      if (!state.autoPauseActive && state.phase === "recording" && silenceFor >= silenceWindowMs) {
        pauseRecorder({
          automatic: true,
          reason: "Silence below " + thresholdDb + " dB; pausing to skip dead air."
        });
        state.silenceMonitor.currentSkipStartMs = Date.now();
      }
    } else {
      state.silenceMonitor.silenceSinceMs = 0;
      if (state.autoPauseActive && state.phase === "paused") {
        finishCurrentSilenceSegment();
        resumeRecorder({ automatic: true });
      }
    }

    state.silenceMonitor.raf = requestAnimationFrame(poll);
  };

  state.silenceMonitor.raf = requestAnimationFrame(poll);
}

function calculateRmsDb(floatData) {
  let sum = 0;
  for (let i = 0; i < floatData.length; i += 1) {
    const value = floatData[i];
    sum += value * value;
  }
  const rms = Math.sqrt(sum / floatData.length);
  if (rms < 0.00001) {
    return -100;
  }
  return 20 * Math.log10(rms);
}

function finishCurrentSilenceSegment() {
  if (!state.silenceMonitor.currentSkipStartMs) {
    return;
  }

  const endMs = Date.now();
  const durationMs = endMs - state.silenceMonitor.currentSkipStartMs;
  if (durationMs > 120) {
    state.silenceMonitor.segments.push({
      startMs: state.silenceMonitor.currentSkipStartMs,
      endMs,
      durationMs
    });
  }

  state.silenceMonitor.currentSkipStartMs = 0;
}

function stopSilenceMonitor() {
  if (state.silenceMonitor.raf) {
    cancelAnimationFrame(state.silenceMonitor.raf);
  }
  state.silenceMonitor.raf = 0;

  if (state.silenceMonitor.context && state.silenceMonitor.context.state !== "closed") {
    state.silenceMonitor.context.close().catch(() => {
      // no-op
    });
  }

  state.silenceMonitor.context = null;
  state.silenceMonitor.source = null;
  state.silenceMonitor.analyser = null;
  state.silenceMonitor.buffer = null;
  state.silenceMonitor.silenceSinceMs = 0;
}

async function startTranscriptionIfEnabled(options) {
  await stopTranscription();
  if (!options.enableTranscription) {
    return;
  }

  if (!state.transcript.supported || !SpeechRecognitionCtor) {
    el.supportHint.textContent = "Live transcription is not supported in this browser.";
    return;
  }

  if (!state.micStream?.getAudioTracks().length) {
    el.supportHint.textContent = "Live transcription requires microphone access.";
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = el.transcriptionLang.value;

  recognition.onresult = onTranscriptionResult;
  recognition.onerror = (event) => {
    console.warn("Transcription error:", event.error);
    if (event.error === "not-allowed") {
      el.supportHint.textContent = "Microphone permission is required for transcription.";
      state.transcript.shouldRestart = false;
    }
  };
  recognition.onend = () => {
    state.transcript.active = false;
    if (state.transcript.shouldRestart && state.phase !== "idle") {
      try {
        recognition.start();
        state.transcript.active = true;
      } catch {
        // Browser may require user gesture after repeated restarts.
      }
    }
  };

  state.transcript.recognition = recognition;
  state.transcript.shouldRestart = true;

  try {
    recognition.start();
    state.transcript.active = true;
    toggleTranscriptPanel(true);
    renderTranscriptFeed();
  } catch (error) {
    console.warn("Unable to start transcription:", error);
    el.supportHint.textContent = "Unable to start transcription in this tab.";
    state.transcript.shouldRestart = false;
  }
}

function onTranscriptionResult(event) {
  const shouldCaptureSpeech = state.phase === "recording";
  let interim = "";

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const text = result[0]?.transcript?.trim();
    if (!text) {
      continue;
    }

    if (result.isFinal) {
      if (!shouldCaptureSpeech) {
        continue;
      }
      state.transcript.entries.push({
        timeMs: getElapsedMs(),
        text
      });
    } else if (shouldCaptureSpeech) {
      interim = text;
    }
  }

  state.transcript.interimText = shouldCaptureSpeech ? interim : "";
  renderTranscriptFeed();
}

async function stopTranscription() {
  const recognition = state.transcript.recognition;
  state.transcript.shouldRestart = false;
  state.transcript.active = false;

  if (!recognition) {
    state.transcript.interimText = "";
    return;
  }

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      resolve();
    };

    recognition.onend = finish;

    try {
      recognition.stop();
    } catch {
      finish();
    }

    setTimeout(finish, 700);
  });

  state.transcript.recognition = null;
  state.transcript.interimText = "";
  renderTranscriptFeed();
}

function renderTranscriptFeed() {
  if (!el.transcriptFeed) {
    return;
  }

  el.transcriptFeed.innerHTML = "";
  const entries = state.transcript.entries;
  const interimText = state.transcript.interimText;

  if (!entries.length && !interimText) {
    const empty = document.createElement("div");
    empty.className = "transcript-empty";
    empty.textContent = "No transcript yet. Enable Live Transcription to capture speech while recording.";
    el.transcriptFeed.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  const visibleEntries = entries.slice(-30);
  for (const entry of visibleEntries) {
    const line = document.createElement("div");
    line.className = "transcript-line";

    const time = document.createElement("span");
    time.className = "transcript-time";
    time.textContent = formatTime(entry.timeMs);

    const text = document.createElement("span");
    text.className = "transcript-text";
    text.textContent = entry.text;

    line.append(time, text);
    fragment.append(line);
  }

  if (interimText) {
    const line = document.createElement("div");
    line.className = "transcript-line transcript-interim";

    const time = document.createElement("span");
    time.className = "transcript-time";
    time.textContent = "live";

    const text = document.createElement("span");
    text.className = "transcript-text";
    text.textContent = interimText;

    line.append(time, text);
    fragment.append(line);
  }

  el.transcriptFeed.append(fragment);
}

function toggleTranscriptPanel(forceValue) {
  if (!el.transcriptPanel) {
    return;
  }

  const shouldShow =
    typeof forceValue === "boolean"
      ? forceValue
      : el.enableTranscription.checked || state.transcript.entries.length > 0 || Boolean(state.sessionExports.transcriptText);

  if (shouldShow) {
    el.transcriptPanel.classList.remove("hidden");
  } else {
    el.transcriptPanel.classList.add("hidden");
  }
}

function buildTranscriptExportText(videoFilename) {
  const entries = state.transcript.entries;
  const silenceSegments = state.silenceMonitor.segments;
  if (!entries.length && !silenceSegments.length) {
    return "";
  }

  const lines = [];
  lines.push("VDO.Ninja Screen Recorder Transcript");
  lines.push("Source: " + videoFilename);
  lines.push("Created: " + new Date().toISOString());
  lines.push("");

  if (silenceSegments.length) {
    const totalSkippedMs = silenceSegments.reduce((sum, segment) => sum + segment.durationMs, 0);
    lines.push("Auto Skip Silence: " + silenceSegments.length + " segment(s), " + formatSeconds(totalSkippedMs / 1000) + " removed.");
    lines.push("");
  }

  if (entries.length) {
    lines.push("Transcript:");
    for (const entry of entries) {
      lines.push("[" + formatTime(entry.timeMs) + "] " + entry.text);
    }
  }

  const smartHints = buildSmartEditHints(entries, silenceSegments);
  if (smartHints.length) {
    lines.push("");
    lines.push("Smart Edit Notes:");
    smartHints.forEach((hint, index) => {
      lines.push((index + 1) + ". " + hint);
    });
  }

  return lines.join("\n");
}

function buildSmartEditHints(entries, silenceSegments) {
  const hints = [];

  if (silenceSegments.length) {
    const totalSkippedMs = silenceSegments.reduce((sum, segment) => sum + segment.durationMs, 0);
    hints.push("Detected and removed " + formatSeconds(totalSkippedMs / 1000) + " of low-volume pauses.");
  }

  if (entries.length) {
    const text = entries.map((entry) => entry.text).join(" ").toLowerCase();
    const fillerPattern = /\b(um+|uh+|like|you know|sort of|kind of)\b/g;
    const fillerMatches = text.match(fillerPattern) || [];
    if (fillerMatches.length >= 3) {
      hints.push("Frequent filler words detected (" + fillerMatches.length + "). Consider trimming those clips.");
    }

    if (entries.length >= 6) {
      hints.push("Consider chapter markers every 3-5 transcript lines for faster tutorial navigation.");
    }
  }

  return hints;
}

function downloadTranscriptFromLastSession() {
  if (!state.sessionExports.transcriptText) {
    return;
  }

  const blob = new Blob([state.sessionExports.transcriptText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = state.sessionExports.transcriptFilename || "screenrecord-transcript.txt";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatSeconds(seconds) {
  return seconds.toFixed(1) + "s";
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}






