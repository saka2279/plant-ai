"use strict";

const assert = require("node:assert/strict");

require("../measurement-records.js");

// 以下は処理確認専用の架空データで、実際のカポックの測定値ではありません。
const measurements = global.PlantAIMeasurements;
const records = [
  measurements.normalizeRecord({
    id: "a",
    measuredAt: "2026-07-20T01:00:00.000Z",
    raw_avg: 500.2,
    raw_min: 498,
    raw_max: 503,
    watering: "なし",
    soilFeel: "乾いている",
    memo: "引用符\"と,カンマ\n改行",
    source: "actual"
  }),
  measurements.normalizeRecord({
    id: "b",
    measuredAt: "2026-07-21T01:00:00.000Z",
    rawAvg: 420,
    rawMin: 418,
    rawMax: 424,
    watered: true,
    soil_feel: "しっとりしている"
  })
];

assert.equal(records.every(Boolean), true);

const csv = measurements.buildCsv(records);
const parsed = measurements.parseCsv(csv);
assert.equal(parsed.records.length, 2);
const byId = new Map(parsed.records.map((record) => [record.id, record]));
assert.equal(byId.get("a").memo, "引用符\"と,カンマ\n改行");
assert.equal(byId.get("b").watering, "yes");
assert.equal(byId.get("b").source, "actual");
assert.deepEqual(measurements.sortNewestFirst(parsed.records).map((record) => record.id), ["b", "a"]);

assert.equal(measurements.normalizeRecord({ measuredAt: "bad", rawAvg: 1, rawMin: 1, rawMax: 1 }), null);
assert.equal(measurements.normalizeRecord({ measuredAt: "2026-07-21", rawAvg: 10, rawMin: 11, rawMax: 12 }), null);
assert.equal(measurements.normalizeRecord({ measuredAt: "2026-07-21", rawAvg: 10, rawMin: 9, rawMax: 12, source: "demo" }), null);
assert.throws(() => measurements.parseCsv("bad,csv\n1,2"));
assert.throws(() => measurements.parseCsv('"測定日時","raw_avg","raw_min","raw_max"\n"2026-07-21,"10","9","11"'));

const legacyStorage = {
  getItem(key) {
    if (key === measurements.STORAGE_KEY) return "{broken";
    if (key === "plant-ai-raw-measurements-v0.2.0") {
      return JSON.stringify([{ measured_at: "2026-07-19T01:00:00.000Z", raw_avg: 600, raw_min: 598, raw_max: 604, watered: false }]);
    }
    return null;
  }
};
const legacyResult = measurements.loadRecords(legacyStorage);
assert.equal(legacyResult.records.length, 1);
assert.equal(legacyResult.records[0].watering, "no");
assert.equal(legacyResult.warnings.length, 1);

const unavailableStorageResult = measurements.loadRecords({ getItem() { throw new Error("blocked"); } });
assert.deepEqual(unavailableStorageResult.records, []);
assert.equal(unavailableStorageResult.warnings.length, 1);

const repeatedNoWater = measurements.mergeRecords([], [records[0], { ...records[1], id: "c", watering: "no" }]);
assert.equal(repeatedNoWater.length, 2);
assert.equal(repeatedNoWater.every((record) => record.watering === "no"), true);

const updateSource = records.map((record) => ({ ...record }));
const updateResult = measurements.updateRecord(updateSource, "a", {
  measuredAt: "2026-07-22T01:00:00.000Z",
  rawAvg: 480,
  rawMin: 478,
  rawMax: 482,
  watering: "yes",
  soilFeel: "moist",
  memo: "編集後"
});
assert.ok(updateResult);
assert.equal(updateResult.record.id, "a");
assert.equal(updateResult.record.version, records[0].version);
assert.equal(updateResult.records.length, updateSource.length);
assert.equal(updateResult.records[0].id, "a");
assert.deepEqual(updateResult.records.find((record) => record.id === "b"), updateSource.find((record) => record.id === "b"));
assert.equal(updateResult.records.find((record) => record.id === "a").memo, "編集後");
assert.equal(updateSource[0].rawAvg, 500.2);
assert.equal(measurements.updateRecord(updateSource, "missing", { rawAvg: 450, rawMin: 440, rawMax: 460 }), null);
assert.equal(measurements.updateRecord(updateSource, "a", { rawAvg: 2000, rawMin: 478, rawMax: 482 }), null);
assert.equal(measurements.updateRecord(updateSource, "a", { rawAvg: 470, rawMin: 471, rawMax: 482 }), null);

const legacyRecord = legacyResult.records[0];
const legacyUpdate = measurements.updateRecord(legacyResult.records, legacyRecord.id, {
  measuredAt: "2026-07-23T01:00:00.000Z",
  rawAvg: 590,
  rawMin: 588,
  rawMax: 594
});
assert.ok(legacyUpdate);
assert.equal(legacyUpdate.record.id, legacyRecord.id);
assert.equal(legacyUpdate.record.version, legacyRecord.version);
assert.equal(legacyUpdate.records.length, 1);

const newRecord = measurements.normalizeRecord({ id: "new", measuredAt: "2026-07-24T01:00:00.000Z", rawAvg: 450, rawMin: 448, rawMax: 454 });
const newRegistration = measurements.mergeRecords(updateSource, [newRecord]);
assert.equal(newRegistration.length, 3);
assert.equal(newRegistration.some((record) => record.id === "new"), true);

const csvHeader = measurements.buildCsv(updateResult.records).split("\r\n")[0];
assert.equal(csvHeader, '"ID","測定日時","raw_avg","raw_min","raw_max","水やり","土の感触","メモ","データ種別","記録バージョン"');

console.log("measurement-records: tests passed");
