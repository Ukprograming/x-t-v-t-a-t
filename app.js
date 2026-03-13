const TIME_POINTS = Array.from({ length: 11 }, (_, index) => index);
const ACCELERATION_INTERVALS = Array.from({ length: 10 }, (_, index) => index);
const STORAGE_KEY = "physics-motion-presets-v1";
const GRAPH_CONFIG = {
  x: { key: "x", label: "x-t", unit: "m", color: "#2c7a7b" },
  v: { key: "v", label: "v-t", unit: "m/s", color: "#2457c5" },
  a: { key: "a", label: "a-t", unit: "m/s²", color: "#b83b5e" }
};

const state = {
  data: {
    x: [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55],
    v: [],
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
  visibleGraphs: new Set(["x", "v", "a"]),
  selectedPoint: null,
  drag: null,
  strobeEnabled: true,
  presets: [],
  playback: {
    running: false,
    currentTime: 0,
    lastFrame: 0
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
  cards: {
    x: document.querySelector('[data-graph-card="x"]'),
    v: document.querySelector('[data-graph-card="v"]'),
    a: document.querySelector('[data-graph-card="a"]')
  },
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  savePresetButton: document.getElementById("savePresetButton"),
  loadPresetButton: document.getElementById("loadPresetButton"),
  deletePresetButton: document.getElementById("deletePresetButton"),
  presetSelect: document.getElementById("presetSelect"),
  strobeToggle: document.getElementById("strobeToggle"),
  car: document.getElementById("car"),
  strobeLayer: document.getElementById("strobeLayer"),
  originMarker: document.getElementById("originMarker"),
  xAxisScale: document.getElementById("xAxisScale"),
};

initialize();

function initialize() {
  loadPresetsFromStorage();
  recomputeDerivedFrom("x");
  syncCanvasResolution();
  bindEvents();
  renderPresetOptions();
  updateEraseButtons();
  renderAll();
  requestAnimationFrame(tick);
}

function bindEvents() {
  window.addEventListener("resize", () => {
    syncCanvasResolution();
    renderAll();
  });

  elements.toggles.forEach((button) => {
    button.addEventListener("click", () => toggleGraph(button.dataset.graph));
  });

  elements.eraseButtons.forEach((button) => {
    button.addEventListener("click", () => eraseSelectedPoint(button.dataset.eraseGraph));
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

  elements.startButton.addEventListener("click", () => {
    state.playback.running = true;
    if (!state.playback.lastFrame) {
      state.playback.lastFrame = performance.now();
    }
  });

  elements.pauseButton.addEventListener("click", () => {
    state.playback.running = false;
    state.playback.lastFrame = 0;
  });

  elements.resetButton.addEventListener("click", () => {
    state.playback.running = false;
    state.playback.currentTime = 0;
    state.playback.lastFrame = 0;
    renderAll();
  });

  elements.strobeToggle.addEventListener("change", () => {
    state.strobeEnabled = elements.strobeToggle.checked;
    renderMotion();
  });

  elements.savePresetButton.addEventListener("click", savePreset);
  elements.loadPresetButton.addEventListener("click", loadSelectedPreset);
  elements.deletePresetButton.addEventListener("click", deleteSelectedPreset);
}

function toggleGraph(graphKey) {
  const isVisible = state.visibleGraphs.has(graphKey);
  if (isVisible && state.visibleGraphs.size === 1) {
    return;
  }

  if (isVisible) {
    state.visibleGraphs.delete(graphKey);
  } else if (state.visibleGraphs.size < 3) {
    state.visibleGraphs.add(graphKey);
  }

  elements.toggles.forEach((button) => {
    const active = state.visibleGraphs.has(button.dataset.graph);
    button.classList.toggle("is-active", active);
  });

  Object.entries(elements.cards).forEach(([key, card]) => {
    card.classList.toggle("is-hidden", !state.visibleGraphs.has(key));
  });

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
  const pointIndex = getNearestPointIndex(graphKey, event);
  if (pointIndex === null) {
    clearSelection();
    renderAll();
    return;
  }

  state.playback.running = false;
  state.playback.lastFrame = 0;
  state.drag = {
    graphKey,
    pointIndex,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    currentValue: state.data[graphKey][pointIndex]
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
  const metrics = getGraphMetrics(canvas, state.ranges[graphKey]);
  const rect = canvas.getBoundingClientRect();
  const pixelY = (event.clientY - rect.top) * (window.devicePixelRatio || 1);
  const clampedY = Math.max(metrics.top - 18, Math.min(metrics.bottom + 18, pixelY));
  const nextValue = yToValue(clampedY, metrics);
  const currentRange = state.ranges[graphKey];
  const padding = Math.max(1, (currentRange.max - currentRange.min) * 0.08);
  const growth = Math.max(1, Math.ceil(Math.max(2, currentRange.max - currentRange.min) * 0.08));

  if (nextValue > currentRange.max - padding) {
    currentRange.max += growth;
  }
  if (nextValue < currentRange.min + padding) {
    currentRange.min -= growth;
  }

  state.data[graphKey][pointIndex] = roundValue(nextValue);
  state.drag.currentValue = state.data[graphKey][pointIndex];
  recomputeDerivedFrom(graphKey);
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
      Boolean(state.selectedPoint) &&
      state.selectedPoint.graphKey === graphKey &&
      state.activePoints[graphKey][state.selectedPoint.pointIndex];
    button.hidden = !shouldShow;
  });
}

function eraseSelectedPoint(graphKey) {
  if (!state.selectedPoint || state.selectedPoint.graphKey !== graphKey) {
    return;
  }

  const activeMask = state.activePoints[graphKey];
  const activeCount = activeMask.filter(Boolean).length;
  const minimumActive = graphKey === "a" ? 1 : 2;
  if (activeCount <= minimumActive) {
    return;
  }

  activeMask[state.selectedPoint.pointIndex] = false;
  state.data[graphKey] = resolveSeries(graphKey);
  recomputeDerivedFrom(graphKey);
  clearSelection();
  renderAll();
}

function recomputeDerivedFrom(sourceKey) {
  state.data[sourceKey] = resolveSeries(sourceKey);

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

function resolveSeries(graphKey) {
  const values = [...state.data[graphKey]];
  const activeMask = state.activePoints[graphKey];
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
      continue;
    }

    if (rightIndex === null && leftIndex !== null) {
      values[index] = values[leftIndex];
      continue;
    }

    if (leftIndex !== null && rightIndex !== null) {
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
  return ACCELERATION_INTERVALS.map((index) => {
    return roundValue(velocitySeries[index + 1] - velocitySeries[index]);
  });
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
    position[index + 1] = roundValue(position[index] + velocitySeries[index]);
  }
  return position;
}

function updateRanges() {
  Object.keys(state.data).forEach((key) => {
    const series = state.data[key];
    const minValue = Math.min(...series);
    const maxValue = Math.max(...series);
    const span = Math.max(2, maxValue - minValue);
    const padding = Math.max(1, Math.ceil(span * 0.18));

    state.ranges[key] = {
      min: Math.min(0, Math.floor(minValue - padding)),
      max: Math.max(0, Math.ceil(maxValue + padding))
    };
  });
}

function renderAll() {
  Object.keys(canvases).forEach((key) => renderGraph(key));
  renderMotion();
}

function renderGraph(graphKey) {
  const canvas = canvases[graphKey];
  const context = canvas.getContext("2d");
  const metrics = getGraphMetrics(canvas, state.ranges[graphKey]);
  const config = GRAPH_CONFIG[graphKey];
  const yTicks = buildAxisTicks(state.ranges[graphKey]);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffdf7";
  roundRect(context, 0, 0, canvas.width, canvas.height, 24);
  context.fill();

  drawGrid(context, metrics, yTicks);
  drawAxes(context, metrics, graphKey, yTicks);

  if (graphKey === "a") {
    drawStepAccelerationGraph(context, metrics, config.color, state.data.a, state.activePoints.a);
  } else {
    drawLineGraph(context, metrics, config.color, state.data[graphKey], TIME_POINTS, state.activePoints[graphKey]);
  }

  drawSelectedPoint(context, metrics, graphKey, config.color);
  drawDragValueBubble(context, metrics, graphKey, config.color);
  drawPlaybackCursor(context, metrics, graphKey, config.color);
}

function drawLineGraph(context, metrics, color, series, times, activeMask) {
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  series.forEach((value, index) => {
    const x = timeToX(times[index], metrics);
    const y = valueToY(value, metrics);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  series.forEach((value, index) => {
    if (activeMask[index]) {
      drawGraphPoint(context, timeToX(times[index], metrics), valueToY(value, metrics), color, metrics.canvas);
    }
  });
}

function drawStepAccelerationGraph(context, metrics, color, series, activeMask) {
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "miter";
  context.lineCap = "butt";
  context.beginPath();

  context.moveTo(timeToX(0, metrics), valueToY(series[0], metrics));
  for (let index = 0; index < series.length; index += 1) {
    const startX = timeToX(index, metrics);
    const endX = timeToX(index + 1, metrics);
    const currentY = valueToY(series[index], metrics);

    if (index === 0) {
      context.moveTo(startX, currentY);
    }
    context.lineTo(endX, currentY);

    if (index < series.length - 1) {
      const nextY = valueToY(series[index + 1], metrics);
      context.lineTo(endX, nextY);
    }
  }
  context.stroke();

  series.forEach((value, index) => {
    if (activeMask[index]) {
      drawGraphPoint(context, timeToX(index, metrics), valueToY(value, metrics), color, metrics.canvas);
    }
  });
}

function drawGraphPoint(context, x, y, color, canvas) {
  context.beginPath();
  context.fillStyle = "#fffdf7";
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.arc(x, y, getPointRadius(canvas), 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawSelectedPoint(context, metrics, graphKey, color) {
  if (!state.selectedPoint || state.selectedPoint.graphKey !== graphKey) {
    return;
  }

  const { pointIndex } = state.selectedPoint;
  if (!state.activePoints[graphKey][pointIndex]) {
    return;
  }

  const pointTime = getPointTimes(graphKey)[pointIndex];
  const pointValue = state.data[graphKey][pointIndex];
  const x = timeToX(pointTime, metrics);
  const y = valueToY(pointValue, metrics);

  context.beginPath();
  context.fillStyle = color;
  context.globalAlpha = 0.18;
  context.arc(x, y, getPointRadius(metrics.canvas) + 7, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawDragValueBubble(context, metrics, graphKey, color) {
  if (!state.drag || !state.drag.moved || state.drag.graphKey !== graphKey) {
    return;
  }

  const pointTime = getPointTimes(graphKey)[state.drag.pointIndex];
  const value = state.data[graphKey][state.drag.pointIndex];
  const x = timeToX(pointTime, metrics);
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

function drawPlaybackCursor(context, metrics, graphKey, color) {
  const currentTime = state.playback.currentTime;
  const currentValue = sampleSeries(graphKey, currentTime);
  const cursorX = timeToX(currentTime, metrics);
  const cursorY = valueToY(currentValue, metrics);

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
  context.strokeStyle = "rgba(23, 48, 66, 0.24)";
  context.fillStyle = "#5d7380";
  context.lineWidth = 2;
  context.font = `${getAxisFontSize(metrics.canvas)}px Segoe UI`;

  const zeroY = valueToY(0, metrics);
  const xAxisY = zeroY >= metrics.top && zeroY <= metrics.bottom ? zeroY : metrics.bottom;

  context.beginPath();
  context.moveTo(metrics.left, xAxisY);
  context.lineTo(metrics.right, xAxisY);
  context.moveTo(metrics.left, metrics.top);
  context.lineTo(metrics.left, metrics.bottom);
  context.stroke();

  TIME_POINTS.forEach((time) => {
    const x = timeToX(time, metrics);
    context.fillText(`${time}`, x - 4, metrics.bottom + 20);
  });

  const unit = GRAPH_CONFIG[graphKey].unit;
  yTicks.forEach((tick) => {
    const y = valueToY(tick, metrics);
    context.fillText(`${tick} ${unit}`, 8, y + 4);
  });

  context.fillText("t [s]", metrics.right - 28, metrics.bottom + 20);
}

function renderMotion() {
  const currentTime = state.playback.currentTime;
  const xValue = sampleSeries("x", currentTime);
  const range = state.ranges.x;
  const span = Math.max(0.001, range.max - range.min);
  const leftPercent = 6 + ((xValue - range.min) / span) * 88;
  const originPercent = 6 + ((0 - range.min) / span) * 88;

  elements.car.style.left = `${clamp(leftPercent, 6, 94)}%`;
  elements.originMarker.style.left = `${clamp(originPercent, 6, 94)}%`;
  renderXAxisScale(range);
  renderStrobeCars();
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

function renderStrobeCars() {
  elements.strobeLayer.innerHTML = "";
  if (!state.strobeEnabled) {
    return;
  }

  const range = state.ranges.x;
  const span = Math.max(0.001, range.max - range.min);
  const passedTimes = TIME_POINTS.filter((time) => time < state.playback.currentTime);

  passedTimes.forEach((time, index) => {
    const ghost = document.createElement("div");
    ghost.className = "car ghost-car";
    ghost.style.left = `${clamp(6 + ((state.data.x[time] - range.min) / span) * 88, 6, 94)}%`;
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
      state.playback.running = false;
      state.playback.lastFrame = 0;
    }

    renderAll();
  }

  requestAnimationFrame(tick);
}

function getNearestPointIndex(graphKey, event) {
  const canvas = canvases[graphKey];
  const metrics = getGraphMetrics(canvas, state.ranges[graphKey]);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (window.devicePixelRatio || 1);
  const pointTimes = getPointTimes(graphKey);
  let nearestIndex = null;
  let nearestDistance = Infinity;

  pointTimes.forEach((time, index) => {
    if (!state.activePoints[graphKey][index]) {
      return;
    }
    const pointX = timeToX(time, metrics);
    const distance = Math.abs(pointX - x);
    if (distance < nearestDistance && distance < 28 * (window.devicePixelRatio || 1)) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function getPointTimes(graphKey) {
  return graphKey === "a" ? ACCELERATION_INTERVALS : TIME_POINTS;
}

function getGraphMetrics(canvas, range) {
  const left = Math.max(46, canvas.width * 0.14);
  const right = canvas.width - 18;
  const top = 16;
  const bottom = canvas.height - 30;
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
  return Math.max(10, Math.min(16, Math.floor(Math.min(canvas.width / 22, canvas.height / 12))));
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
  if (graphKey === "a") {
    const clampedIndex = Math.min(ACCELERATION_INTERVALS.length - 1, Math.max(0, Math.floor(Math.min(time, 9.999))));
    return state.data.a[clampedIndex];
  }

  const series = state.data[graphKey];
  const lowerIndex = Math.floor(time);
  const upperIndex = Math.min(10, Math.ceil(time));
  if (lowerIndex === upperIndex) {
    return series[lowerIndex];
  }
  const ratio = time - lowerIndex;
  return series[lowerIndex] + (series[upperIndex] - series[lowerIndex]) * ratio;
}

function savePreset() {
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
    visibleGraphs: Array.from(state.visibleGraphs),
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
  const presetName = elements.presetSelect.value;
  if (!presetName) {
    return;
  }

  const preset = state.presets.find((item) => item.name === presetName);
  if (!preset) {
    return;
  }

  state.data = cloneSeriesState(preset.data);
  state.activePoints = cloneSeriesState(preset.activePoints);
  state.visibleGraphs = new Set(preset.visibleGraphs || ["x", "v", "a"]);
  state.strobeEnabled = preset.strobeEnabled !== false;
  state.playback.running = false;
  state.playback.currentTime = 0;
  state.playback.lastFrame = 0;
  state.drag = null;
  clearSelection();
  updateRanges();

  elements.strobeToggle.checked = state.strobeEnabled;
  elements.toggles.forEach((button) => {
    const active = state.visibleGraphs.has(button.dataset.graph);
    button.classList.toggle("is-active", active);
  });
  Object.entries(elements.cards).forEach(([key, card]) => {
    card.classList.toggle("is-hidden", !state.visibleGraphs.has(key));
  });

  syncCanvasResolution();
  renderAll();
}

function deleteSelectedPreset() {
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

function cloneSeriesState(source) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, [...value]])
  );
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








