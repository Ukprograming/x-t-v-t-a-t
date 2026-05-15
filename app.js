const TIME_POINTS = Array.from({ length: 11 }, (_, index) => index);
const ACCELERATION_INTERVALS = Array.from({ length: 10 }, (_, index) => index);
const STORAGE_KEY = "physics-motion-presets-v3";
const NICKNAME_KEY = "physics-motion-nickname";
const LOCAL_LOG_STORAGE_KEY = "physics-motion-local-quiz-logs";
const QUIZ_LOG_ENDPOINT = "https://script.google.com/macros/s/AKfycbzI8GE3HG_8kpv5snLSC3n5_uZai0xpTDsz_oIxa8v1_iv-aWqPOiSbkaZpK-2N9KSI/exec";
const QUIZ_CODE_PREFIX = "QZ3-";
const ANSWER_TOLERANCE = 0.35;
const RANGE_EXPAND_DELAY_MS = 1400;
const RANGE_EXPAND_INTERVAL_MS = 320;
const RANGE_EDGE_OUTSIDE_PX = 8;
const UNDO_LIMIT = 50;
const GRAPH_CONFIG = {
  x: { key: "x", label: "x-t", unit: "m", color: "#2c7a7b" },
  v: { key: "v", label: "v-t", unit: "m/s", color: "#2457c5" },
  a: { key: "a", label: "a-t", unit: "m/s²", color: "#b83b5e" }
};

const state = {
  userNickname: "",
  data: {
    x: [0, 0.5, 2, 4.5, 8, 12.5, 18, 24.5, 32, 40.5, 50],
    v: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    a: []
  },
  activePoints: {
    x: Array(TIME_POINTS.length).fill(true),
    v: Array(TIME_POINTS.length).fill(true),
    a: Array(ACCELERATION_INTERVALS.length).fill(true)
  },
  ranges: {
    x: { min: 0, max: 10 },
    v: { min: -2, max: 8 },
    a: { min: -2, max: 2 }
  },
  visiblePanels: {
    x: true,
    v: true,
    a: true,
    motion: true
  },
  selectedPoint: null,
  drag: null,
  undoStack: [],
  strobeEnabled: true,
  presets: [],
  mode: "normal",
  positionSource: "v",
  statusMessage: "x-t グラフ、v-t グラフ、a-t グラフを編集できます。",
  playback: {
    running: false,
    currentTime: 0,
    lastFrame: 0
  },
  quiz: {
    builder: null,
    currentCode: "",
    session: null,
    submitContext: {
      retry: false
    },
    submitting: false
  }
};

const canvases = {
  x: document.getElementById("xCanvas"),
  v: document.getElementById("vCanvas"),
  a: document.getElementById("aCanvas")
};

const elements = {
  toggles: Array.from(document.querySelectorAll(".graph-toggle")),
  eraseButtons: Array.from(document.querySelectorAll(".erase-point-button")),
  stepperButtons: Array.from(document.querySelectorAll(".stepper-button")),
  pointAdjusters: {
    x: document.querySelector('[data-adjuster="x"]'),
    v: document.querySelector('[data-adjuster="v"]'),
    a: document.querySelector('[data-adjuster="a"]')
  },
  pointValueLabels: {
    x: document.getElementById("xPointValue"),
    v: document.getElementById("vPointValue"),
    a: document.getElementById("aPointValue")
  },
  cards: {
    x: document.querySelector('[data-graph-card="x"]'),
    v: document.querySelector('[data-graph-card="v"]'),
    a: document.querySelector('[data-graph-card="a"]')
  },
  motionPanel: document.getElementById("motionPanel"),
  statusMessage: document.getElementById("statusMessage"),
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  undoButton: document.getElementById("undoButton"),
  savePresetButton: document.getElementById("savePresetButton"),
  loadPresetButton: document.getElementById("loadPresetButton"),
  deletePresetButton: document.getElementById("deletePresetButton"),
  presetSelect: document.getElementById("presetSelect"),
  strobeToggle: document.getElementById("strobeToggle"),
  car: document.getElementById("car"),
  strobeLayer: document.getElementById("strobeLayer"),
  originMarker: document.getElementById("originMarker"),
  xAxisScale: document.getElementById("xAxisScale"),
  createQuizButton: document.getElementById("createQuizButton"),
  joinQuizButton: document.getElementById("joinQuizButton"),
  submitQuizButton: document.getElementById("submitQuizButton"),
  endQuizButton: document.getElementById("endQuizButton"),
  loginOverlay: document.getElementById("loginOverlay"),
  nicknameInput: document.getElementById("nicknameInput"),
  loginButton: document.getElementById("loginButton"),
  quizSetupOverlay: document.getElementById("quizSetupOverlay"),
  cancelQuizSetupButton: document.getElementById("cancelQuizSetupButton"),
  beginQuizEditButton: document.getElementById("beginQuizEditButton"),
  quizCodeOverlay: document.getElementById("quizCodeOverlay"),
  quizCodeOutput: document.getElementById("quizCodeOutput"),
  copyQuizCodeButton: document.getElementById("copyQuizCodeButton"),
  closeQuizCodeButton: document.getElementById("closeQuizCodeButton"),
  quizJoinOverlay: document.getElementById("quizJoinOverlay"),
  quizCodeInput: document.getElementById("quizCodeInput"),
  cancelQuizJoinButton: document.getElementById("cancelQuizJoinButton"),
  startQuizButton: document.getElementById("startQuizButton"),
  submitOverlay: document.getElementById("submitOverlay"),
  submitOverlayTitle: document.getElementById("submitOverlayTitle"),
  submitOverlayMessage: document.getElementById("submitOverlayMessage"),
  confidenceGroup: document.getElementById("confidenceGroup"),
  retryReasonField: document.getElementById("retryReasonField"),
  retryReasonInput: document.getElementById("retryReasonInput"),
  cancelSubmitButton: document.getElementById("cancelSubmitButton"),
  confirmSubmitButton: document.getElementById("confirmSubmitButton"),
  celebrationLayer: document.getElementById("celebrationLayer"),
  closeCelebrationButton: document.getElementById("closeCelebrationButton"),
  resultOverlay: document.getElementById("resultOverlay"),
  resultTitle: document.getElementById("resultTitle"),
  resultMessage: document.getElementById("resultMessage"),
  closeResultButton: document.getElementById("closeResultButton"),
  answerGraphInputs: Array.from(document.querySelectorAll('input[name="answerGraph"]')),
  quizVisibilityInputs: Array.from(document.querySelectorAll("[data-quiz-visible]"))
};

initialize();

function initialize() {
  loadPresetsFromStorage();
  state.data = normalizeDataSet(state.data);
  state.activePoints = normalizeActivePoints(state.activePoints);
  recomputeDerivedFrom("v");
  bindEvents();
  renderPresetOptions();
  populateConfidenceOptions();
  updateStatus();
  updatePanelVisibility();
  updateGraphLocks();
  updateMotionControls();
  updateUndoButton();
  syncCanvasResolution();
  renderAll();
  initializeLogin();
  requestAnimationFrame(tick);
}

