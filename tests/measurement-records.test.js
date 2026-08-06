"use strict";

const assert = require("node:assert/strict");

require("../measurement-records.js");

// 以下は処理確認専用の架空データで、実際のカポックの測定値ではありません。
const measurements = global.PlantAIMeasurements;
const CSV_HEADER = '"ID","測定日時","raw_avg","raw_min","raw_max","水やり","土の感触","メモ","データ種別","記録バージョン"';

function rawCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildUnmarkedCsv(values, newline = "\r\n") {
  const headers = ["ID", "測定日時", "raw_avg", "raw_min", "raw_max", "メモ", "記録バージョン"];
  return [headers, values].map((row) => row.map(rawCsvCell).join(",")).join(newline);
}
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
assert.equal(csv.split("\r\n")[0], measurements.CSV_FORMAT_MARKER);
assert.equal(csv.split("\r\n")[1], CSV_HEADER);
const parsed = measurements.parseCsv(csv);
assert.equal(parsed.records.length, 2);
assert.equal(parsed.formatVersion, 2);
for (const newline of ["\r\n", "\n", "\r"]) {
  const csvWithNewline = csv.replace(/\r\n/g, newline);
  assert.equal(measurements.parseCsv(csvWithNewline).records.length, 2);
  assert.equal(measurements.parseCsv(`\uFEFF${csvWithNewline}`).records.length, 2);
}
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

const legacyCsv = [
  '"測定日時","raw_avg","raw_min","raw_max","メモ"',
  '"2026-07-18T01:00:00.000Z","610","608","612","旧CSV"'
].join("\r\n");
const legacyCsvResult = measurements.parseCsv(legacyCsv);
assert.equal(legacyCsvResult.records.length, 1);
assert.equal(legacyCsvResult.records[0].memo, "旧CSV");
assert.equal(legacyCsvResult.records[0].version, "v0.2.1");
assert.equal(legacyCsvResult.formatVersion, null);
assert.throws(
  () => measurements.parseCsv(csv.replace(measurements.CSV_FORMAT_MARKER, "# tsuchimirucho-csv-format=3;formula-escape=apostrophe-v1")),
  /対応していません/
);

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

const csvHeader = measurements.buildCsv(updateResult.records).split("\r\n")[1];
assert.equal(csvHeader, CSV_HEADER);

function createLimitRecord(index, overrides = {}) {
  return measurements.normalizeRecord({
    id: `limit-${index}`,
    measuredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    rawAvg: 400,
    rawMin: 399,
    rawMax: 401,
    watering: "unknown",
    soilFeel: "unknown",
    memo: "",
    source: "actual",
    version: "v0.3.2",
    ...overrides
  });
}

const limit499 = Array.from({ length: 499 }, (_, index) => createLimitRecord(index));
const fiveHundredth = createLimitRecord(499, { id: "five-hundredth" });
const planTo500 = measurements.planRecordMerge(limit499, [fiveHundredth]);
assert.equal(planTo500.canApply, true);
assert.equal(planTo500.totalCount, 500);
assert.equal(planTo500.addedCount, 1);

let storedAtLimit = "unchanged";
let storageWriteCount = 0;
const limitStorage = {
  setItem(_key, value) {
    storageWriteCount += 1;
    storedAtLimit = value;
  }
};
assert.equal(measurements.saveRecords(limitStorage, planTo500.records), true);
assert.equal(storageWriteCount, 1);
assert.equal(JSON.parse(storedAtLimit).length, 500);

const limit500 = planTo500.records.map((record) => ({ ...record }));
const limit500Before = structuredClone(limit500);
const olderNewRecord = createLimitRecord(600, { id: "older-new", measuredAt: "2025-01-01T00:00:00.000Z" });
const newerNewRecord = createLimitRecord(601, { id: "newer-new", measuredAt: "2027-01-01T00:00:00.000Z" });
const olderPlan = measurements.planRecordMerge(limit500, [olderNewRecord]);
const newerPlan = measurements.planRecordMerge(limit500, [newerNewRecord]);
assert.equal(olderPlan.canApply, false);
assert.equal(newerPlan.canApply, false);
assert.equal(olderPlan.excessCount, 1);
assert.equal(newerPlan.excessCount, 1);
assert.equal(olderPlan.records.some((record) => record.id === "older-new"), true);
assert.equal(newerPlan.records.some((record) => record.id === "newer-new"), true);
assert.equal(limit500.every((record) => olderPlan.records.some((candidate) => candidate.id === record.id)), true);
assert.equal(limit500.every((record) => newerPlan.records.some((candidate) => candidate.id === record.id)), true);
assert.equal(measurements.mergeRecords(limit500, [olderNewRecord]), null);
assert.equal(measurements.mergeRecords(limit500, [newerNewRecord]), null);
assert.deepEqual(limit500, limit500Before);

