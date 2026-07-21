(function (global) {
  "use strict";

  const STORAGE_KEY = "plant-ai-raw-measurements-v0.2.1";
  const LEGACY_STORAGE_KEYS = Object.freeze([
    "plant-ai-raw-measurements-v0.2.0",
    "plant-ai-calibration-records-v0.2.0"
  ]);
  const MAX_RECORDS = 500;
  const RAW_MIN = 0;
  const RAW_MAX = 1023;

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
      memo: String(getFirstValue(item, ["memo", "note", "メモ"]) ?? "").trim().slice(0, 300),
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
    return sortNewestFirst(records).slice(0, MAX_RECORDS);
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
        return { records, warnings };
      } catch (_error) {
        warnings.push(`${key}の保存データを読み取れなかったため除外しました。`);
      }
    }
    return { records: [], warnings };
  }

  function saveRecords(storage, records) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(sortNewestFirst(records).slice(0, MAX_RECORDS)));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function escapeCsv(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
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
    return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
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
    const rows = parseCsvRows(text);
    if (rows.length < 2) throw new Error("見出しと測定データが必要です。");
    const headers = rows[0].map((value) => value.trim());
    const required = ["測定日時", "raw_avg", "raw_min", "raw_max"];
    if (required.some((header) => !headers.includes(header))) {
      throw new Error("測定日時、raw_avg、raw_min、raw_maxの列が必要です。");
    }

    const indexOf = (name) => headers.indexOf(name);
    const imported = [];
    let skippedCount = 0;
    rows.slice(1).forEach((row) => {
      const valueAt = (name) => indexOf(name) >= 0 ? row[indexOf(name)] : undefined;
      const record = normalizeRecord({
        id: valueAt("ID"),
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

    if (imported.length === 0) throw new Error("読み込める実測記録がありませんでした。");
    return { records: imported, skippedCount };
  }

  function mergeRecords(current, incoming) {
    const byId = new Map();
    [...current, ...incoming].forEach((record) => {
      const normalized = normalizeRecord(record);
      if (normalized) byId.set(normalized.id, normalized);
    });
    return sortNewestFirst([...byId.values()]).slice(0, MAX_RECORDS);
  }

  global.PlantAIMeasurements = Object.freeze({
    STORAGE_KEY,
    MAX_RECORDS,
    WATERING_LABELS,
    SOIL_FEEL_LABELS,
    normalizeRecord,
    loadRecords,
    saveRecords,
    buildCsv,
    parseCsv,
    mergeRecords,
    sortNewestFirst
  });
})(globalThis);