function bindEvents() {
  window.addEventListener("resize", () => {
    syncCanvasResolution();
    renderAll();
  });

  elements.toggles.forEach((button) => {
    button.addEventListener("click", () => togglePanelVisibility(button.dataset.graph));
  });

  elements.eraseButtons.forEach((button) => {
    button.addEventListener("click", () => eraseSelectedPoint(button.dataset.eraseGraph));
  });

  elements.stepperButtons.forEach((button) => {
    button.addEventListener("click", () => nudgeSelectedPoint(button.dataset.stepGraph, button.dataset.stepDir));
  });

  Object.entries(canvases).forEach(([graphKey, canvas]) => {
    canvas.addEventListener("pointerdown", (event) => startDrag(event, graphKey));
    canvas.addEventListener("pointermove", updateDrag);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", (event) => {
      if (state.drag && state.drag.pointerId === event.pointerId && event.buttons === 0) {
        endDrag(event);
      }
    });
  });

  elements.startButton.addEventListener("click", startPlayback);
  elements.pauseButton.addEventListener("click", pausePlayback);
  elements.resetButton.addEventListener("click", resetPlayback);
  elements.undoButton.addEventListener("click", undoLastEdit);

  elements.strobeToggle.addEventListener("change", () => {
    state.strobeEnabled = elements.strobeToggle.checked;
    renderMotion();
  });

  elements.savePresetButton.addEventListener("click", savePreset);
  elements.loadPresetButton.addEventListener("click", loadSelectedPreset);
  elements.deletePresetButton.addEventListener("click", deleteSelectedPreset);

  elements.loginButton.addEventListener("click", handleLogin);
  elements.nicknameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleLogin();
    }
  });
  elements.answerGraphInputs.forEach((input) => {
    input.addEventListener("change", updateQuizVisibilityControls);
  });

  elements.createQuizButton.addEventListener("click", handleCreateQuizButtonClick);
  elements.joinQuizButton.addEventListener("click", () => openOverlay(elements.quizJoinOverlay));
  elements.submitQuizButton.addEventListener("click", handleSubmitButtonClick);
  elements.endQuizButton.addEventListener("click", exitQuizMode);
  elements.cancelQuizSetupButton.addEventListener("click", () => closeOverlay(elements.quizSetupOverlay));
  elements.beginQuizEditButton.addEventListener("click", beginQuizEditing);
  elements.copyQuizCodeButton.addEventListener("click", copyQuizCode);
  elements.closeQuizCodeButton.addEventListener("click", () => closeOverlay(elements.quizCodeOverlay));
  elements.cancelQuizJoinButton.addEventListener("click", () => closeOverlay(elements.quizJoinOverlay));
  elements.startQuizButton.addEventListener("click", startQuizFromInputCode);
  elements.cancelSubmitButton.addEventListener("click", () => closeOverlay(elements.submitOverlay));
  elements.confirmSubmitButton.addEventListener("click", submitCurrentQuizAnswer);
  elements.closeCelebrationButton.addEventListener("click", () => elements.celebrationLayer.classList.remove("is-visible"));
  elements.closeResultButton.addEventListener("click", handleResultClose);
}

function initializeLogin() {
  const savedNickname = localStorage.getItem(NICKNAME_KEY) || "";
  elements.nicknameInput.value = savedNickname;
  openOverlay(elements.loginOverlay);
}

function handleLogin() {
  const nickname = elements.nicknameInput.value.trim();
  if (!nickname) {
    elements.nicknameInput.focus();
    return;
  }

  state.userNickname = nickname;
  localStorage.setItem(NICKNAME_KEY, nickname);
  closeOverlay(elements.loginOverlay);
  updateStatus();
}

function populateConfidenceOptions() {
  elements.confidenceGroup.innerHTML = "";
  for (let level = 1; level <= 5; level += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "confidence-option";
    button.dataset.level = `${level}`;
    button.textContent = `${level}`;
    button.addEventListener("click", () => {
      elements.confidenceGroup.querySelectorAll(".confidence-option").forEach((item) => {
        item.classList.toggle("is-selected", item.dataset.level === `${level}`);
      });
    });
    elements.confidenceGroup.appendChild(button);
  }
}

function handleCreateQuizButtonClick() {
  if (state.mode === "quiz-create-edit") {
    finalizeQuizCreation();
    return;
  }

  if (state.mode === "quiz-participant") {
    exitQuizMode();
  }

  updateQuizVisibilityControls();
  openOverlay(elements.quizSetupOverlay);
}

function beginQuizEditing() {
  const answerGraph = getCheckedValue("answerGraph");
  const visibility = getQuizVisibilityOptions(answerGraph);

  state.quiz.builder = { answerGraph, graphVisibility: visibility, showMotion: visibility.motion };
  state.mode = "quiz-create-edit";
  state.statusMessage = `${GRAPH_CONFIG[answerGraph].label} を回答させるクイズを編集中です。運動を作ったら「クイズ確定」を押してください。`;
  elements.createQuizButton.textContent = "クイズ確定";
  closeOverlay(elements.quizSetupOverlay);
  updateStatus();
  updateGraphLocks();
  updateMotionControls();
  renderAll();
}

function updateQuizVisibilityControls() {
  const answerGraph = getCheckedValue("answerGraph") || "x";
  elements.quizVisibilityInputs.forEach((input) => {
    const target = input.dataset.quizVisible;
    const isAnswerGraph = target === answerGraph;
    if (isAnswerGraph) {
      input.checked = true;
    }
    input.disabled = isAnswerGraph;
  });
}

function getQuizVisibilityOptions(answerGraph) {
  const visibility = { x: true, v: true, a: true, motion: true };
  elements.quizVisibilityInputs.forEach((input) => {
    visibility[input.dataset.quizVisible] = input.checked;
  });
  visibility[answerGraph] = true;
  return visibility;
}

function normalizeQuizGraphVisibility(source, answerGraph, legacyShowMotion = true) {
  return {
    x: answerGraph === "x" || (source ? source.x !== false : true),
    v: answerGraph === "v" || (source ? source.v !== false : true),
    a: answerGraph === "a" || (source ? source.a !== false : true),
    motion: source ? source.motion !== false : legacyShowMotion !== false
  };
}

function finalizeQuizCreation() {
  if (!state.quiz.builder) {
    return;
  }

  const payload = {
    answerGraph: state.quiz.builder.answerGraph,
    showMotion: state.quiz.builder.showMotion,
    graphVisibility: state.quiz.builder.graphVisibility,
    positionSource: state.positionSource,
    solution: normalizeDataSet(cloneSeriesState(state.data)),
    createdAt: new Date().toISOString()
  };

  state.quiz.currentCode = QUIZ_CODE_PREFIX + encodePayload(payload);
  elements.quizCodeOutput.value = state.quiz.currentCode;
  openOverlay(elements.quizCodeOverlay);

  state.quiz.builder = null;
  state.mode = "normal";
  state.statusMessage = "クイズコードを発行しました。共有して挑戦できます。";
  elements.createQuizButton.textContent = "クイズ作成";
  updateStatus();
  updateGraphLocks();
  updateMotionControls();
  renderAll();
}

function startQuizFromInputCode() {
  const code = elements.quizCodeInput.value.trim();
  if (!code.startsWith(QUIZ_CODE_PREFIX)) {
    elements.quizCodeInput.focus();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(decodePayload(code.slice(QUIZ_CODE_PREFIX.length)));
  } catch (error) {
    elements.quizCodeInput.focus();
    return;
  }

  if (!GRAPH_CONFIG[payload.answerGraph] || !payload.solution) {
    elements.quizCodeInput.focus();
    return;
  }

  const normalizedSolution = normalizeDataSet(cloneSeriesState(payload.solution));
  const graphVisibility = normalizeQuizGraphVisibility(payload.graphVisibility, payload.answerGraph, payload.showMotion);
  state.quiz.session = {
    code,
    answerGraph: payload.answerGraph,
    showMotion: graphVisibility.motion,
    graphVisibility,
    positionSource: payload.positionSource || "x",
    solution: normalizedSolution,
    answerData: {
      [payload.answerGraph]: buildBlankAnswerSeries(payload.answerGraph, normalizedSolution[payload.answerGraph])
    },
    answerActivePoints: {
      [payload.answerGraph]: Array(getPointCount(payload.answerGraph)).fill(true)
    },
    answerRanges: deriveRangesFromData(normalizedSolution),
    firstAttempt: null,
    retryAttempts: [],
    completed: false,
    finalized: false,
    finalCorrect: false,
    reviewMode: false
  };

  state.mode = "quiz-participant";
  state.statusMessage = `${GRAPH_CONFIG[payload.answerGraph].label} を編集して答えてください。できたら「提出」を押します。`;
  clearUndoStack();
  closeOverlay(elements.quizJoinOverlay);
  elements.quizCodeInput.value = "";
  resetPlayback();
  clearSelection();
  updateStatus();
  updateGraphLocks();
  updateMotionControls();
  syncCanvasResolution();
  renderAll();
}

function handleSubmitButtonClick() {
  if (!state.quiz.session) {
    return;
  }

  if (state.quiz.session.finalized) {
    return;
  }

  const isRetry = Boolean(state.quiz.session.firstAttempt);
  openSubmitOverlay(isRetry);
}

function openSubmitOverlay(isRetry) {
  state.quiz.submitting = false;
  state.quiz.submitContext.retry = isRetry;
  elements.submitOverlayTitle.textContent = isRetry ? "二回目の回答を提出" : "一回目の回答を提出";
  elements.submitOverlayMessage.textContent = isRetry
    ? "話し合いをふまえた今の考えを提出します。自信度を選んでください。必要なら、考えが変わった理由も残せます。"
    : "今の考えをいったん保存します。正誤はまだ表示せず、このあと話し合いに進みます。自信度を選んでください。";
  elements.retryReasonField.classList.toggle("is-hidden", !isRetry);
  elements.retryReasonInput.value = "";
  elements.confidenceGroup.querySelectorAll(".confidence-option").forEach((item) => item.classList.remove("is-selected"));
  elements.confirmSubmitButton.disabled = false;
  elements.confirmSubmitButton.textContent = "提出する";
  openOverlay(elements.submitOverlay);
}

