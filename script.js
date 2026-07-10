(function () {
  "use strict";

  const APP_VERSION = "v0.1.1";
  const STORAGE_KEY = "plant-ai-digital-twin-v0.1.0";
  const LEGACY_STORAGE_KEY = "plant-ai-measurements-v0.1.0";
  const MAX_HISTORY_ITEMS = 30;
  const adapter = new PlantAISensors.DemoSensorAdapter();

  const elements = {
    surfaceRange: document.querySelector("#surface-range"),
    surfaceNumber: document.querySelector("#surface-number"),
    surfaceOutput: document.querySelector("#surface-output"),
    rootRange: document.querySelector("#root-range"),
    rootNumber: document.querySelector("#root-number"),
    rootOutput: document.querySelector("#root-output"),
    weight: document.querySelector("#weight-input"),
    temperature: document.querySelector("#temperature-input"),
    humidity: document.querySelector("#humidity-input"),
    decisionPanel: document.querySelector("#decision-panel"),
    decisionTitle: document.querySelector("#decision-title"),
    decisionSummary: document.querySelector("#decision-summary"),
    agreementBadge: document.querySelector("#agreement-badge"),
    certaintyLabel: document.querySelector("#certainty-label"),
    certaintyMeter: document.querySelector("#certainty-meter"),
    reasonList: document.querySelector("#reason-list"),
    eventNotice: document.querySelector("#event-notice"),
    randomDemoButton: document.querySelector("#random-demo-button"),
    scenarioButtons: Array.from(document.querySelectorAll("[data-scenario]")),
    saveButton: document.querySelector("#save-button"),
    exportButton: document.querySelector("#export-button"),
    clearButton: document.querySelector("#clear-button"),
    historyList: document.querySelector("#history-list"),
    emptyHistory: document.querySelector("#empty-history"),
    feedback: document.querySelector("#feedback")
  };

  let previousReading = null;
  let currentReading = null;
  let currentAnalysis = null;
  let activeScenario = "balanced";
  let history = loadHistory();
  let feedbackTimer;

  function readInputs() {
    return PlantAILogic.normalizeReading({
      surface: elements.surfaceNumber.value,
      root: elements.rootNumber.value,
      weightChange: elements.weight.value,
      temperature: elements.temperature.value,
      humidity: elements.humidity.value
    });
  }

  function writeInputs(reading) {
    const normalized = PlantAILogic.normalizeReading(reading);
    elements.surfaceRange.value = String(normalized.surface);
    elements.surfaceNumber.value = String(normalized.surface);
    elements.surfaceOutput.textContent = String(normalized.surface);
    elements.surfaceRange.style.setProperty("--range-progress", `${normalized.surface}%`);
    elements.rootRange.value = String(normalized.root);
    elements.rootNumber.value = String(normalized.root);
    elements.rootOutput.textContent = String(normalized.root);
    elements.rootRange.style.setProperty("--range-progress", `${normalized.root}%`);
    elements.weight.value = String(normalized.weightChange);
    elements.temperature.value = String(normalized.temperature);
    elements.humidity.value = String(normalized.humidity);
  }

  function analyzeAndRender(reading, previous) {
    currentReading = PlantAILogic.normalizeReading(reading);
    currentAnalysis = PlantAILogic.evaluateReading(currentReading, previous);
    renderAnalysis(currentAnalysis);
  }

  function renderAnalysis(analysis) {
    elements.decisionPanel.className = `decision-panel decision-${analysis.state}`;
    elements.decisionTitle.textContent = analysis.stateLabel;
    elements.decisionSummary.textContent = analysis.summary;
    elements.agreementBadge.className = `agreement-badge agreement-${analysis.agreement}`;
    elements.agreementBadge.textContent = analysis.agreementLabel;
    elements.certaintyLabel.textContent = analysis.certaintyLabel;
    elements.certaintyMeter.dataset.level = String(analysis.certaintyLevel);
    elements.certaintyMeter.setAttribute("aria-label", `判断の確からしさ ${analysis.certaintyLabel}`);

    elements.reasonList.replaceChildren();
    analysis.reasons.forEach((reason, index) => {
      const item = document.createElement("li");
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const text = document.createElement("p");
      text.textContent = reason;
      item.append(number, text);
      elements.reasonList.append(item);
    });

    if (analysis.wateringDetected) {
      elements.eventNotice.hidden = false;
      elements.eventNotice.textContent = `水やりによる変化の可能性：表層 ${PlantAILogic.formatSigned(analysis.deltas.surface)}pt・根元 ${PlantAILogic.formatSigned(analysis.deltas.root)}pt・重量 ${PlantAILogic.formatSigned(analysis.reading.weightChange)}g`;
    } else {
      elements.eventNotice.hidden = true;
      elements.eventNotice.textContent = "";
    }
  }

  function applyScenario(name) {
    const scenario = adapter.getScenario(name);
    previousReading = scenario.previous;
    activeScenario = name;
    writeInputs(scenario.current);
    analyzeAndRender(scenario.current, scenario.previous);
    setActiveScenarioButton(name);
    showFeedback(`「${scenario.label}」のデモを再現しました。`);
  }

  function applyRandomDemo() {
    const demo = adapter.getRandomReading(currentReading);
    previousReading = demo.previous;
    activeScenario = "random";
    writeInputs(demo.current);
    analyzeAndRender(demo.current, demo.previous);
    setActiveScenarioButton("");
    showFeedback("ランダムなデモ値を生成しました。");
  }

  function handleManualInput(changedKey) {
    if (changedKey === "surface") {
      elements.surfaceRange.value = elements.surfaceNumber.value;
      elements.surfaceOutput.textContent = elements.surfaceNumber.value || "0";
    }
    if (changedKey === "root") {
      elements.rootRange.value = elements.rootNumber.value;
      elements.rootOutput.textContent = elements.rootNumber.value || "0";
    }

    const beforeChange = currentReading ? { ...currentReading } : null;
    const nextReading = readInputs();
    activeScenario = "manual";
    setActiveScenarioButton("");
    previousReading = beforeChange;
    analyzeAndRender(nextReading, beforeChange);
  }

  function setActiveScenarioButton(name) {
    elements.scenarioButtons.forEach((button) => {
      const isActive = button.dataset.scenario === name;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function createSnapshot() {
    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      recordedAt: new Date().toISOString(),
      version: APP_VERSION,
      scenario: activeScenario,
      reading: { ...currentReading },
      state: currentAnalysis.stateLabel,
      agreement: currentAnalysis.agreementLabel,
      certainty: currentAnalysis.certaintyLabel
    };
  }

  function saveSnapshot() {
    history = [createSnapshot(), ...history].slice(0, MAX_HISTORY_ITEMS);
    if (persistHistory()) {
      renderHistory();
      showFeedback("現在の状態を記録しました。");
    }
  }

  function loadHistory() {
    try {
      const currentData = localStorage.getItem(STORAGE_KEY);
      if (currentData !== null) {
        const saved = JSON.parse(currentData);
        return Array.isArray(saved) ? saved.filter(isValidSnapshot).slice(0, MAX_HISTORY_ITEMS) : [];
      }

      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      if (!Array.isArray(legacy)) return [];
      return legacy.map(convertLegacyMeasurement).filter(Boolean).slice(0, MAX_HISTORY_ITEMS);
    } catch (_error) {
      return [];
    }
  }

  function isValidSnapshot(item) {
    return Boolean(item && typeof item.recordedAt === "string" && item.reading && Number.isFinite(Number(item.reading.surface)) && Number.isFinite(Number(item.reading.root)));
  }

  function convertLegacyMeasurement(item) {
    if (!item || !Number.isFinite(Number(item.moisture ?? item.value))) return null;
    const moisture = Number(item.moisture ?? item.value);
    const reading = PlantAILogic.normalizeReading({ surface: moisture, root: moisture, weightChange: 0, temperature: 24, humidity: 55 });
    const analysis = PlantAILogic.evaluateReading(reading, null);
    return {
      id: item.id || `legacy-${Date.now()}`,
      recordedAt: item.measuredAt || item.createdAt || new Date().toISOString(),
      version: APP_VERSION,
      scenario: "legacy",
      reading,
      state: analysis.stateLabel,
      agreement: analysis.agreementLabel,
      certainty: analysis.certaintyLabel
    };
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      return true;
    } catch (_error) {
      showFeedback("履歴を保存できませんでした。ブラウザの設定をご確認ください。", true);
      return false;
    }
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    history.forEach((snapshot) => {
      const card = document.createElement("article");
      card.className = "history-card";
      const time = document.createElement("time");
      time.dateTime = snapshot.recordedAt;
      time.textContent = formatDate(snapshot.recordedAt);
      const title = document.createElement("strong");
      title.textContent = snapshot.state;
      const values = document.createElement("p");
      values.textContent = `表層 ${snapshot.reading.surface}% ／ 根元 ${snapshot.reading.root}% ／ 重量 ${PlantAILogic.formatSigned(snapshot.reading.weightChange)}g`;
      const meta = document.createElement("small");
      meta.textContent = `${snapshot.agreement}・確からしさ ${snapshot.certainty}`;
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "snapshot-delete";
      deleteButton.textContent = "この記録を削除";
      deleteButton.setAttribute("aria-label", `${formatDate(snapshot.recordedAt)}の観察記録を削除`);
      deleteButton.addEventListener("click", () => deleteSnapshot(snapshot.id));
      card.append(time, title, values, meta, deleteButton);
      elements.historyList.append(card);
    });
    elements.emptyHistory.hidden = history.length > 0;
    elements.clearButton.disabled = history.length === 0;
    elements.exportButton.disabled = history.length === 0;
  }

  function deleteSnapshot(id) {
    const nextHistory = history.filter((snapshot) => snapshot.id !== id);
    if (nextHistory.length === history.length) return;
    history = nextHistory;
    if (persistHistory()) {
      renderHistory();
      showFeedback("選択した観察記録を削除しました。");
    }
  }

  function escapeCsvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function buildHistoryCsv() {
    const headers = ["ID", "測定日時", "シナリオ", "表層水分(%)", "根元水分(%)", "鉢重量変化(g)", "温度(℃)", "湿度(%)", "状態", "センサー整合性", "確からしさ", "記録バージョン"];
    const rows = history.map((snapshot) => [
      snapshot.id,
      snapshot.recordedAt,
      snapshot.scenario,
      snapshot.reading.surface,
      snapshot.reading.root,
      snapshot.reading.weightChange,
      snapshot.reading.temperature,
      snapshot.reading.humidity,
      snapshot.state,
      snapshot.agreement,
      snapshot.certainty,
      snapshot.version || "v0.1.0"
    ]);
    return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
  }

  function exportHistoryCsv() {
    if (history.length === 0) return;
    const csv = `\uFEFF${buildHistoryCsv()}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plant-ai-snapshots-v0.1.1.csv";
    document.body.append(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    showFeedback(`${history.length}件の観察記録をCSVへ書き出しました。`);
  }

  function clearHistory() {
    if (history.length === 0) return;
    if (!window.confirm("観察履歴をすべて削除します。よろしいですか？")) return;
    history = [];
    if (persistHistory()) {
      renderHistory();
      showFeedback("観察履歴を削除しました。");
    }
  }

  function formatDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function showFeedback(message, isError = false) {
    window.clearTimeout(feedbackTimer);
    elements.feedback.textContent = message;
    elements.feedback.classList.toggle("is-error", isError);
    feedbackTimer = window.setTimeout(() => { elements.feedback.textContent = ""; }, 4000);
  }

  elements.surfaceRange.addEventListener("input", () => {
    elements.surfaceNumber.value = elements.surfaceRange.value;
    elements.surfaceOutput.textContent = elements.surfaceRange.value;
    handleManualInput("surface");
  });
  elements.surfaceNumber.addEventListener("input", () => {
    if (elements.surfaceNumber.value !== "") handleManualInput("surface");
  });
  elements.rootRange.addEventListener("input", () => {
    elements.rootNumber.value = elements.rootRange.value;
    elements.rootOutput.textContent = elements.rootRange.value;
    handleManualInput("root");
  });
  elements.rootNumber.addEventListener("input", () => {
    if (elements.rootNumber.value !== "") handleManualInput("root");
  });
  [elements.weight, elements.temperature, elements.humidity].forEach((input) => {
    input.addEventListener("input", () => { if (input.value !== "") handleManualInput(input.dataset.sensor); });
  });
  elements.scenarioButtons.forEach((button) => button.addEventListener("click", () => applyScenario(button.dataset.scenario)));
  elements.randomDemoButton.addEventListener("click", applyRandomDemo);
  elements.saveButton.addEventListener("click", saveSnapshot);
  elements.exportButton.addEventListener("click", exportHistoryCsv);
  elements.clearButton.addEventListener("click", clearHistory);

  // CSV生成結果を変更せず確認するための読み取り専用インターフェースです。
  globalThis.PlantAIApp = Object.freeze({ getHistoryCsv: buildHistoryCsv, getHistoryCount: () => history.length });

  const initial = adapter.getInitialReading();
  previousReading = initial.previous;
  writeInputs(initial.current);
  analyzeAndRender(initial.current, initial.previous);
  setActiveScenarioButton("balanced");
  renderHistory();
})();