storedAtLimit = "still-unchanged";
storageWriteCount = 0;
assert.equal(measurements.saveRecords(limitStorage, olderPlan.records), false);
assert.equal(storageWriteCount, 0);
assert.equal(storedAtLimit, "still-unchanged");

const limitEdit = measurements.updateRecord(limit500, limit500[250].id, {
  measuredAt: "2028-01-01T00:00:00.000Z",
  rawAvg: 420,
  rawMin: 419,
  rawMax: 421,
  memo: "500件での編集"
});
assert.ok(limitEdit);
assert.equal(limitEdit.records.length, 500);
assert.equal(limitEdit.record.id, limit500[250].id);
assert.equal(limitEdit.records.some((record) => record.id === limit500[250].id && record.memo === "500件での編集"), true);
assert.equal(measurements.saveRecords(limitStorage, limitEdit.records), true);

const overLimit502 = Array.from({ length: 502 }, (_, index) => createLimitRecord(1000 + index));
const overLimit502Before = structuredClone(overLimit502);
const reduced501 = overLimit502.slice(1);
const reduced501Before = structuredClone(reduced501);
const reductionPlan = measurements.planRecordReduction(overLimit502, reduced501);
assert.equal(reductionPlan.canApply, true);
assert.equal(reductionPlan.removedCount, 1);

let recoveryWriteCount = 0;
let recoveryStored = "unchanged";
const recoveryStorage = {
  setItem(_key, value) {
    recoveryWriteCount += 1;
    recoveryStored = value;
  }
};
assert.equal(measurements.saveRecordReduction(recoveryStorage, overLimit502, reduced501), true);
assert.equal(recoveryWriteCount, 1);
const persisted501 = JSON.parse(recoveryStored);
assert.equal(persisted501.length, 501);
assert.equal(persisted501.every((record) => reduced501.some((candidate) => candidate.id === record.id)), true);

recoveryWriteCount = 0;
const reduced500 = persisted501.slice(1);
assert.equal(measurements.saveRecordReduction(recoveryStorage, persisted501, reduced500), true);
assert.equal(recoveryWriteCount, 1);
assert.equal(JSON.parse(recoveryStored).length, 500);

const overLimitEditOnly = overLimit502.map((record, index) => index === 0 ? { ...record, memo: "変更" } : { ...record });
const deletionAndEdit = overLimit502.slice(1).map((record, index) => index === 0 ? { ...record, rawAvg: 450, rawMin: 449, rawMax: 451 } : { ...record });
const deletionAndAddition = [...overLimit502.slice(2), createLimitRecord(2000, { id: "recovery-new-id" })];
for (const invalidReduction of [overLimitEditOnly, deletionAndEdit, deletionAndAddition]) {
  recoveryWriteCount = 0;
  recoveryStored = "still-unchanged";
  assert.equal(measurements.saveRecordReduction(recoveryStorage, overLimit502, invalidReduction), false);
  assert.equal(recoveryWriteCount, 0);
  assert.equal(recoveryStored, "still-unchanged");
}
assert.deepEqual(overLimit502, overLimit502Before);
assert.deepEqual(reduced501, reduced501Before);

const currentForImport = [
  createLimitRecord(700, { id: "update-me", rawAvg: 300, rawMin: 299, rawMax: 301, memo: "更新前" }),
  createLimitRecord(701, { id: "unchanged", rawAvg: 500, rawMin: 499, rawMax: 501, memo: "同じ" })
];
const currentForImportBefore = structuredClone(currentForImport);
const incomingForImport = [
  createLimitRecord(700, { id: "update-me", rawAvg: 320, rawMin: 319, rawMax: 321, memo: "更新後" }),
  { ...currentForImport[1] },
  createLimitRecord(702, { id: "add-me", rawAvg: 600, rawMin: 599, rawMax: 601 })
];
const importPlan = measurements.planRecordMerge(currentForImport, incomingForImport);
assert.equal(importPlan.canApply, true);
assert.equal(importPlan.addedCount, 1);
assert.equal(importPlan.updatedCount, 1);
assert.equal(importPlan.unchangedCount, 1);
assert.equal(importPlan.totalCount, 3);
assert.equal(importPlan.records.find((record) => record.id === "update-me").memo, "更新後");
assert.deepEqual(importPlan.records.find((record) => record.id === "unchanged"), currentForImport[1]);
assert.deepEqual(currentForImport, currentForImportBefore);