async function submitCurrentQuizAnswer() {
  if (state.quiz.submitting) {
    return;
  }

  const selectedConfidence = elements.confidenceGroup.querySelector(".confidence-option.is-selected");
  if (!selectedConfidence || !state.quiz.session) {
    return;
  }

  state.quiz.submitting = true;
  elements.confirmSubmitButton.disabled = true;
  elements.confirmSubmitButton.textContent = "送信中...";
  elements.submitOverlayMessage.textContent = "送信中です。しばらくお待ちください。";

  const session = state.quiz.session;
  const answerGraph = session.answerGraph;
  const isRetry = Boolean(session.firstAttempt);
  const answerSeries = resolveSeriesForArray(session.answerData[answerGraph], session.answerActivePoints[answerGraph]);
  session.answerData[answerGraph] = [...answerSeries];
  const expectedSeries = session.solution[answerGraph];
  const attempt = {
    submittedAt: new Date().toISOString(),
    answerSeries,
    confidence: Number(selectedConfidence.dataset.level),
    isCorrect: compareSeries(answerSeries, expectedSeries, ANSWER_TOLERANCE),
    retryReason: state.quiz.submitContext.retry ? elements.retryReasonInput.value.trim() : ""
  };

  if (!session.firstAttempt) {
    session.firstAttempt = attempt;
  } else {
    session.retryAttempts.push(attempt);
  }

  try {
    await sendQuizLog(buildQuizLogRecord(session, attempt, isRetry));
  } catch (error) {
    console.warn("Quiz log could not be saved, but submission will continue.", error);
  } finally {
    state.quiz.submitting = false;
    elements.confirmSubmitButton.disabled = false;
    elements.confirmSubmitButton.textContent = "提出する";
  }

  closeOverlay(elements.submitOverlay);

  if (!isRetry) {
    session.completed = false;
    session.finalized = false;
    session.finalCorrect = false;
    session.reviewMode = false;
    state.statusMessage = "一回目の考えを保存しました。どの点や傾きに注目したか、周りの人と話し合ってから、必要ならグラフを調整して二回目を提出できます。";
    updateStatus();
    updateMotionControls();
    renderAll();
    showResultOverlay(
      "考えを持ち寄る時間です",
      "正誤はまだ表示しません。自分のグラフで大切にしたところを一つ選び、周りの人の見方と比べてみてください。納得できたら、グラフを調整して二回目の回答を提出できます。"
    );
    return;
  }

  session.completed = true;
  session.finalized = true;
  session.finalCorrect = attempt.isCorrect;
  session.reviewMode = !attempt.isCorrect;

  if (attempt.isCorrect) {
    state.statusMessage = "二回目の回答を確認しました。条件に合うグラフになっています。閉じると正解のグラフを通常編集モードで確認できます。";
    updateStatus();
    updateMotionControls();
    renderAll();
    showResultOverlay(
      "条件に合っています",
      "条件に合うグラフになっています。閉じると、この正解グラフを通常編集モードで続けて確かめられます。"
    );
    return;
  }

  state.statusMessage = "二回目の回答を確認しました。条件とずれているところがあります。赤い線を参考に、自分のグラフとの違いから関係を確かめてみましょう。";
  updateStatus();
  updateMotionControls();
  renderAll();
  showResultOverlay(
    "正解グラフと比べてみましょう",
    "今回は条件とずれているところがあります。赤い線で条件に合うグラフを重ねています。どの区間の傾きや面積が違っていたかを見比べてください。閉じると、正解グラフを通常編集モードで確認できます。"
  );
}

function buildQuizLogRecord(session, latestAttempt, isRetry) {
  return {
    timestamp: latestAttempt.submittedAt,
    nickname: state.userNickname,
    quizCode: session.code,
    answerGraph: session.answerGraph,
    showMotion: session.showMotion,
    quizContent: JSON.stringify(session.solution),
    firstAnswer: JSON.stringify(session.firstAttempt ? session.firstAttempt.answerSeries : []),
    firstConfidence: session.firstAttempt ? session.firstAttempt.confidence : "",
    firstCorrect: session.firstAttempt ? session.firstAttempt.isCorrect : "",
    retryAnswer: isRetry ? JSON.stringify(latestAttempt.answerSeries) : "",
    retryConfidence: isRetry ? latestAttempt.confidence : "",
    retryReason: isRetry ? latestAttempt.retryReason : "",
    latestCorrect: latestAttempt.isCorrect,
    attemptNumber: session.retryAttempts.length + 1
  };
}

async function sendQuizLog(record) {
  if (QUIZ_LOG_ENDPOINT && !QUIZ_LOG_ENDPOINT.startsWith("PASTE_") && window.location.protocol !== "file:") {
    const body = new URLSearchParams({ payload: JSON.stringify(record) });
    await fetch(QUIZ_LOG_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      body
    });
    return;
  }

  const existing = loadLocalQuizLogs();
  existing.push(record);
  localStorage.setItem(LOCAL_LOG_STORAGE_KEY, JSON.stringify(existing));
}

function loadLocalQuizLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LOG_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function exitQuizMode() {
  closeOverlay(elements.resultOverlay);
  elements.celebrationLayer.classList.remove("is-visible");
  state.mode = "normal";
  state.quiz.session = null;
  state.statusMessage = "通常編集に戻りました。";
  clearUndoStack();
  clearSelection();
  resetPlayback();
  updateStatus();
  updateGraphLocks();
  updateMotionControls();
  renderAll();
}

function handleResultClose() {
  if (state.mode === "quiz-participant" && state.quiz.session && state.quiz.session.finalized) {
    applyQuizSolutionAndExit();
    return;
  }

  closeOverlay(elements.resultOverlay);
}

function applyQuizSolutionAndExit() {
  const session = state.quiz.session;
  if (!session) {
    closeOverlay(elements.resultOverlay);
    return;
  }

  const solution = normalizeDataSet(cloneSeriesState(session.solution));
  const positionSource = session.positionSource || "x";

  closeOverlay(elements.resultOverlay);
  elements.celebrationLayer.classList.remove("is-visible");
  state.mode = "normal";
  state.quiz.session = null;
  state.data = solution;
  state.activePoints = normalizeActivePoints({
    x: Array(TIME_POINTS.length).fill(true),
    v: Array(TIME_POINTS.length).fill(true),
    a: Array(ACCELERATION_INTERVALS.length).fill(true)
  });
  state.positionSource = positionSource;
  state.visiblePanels = { x: true, v: true, a: true, motion: true };
  state.strobeEnabled = true;
  elements.strobeToggle.checked = true;
  state.statusMessage = "正解のグラフを通常編集モードで表示しています。気になる点を自由に動かして、関係を確かめられます。";
  clearUndoStack();
  clearSelection();
  updateRanges();
  resetPlayback();
  updateStatus();
  updateGraphLocks();
  updateMotionControls();
  syncCanvasResolution();
  renderAll();
}

async function copyQuizCode() {
  const value = elements.quizCodeOutput.value.trim();
  if (!value) {
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      elements.quizCodeOutput.focus();
      elements.quizCodeOutput.select();
      document.execCommand("copy");
    }
    elements.copyQuizCodeButton.textContent = "コピー済み";
    window.setTimeout(() => {
      elements.copyQuizCodeButton.textContent = "コピー";
    }, 1400);
  } catch (error) {
    elements.quizCodeOutput.focus();
    elements.quizCodeOutput.select();
  }
}

function startPlayback() {
  state.playback.running = true;
  if (!state.playback.lastFrame) {
    state.playback.lastFrame = performance.now();
  }
}

function pausePlayback() {
  state.playback.running = false;
  state.playback.lastFrame = 0;
}

function resetPlayback() {
  state.playback.running = false;
  state.playback.currentTime = 0;
  state.playback.lastFrame = 0;
  renderAll();
}

function pushUndoState() {
  state.undoStack.push(createUndoSnapshot());
  if (state.undoStack.length > UNDO_LIMIT) {
    state.undoStack.shift();
  }
  updateUndoButton();
}

