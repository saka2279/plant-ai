(function (global) {
  "use strict";

  const SCENARIOS = Object.freeze({
    balanced: {
      label: "通常の観察",
      previous: { surface: 47, root: 53, weightChange: -10, temperature: 24.0, humidity: 59 },
      current: { surface: 46, root: 52, weightChange: -8, temperature: 24.2, humidity: 58 }
    },
    surfaceDry: {
      label: "表面だけ乾燥",
      previous: { surface: 23, root: 57, weightChange: -5, temperature: 24.2, humidity: 57 },
      current: { surface: 18, root: 58, weightChange: -4, temperature: 24.5, humidity: 55 }
    },
    allDry: {
      label: "全体が乾燥",
      previous: { surface: 29, root: 31, weightChange: -38, temperature: 26.4, humidity: 46 },
      current: { surface: 16, root: 20, weightChange: -86, temperature: 27.0, humidity: 43 }
    },
    sensorMismatch: {
      label: "センサー不一致",
      previous: { surface: 22, root: 48, weightChange: -3, temperature: 24.1, humidity: 57 },
      current: { surface: 82, root: 48, weightChange: -2, temperature: 24.1, humidity: 57 }
    },
    watering: {
      label: "水やり変化",
      previous: { surface: 30, root: 34, weightChange: -22, temperature: 24.0, humidity: 55 },
      current: { surface: 78, root: 74, weightChange: 190, temperature: 24.1, humidity: 56 }
    }
  });

  function copyReading(reading) {
    return { ...reading };
  }

  class DemoSensorAdapter {
    constructor() {
      this.adapterName = "DemoSensorAdapter";
    }

    getInitialReading() {
      return this.getScenario("balanced");
    }

    getScenario(name) {
      const scenario = SCENARIOS[name] || SCENARIOS.balanced;
      return { label: scenario.label, previous: copyReading(scenario.previous), current: copyReading(scenario.current) };
    }

    getRandomReading(previous) {
      const base = previous || SCENARIOS.balanced.current;
      const randomAround = (value, spread, min, max) => Math.min(max, Math.max(min, Math.round(value + (Math.random() - 0.5) * spread)));
      return {
        label: "ランダムデモ",
        previous: copyReading(base),
        current: {
          surface: randomAround(45, 70, 0, 100),
          root: randomAround(50, 55, 0, 100),
          weightChange: randomAround(-15, 100, -100, 80),
          temperature: Math.round((20 + Math.random() * 10) * 10) / 10,
          humidity: randomAround(55, 35, 30, 80)
        }
      };
    }
  }

  global.PlantAISensors = Object.freeze({ DemoSensorAdapter, SCENARIOS });
})(globalThis);
