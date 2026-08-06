(function (global) {
  "use strict";

  const STORAGE_KEY = "plant-ai-raw-measurements-v0.2.1";
  const LEGACY_STORAGE_KEYS = Object.freeze([
    "plant-ai-raw-measurements-v0.2.0",
    "plant-ai-calibration-records-v0.2.0"
  ]);
  const MAX_RECORDS = 500;
  const CSV_FORMAT_MARKER = "# tsuchimirucho-csv-format=2;formula-escape=apostrophe-v1";
  const CSV_FORMAT_FAMILY_PREFIX = "# tsuchimirucho-csv-format";
  const RAW_MIN = 0;
  const RAW_MAX = 1023;
  const RECORD_CONTENT_KEYS = Object.freeze([
    "id",
    "measuredAt",
    "rawAvg",
    "rawMin",
    "rawMax",
    "watering",
    "soilFeel",
    "memo",
    "source",
    "version"
  ]);

  const WATERING_LABELS = Object.freeze({ yes: "あり", no: "なし", unknown: "未確認" });
  const SOIL_FEEL_LABELS = Object.freeze({
    dry: "乾いている",
    slightlyDry: "やや乾いている",
    moist: "しっとりしている",
    wet: "湿っている",
    unknown: "未確認"
  });

  function createId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getFirstValue(item, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
    }
    return undefined;
  }

  function normalizeRaw(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < RAW_MIN || number > RAW_MAX) return null;
    return Math.round(number * 10) / 10;
  }

  function normalizeWatering(value) {
    if (value === true || value === 1) return "yes";
    if (value === false || value === 0) return "no";
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["yes", "あり", "有", "水やりあり", "した", "実施"].includes(normalized)) return "yes";
    if (["no", "なし", "無", "水やりなし", "していない", "未実施"].includes(normalized)) return "no";
    return "unknown";
  }

  function normalizeSoilFeel(value) {
    const normalized = String(value ?? "").trim();
    const byValue = {
      dry: "dry",
      slightlyDry: "slightlyDry",
      moist: "moist",
      wet: "wet",
      unknown: "unknown",
      "乾いている": "dry",
      "やや乾いている": "slightlyDry",
      "しっとりしている": "moist",
      "湿っている": "wet",
      "未確認": "unknown"
    };
    return byValue[normalized] || "unknown";
  }

  function normalizeRecord(item) {
    if (!item || typeof item !== "object") return null;
    const measuredAtValue = getFirstValue(item, ["measuredAt", "measured_at", "recordedAt", "測定日時"]);
    const measuredDate = new Date(String(measuredAtValue ?? ""));
    if (Number.isNaN(measuredDate.getTime())) return null;

    const rawAvg = normalizeRaw(getFirstValue(item, ["rawAvg", "raw_avg", "平均値"]));
    const rawMin = normalizeRaw(getFirstValue(item, ["rawMin", "raw_min", "最小値"]));
    const rawMax = normalizeRaw(getFirstValue(item, ["rawMax", "raw_max", "最大値"]));
    if (rawAvg === null || rawMin === null || rawMax === null || rawMin > rawAvg || rawAvg > rawMax) return null;

    const sourceValue = String(getFirstValue(item, ["source", "dataType", "データ種別"]) ?? "actual").trim().toLowerCase();
    if (["demo", "デモ", "デモデータ"].includes(sourceValue)) return null;

    return {
      id: String(item.id || item.ID || createId()),
      measuredAt: measuredDate.toISOString(),
      rawAvg,
      rawMin,
      rawMax,
      watering: normalizeWatering(getFirstValue(item, ["watering", "watered", "水やり"])),
      soilFeel: normalizeSoilFeel(getFirstValue(item, ["soilFeel", "soil_feel", "土の感触"])),
      memo: String(getFirstValue(item, ["memo", "note", "メモ"]) ?? "").slice(0, 300),
      source: "actual",
      version: String(item.version || item["記録バージョン"] || "v0.2.1")
    };
  }

  function sortNewestFirst(records) {
    return [...records].sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
  }

  function normalizeCollection(value) {
    const candidates = Array.isArray(value) ? value : (value && Array.isArray(value.records) ? value.records : []);
    const records = candidates.map(normalizeRecord).filter(Boolean);
    return sortNewestFirst(records);
  }

  function loadRecords(storage) {
    const warnings = [];
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (_error) {
        return { records: [], warnings: ["ブラウザの保存領域を読み取れませんでした。"] };
      }
      if (raw === null) continue;
      try {
        const parsed = JSON.parse(raw);
        const records = normalizeCollection(parsed);
        const sourceCount = Array.isArray(parsed) ? parsed.length : (Array.isArray(parsed?.records) ? parsed.records.length : 0);
        if (records.length < sourceCount) warnings.push("読み取れない旧形式の実測記録を一部除外しました。");
        if (records.length > MAX_RECORDS) warnings.push(`保存件数が${MAX_RECORDS}件を超えています。CSVへバックアップし、不要な記録を削除してください。`);
        return { records, warnings };
      } catch (_error) {
        warnings.push(`${key}の保存データを読み取れなかったため除外しました。`);
      }
    }
    return { records: [], warnings };
  }

  function persistRecords(storage, records) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(sortNewestFirst(records)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function saveRecords(storage, records) {
    if (!Array.isArray(records) || records.length > MAX_RECORDS) return false;
    return persistRecords(storage, records);
  }

  // 表計算ソフトの数式評価を防ぐための文字列エスケープ。CSVの引用符処理とは別に扱う。
  function protectCsvString(value) {
    const text = String(value ?? "");
    if (/^[ \t]*['=+\-@]/.test(text)) return `'${text}`;
    return text;
  }

  // 形式マーカーで由来を確認したCSVに限り、protectCsvStringが付加した先頭引用符を戻す。
  function restoreCsvString(value) {
    const text = String(value ?? "");
    if (text.startsWith("'") && /^[ \t]*['=+\-@]/.test(text.slice(1))) return text.slice(1);
    return text;
  }

  function quoteCsvValue(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function escapeCsvCell(value) {
    return quoteCsvValue(typeof value === "string" ? protectCsvString(value) : value);
  }

  function buildMarkedCsv(headers, rows) {
    const body = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    return `${CSV_FORMAT_MARKER}\r\n${body}`;
  }

  function buildCsv(records) {
    const headers = ["ID", "測定日時", "raw_avg", "raw_min", "raw_max", "水やり", "土の感触", "メモ", "データ種別", "記録バージョン"];
    const rows = sortNewestFirst(records).map((record) => [
      record.id,
      record.measuredAt,
      record.rawAvg,
      record.rawMin,
      record.rawMax,
      WATERING_LABELS[record.watering] || WATERING_LABELS.unknown,
      SOIL_FEEL_LABELS[record.soilFeel] || SOIL_FEEL_LABELS.unknown,
      record.memo,
      "実測",
      record.version || "v0.2.1"
    ]);
    return buildMarkedCsv(headers, rows);
  }

  function parseCsvEnvelope(text) {
    let source = String(text ?? "");
    if (source.startsWith("\uFEFF")) source = source.slice(1);

    const lineBreak = /\r\n|\n|\r/.exec(source);
    const firstLine = lineBreak ? source.slice(0, lineBreak.index) : source;
    const body = lineBreak ? source.slice(lineBreak.index + lineBreak[0].length) : "";

    if (firstLine === CSV_FORMAT_MARKER) {
      return { body, formulaEscape: "apostrophe-v1", formatVersion: 2 };
    }
    if (firstLine.startsWith(CSV_FORMAT_FAMILY_PREFIX)) {
      throw new Error("この土みる帳CSVの形式または文字列安全化方式には対応していません。CSV全体を読み込みませんでした。");
    }
    return { body: source, formulaEscape: null, formatVersion: null };
  }

  function parseCsvRows(text) {
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field === "") {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(field);
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (quoted) throw new Error("引用符が閉じられていません。");
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
  }

  function parseCsv(text) {
    const envelope = parseCsvEnvelope(text);
    const rows = parseCsvRows(envelope.body);
    if (rows.length < 2) throw new Error("見出しと測定データが必要です。");
    const headers = rows[0].map((value) => value.trim());
    const required = ["測定日時", "raw_avg", "raw_min", "raw_max"];
    if (required.some((header) => !headers.includes(header))) {
      throw new Error("測定日時、raw_avg、raw_min、raw_maxの列が必要です。");
    }

    const indexOf = (name) => headers.indexOf(name);
    const imported = [];
    const seenIds = new Set();
    const duplicateIds = new Set();
    let skippedCount = 0;
    rows.slice(1).forEach((row) => {
      const valueAt = (name) => {
        if (indexOf(name) < 0) return undefined;
        const value = row[indexOf(name)];
        return envelope.formulaEscape === "apostrophe-v1" ? restoreCsvString(value) : value;
      };
      const importedId = valueAt("ID");
      if (importedId) {
        if (seenIds.has(importedId)) duplicateIds.add(importedId);
        seenIds.add(importedId);
      }
      const record = normalizeRecord({
        id: importedId,
        measuredAt: valueAt("測定日時"),
        raw_avg: valueAt("raw_avg"),
        raw_min: valueAt("raw_min"),
        raw_max: valueAt("raw_max"),
        watering: valueAt("水やり"),
        soilFeel: valueAt("土の感触"),
        memo: valueAt("メモ"),
        dataType: valueAt("データ種別"),
        version: valueAt("記録バージョン")
      });
      if (record) imported.push(record);
      else skippedCount += 1;
    });

    if (duplicateIds.size > 0) {
      throw new Error(`CSV内でID「${[...duplicateIds].join("、")}」が重複しています。CSV全体を読み込みませんでした。`);
    }
    if (imported.length === 0) throw new Error("読み込める実測記録がありませんでした。");
    return { records: imported, skippedCount, formatVersion: envelope.formatVersion };
  }

  function recordsHaveSameContent(first, second) {
    return RECORD_CONTENT_KEYS.every((key) => first[key] === second[key]);
  }

  function planRecordReduction(current, candidate) {
    if (!Array.isArray(current) || !Array.isArray(candidate)) return { canApply: false };
    if (current.length <= MAX_RECORDS || candidate.length >= current.length) return { canApply: false };

    const currentRecords = current.map(normalizeRecord);
    const candidateRecords = candidate.map(normalizeRecord);
    if (currentRecords.some((record) => !record) || candidateRecords.some((record) => !record)) return { canApply: false };

    const currentById = new Map();
    for (const record of currentRecords) {
      if (currentById.has(record.id)) return { canApply: false };
      currentById.set(record.id, record);
    }

    const candidateIds = new Set();
    for (const record of candidateRecords) {
      if (candidateIds.has(record.id)) return { canApply: false };
      candidateIds.add(record.id);
      const existing = currentById.get(record.id);
      if (!existing || !recordsHaveSameContent(existing, record)) return { canApply: false };
    }

    if (candidateIds.size >= currentById.size) return { canApply: false };
    return {
      canApply: true,
      records: sortNewestFirst(candidateRecords),
      removedCount: currentById.size - candidateIds.size
    };
  }

  function saveRecordReduction(storage, current, candidate) {
    const plan = planRecordReduction(current, candidate);
    return plan.canApply && persistRecords(storage, plan.records);
  }

  function planRecordMerge(current, incoming) {
    const currentRecords = Array.isArray(current) ? current.map(normalizeRecord).filter(Boolean) : [];
    const incomingRecords = Array.isArray(incoming) ? incoming.map(normalizeRecord).filter(Boolean) : [];
    const byId = new Map();
    currentRecords.forEach((record) => byId.set(record.id, record));

    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    incomingRecords.forEach((record) => {
      const existing = byId.get(record.id);
      if (!existing) {
        addedCount += 1;
        byId.set(record.id, record);
        return;
      }
      if (recordsHaveSameContent(existing, record)) {
        unchangedCount += 1;
        return;
      }
      updatedCount += 1;
      byId.set(record.id, record);
    });

    const records = sortNewestFirst([...byId.values()]);
    const excessCount = Math.max(0, records.length - MAX_RECORDS);
    return {
      records,
      addedCount,
      updatedCount,
      unchangedCount,
      totalCount: records.length,
      excessCount,
      canApply: excessCount === 0
    };
  }

  // 既存呼び出し向け。上限を超える場合は切り詰めず、適用不可をnullで返す。
  function mergeRecords(current, incoming) {
    const plan = planRecordMerge(current, incoming);
    return plan.canApply ? plan.records : null;
  }

  function commitRecordMergePlan(plan, confirm, persist) {
    if (!plan || !plan.canApply) return { status: "rejected" };

    let confirmed = false;
    try {
      confirmed = typeof confirm === "function" && confirm(plan) === true;
    } catch (_error) {
      return { status: "confirm-failed" };
    }
    if (!confirmed) return { status: "cancelled" };

    let saved = false;
    try {
      saved = typeof persist === "function" && persist(plan.records) === true;
    } catch (_error) {
      saved = false;
    }
    if (!saved) return { status: "save-failed" };
    return { status: "applied", records: plan.records };
  }

  function updateRecord(records, id, changes) {
    if (!Array.isArray(records) || !changes || typeof changes !== "object") return null;
    const targetId = String(id ?? "");
    const targetIndex = records.findIndex((record) => String(record?.id ?? record?.ID ?? "") === targetId);
    if (targetIndex < 0) return null;

    const current = normalizeRecord(records[targetIndex]);
    if (!current) return null;
    const updated = normalizeRecord({
      ...current,
      ...changes,
      id: current.id,
      source: "actual",
      version: current.version
    });
    if (!updated) return null;

    const next = records.map((record, index) => index === targetIndex ? updated : record);
    return {
      record: updated,
      records: sortNewestFirst(next)
    };
  }

  global.PlantAIMeasurements = Object.freeze({
    STORAGE_KEY,
    MAX_RECORDS,
    CSV_FORMAT_MARKER,
    WATERING_LABELS,
    SOIL_FEEL_LABELS,
    normalizeRecord,
    loadRecords,
    saveRecords,
    planRecordReduction,
    saveRecordReduction,
    protectCsvString,
    restoreCsvString,
    escapeCsvCell,
    buildMarkedCsv,
    buildCsv,
    parseCsv,
    planRecordMerge,
    mergeRecords,
    commitRecordMergePlan,
    updateRecord,
    sortNewestFirst
  });
})(globalThis);