function createUndoSnapshot() {
  const snapshot = {
    mode: state.mode,
    data: cloneSeriesState(state.data),
    activePoints: cloneSeriesState(state.activePoints),
    ranges: cloneRangeState(state.ranges),
    positionSource: state.positionSource,
    selectedPoint: state.selectedPoint ? { ...state.selectedPoint } : null
  };

  if (state.mode === "quiz-participant" && state.quiz.session) {
    snapshot.quizSession = {
      answerData: cloneSeriesState(state.quiz.session.answerData),
      answerActivePoints: cloneSeriesState(state.quiz.session.answerActivePoints),
      answerRanges: cloneRangeState(state.quiz.session.answerRanges),
      reviewMode: state.quiz.session.reviewMode,
      completed: state.quiz.session.completed
    };
  }

  return snapshot;
}

function undoLastEdit() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) {
    updateUndoButton();
    return;
  }

  pausePlayback();
  state.drag = null;
  if (snapshot.mode === "quiz-participant" && state.mode === "quiz-participant" && state.quiz.session && snapshot.quizSession) {
    state.quiz.session.answerData = cloneSeriesState(snapshot.quizSession.answerData);
    state.quiz.session.answerActivePoints = cloneSeriesState(snapshot.quizSession.answerActivePoints);
    state.quiz.session.answerRanges = cloneRangeState(snapshot.quizSession.answerRanges);
    state.quiz.session.reviewMode = snapshot.quizSession.reviewMode;
    state.quiz.session.completed = snapshot.quizSession.completed;
  } else {
    state.data = cloneSeriesState(snapshot.data);
    state.activePoints = cloneSeriesState(snapshot.activePoints);
    state.ranges = cloneRangeState(snapshot.ranges);
    state.positionSource = snapshot.positionSource || "x";
  }

  state.selectedPoint = snapshot.selectedPoint ? { ...snapshot.selectedPoint } : null;
  updateUndoButton();
  updateEraseButtons();
  updateGraphLocks();
  updateMotionControls();
  renderAll();
}

function clearUndoStack() {
  state.undoStack = [];
  updateUndoButton();
}

function togglePanelVisibility(panelKey) {
  if (state.mode === "quiz-participant") {
    return;
  }

  if (panelKey === "motion") {
    state.visiblePanels.motion = !state.visiblePanels.motion;
  } else if (GRAPH_CONFIG[panelKey]) {
    const visibleGraphCount = ["x", "v", "a"].filter((key) => state.visiblePanels[key]).length;
    if (state.visiblePanels[panelKey] && visibleGraphCount === 1) {
      return;
    }
    state.visiblePanels[panelKey] = !state.visiblePanels[panelKey];
    if (state.selectedPoint && state.selectedPoint.graphKey === panelKey && !state.visiblePanels[panelKey]) {
      clearSelection();
    }
  }

  updatePanelVisibility();
  syncCanvasResolution();
  renderAll();
}

