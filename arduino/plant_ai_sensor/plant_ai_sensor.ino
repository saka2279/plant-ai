// Plant AI v0.2.0
// ELEGOO UNO R3 + analog soil-moisture sensor verification sketch.
// The reported values are raw ADC readings, not moisture percentages.

const uint8_t SENSOR_PIN = A0;
const uint8_t STATUS_LED_PIN = LED_BUILTIN;
const unsigned long SERIAL_BAUD = 115200;
const unsigned long OUTPUT_INTERVAL_MS = 1000;
const uint8_t SAMPLE_COUNT = 20;
const unsigned int SAMPLE_DELAY_MS = 5;

unsigned long lastOutputAt = 0;
bool statusLedOn = false;

struct ReadingSummary {
  float average;
  int minimum;
  int maximum;
};

ReadingSummary readAveragedRawValue() {
  unsigned long total = 0;
  int minimum = 1023;
  int maximum = 0;

  for (uint8_t index = 0; index < SAMPLE_COUNT; index += 1) {
    const int rawValue = analogRead(SENSOR_PIN);
    total += rawValue;

    if (rawValue < minimum) {
      minimum = rawValue;
    }

    if (rawValue > maximum) {
      maximum = rawValue;
    }

    delay(SAMPLE_DELAY_MS);
  }

  ReadingSummary summary;
  summary.average = static_cast<float>(total) / SAMPLE_COUNT;
  summary.minimum = minimum;
  summary.maximum = maximum;
  return summary;
}

void printReading(const ReadingSummary &summary, unsigned long measuredAt) {
  Serial.print(F("uptime_ms="));
  Serial.print(measuredAt);
  Serial.print(F(",raw_avg="));
  Serial.print(summary.average, 1);
  Serial.print(F(",raw_min="));
  Serial.print(summary.minimum);
  Serial.print(F(",raw_max="));
  Serial.print(summary.maximum);
  Serial.print(F(",samples="));
  Serial.println(SAMPLE_COUNT);
}

void setup() {
  pinMode(SENSOR_PIN, INPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.begin(SERIAL_BAUD);
  delay(1000);

  Serial.println(F("Plant AI v0.2.0 / UNO R3 soil sensor raw-value monitor"));
  Serial.println(F("Values are raw ADC readings (0-1023), not moisture percentages."));
  Serial.println(F("format: uptime_ms,raw_avg,raw_min,raw_max,samples"));
}

void loop() {
  const unsigned long now = millis();

  if (now - lastOutputAt < OUTPUT_INTERVAL_MS) {
    return;
  }

  lastOutputAt = now;
  const ReadingSummary summary = readAveragedRawValue();
  printReading(summary, now);

  statusLedOn = !statusLedOn;
  digitalWrite(STATUS_LED_PIN, statusLedOn ? HIGH : LOW);
}