// CSV適用の実制御を通し、キャンセル・保存失敗では保存結果を返さない。
let confirmCallCount = 0;
let persistCallCount = 0;
let persistedImport = "unchanged";
const cancelledCurrent = structuredClone(currentForImport);
const cancelledCommit = measurements.commitRecordMergePlan(
  importPlan,
  () => {
    confirmCallCount += 1;
    return false;
  },
  () => {
    persistCallCount += 1;
    persistedImport = "changed";
    return true;
  }
);
assert.equal(cancelledCommit.status, "cancelled");
assert.equal(Object.hasOwn(cancelledCommit, "records"), false);
assert.equal(confirmCallCount, 1);
assert.equal(persistCallCount, 0);
assert.equal(persistedImport, "unchanged");
assert.deepEqual(currentForImport, cancelledCurrent);

const failedCommit = measurements.commitRecordMergePlan(importPlan, () => true, () => {
  persistCallCount += 1;
  return false;
});
assert.equal(failedCommit.status, "save-failed");
assert.equal(Object.hasOwn(failedCommit, "records"), false);
assert.equal(persistedImport, "unchanged");
assert.deepEqual(currentForImport, cancelledCurrent);

const thrownCommit = measurements.commitRecordMergePlan(importPlan, () => true, () => {
  persistCallCount += 1;
  throw new Error("quota");
});
assert.equal(thrownCommit.status, "save-failed");
assert.equal(Object.hasOwn(thrownCommit, "records"), false);
assert.equal(persistedImport, "unchanged");
assert.deepEqual(currentForImport, cancelledCurrent);

const successfulCommit = measurements.commitRecordMergePlan(importPlan, () => true, (candidate) => {
  persistCallCount += 1;
  persistedImport = JSON.stringify(candidate);
  return true;
});
assert.equal(successfulCommit.status, "applied");
assert.deepEqual(successfulCommit.records, importPlan.records);
assert.deepEqual(JSON.parse(persistedImport), importPlan.records);
assert.deepEqual(currentForImport, cancelledCurrent);

let rejectedSideEffectCount = 0;
const rejectedCommit = measurements.commitRecordMergePlan({ ...importPlan, canApply: false }, () => {
  rejectedSideEffectCount += 1;
  return true;
}, () => {
  rejectedSideEffectCount += 1;
  return true;
});
assert.equal(rejectedCommit.status, "rejected");
assert.equal(rejectedSideEffectCount, 0);

const duplicateCsv = measurements.buildCsv([
  createLimitRecord(800, { id: "duplicate-id" }),
  createLimitRecord(801, { id: "duplicate-id", rawAvg: 450, rawMin: 449, rawMax: 451 })
]);
assert.throws(() => measurements.parseCsv(duplicateCsv), /重複/);

const csv500 = measurements.buildCsv(limit500);
const parsedCsv500 = measurements.parseCsv(csv500);
const csv500Plan = measurements.planRecordMerge([], parsedCsv500.records);
assert.equal(csv500Plan.canApply, true);
assert.equal(csv500Plan.totalCount, 500);

const csv501Records = [...limit500, createLimitRecord(900, { id: "csv-501" })];
const parsedCsv501 = measurements.parseCsv(measurements.buildCsv(csv501Records));
const csv501Plan = measurements.planRecordMerge([], parsedCsv501.records);
assert.equal(csv501Plan.canApply, false);
assert.equal(csv501Plan.totalCount, 501);
assert.equal(csv501Plan.excessCount, 1);

const invalidOnlyCsv = [
  '"測定日時","raw_avg","raw_min","raw_max"',
  '"bad-date","9999","0","1"'
].join("\r\n");
const invalidOriginal = structuredClone(currentForImport);
assert.throws(() => measurements.parseCsv(invalidOnlyCsv), /読み込める実測記録/);
assert.deepEqual(currentForImport, invalidOriginal);