function syncCanvasResolution() {
  Object.values(canvases).forEach((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(180, Math.floor(bounds.width * ratio));
    const height = Math.max(140, Math.floor(bounds.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  });
}

function startDrag(event, graphKey) {
  if (!isGraphEditable(graphKey)) {
    return;
  }

  const pointIndex = getNearestPointIndex(graphKey, event);
  if (pointIndex === null) {
    clearSelection();
    renderAll();
    return;
  }

  pausePlayback();
  state.drag = {
    graphKey,
    pointIndex,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    undoCaptured: false,
    edgeDirection: null,
    edgeStartAt: 0,
    lastExpandAt: 0
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function updateDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) {
    return;
  }

  if (!state.drag.moved) {
    const deltaX = event.clientX - state.drag.startX;
    const deltaY = event.clientY - state.drag.startY;
    if (Math.hypot(deltaX, deltaY) < 6) {
      return;
    }
    pushUndoState();
    state.drag.undoCaptured = true;
    state.drag.moved = true;
    clearSelection();
  }

  applyDragValue(event);
}

function endDrag(event) {
  if (!state.drag) {
    return;
  }

  const activeDrag = state.drag;
  if (event && activeDrag.pointerId !== event.pointerId) {
    return;
  }

  if (activeDrag.moved && event) {
    applyDragValue(event);
    state.selectedPoint = { graphKey: activeDrag.graphKey, pointIndex: activeDrag.pointIndex };
  } else {
    toggleSelection(activeDrag.graphKey, activeDrag.pointIndex);
  }

  state.drag = null;
  updateEraseButtons();
  renderAll();
}

function applyDragValue(event) {
  if (!state.drag) {
    return;
  }

  const { graphKey, pointIndex } = state.drag;
  const canvas = canvases[graphKey];
  const range = getMutableRange(graphKey);
  let metrics = getGraphMetrics(canvas, range);
  const rect = canvas.getBoundingClientRect();
  const pixelY = (event.clientY - rect.top) * (window.devicePixelRatio || 1);
  const clampedY = Math.max(metrics.top - 18, Math.min(metrics.bottom + 18, pixelY));
  const canExpand = maybeExpandRangeFromEdge(range, getEdgeDirection(pixelY, metrics));
  if (canExpand) {
    metrics = getGraphMetrics(canvas, range);
  }
  const unclampedValue = roundValue(yToValue(clampedY, metrics));
  const nextValue = canExpand ? unclampedValue : clamp(unclampedValue, range.min + 0.1, range.max - 0.1);

  if (state.mode === "quiz-participant") {
    state.quiz.session.answerData[graphKey][pointIndex] = nextValue;
    state.quiz.session.answerData[graphKey] = resolveSeriesForArray(
      state.quiz.session.answerData[graphKey],
      state.quiz.session.answerActivePoints[graphKey]
    );
  } else {
    state.data[graphKey][pointIndex] = nextValue;
    recomputeDerivedFrom(graphKey);
  }

  renderAll();
}

function nudgeSelectedPoint(graphKey, direction) {
  if (!state.selectedPoint || state.selectedPoint.graphKey !== graphKey || !isGraphEditable(graphKey)) {
    return;
  }

  const series = getMutableSeries(graphKey);
  const pointIndex = state.selectedPoint.pointIndex;
  pushUndoState();
  series[pointIndex] = roundValue(series[pointIndex] + (direction === "up" ? 0.1 : -0.1));

  if (state.mode === "quiz-participant") {
    const range = getMutableRange(graphKey);
    range.min = Math.min(range.min, Math.floor(series[pointIndex] - 1));
    range.max = Math.max(range.max, Math.ceil(series[pointIndex] + 1));
    state.quiz.session.answerData[graphKey] = resolveSeriesForArray(
      state.quiz.session.answerData[graphKey],
      state.quiz.session.answerActivePoints[graphKey]
    );
  } else {
    recomputeDerivedFrom(graphKey);
  }

  updatePointAdjusters();
  renderAll();
}

function toggleSelection(graphKey, pointIndex) {
  if (
    state.selectedPoint &&
    state.selectedPoint.graphKey === graphKey &&
    state.selectedPoint.pointIndex === pointIndex
  ) {
    state.selectedPoint = null;
  } else {
    state.selectedPoint = { graphKey, pointIndex };
  }
  updateEraseButtons();
}

function clearSelection() {
  state.selectedPoint = null;
  updateEraseButtons();
}

function updateEraseButtons() {
  elements.eraseButtons.forEach((button) => {
    const graphKey = button.dataset.eraseGraph;
    const shouldShow =
      isGraphEditable(graphKey) &&
      Boolean(state.selectedPoint) &&
      state.selectedPoint.graphKey === graphKey &&
      getActivePointMask(graphKey)[state.selectedPoint.pointIndex];
    button.hidden = !shouldShow;
  });
  updatePointAdjusters();
}

function eraseSelectedPoint(graphKey) {
  if (!state.selectedPoint || state.selectedPoint.graphKey !== graphKey || !isGraphEditable(graphKey)) {
    return;
  }

  const activeMask = getActivePointMask(graphKey);
  const activeCount = activeMask.filter(Boolean).length;
  if (activeCount <= getMinimumActivePoints(graphKey)) {
    return;
  }

  pushUndoState();
  activeMask[state.selectedPoint.pointIndex] = false;
  if (state.mode === "quiz-participant") {
    state.quiz.session.answerData[graphKey] = resolveSeriesForArray(state.quiz.session.answerData[graphKey], activeMask);
  } else {
    state.data[graphKey] = resolveSeriesForArray(state.data[graphKey], activeMask);
    recomputeDerivedFrom(graphKey);
  }

  clearSelection();
  renderAll();
}

function recomputeDerivedFrom(sourceKey) {
  state.positionSource = sourceKey;
  state.data[sourceKey] = resolveSeriesForArray(state.data[sourceKey], state.activePoints[sourceKey]);

  if (sourceKey === "x") {
    state.data.v = deriveVelocity(state.data.x);
    state.activePoints.v = Array(TIME_POINTS.length).fill(true);
    state.data.a = deriveAcceleration(state.data.v);
    state.activePoints.a = Array(ACCELERATION_INTERVALS.length).fill(true);
  } else if (sourceKey === "v") {
    state.data.x = integratePositionFromVelocity(state.data.v, state.data.x[0]);
    state.activePoints.x = Array(TIME_POINTS.length).fill(true);
    state.data.a = deriveAcceleration(state.data.v);
    state.activePoints.a = Array(ACCELERATION_INTERVALS.length).fill(true);
  } else if (sourceKey === "a") {
    state.data.v = integrateVelocityFromAcceleration(state.data.a, state.data.v[0] || 0);
    state.activePoints.v = Array(TIME_POINTS.length).fill(true);
    state.data.x = integratePositionFromVelocity(state.data.v, state.data.x[0]);
    state.activePoints.x = Array(TIME_POINTS.length).fill(true);
  }

  updateRanges();
}

function resolveSeriesForArray(series, activeMask) {
  const values = [...series];
  const activeIndices = activeMask
    .map((isActive, index) => (isActive ? index : null))
    .filter((index) => index !== null);

  if (activeIndices.length === 0) {
    return values;
  }

  for (let index = 0; index < values.length; index += 1) {
    if (activeMask[index]) {
      continue;
    }

    const leftIndex = getNeighborIndex(activeIndices, index, -1);
    const rightIndex = getNeighborIndex(activeIndices, index, 1);

    if (leftIndex === null && rightIndex !== null) {
      values[index] = values[rightIndex];
    } else if (rightIndex === null && leftIndex !== null) {
      values[index] = values[leftIndex];
    } else if (leftIndex !== null && rightIndex !== null) {
      const ratio = (index - leftIndex) / (rightIndex - leftIndex);
      values[index] = roundValue(values[leftIndex] + (values[rightIndex] - values[leftIndex]) * ratio);
    }
  }

  return values;
}

function getNeighborIndex(activeIndices, currentIndex, direction) {
  if (direction < 0) {
    for (let index = activeIndices.length - 1; index >= 0; index -= 1) {
      if (activeIndices[index] < currentIndex) {
        return activeIndices[index];
      }
    }
    return null;
  }

  for (let index = 0; index < activeIndices.length; index += 1) {
    if (activeIndices[index] > currentIndex) {
      return activeIndices[index];
    }
  }
  return null;
}

function deriveVelocity(positionSeries) {
  return positionSeries.map((value, index, array) => {
    if (index === 0) {
      return roundValue(array[1] - array[0]);
    }
    if (index === array.length - 1) {
      return roundValue(array[index] - array[index - 1]);
    }
    return roundValue((array[index + 1] - array[index - 1]) / 2);
  });
}

function deriveAcceleration(velocitySeries) {
  return ACCELERATION_INTERVALS.map((index) => roundValue(velocitySeries[index + 1] - velocitySeries[index]));
}

function integrateVelocityFromAcceleration(accelerationSeries, startVelocity) {
  const velocity = [roundValue(startVelocity)];
  for (let index = 0; index < accelerationSeries.length; index += 1) {
    velocity[index + 1] = roundValue(velocity[index] + accelerationSeries[index]);
  }
  return velocity;
}

function integratePositionFromVelocity(velocitySeries, startPosition) {
  const position = [roundValue(startPosition)];
  for (let index = 0; index < velocitySeries.length - 1; index += 1) {
    position[index + 1] = roundValue(position[index] + (velocitySeries[index] + velocitySeries[index + 1]) / 2);
  }
  return position;
}

function updateRanges() {
  state.ranges = deriveRangesFromData(state.data);
}

function deriveRangesFromData(seriesByGraph) {
  return Object.fromEntries(
    Object.entries(seriesByGraph).map(([key, series]) => {
      const values = Array.isArray(series) && series.length ? series : [0];
      const minValue = Math.min(...values);
      const maxValue = Math.max(...values);
      const span = Math.max(2, maxValue - minValue);
      const padding = Math.max(1, Math.ceil(span * 0.18));
      return [
        key,
        {
          min: Math.min(0, Math.floor(minValue - padding)),
          max: Math.max(0, Math.ceil(maxValue + padding))
        }
      ];
    })
  );
}

function renderAll() {
  Object.keys(canvases).forEach((key) => renderGraph(key));
  renderMotion();
}

function renderGraph(graphKey) {
  const canvas = canvases[graphKey];
  const context = canvas.getContext("2d");
  const series = getDisplaySeries(graphKey);
  const metrics = getGraphMetrics(canvas, getDisplayRange(graphKey));
  const config = GRAPH_CONFIG[graphKey];
  const yTicks = buildAxisTicks(getDisplayRange(graphKey));

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffdf7";
  roundRect(context, 0, 0, canvas.width, canvas.height, 24);
  context.fill();

  drawGrid(context, metrics, yTicks);
  drawAxes(context, metrics, graphKey, yTicks);

  if (graphKey === "a") {
    drawStepAccelerationGraph(context, metrics, config.color, series, getActivePointMask(graphKey), isGraphEditable(graphKey));
  } else if (graphKey === "x" && shouldRenderCurvedPosition()) {
    drawCurvedPositionGraph(context, metrics, config.color, series, getActivePointMask(graphKey), isGraphEditable(graphKey));
  } else {
    drawLineGraph(context, metrics, config.color, series, getPointTimes(graphKey), getActivePointMask(graphKey), isGraphEditable(graphKey));
  }

  drawSolutionOverlay(context, metrics, graphKey);
  drawSelectedPoint(context, metrics, graphKey, config.color);
  drawDragValueBubble(context, metrics, graphKey, config.color);
  drawPlaybackCursor(context, metrics, graphKey, config.color);
}

function drawLineGraph(context, metrics, color, series, times, activeMask, editable, options = {}) {
  const connectActiveOnly = options.connectActiveOnly !== false;
  const showPoints = options.showPoints !== false;
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  let started = false;
  series.forEach((value, index) => {
    if (connectActiveOnly && !activeMask[index]) {
      return;
    }
    const x = timeToX(times[index], metrics);
    const y = valueToY(value, metrics);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  if (!showPoints) {
    return;
  }

  series.forEach((value, index) => {
    if (activeMask[index]) {
      drawGraphPoint(context, timeToX(times[index], metrics), valueToY(value, metrics), color, metrics.canvas, editable);
    }
  });
}

function drawCurvedPositionGraph(context, metrics, color, series, activeMask, editable, velocitySeries = getDisplayedVelocitySeriesForPosition()) {
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  let started = false;
  for (let time = 0; time <= 10.0001; time += 0.05) {
    const clampedTime = Math.min(10, time);
    const x = timeToX(clampedTime, metrics);
    const y = valueToY(samplePositionCurve(series, velocitySeries, clampedTime), metrics);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();

  series.forEach((value, index) => {
    if (activeMask[index]) {
      drawGraphPoint(context, timeToX(TIME_POINTS[index], metrics), valueToY(value, metrics), color, metrics.canvas, editable);
    }
  });
}

function drawStepAccelerationGraph(context, metrics, color, series, activeMask, editable) {
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "miter";
  context.lineCap = "butt";
  context.beginPath();

  series.forEach((value, index) => {
    const startX = timeToX(index, metrics);
    const endX = timeToX(index + 1, metrics);
    const y = valueToY(value, metrics);
    context.moveTo(startX, y);
    context.lineTo(endX, y);
  });
  context.stroke();

  context.save();
  context.setLineDash([8, 6]);
  context.beginPath();
  series.forEach((value, index) => {
    if (index >= series.length - 1) {
      return;
    }
    const boundaryX = timeToX(index + 1, metrics);
    context.moveTo(boundaryX, valueToY(value, metrics));
    context.lineTo(boundaryX, valueToY(series[index + 1], metrics));
  });
  context.stroke();
  context.restore();

  series.forEach((value, index) => {
    if (activeMask[index]) {
      drawGraphPoint(context, timeToX(index, metrics), valueToY(value, metrics), color, metrics.canvas, editable);
    }
  });
}

function drawGraphPoint(context, x, y, color, canvas, editable) {
  context.beginPath();
  context.fillStyle = editable ? "#fffdf7" : "rgba(255, 253, 247, 0.7)";
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.arc(x, y, getPointRadius(canvas), 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawSelectedPoint(context, metrics, graphKey, color) {
  if (!state.selectedPoint || state.selectedPoint.graphKey !== graphKey || !isGraphEditable(graphKey)) {
    return;
  }

  const { pointIndex } = state.selectedPoint;
  if (!getActivePointMask(graphKey)[pointIndex]) {
    return;
  }

  const x = timeToX(getPointTimes(graphKey)[pointIndex], metrics);
  const y = valueToY(getDisplaySeries(graphKey)[pointIndex], metrics);

  context.beginPath();
  context.fillStyle = color;
  context.globalAlpha = 0.18;
  context.arc(x, y, getPointRadius(metrics.canvas) + 7, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawDragValueBubble(context, metrics, graphKey, color) {
  const activePoint =
    state.drag && state.drag.moved && state.drag.graphKey === graphKey
      ? state.drag.pointIndex
      : state.selectedPoint && state.selectedPoint.graphKey === graphKey
        ? state.selectedPoint.pointIndex
        : null;

  if (activePoint === null || !getActivePointMask(graphKey)[activePoint]) {
    return;
  }

  const value = getDisplaySeries(graphKey)[activePoint];
  const x = timeToX(getPointTimes(graphKey)[activePoint], metrics);
  const y = valueToY(value, metrics);
  const text = `${value.toFixed(1)} ${GRAPH_CONFIG[graphKey].unit}`;

  context.font = `${getAxisFontSize(metrics.canvas)}px Segoe UI`;
  const width = context.measureText(text).width + 18;
  const bubbleX = Math.max(metrics.left, Math.min(metrics.right - width, x - width / 2));
  const bubbleY = Math.max(metrics.top + 4, y - 34);

  context.fillStyle = "rgba(23, 48, 66, 0.9)";
  roundRect(context, bubbleX, bubbleY, width, 24, 10);
  context.fill();
  context.fillStyle = "#fff";
  context.fillText(text, bubbleX + 9, bubbleY + 16);
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.moveTo(x, y - 4);
  context.lineTo(x, bubbleY + 24);
  context.stroke();
}

function drawSolutionOverlay(context, metrics, graphKey) {
  if (
    state.mode !== "quiz-participant" ||
    !state.quiz.session ||
    !state.quiz.session.reviewMode ||
    state.quiz.session.answerGraph !== graphKey
  ) {
    return;
  }

  context.save();
  context.globalAlpha = 0.92;
  if (graphKey === "a") {
    drawStepAccelerationGraph(
      context,
      metrics,
      "#d62839",
      state.quiz.session.solution[graphKey],
      Array(state.quiz.session.solution[graphKey].length).fill(false),
      false,
      state.quiz.session.solution.v
    );
  } else if (graphKey === "x" && getSolutionPositionSource() !== "x") {
    drawCurvedPositionGraph(
      context,
      metrics,
      "#d62839",
      state.quiz.session.solution[graphKey],
      Array(state.quiz.session.solution[graphKey].length).fill(false),
      false
    );
  } else {
    drawLineGraph(
      context,
      metrics,
      "#d62839",
      state.quiz.session.solution[graphKey],
      getPointTimes(graphKey),
      Array(state.quiz.session.solution[graphKey].length).fill(false),
      false,
      { connectActiveOnly: false, showPoints: false }
    );
  }
  context.restore();
}

function drawPlaybackCursor(context, metrics, graphKey, color) {
  const currentTime = state.playback.currentTime;
  const cursorX = timeToX(currentTime, metrics);
  const cursorY = valueToY(samplePlaybackSeries(graphKey, currentTime), metrics);

  context.strokeStyle = "rgba(23, 48, 66, 0.35)";
  context.lineWidth = 2;
  context.setLineDash([8, 8]);
  context.beginPath();
  context.moveTo(cursorX, metrics.top);
  context.lineTo(cursorX, metrics.bottom);
  context.stroke();
  context.setLineDash([]);

  context.beginPath();
  context.fillStyle = color;
  context.arc(cursorX, cursorY, Math.max(4, getPointRadius(metrics.canvas) - 1), 0, Math.PI * 2);
  context.fill();
}

function drawGrid(context, metrics, yTicks) {
  context.strokeStyle = "rgba(23, 48, 66, 0.09)";
  context.lineWidth = 1;

  TIME_POINTS.forEach((time) => {
    const x = timeToX(time, metrics);
    context.beginPath();
    context.moveTo(x, metrics.top);
    context.lineTo(x, metrics.bottom);
    context.stroke();
  });

  yTicks.forEach((tick) => {
    const y = valueToY(tick, metrics);
    context.beginPath();
    context.moveTo(metrics.left, y);
    context.lineTo(metrics.right, y);
    context.stroke();
  });
}

function drawAxes(context, metrics, graphKey, yTicks) {
  context.strokeStyle = "#000";
  context.fillStyle = "#000";
  context.lineWidth = 2.4;
  context.font = `700 ${getAxisFontSize(metrics.canvas)}px Segoe UI`;
  context.textBaseline = "middle";

  const zeroY = valueToY(0, metrics);
  const xAxisY = zeroY >= metrics.top && zeroY <= metrics.bottom ? zeroY : metrics.bottom;

  drawArrow(context, metrics.left, xAxisY, metrics.right, xAxisY);
  drawArrow(context, metrics.left, metrics.bottom, metrics.left, metrics.top);

  TIME_POINTS.forEach((time) => {
    const x = timeToX(time, metrics);
    context.textAlign = "center";
    context.fillText(`${time}`, x, metrics.bottom + 24);
  });

  yTicks.forEach((tick) => {
    const y = valueToY(tick, metrics);
    context.textAlign = "right";
    context.fillText(`${tick}`, metrics.left - 12, y);
  });

  context.textAlign = "left";
  context.fillText("t [s]", metrics.right + 10, xAxisY);
  context.textAlign = "center";
  context.fillText(`${GRAPH_CONFIG[graphKey].key} [${GRAPH_CONFIG[graphKey].unit}]`, metrics.left, metrics.top - 16);
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
}

function drawArrow(context, fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 12;

  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();

  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
  context.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function renderMotion() {
  const visible = shouldShowMotion();
  elements.motionPanel.classList.toggle("is-hidden", !visible);
  if (!visible) {
    return;
  }

  const xSeries = state.mode === "quiz-participant" ? state.quiz.session.solution.x : state.data.x;
  const range = state.mode === "quiz-participant" ? state.quiz.session.answerRanges.x : state.ranges.x;
  const xValue = samplePositionForMotion(state.playback.currentTime);
  const span = Math.max(0.001, range.max - range.min);
  const leftPercent = 6 + ((xValue - range.min) / span) * 88;
  const originPercent = 6 + ((0 - range.min) / span) * 88;

  elements.car.style.left = `${clamp(leftPercent, 6, 94)}%`;
  elements.originMarker.style.left = `${clamp(originPercent, 6, 94)}%`;
  renderXAxisScale(range);
  renderStrobeCars(xSeries, range);
}

function renderXAxisScale(range) {
  elements.xAxisScale.innerHTML = "";
  const span = Math.max(1, range.max - range.min);
  const ticks = buildAxisTicks(range);

  ticks.forEach((value) => {
    const tick = document.createElement("div");
    tick.className = "x-axis-tick";
    tick.style.left = `${clamp(((value - range.min) / span) * 100, 0, 100)}%`;

    const label = document.createElement("span");
    label.textContent = `${value} m`;
    tick.appendChild(label);
    elements.xAxisScale.appendChild(tick);
  });
}

function renderStrobeCars(xSeries, range) {
  elements.strobeLayer.innerHTML = "";
  if (!state.strobeEnabled) {
    return;
  }

  const span = Math.max(0.001, range.max - range.min);
  const passedTimes = TIME_POINTS.filter((time) => time < state.playback.currentTime);

  passedTimes.forEach((time, index) => {
    const ghost = document.createElement("div");
    ghost.className = "car ghost-car";
    const xValue = samplePositionForMotion(time);
    ghost.style.left = `${clamp(6 + ((xValue - range.min) / span) * 88, 6, 94)}%`;
    ghost.style.opacity = `${0.12 + (index / Math.max(1, passedTimes.length)) * 0.24}`;
    ghost.innerHTML = createCarMarkup();
    elements.strobeLayer.appendChild(ghost);
  });
}

function createCarMarkup() {
  return '<div class="car-body"></div><div class="car-top"></div><div class="wheel left"></div><div class="wheel right"></div>';
}

function tick(timestamp) {
  if (state.playback.running) {
    if (!state.playback.lastFrame) {
      state.playback.lastFrame = timestamp;
    }

    const delta = (timestamp - state.playback.lastFrame) / 1000;
    state.playback.lastFrame = timestamp;
    state.playback.currentTime += delta;

    if (state.playback.currentTime >= 10) {
      state.playback.currentTime = 10;
      pausePlayback();
    }

    renderAll();
  }

  requestAnimationFrame(tick);
}

function getNearestPointIndex(graphKey, event) {
  const canvas = canvases[graphKey];
  const metrics = getGraphMetrics(canvas, getDisplayRange(graphKey));
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (window.devicePixelRatio || 1);
  const y = (event.clientY - rect.top) * (window.devicePixelRatio || 1);
  const hitRadius = Math.max(18 * (window.devicePixelRatio || 1), getPointRadius(canvas) * 2.4);
  let nearestIndex = null;
  let nearestDistance = Infinity;

  getPointTimes(graphKey).forEach((time, index) => {
    if (!getActivePointMask(graphKey)[index]) {
      return;
    }
    const pointX = timeToX(time, metrics);
    const pointY = valueToY(getDisplaySeries(graphKey)[index], metrics);
    const distance = Math.hypot(pointX - x, pointY - y);
    if (distance < nearestDistance && distance <= hitRadius) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function getPointTimes(graphKey) {
  return graphKey === "a" ? ACCELERATION_INTERVALS : TIME_POINTS;
}

function getPointCount(graphKey) {
  return getPointTimes(graphKey).length;
}

function getMinimumActivePoints(graphKey) {
  return graphKey === "a" ? 1 : 2;
}

function getGraphMetrics(canvas, range) {
  const left = Math.max(58, canvas.width * 0.12);
  const right = canvas.width - Math.max(56, canvas.width * 0.08);
  const top = 38;
  const bottom = canvas.height - 54;
  return {
    canvas,
    left,
    right,
    top,
    bottom,
    min: range.min,
    max: range.max
  };
}

function buildAxisTicks(range) {
  const span = Math.max(1, range.max - range.min);
  const roughStep = Math.max(1, Math.ceil(span / 4));
  const step = getNiceIntegerStep(roughStep);
  const start = Math.floor(range.min / step) * step;
  const end = Math.ceil(range.max / step) * step;
  const ticks = [];

  for (let tick = start; tick <= end; tick += step) {
    ticks.push(tick);
  }

  if (!ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((left, right) => left - right);
  }

  return ticks;
}

function getNiceIntegerStep(value) {
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;

  if (normalized <= 1) {
    return power;
  }
  if (normalized <= 2) {
    return 2 * power;
  }
  if (normalized <= 5) {
    return 5 * power;
  }
  return 10 * power;
}

function getAxisFontSize(canvas) {
  return Math.max(13, Math.min(20, Math.floor(Math.min(canvas.width / 18, canvas.height / 9))));
}

function getPointRadius(canvas) {
  return Math.max(4, Math.min(8, Math.floor(Math.min(canvas.width, canvas.height) / 32)));
}

function timeToX(time, metrics) {
  return metrics.left + ((metrics.right - metrics.left) * time) / 10;
}

function valueToY(value, metrics) {
  return metrics.bottom - ((value - metrics.min) / Math.max(0.001, metrics.max - metrics.min)) * (metrics.bottom - metrics.top);
}

function yToValue(y, metrics) {
  const normalized = (metrics.bottom - y) / Math.max(0.001, metrics.bottom - metrics.top);
  return metrics.min + normalized * (metrics.max - metrics.min);
}

function sampleSeries(graphKey, time) {
  return sampleSeriesForArray(getDisplaySeries(graphKey), graphKey, time);
}

function samplePlaybackSeries(graphKey, time) {
  if (
    state.mode === "quiz-participant" &&
    state.quiz.session &&
    state.quiz.session.reviewMode &&
    state.quiz.session.answerGraph === graphKey
  ) {
    if (graphKey === "x" && getSolutionPositionSource() !== "x") {
      return samplePositionCurve(state.quiz.session.solution.x, state.quiz.session.solution.v, time);
    }
    return sampleSeriesForArray(state.quiz.session.solution[graphKey], graphKey, time);
  }

  return sampleSeries(graphKey, time);
}

function sampleSeriesForArray(series, graphKey, time) {
  if (graphKey === "a") {
    const index = Math.min(ACCELERATION_INTERVALS.length - 1, Math.max(0, Math.floor(Math.min(time, 9.999))));
    return series[index];
  }

  if (graphKey === "x" && shouldRenderCurvedPosition()) {
    return samplePositionCurve(series, getDisplayedVelocitySeriesForPosition(), time);
  }

  return sampleSeriesFromArray(series, time);
}

function sampleSeriesFromArray(series, time) {
  const lowerIndex = Math.floor(time);
  const upperIndex = Math.min(10, Math.ceil(time));
  if (lowerIndex === upperIndex) {
    return series[lowerIndex];
  }
  const ratio = time - lowerIndex;
  return series[lowerIndex] + (series[upperIndex] - series[lowerIndex]) * ratio;
}

function samplePositionForMotion(time) {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    if (getSolutionPositionSource() !== "x") {
      return samplePositionCurve(state.quiz.session.solution.x, state.quiz.session.solution.v, time);
    }
    return sampleSeriesFromArray(state.quiz.session.solution.x, time);
  }

  if (state.positionSource !== "x") {
    return samplePositionCurve(state.data.x, state.data.v, time);
  }
  return sampleSeriesFromArray(state.data.x, time);
}

function samplePositionCurve(positionSeries, velocitySeries, time) {
  const clampedTime = Math.max(0, Math.min(10, time));
  const lowerIndex = Math.floor(clampedTime);
  if (lowerIndex >= 10) {
    return positionSeries[10];
  }

  const fraction = clampedTime - lowerIndex;
  const v0 = velocitySeries[lowerIndex];
  const v1 = velocitySeries[Math.min(velocitySeries.length - 1, lowerIndex + 1)];
  return positionSeries[lowerIndex] + v0 * fraction + 0.5 * (v1 - v0) * fraction * fraction;
}

function savePreset() {
  if (state.mode === "quiz-participant") {
    return;
  }

  const suggestedName = `グラフ ${state.presets.length + 1}`;
  const name = window.prompt("保存名を入力してください", suggestedName);
  if (!name) {
    return;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return;
  }

  const preset = {
    name: trimmedName,
    data: cloneSeriesState(state.data),
    activePoints: cloneSeriesState(state.activePoints),
    visiblePanels: { ...state.visiblePanels },
    positionSource: state.positionSource,
    strobeEnabled: state.strobeEnabled
  };

  const existingIndex = state.presets.findIndex((item) => item.name === trimmedName);
  if (existingIndex >= 0) {
    state.presets[existingIndex] = preset;
  } else {
    state.presets.push(preset);
  }

  savePresetsToStorage();
  renderPresetOptions(trimmedName);
}

function loadSelectedPreset() {
  if (state.mode === "quiz-participant") {
    return;
  }

  const presetName = elements.presetSelect.value;
  if (!presetName) {
    return;
  }

  const preset = state.presets.find((item) => item.name === presetName);
  if (!preset) {
    return;
  }

  state.data = normalizeDataSet(cloneSeriesState(preset.data));
  state.activePoints = normalizeActivePoints(cloneSeriesState(preset.activePoints));
  state.positionSource = preset.positionSource || "x";
  state.visiblePanels = {
    x: preset.visiblePanels ? preset.visiblePanels.x !== false : true,
    v: preset.visiblePanels ? preset.visiblePanels.v !== false : true,
    a: preset.visiblePanels ? preset.visiblePanels.a !== false : true,
    motion: preset.visiblePanels ? preset.visiblePanels.motion !== false : true
  };
  state.strobeEnabled = preset.strobeEnabled !== false;
  state.drag = null;
  clearUndoStack();
  clearSelection();
  updateRanges();
  elements.strobeToggle.checked = state.strobeEnabled;
  resetPlayback();
  updatePanelVisibility();
  renderAll();
}

function deleteSelectedPreset() {
  if (state.mode === "quiz-participant") {
    return;
  }

  const presetName = elements.presetSelect.value;
  if (!presetName) {
    return;
  }

  state.presets = state.presets.filter((item) => item.name !== presetName);
  savePresetsToStorage();
  renderPresetOptions();
}

function loadPresetsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.presets = raw ? JSON.parse(raw) : [];
  } catch (error) {
    state.presets = [];
  }
}

function savePresetsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.presets));
}

function renderPresetOptions(selectedName = elements.presetSelect.value) {
  elements.presetSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "保存データ";
  elements.presetSelect.appendChild(placeholder);

  state.presets
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))
    .forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.name;
      option.textContent = preset.name;
      if (preset.name === selectedName) {
        option.selected = true;
      }
      elements.presetSelect.appendChild(option);
    });
}

function updateStatus() {
  elements.statusMessage.textContent = state.statusMessage;
}

function updateUndoButton() {
  elements.undoButton.disabled = state.undoStack.length === 0;
}

function updatePointAdjusters() {
  Object.keys(elements.pointAdjusters).forEach((graphKey) => {
    const adjuster = elements.pointAdjusters[graphKey];
    const label = elements.pointValueLabels[graphKey];
    const isSelected = Boolean(
      state.selectedPoint &&
      state.selectedPoint.graphKey === graphKey &&
      getActivePointMask(graphKey)[state.selectedPoint.pointIndex] &&
      isGraphEditable(graphKey)
    );
    adjuster.hidden = !isSelected;
    if (isSelected) {
      label.textContent = `${getDisplaySeries(graphKey)[state.selectedPoint.pointIndex].toFixed(1)}`;
    }
  });
}

function updatePanelVisibility() {
  Object.entries(elements.cards).forEach(([panelKey, card]) => {
    card.classList.toggle("is-hidden", !isGraphPanelVisible(panelKey));
  });
  elements.motionPanel.classList.toggle("is-hidden", !shouldShowMotion());
  elements.toggles.forEach((button) => {
    const panelKey = button.dataset.graph;
    const active = panelKey === "motion" ? shouldShowMotion() : isGraphPanelVisible(panelKey);
    button.classList.toggle("is-active", active);
    button.disabled = state.mode === "quiz-participant";
  });
}

function updateGraphLocks() {
  Object.entries(elements.cards).forEach(([graphKey, card]) => {
    card.classList.toggle("is-locked", !isGraphEditable(graphKey));
  });
  updateEraseButtons();
}

function updateMotionControls() {
  const inQuiz = state.mode === "quiz-participant";
  const inQuizBuild = state.mode === "quiz-create-edit";
  elements.savePresetButton.hidden = inQuiz;
  elements.loadPresetButton.hidden = inQuiz;
  elements.deletePresetButton.hidden = inQuiz;
  elements.presetSelect.hidden = inQuiz;
  elements.createQuizButton.hidden = inQuiz;
  elements.joinQuizButton.hidden = inQuiz || inQuizBuild;
  elements.submitQuizButton.hidden = !inQuiz || Boolean(state.quiz.session && state.quiz.session.finalized);
  elements.endQuizButton.hidden = true;
  elements.strobeToggle.disabled = !shouldShowMotion();
  updatePanelVisibility();
}

function shouldShowMotion() {
  if (state.mode === "quiz-participant") {
    return state.quiz.session ? state.quiz.session.showMotion : true;
  }
  return Boolean(state.visiblePanels.motion);
}

function isGraphPanelVisible(graphKey) {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    return state.quiz.session.answerGraph === graphKey || state.quiz.session.graphVisibility[graphKey] !== false;
  }
  return Boolean(state.visiblePanels[graphKey]);
}

function isGraphEditable(graphKey) {
  if (state.mode === "quiz-participant") {
    return state.quiz.session && state.quiz.session.answerGraph === graphKey;
  }
  return true;
}

function getDisplaySeries(graphKey) {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    if (state.quiz.session.answerGraph === graphKey) {
      return state.quiz.session.answerData[graphKey];
    }
    return state.quiz.session.solution[graphKey];
  }
  return state.data[graphKey];
}

function getMutableSeries(graphKey) {
  if (state.mode === "quiz-participant" && state.quiz.session && state.quiz.session.answerGraph === graphKey) {
    return state.quiz.session.answerData[graphKey];
  }
  return state.data[graphKey];
}

function getActivePointMask(graphKey) {
  if (state.mode === "quiz-participant" && state.quiz.session && state.quiz.session.answerGraph === graphKey) {
    return state.quiz.session.answerActivePoints[graphKey];
  }
  return state.activePoints[graphKey];
}

function getDisplayRange(graphKey) {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    return state.quiz.session.answerRanges[graphKey];
  }
  return state.ranges[graphKey];
}

