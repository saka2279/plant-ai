(function () {
  "use strict";

  const APP_VERSION = "v0.3.0";
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
    feedback: document.querySelector("#feedback"),
    measurementForm: document.querySelector("#measurement-form"),
    serialOutput: document.querySelector("#serial-output-input"),
    serialParseFeedback: document.querySelector("#serial-parse-feedback"),
    parsedSummary: document.querySelector("#parsed-summary"),
    parsedSource: document.querySelector("#parsed-source"),
    parsedRawAvg: document.querySelector("#parsed-raw-avg"),
    parsedRawMin: document.querySelector("#parsed-raw-min"),
    parsedRawMax: document.querySelector("#parsed-raw-max"),
    measurementEditStatus: document.querySelector("#measurement-edit-status"),
    measurementEditTarget: document.querySelector("#measurement-edit-target"),
    measurementSaveTitle: document.querySelector("#measurement-save-title"),
    measurementSaveButton: document.querySelector("#measurement-save-button"),
    measurementCancelButton: document.querySelector("#measurement-cancel-button"),
    manualEntryDetails: document.querySelector("#manual-entry-details"),
    observationOptionsDetails: document.querySelector("#observation-options-details"),
    memoDetails: document.querySelector("#memo-details"),
    measurementDate: document.querySelector("#measurement-datetime"),
    rawAvg: document.querySelector("#raw-avg-input"),
    rawMin: document.querySelector("#raw-min-input"),
    rawMax: document.querySelector("#raw-max-input"),
    watering: document.querySelector("#watering-input"),
    soilFeel: document.querySelector("#soil-feel-input"),
    observationSummary: document.querySelector("#observation-summary"),
    measurementMemo: document.querySelector("#measurement-memo"),
    measurementFeedback: document.querySelector("#measurement-feedback"),
    measurementList: document.querySelector("#measurement-list"),
    emptyMeasurements: document.querySelector("#empty-measurements"),
    measurementCount: document.querySelector("#measurement-count"),
    rawChart: document.querySelector("#raw-chart"),
    emptyChart: document.querySelector("#empty-chart"),
    measurementExportButton: document.querySelector("#measurement-export-button"),
    measurementImportButton: document.querySelector("#measurement-import-button"),
    measurementCsvInput: document.querySelector("#measurement-csv-input")
  };

  let previousReading = null;
  let currentReading = null;
  let currentAnalysis = null;
  let activeScenario = "balanced";
  let history = loadHistory();
  let feedbackTimer;
  const measurementLoadResult = PlantAIMeasurements.loadRecords(localStorage);
  let measurements = measurementLoadResult.records;
  let editingMeasurementId = null;
  let measurementFeedbackTimer;
  let chartResizeFrame;

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
    link.download = "plant-ai-demo-snapshots-v0.2.1.csv";
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

  function parseSerialMeasurementLine(line) {
    const expectedFields = ["uptime_ms", "raw_avg", "raw_min", "raw_max", "samples"];
    const values = {};

    String(line ?? "").split(",").forEach((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (expectedFields.includes(key)) values[key] = value;
    });

    const missing = expectedFields.filter((field) => !Object.prototype.hasOwnProperty.call(values, field) || values[field] === "");
    if (missing.length > 0) {
      return { ok: false, message: `不足している項目：${missing.join("、")}` };
    }

    if (!/^\d+$/.test(values.uptime_ms)) {
      return { ok: false, message: "uptime_msは0以上の整数で入力してください。" };
    }
    if (!/^\d+$/.test(values.samples) || Number(values.samples) < 1) {
      return { ok: false, message: "samplesは1以上の整数で入力してください。" };
    }

    const rawPattern = /^\d+(?:\.\d+)?$/;
    const invalidRawFields = ["raw_avg", "raw_min", "raw_max"].filter((field) => !rawPattern.test(values[field]) || Number(values[field]) < 0 || Number(values[field]) > 1023);
    if (invalidRawFields.length > 0) {
      return { ok: false, message: `${invalidRawFields.join("、")}は0〜1023のADC生値で入力してください。` };
    }

    const rawAvg = Math.round(Number(values.raw_avg) * 10) / 10;
    const rawMin = Math.round(Number(values.raw_min) * 10) / 10;
    const rawMax = Math.round(Number(values.raw_max) * 10) / 10;
    if (rawMin > rawAvg || rawAvg > rawMax) {
      return { ok: false, message: "値の順序を確認してください。raw_min ≤ raw_avg ≤ raw_maxである必要があります。" };
    }

    return {
      ok: true,
      rawAvg,
      rawMin,
      rawMax,
      uptimeMs: Number(values.uptime_ms),
      samples: Number(values.samples)
    };
  }

  function parseSerialOutput(text) {
    const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return { ok: false, message: "シリアル出力を貼り付けてください。" };
    }

    const candidates = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.startsWith("uptime_ms=") || line.includes("raw_avg=") || line.includes("raw_min=") || line.includes("raw_max="));

    if (candidates.length === 0) {
      return { ok: false, message: "測定行が見つかりません。uptime_ms=で始まる行を貼り付けてください。" };
    }

    let latestError = null;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      const parsed = parseSerialMeasurementLine(candidate.line);
      if (parsed.ok) {
        return { ...parsed, lineNumber: candidate.index + 1, lineCount: lines.length };
      }
      if (!latestError) latestError = parsed;
    }
    return latestError;
  }

  function setParseFeedback(message, type = "neutral") {
    elements.serialParseFeedback.textContent = message;
    elements.serialParseFeedback.classList.toggle("is-error", type === "error");
    elements.serialParseFeedback.classList.toggle("is-success", type === "success");
  }

  function renderMeasurementPreview(result, sourceLabel) {
    elements.parsedRawAvg.textContent = String(result.rawAvg);
    elements.parsedRawMin.textContent = String(result.rawMin);
    elements.parsedRawMax.textContent = String(result.rawMax);
    elements.parsedSource.textContent = sourceLabel;
    elements.parsedSummary.classList.add("is-ready");
    elements.measurementSaveButton.disabled = false;
  }

  function clearMeasurementPreview(sourceLabel = "測定結果はまだ入力されていません。") {
    elements.parsedRawAvg.textContent = "—";
    elements.parsedRawMin.textContent = "—";
    elements.parsedRawMax.textContent = "—";
    elements.parsedSource.textContent = sourceLabel;
    elements.parsedSummary.classList.remove("is-ready");
    elements.measurementSaveButton.disabled = true;
  }

  function clearRawInputs() {
    elements.rawAvg.value = "";
    elements.rawMin.value = "";
    elements.rawMax.value = "";
  }

  function writeRawInputs(result) {
    elements.rawAvg.value = String(result.rawAvg);
    elements.rawMin.value = String(result.rawMin);
    elements.rawMax.value = String(result.rawMax);
  }

  function readManualRawInputs() {
    const values = {
      rawAvg: elements.rawAvg.value,
      rawMin: elements.rawMin.value,
      rawMax: elements.rawMax.value
    };
    const missing = Object.entries(values).filter(([, value]) => value === "").map(([key]) => ({ rawAvg: "raw_avg", rawMin: "raw_min", rawMax: "raw_max" })[key]);
    if (missing.length > 0) {
      return { ok: false, message: `手入力で不足している項目：${missing.join("、")}` };
    }

    const numbers = { rawAvg: Number(values.rawAvg), rawMin: Number(values.rawMin), rawMax: Number(values.rawMax) };
    const invalid = Object.entries(numbers).filter(([, value]) => !Number.isFinite(value) || value < 0 || value > 1023).map(([key]) => ({ rawAvg: "raw_avg", rawMin: "raw_min", rawMax: "raw_max" })[key]);
    if (invalid.length > 0) {
      return { ok: false, message: `${invalid.join("、")}は0〜1023のADC生値で入力してください。` };
    }
    if (numbers.rawMin > numbers.rawAvg || numbers.rawAvg > numbers.rawMax) {
      return { ok: false, message: "値の順序を確認してください。raw_min ≤ raw_avg ≤ raw_maxである必要があります。" };
    }
    return {
      ok: true,
      rawAvg: Math.round(numbers.rawAvg * 10) / 10,
      rawMin: Math.round(numbers.rawMin * 10) / 10,
      rawMax: Math.round(numbers.rawMax * 10) / 10
    };
  }

  function handleSerialOutputInput() {
    const result = parseSerialOutput(elements.serialOutput.value);
    if (!result.ok) {
      clearRawInputs();
      clearMeasurementPreview("貼り付けた測定行を読み取れませんでした。");
      setParseFeedback(result.message, elements.serialOutput.value.trim() ? "error" : "neutral");
      return;
    }

    writeRawInputs(result);
    renderMeasurementPreview(result, `貼り付けから読み取りました（samples=${result.samples}）`);
    setParseFeedback(`${result.lineCount}行中、最新の完全な測定行を読み取りました。`, "success");
  }

  function handleManualRawInput() {
    const result = readManualRawInputs();
    if (!result.ok) {
      clearMeasurementPreview("手入力の完了を待っています。");
      setParseFeedback(result.message, "error");
      return;
    }
    renderMeasurementPreview(result, "詳細入力の値を確認しました");
    setParseFeedback("手入力の3項目を確認しました。", "success");
  }

  function formatDateTimeLocal(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function setMeasurementDefaults() {
    elements.measurementDate.value = formatDateTimeLocal(new Date());
    elements.watering.value = "unknown";
    elements.soilFeel.value = "unknown";
    updateObservationSummary();
  }

  function updateObservationSummary() {
    const watering = PlantAIMeasurements.WATERING_LABELS[elements.watering.value] || PlantAIMeasurements.WATERING_LABELS.unknown;
    const soilFeel = PlantAIMeasurements.SOIL_FEEL_LABELS[elements.soilFeel.value] || PlantAIMeasurements.SOIL_FEEL_LABELS.unknown;
    elements.observationSummary.textContent = watering === "未確認" && soilFeel === "未確認"
      ? "現在：未確認"
      : `現在：水やり ${watering}・土 ${soilFeel}`;
  }

  function setMeasurementEditMode(record = null) {
    editingMeasurementId = record?.id || null;
    elements.measurementEditStatus.hidden = !record;
    elements.measurementEditTarget.textContent = record
      ? formatMeasurementEditTarget(record)
      : "";
    elements.measurementSaveTitle.textContent = record ? "実測記録の変更を保存する" : "実測記録として保存する";
    elements.measurementSaveButton.textContent = record ? "変更を保存" : "実測記録を保存";
    elements.measurementCancelButton.hidden = !record;
  }

  function formatMeasurementEditTarget(record) {
    const measuredAt = new Date(record.measuredAt);
    const editDate = Number.isNaN(measuredAt.getTime())
      ? "日時不明"
      : [
          measuredAt.getFullYear(),
          String(measuredAt.getMonth() + 1).padStart(2, "0"),
          String(measuredAt.getDate()).padStart(2, "0"),
        ].join("/")
        + ` ${String(measuredAt.getHours()).padStart(2, "0")}:${String(measuredAt.getMinutes()).padStart(2, "0")}`;
    return `編集中：${editDate}・raw_avg ${record.rawAvg}`;
  }

  function resetMeasurementDraft() {
    elements.measurementForm.reset();
    elements.serialOutput.value = "";
    clearRawInputs();
    setMeasurementDefaults();
    clearMeasurementPreview();
    setParseFeedback("測定行を貼り付けると、raw値をここで確認できます。");
    elements.manualEntryDetails.open = false;
    elements.observationOptionsDetails.open = false;
    elements.memoDetails.open = false;
    setMeasurementEditMode();
  }

  function readMeasurementDraft() {
    return {
      measuredAt: elements.measurementDate.value,
      rawAvg: elements.rawAvg.value,
      rawMin: elements.rawMin.value,
      rawMax: elements.rawMax.value,
      watering: elements.watering.value,
      soilFeel: elements.soilFeel.value,
      memo: elements.measurementMemo.value,
      source: "actual"
    };
  }

  function createMeasurementRecord() {
    return PlantAIMeasurements.normalizeRecord({
      ...readMeasurementDraft(),
      version: APP_VERSION
    });
  }

  function startMeasurementEdit(id) {
    const record = measurements.find((measurement) => measurement.id === id);
    if (!record) {
      showMeasurementFeedback("編集する実測記録が見つかりませんでした。", true);
      return;
    }

    elements.measurementForm.reset();
    elements.serialOutput.value = "";
    elements.measurementDate.value = formatDateTimeLocal(new Date(record.measuredAt));
    writeRawInputs(record);
    elements.watering.value = record.watering;
    elements.soilFeel.value = record.soilFeel;
    updateObservationSummary();
    elements.measurementMemo.value = record.memo;
    elements.manualEntryDetails.open = true;
    elements.observationOptionsDetails.open = true;
    elements.memoDetails.open = true;
    renderMeasurementPreview(record, formatMeasurementEditTarget(record));
    setParseFeedback("raw値を修正し、変更内容を確認してください。", "success");
    setMeasurementEditMode(record);

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    elements.measurementForm.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    window.requestAnimationFrame(() => elements.rawAvg.focus({ preventScroll: true }));
  }

  function cancelMeasurementEdit() {
    if (!editingMeasurementId) return;
    resetMeasurementDraft();
    showMeasurementFeedback("編集をキャンセルしました。保存済み記録は変更していません。");
  }

  function saveMeasurement(event) {
    event.preventDefault();
    if (!elements.measurementForm.reportValidity()) return;
    let record;
    let next;
    const wasEditing = Boolean(editingMeasurementId);
    if (wasEditing) {
      const updateResult = PlantAIMeasurements.updateRecord(measurements, editingMeasurementId, readMeasurementDraft());
      if (updateResult) {
        record = updateResult.record;
        next = updateResult.records;
      }
    } else {
      record = createMeasurementRecord();
      if (record) next = PlantAIMeasurements.mergeRecords(measurements, [record]);
    }

    if (!record || !next) {
      showMeasurementFeedback("入力内容を確認してください。raw_min ≦ raw_avg ≦ raw_maxの順で、各値は0〜1023にしてください。", true);
      return;
    }

    if (!PlantAIMeasurements.saveRecords(localStorage, next)) {
      showMeasurementFeedback("実測記録を保存できませんでした。ブラウザの保存設定をご確認ください。", true);
      return;
    }

    measurements = next;
    const savedSummary = `${wasEditing ? "変更を保存しました" : "記録しました"}。raw_avg ${record.rawAvg} ／ ${formatMeasurementDate(record.measuredAt)}`;
    resetMeasurementDraft();
    renderMeasurements();
    showMeasurementFeedback(savedSummary);
  }

  function renderMeasurements() {
    measurements = PlantAIMeasurements.sortNewestFirst(measurements);
    elements.measurementList.replaceChildren();

    measurements.forEach((record) => {
      const card = document.createElement("article");
      card.className = "measurement-card";

      const head = document.createElement("div");
      head.className = "measurement-card-head";
      const time = document.createElement("time");
      time.dateTime = record.measuredAt;
      time.textContent = formatMeasurementDate(record.measuredAt);
      const source = document.createElement("span");
      source.className = "measurement-source";
      source.textContent = "実測";
      head.append(time, source);

      const raw = document.createElement("div");
      raw.className = "measurement-raw";
      const average = document.createElement("strong");
      average.textContent = `raw_avg ${record.rawAvg}`;
      const range = document.createElement("span");
      range.textContent = `raw_min ${record.rawMin} ／ raw_max ${record.rawMax}`;
      raw.append(average, range);

      const meta = document.createElement("div");
      meta.className = "measurement-meta";
      const watering = document.createElement("span");
      watering.textContent = `水やり ${PlantAIMeasurements.WATERING_LABELS[record.watering]}`;
      watering.classList.toggle("watered", record.watering === "yes");
      const soil = document.createElement("span");
      soil.textContent = `土 ${PlantAIMeasurements.SOIL_FEEL_LABELS[record.soilFeel]}`;
      meta.append(watering, soil);

      card.append(head, raw, meta);
      if (record.memo) {
        const memo = document.createElement("p");
        memo.className = "measurement-memo";
        memo.textContent = record.memo;
        card.append(memo);
      }

      const actions = document.createElement("div");
      actions.className = "measurement-card-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "measurement-edit";
      editButton.textContent = "編集";
      editButton.setAttribute("aria-label", `${formatMeasurementDate(record.measuredAt)}、raw_avg ${record.rawAvg}の実測記録を編集`);
      editButton.addEventListener("click", () => startMeasurementEdit(record.id));
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "measurement-delete";
      deleteButton.textContent = "この実測記録を削除";
      deleteButton.setAttribute("aria-label", `${formatMeasurementDate(record.measuredAt)}の実測記録を削除`);
      deleteButton.addEventListener("click", () => deleteMeasurement(record.id));
      actions.append(editButton, deleteButton);
      card.append(actions);
      elements.measurementList.append(card);
    });

    elements.measurementCount.textContent = `${measurements.length}件`;
    elements.emptyMeasurements.hidden = measurements.length > 0;
    elements.measurementExportButton.disabled = measurements.length === 0;
    drawRawChart();
  }

  function deleteMeasurement(id) {
    const next = measurements.filter((record) => record.id !== id);
    if (next.length === measurements.length) return;
    if (!PlantAIMeasurements.saveRecords(localStorage, next)) {
      showMeasurementFeedback("実測記録を削除できませんでした。", true);
      return;
    }
    const wasEditing = editingMeasurementId === id;
    measurements = next;
    if (wasEditing) resetMeasurementDraft();
    renderMeasurements();
    showMeasurementFeedback(wasEditing ? "編集中の実測記録を削除し、編集を終了しました。" : "選択した実測記録を削除しました。");
  }

  function drawRawChart() {
    const records = PlantAIMeasurements.sortNewestFirst(measurements).reverse();
    elements.emptyChart.hidden = records.length > 0;
    elements.rawChart.hidden = records.length === 0;
    if (records.length === 0) {
      elements.rawChart.setAttribute("aria-label", "raw_avgの時系列グラフ。実測記録がまだありません。");
      return;
    }

    const canvas = elements.rawChart;
    const width = Math.max(260, Math.floor(canvas.getBoundingClientRect().width));
    const height = 280;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const colors = getComputedStyle(document.documentElement);
    const green = colors.getPropertyValue("--green").trim() || "#2e6b51";
    const orange = colors.getPropertyValue("--orange").trim() || "#af6739";
    const line = colors.getPropertyValue("--line").trim() || "#d8dccf";
    const inkSoft = colors.getPropertyValue("--ink-soft").trim() || "#587067";
    const plot = { left: 48, right: width - 16, top: 20, bottom: height - 48 };
    const values = records.map((record) => record.rawAvg);
    const timestamps = records.map((record) => new Date(record.measuredAt).getTime());
    const valueMin = Math.min(...values);
    const valueMax = Math.max(...values);
    const padding = Math.max(5, (valueMax - valueMin) * 0.15);
    const lower = Math.max(0, valueMin - padding);
    const upper = Math.min(1023, valueMax + padding);
    const valueSpan = Math.max(1, upper - lower);
    const timeMin = Math.min(...timestamps);
    const timeMax = Math.max(...timestamps);
    const timeSpan = timeMax - timeMin;
    const xFor = (record, index) => {
      if (records.length === 1) return (plot.left + plot.right) / 2;
      const ratio = timeSpan === 0 ? index / (records.length - 1) : (new Date(record.measuredAt).getTime() - timeMin) / timeSpan;
      return plot.left + ratio * (plot.right - plot.left);
    };
    const yFor = (value) => plot.bottom - ((value - lower) / valueSpan) * (plot.bottom - plot.top);

    context.font = '11px "Yu Gothic", sans-serif';
    context.fillStyle = inkSoft;
    context.strokeStyle = line;
    context.lineWidth = 1;
    context.textAlign = "right";
    for (let step = 0; step <= 4; step += 1) {
      const ratio = step / 4;
      const y = plot.bottom - ratio * (plot.bottom - plot.top);
      const label = lower + ratio * valueSpan;
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillText(label.toFixed(label % 1 === 0 ? 0 : 1), plot.left - 7, y + 4);
    }

    context.strokeStyle = green;
    context.lineWidth = 2;
    context.beginPath();
    records.forEach((record, index) => {
      const x = xFor(record, index);
      const y = yFor(record.rawAvg);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();

    records.forEach((record, index) => {
      const x = xFor(record, index);
      const y = yFor(record.rawAvg);
      context.fillStyle = record.watering === "yes" ? orange : green;
      context.beginPath();
      if (record.watering === "yes") {
        context.moveTo(x, y - 7);
        context.lineTo(x + 7, y);
        context.lineTo(x, y + 7);
        context.lineTo(x - 7, y);
        context.closePath();
      } else {
        context.arc(x, y, 4.5, 0, Math.PI * 2);
      }
      context.fill();
    });

    context.fillStyle = inkSoft;
    context.textAlign = records.length === 1 ? "center" : "left";
    context.fillText(formatChartDate(records[0].measuredAt), records.length === 1 ? (plot.left + plot.right) / 2 : plot.left, height - 20);
    if (records.length > 1) {
      context.textAlign = "right";
      context.fillText(formatChartDate(records[records.length - 1].measuredAt), plot.right, height - 20);
    }

    const wateredCount = records.filter((record) => record.watering === "yes").length;
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    elements.rawChart.setAttribute("aria-label", `raw_avgの時系列グラフ。古い順に${records.length}件。${formatMeasurementDate(firstRecord.measuredAt)}の${firstRecord.rawAvg}から${formatMeasurementDate(lastRecord.measuredAt)}の${lastRecord.rawAvg}まで。値の範囲${valueMin}から${valueMax}、水やりあり${wateredCount}件。`);
  }

  function exportMeasurementCsv() {
    if (measurements.length === 0) return;
    const blob = new Blob([`\uFEFF${PlantAIMeasurements.buildCsv(measurements)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plant-ai-actual-measurements-v0.2.1.csv";
    document.body.append(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    showMeasurementFeedback(`${measurements.length}件の実測記録をCSVへ書き出しました。`);
  }

  function importMeasurementCsvText(text) {
    const parsed = PlantAIMeasurements.parseCsv(text);
    const next = PlantAIMeasurements.mergeRecords(measurements, parsed.records);
    const addedCount = next.length - measurements.length;
    if (!PlantAIMeasurements.saveRecords(localStorage, next)) throw new Error("ブラウザへ保存できませんでした。");
    measurements = next;
    renderMeasurements();
    return { importedCount: parsed.records.length, addedCount, skippedCount: parsed.skippedCount };
  }

  async function importMeasurementCsvFile() {
    const file = elements.measurementCsvInput.files?.[0];
    if (!file) return;
    try {
      const result = importMeasurementCsvText(await file.text());
      const skipped = result.skippedCount ? ` 読み取れない${result.skippedCount}行は除外しました。` : "";
      showMeasurementFeedback(`${result.importedCount}件を確認し、新しく${result.addedCount}件を読み込みました。${skipped}`.trim());
    } catch (error) {
      showMeasurementFeedback(`CSVを読み込めませんでした。${error.message}`, true);
    } finally {
      elements.measurementCsvInput.value = "";
    }
  }

  function formatMeasurementDate(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function formatChartDate(isoDate) {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function showMeasurementFeedback(message, isError = false) {
    window.clearTimeout(measurementFeedbackTimer);
    elements.measurementFeedback.textContent = message;
    elements.measurementFeedback.classList.toggle("is-error", isError);
    measurementFeedbackTimer = window.setTimeout(() => {
      elements.measurementFeedback.textContent = "";
      elements.measurementFeedback.classList.remove("is-error");
    }, 6000);
  }

  elements.serialOutput.addEventListener("input", handleSerialOutputInput);
  [elements.rawAvg, elements.rawMin, elements.rawMax].forEach((input) => {
    input.addEventListener("input", handleManualRawInput);
  });
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
  elements.measurementForm.addEventListener("submit", saveMeasurement);
  elements.measurementCancelButton.addEventListener("click", cancelMeasurementEdit);
  elements.watering.addEventListener("change", updateObservationSummary);
  elements.soilFeel.addEventListener("change", updateObservationSummary);
  elements.measurementExportButton.addEventListener("click", exportMeasurementCsv);
  elements.measurementImportButton.addEventListener("click", () => elements.measurementCsvInput.click());
  elements.measurementCsvInput.addEventListener("change", importMeasurementCsvFile);
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(chartResizeFrame);
    chartResizeFrame = window.requestAnimationFrame(drawRawChart);
  });

  // ブラウザ検証で保存状態とCSV往復を確認するためのインターフェースです。
  globalThis.PlantAIApp = Object.freeze({
    getHistoryCsv: buildHistoryCsv,
    getHistoryCount: () => history.length,
    getMeasurementCsv: () => PlantAIMeasurements.buildCsv(measurements),
    getMeasurementCount: () => measurements.length,
    getMeasurements: () => measurements.map((record) => ({ ...record })),
    importMeasurementCsv: importMeasurementCsvText,
    parseSerialOutput
  });

  const initial = adapter.getInitialReading();
  previousReading = initial.previous;
  writeInputs(initial.current);
  analyzeAndRender(initial.current, initial.previous);
  setActiveScenarioButton("balanced");
  setMeasurementDefaults();
  clearMeasurementPreview();
  renderHistory();
  renderMeasurements();
  if (measurementLoadResult.warnings.length > 0) showMeasurementFeedback(measurementLoadResult.warnings.join(" "), true);
})();