for (const newline of ["\r\n", "\n", "\r"]) {
  const unmarkedCases = [
    { id: "'=external-id", memo: "'=1+1", version: "''hello" },
    { id: "''external-id", memo: "''hello", version: "'=legacy-version" }
  ];
  for (const unmarkedCase of unmarkedCases) {
    const unmarkedCsv = buildUnmarkedCsv([
      unmarkedCase.id,
      "2026-08-06T03:00:00.000Z",
      430,
      429,
      431,
      unmarkedCase.memo,
      unmarkedCase.version
    ], newline);
    for (const prefix of ["", "\uFEFF"]) {
      const unmarkedResult = measurements.parseCsv(`${prefix}${unmarkedCsv}`);
      assert.equal(unmarkedResult.formatVersion, null);
      assert.equal(unmarkedResult.records[0].id, unmarkedCase.id);
      assert.equal(unmarkedResult.records[0].memo, unmarkedCase.memo);
      assert.equal(unmarkedResult.records[0].version, unmarkedCase.version);
    }
  }
}

const dangerousStrings = [
  "=1+1",
  "+SUM(1,1)",
  "-1+2",
  "@SUM(1,1)",
  "  =1+1",
  "\t@SUM(1,1)",
  "  'hello",
  "\t'=1+1",
  "'hello",
  "'=1+1",
  "''=1+1",
  "'''hello",
  " \t'''hello,\"quoted\"\nnext",
  "通常文字列",
  "plant-ai",
  "123",
  ""
];
for (let count = 1; count <= 5; count += 1) {
  dangerousStrings.push(`${"'".repeat(count)}hello`);
  dangerousStrings.push(`${"'".repeat(count)}=1+1`);
}
dangerousStrings.forEach((value) => {
  assert.equal(measurements.restoreCsvString(measurements.protectCsvString(value)), value);
});
assert.equal(measurements.protectCsvString("=1+1"), "'=1+1");
assert.equal(measurements.protectCsvString("  +1"), "'  +1");
assert.equal(measurements.protectCsvString("\t-1"), "'\t-1");
assert.equal(measurements.protectCsvString("'=1+1"), "''=1+1");
assert.equal(measurements.protectCsvString("  'hello"), "'  'hello");
assert.equal(measurements.protectCsvString("通常文字列"), "通常文字列");

const formulaRecord = measurements.normalizeRecord({
  id: "=formula-id",
  measuredAt: "2026-08-06T01:00:00.000Z",
  rawAvg: 410,
  rawMin: 409,
  rawMax: 411,
  watering: "unknown",
  soilFeel: "unknown",
  memo: " \t=HYPERLINK(\"https://example.invalid\",\"x,y\")\n次の行",
  source: "actual",
  version: "@formula-version"
});
const quotedFormulaRecord = measurements.normalizeRecord({
  id: "'=literal-id",
  measuredAt: "2026-08-06T02:00:00.000Z",
  rawAvg: 420,
  rawMin: 419,
  rawMax: 421,
  memo: "'=1+1",
  source: "actual",
  version: "'-literal-version"
});
const formulaCsv = measurements.buildCsv([formulaRecord, quotedFormulaRecord]);
assert.equal(formulaCsv.startsWith(`${measurements.CSV_FORMAT_MARKER}\r\n${CSV_HEADER}\r\n`), true);
assert.match(formulaCsv, /"'=formula-id"/);
assert.match(formulaCsv, /"''=literal-id"/);
const formulaRoundTrip = measurements.parseCsv(formulaCsv).records;
const formulaById = new Map(formulaRoundTrip.map((record) => [record.id, record]));
assert.equal(formulaById.get(formulaRecord.id).memo, formulaRecord.memo);
assert.equal(formulaById.get(formulaRecord.id).version, formulaRecord.version);
assert.equal(formulaById.get(quotedFormulaRecord.id).memo, quotedFormulaRecord.memo);
assert.equal(formulaById.get(quotedFormulaRecord.id).version, quotedFormulaRecord.version);

// 判断デモCSVも共通ビルダーを使い、同じ形式マーカーと文字列安全化を持つ。
const demoValues = ["=scenario", "+state", "-agreement", "@certainty", "'=version"];
const demoCsv = measurements.buildMarkedCsv(["シナリオ", "状態", "整合性", "確からしさ", "記録バージョン"], [demoValues]);
assert.equal(demoCsv.split("\r\n")[0], measurements.CSV_FORMAT_MARKER);
demoValues.forEach((value) => {
  assert.equal(demoCsv.includes(measurements.escapeCsvCell(value)), true);
  assert.equal(measurements.restoreCsvString(measurements.protectCsvString(value)), value);
});

console.log("measurement-records: tests passed");