function getMutableRange(graphKey) {
  return getDisplayRange(graphKey);
}

function shouldRenderCurvedPosition() {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    if (state.quiz.session.answerGraph === "x") {
      return false;
    }
    return getSolutionPositionSource() !== "x";
  }
  return state.positionSource !== "x";
}

function getSolutionPositionSource() {
  return state.quiz.session ? state.quiz.session.positionSource || "x" : "x";
}

function getDisplayedVelocitySeriesForPosition() {
  if (state.mode === "quiz-participant" && state.quiz.session) {
    return state.quiz.session.solution.v;
  }
  return state.data.v;
}

function getEdgeDirection(pixelY, metrics) {
  if (pixelY <= metrics.top - RANGE_EDGE_OUTSIDE_PX) {
    return "max";
  }
  if (pixelY >= metrics.bottom + RANGE_EDGE_OUTSIDE_PX) {
    return "min";
  }
  return null;
}

function maybeExpandRangeFromEdge(range, edgeDirection) {
  if (!state.drag) {
    return false;
  }

  const now = performance.now();
  if (!edgeDirection) {
    state.drag.edgeDirection = null;
    state.drag.edgeStartAt = 0;
    state.drag.lastExpandAt = 0;
    return false;
  }

  if (state.drag.edgeDirection !== edgeDirection) {
    state.drag.edgeDirection = edgeDirection;
    state.drag.edgeStartAt = now;
    state.drag.lastExpandAt = 0;
    return false;
  }

  if (now - state.drag.edgeStartAt < RANGE_EXPAND_DELAY_MS) {
    return false;
  }
  if (state.drag.lastExpandAt && now - state.drag.lastExpandAt < RANGE_EXPAND_INTERVAL_MS) {
    return false;
  }

  const span = Math.max(2, range.max - range.min);
  const growth = Math.max(1, Math.ceil(span * 0.18));
  if (edgeDirection === "max") {
    range.max += growth;
  } else {
    range.min -= growth;
  }
  state.drag.lastExpandAt = now;
  return true;
}

