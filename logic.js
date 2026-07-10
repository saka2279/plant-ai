(function (global) {
  "use strict";

  const THRESHOLDS = Object.freeze({ dryMax: 24, wetMin: 66, largeWeightLoss: -40, wateringGain: 80 });

  function numberInRange(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function normalizeReading(reading) {
    return {
      surface: Math.round(numberInRange(reading.surface, 0, 100, 0)),
      root: Math.round(numberInRange(reading.root, 0, 100, 0)),
      weightChange: Math.round(numberInRange(reading.weightChange, -500, 500, 0)),
      temperature: Math.round(numberInRange(reading.temperature, 0, 50, 20) * 10) / 10,
      humidity: Math.round(numberInRange(reading.humidity, 0, 100, 50))
    };
  }

  function getMoistureBand(value) {
    if (value <= THRESHOLDS.dryMax) return "dry";
    if (value >= THRESHOLDS.wetMin) return "wet";
    return "moist";
  }

  function evaluateReading(rawReading, rawPrevious) {
    const reading = normalizeReading(rawReading || {});
    const previous = rawPrevious ? normalizeReading(rawPrevious) : null;
    const surfaceBand = getMoistureBand(reading.surface);
    const rootBand = getMoistureBand(reading.root);
    const moistureGap = Math.abs(reading.surface - reading.root);
    const surfaceDelta = previous ? reading.surface - previous.surface : 0;
    const rootDelta = previous ? reading.root - previous.root : 0;
    const maxMoistureJump = Math.max(Math.abs(surfaceDelta), Math.abs(rootDelta));
    const weightShift = previous ? reading.weightChange - previous.weightChange : 0;
    const wateringDetected = Boolean(previous && reading.weightChange >= THRESHOLDS.wateringGain && surfaceDelta + rootDelta >= 40);
    const suddenMismatch = Boolean(previous && !wateringDetected && maxMoistureJump >= 25 && Math.abs(reading.weightChange) <= 15 && Math.abs(weightShift) <= 20);
    const surfaceDryRootMoist = surfaceBand === "dry" && reading.root >= 40;
    const bothDry = surfaceBand === "dry" && rootBand === "dry";
    const bothWet = surfaceBand === "wet" && rootBand === "wet";
    const bothMoist = surfaceBand === "moist" && rootBand === "moist";

    let state = "hold";
    let stateLabel = "判断保留";
    let summary = "センサーの示す方向がそろっていません。実際の土や鉢も確認してください。";
    let agreement = "partial";
    let agreementLabel = "一部一致";
    let certainty = "low";
    let certaintyLabel = "低い";
    let certaintyLevel = 2;
    const reasons = [];

    if (suddenMismatch) {
      agreement = "mismatch";
      agreementLabel = "センサー不一致";
      certainty = "reference";
      certaintyLabel = "参考程度";
      certaintyLevel = 1;
      reasons.push(`水分値が直前から${maxMoistureJump}ポイント急変しています。`);
      reasons.push(`鉢重量の変化は${formatSigned(reading.weightChange)}gと小さく、水分値の急変と一致していません。`);
      reasons.push("センサーの位置や土との接触を確認してから、もう一度測るのがおすすめです。");
    } else if (surfaceDryRootMoist) {
      agreement = "mismatch";
      agreementLabel = "深さで不一致";
      certainty = "low";
      certaintyLabel = "低い";
      certaintyLevel = 2;
      reasons.push(`表層は${reading.surface}%で乾燥側ですが、根元は${reading.root}%で水分が残る範囲です。`);
      reasons.push(`鉢重量の変化は${formatSigned(reading.weightChange)}gで、全体が大きく乾いた変化とは言いにくい状態です。`);
      reasons.push("表面だけで決めず、根元付近や鉢の重さも確認して様子を見る選択肢があります。");
    } else if (bothDry) {
      state = "dry";
      stateLabel = "乾燥";
      agreement = reading.weightChange <= THRESHOLDS.largeWeightLoss ? "match" : "partial";
      agreementLabel = reading.weightChange <= THRESHOLDS.largeWeightLoss ? "センサー一致" : "一部一致";
      certainty = reading.weightChange <= THRESHOLDS.largeWeightLoss ? "high" : "medium";
      certaintyLabel = reading.weightChange <= THRESHOLDS.largeWeightLoss ? "高い" : "中程度";
      certaintyLevel = reading.weightChange <= THRESHOLDS.largeWeightLoss ? 4 : 3;
      summary = "表層と根元がともに乾燥側です。葉や土の状態も確認し、水やりを検討できる目安です。";
      reasons.push(`表層${reading.surface}%・根元${reading.root}%で、両方とも乾燥側の値です。`);
      reasons.push(reading.weightChange <= THRESHOLDS.largeWeightLoss ? `鉢重量が6時間で${Math.abs(reading.weightChange)}g減り、水分が減った方向と合っています。` : `鉢重量の減少は${Math.abs(reading.weightChange)}gで、水分値ほど大きな変化ではありません。`);
      reasons.push("葉の張りや土の乾き具合を確認すると、判断材料を増やせます。");
    } else if (bothWet) {
      state = "wet";
      stateLabel = "湿りすぎ";
      agreement = "match";
      agreementLabel = "センサー一致";
      certainty = "high";
      certaintyLabel = "高い";
      certaintyLevel = 4;
      summary = "表層と根元の両方に水分が多い目安です。追加の水やりを急がず変化を見守れます。";
      reasons.push(`表層${reading.surface}%・根元${reading.root}%で、両方とも水分が多い側です。`);
      reasons.push(wateringDetected ? `鉢重量が${formatSigned(reading.weightChange)}gになり、水分値の上昇と同じ方向へ変化しています。` : `2つの水分センサーの差は${moistureGap}ポイントで、近い傾向です。`);
      reasons.push("受け皿や鉢底も確認し、土の変化を見守る選択肢があります。");
    } else if (bothMoist || (moistureGap <= 15 && reading.root > THRESHOLDS.dryMax && reading.root < THRESHOLDS.wetMin)) {
      state = "moist";
      stateLabel = "水分あり";
      agreement = moistureGap <= 12 ? "match" : "partial";
      agreementLabel = moistureGap <= 12 ? "センサー一致" : "一部一致";
      certainty = moistureGap <= 12 ? "high" : "medium";
      certaintyLabel = moistureGap <= 12 ? "高い" : "中程度";
      certaintyLevel = moistureGap <= 12 ? 4 : 3;
      summary = "表層と根元に水分がある目安です。すぐに結論を出さず、いつもの様子と比べられます。";
      reasons.push(`表層${reading.surface}%・根元${reading.root}%で、どちらも中間の範囲です。`);
      reasons.push(`2つの水分センサーの差は${moistureGap}ポイントです。`);
      reasons.push(`室温${reading.temperature}℃・湿度${reading.humidity}%も、今後の乾き方を観察する材料になります。`);
    } else {
      reasons.push(`表層${reading.surface}%と根元${reading.root}%に${moistureGap}ポイントの差があります。`);
      reasons.push(`鉢重量の変化は${formatSigned(reading.weightChange)}gです。水分値だけでは結論を出しにくい状態です。`);
      reasons.push("センサー位置と実際の土の状態を確認し、少し時間を置いて再測定してください。");
    }

    return {
      reading,
      state,
      stateLabel,
      summary,
      agreement,
      agreementLabel,
      certainty,
      certaintyLabel,
      certaintyLevel,
      reasons,
      moistureGap,
      wateringDetected,
      suddenMismatch,
      deltas: { surface: surfaceDelta, root: rootDelta, weight: weightShift }
    };
  }

  function formatSigned(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  global.PlantAILogic = Object.freeze({ THRESHOLDS, normalizeReading, evaluateReading, formatSigned });
})(globalThis);