function buildBlankAnswerSeries(graphKey, solutionSeries) {
  const baseValue = graphKey === "x" ? solutionSeries[0] : 0;
  return Array(getPointCount(graphKey)).fill(roundValue(baseValue));
}

function compareSeries(left, right, tolerance) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
}

function normalizeDataSet(source) {
  const xSeries = Array.isArray(source.x) && source.x.length === TIME_POINTS.length
    ? [...source.x]
    : [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
  const vSeries = Array.isArray(source.v) && source.v.length === TIME_POINTS.length
    ? [...source.v]
    : deriveVelocity(xSeries);
  const aSeries = Array.isArray(source.a) && source.a.length === ACCELERATION_INTERVALS.length
    ? [...source.a]
    : deriveAcceleration(vSeries);
  return { x: xSeries, v: vSeries, a: aSeries };
}

function normalizeActivePoints(source) {
  return {
    x: Array.isArray(source.x) && source.x.length === TIME_POINTS.length ? [...source.x] : Array(TIME_POINTS.length).fill(true),
    v: Array.isArray(source.v) && source.v.length === TIME_POINTS.length ? [...source.v] : Array(TIME_POINTS.length).fill(true),
    a: Array.isArray(source.a) && source.a.length === ACCELERATION_INTERVALS.length ? [...source.a] : Array(ACCELERATION_INTERVALS.length).fill(true)
  };
}

function cloneSeriesState(source) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])
  );
}

function cloneRangeState(source) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, { ...value }])
  );
}

function getCheckedValue(name) {
  const input = document.querySelector(`input[name="${name}"]:checked`);
  return input ? input.value : "";
}

function showResultOverlay(title, message) {
  elements.resultTitle.textContent = title;
  elements.resultMessage.textContent = message;
  openOverlay(elements.resultOverlay);
}

function openOverlay(element) {
  element.classList.add("is-visible");
}

function closeOverlay(element) {
  element.classList.remove("is-visible");
}

function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundValue(value) {
  return Math.round(value * 10) / 10;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
