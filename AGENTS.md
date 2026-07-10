# AGENTS.md

## Project

Plant AI v0.2.0は、カポック・デジタルツインの静的Webアプリを維持しながら、ELEGOO UNO R3による土壌水分センサーの実測を段階的に追加するプロジェクトです。

## Rules

- UIとドキュメントは日本語を基本とする
- スマートフォンでの使いやすさを優先する
- 判定ロジックは`logic.js`、画面更新は`script.js`へ分離する
- センサー取得はアダプター経由とし、`DemoSensorAdapter`を実機用へ交換可能に保つ
- `DemoSensorAdapter`を維持し、将来のUSB接続は`SerialSensorAdapter`として追加する
- Arduinoの生値を校正なしで水分率として扱わない
- センサーの型番、対応電圧、ピン名称を確認してから配線する
- 実測条件と結果は`docs/calibration.md`へ記録する
- v0.2.0ではUNO R3、A0、USBシリアルだけを使用し、BLE、Wi-Fi、Web Serialを追加しない
- 現在の実機方針はELEGOO UNO R3とUSBシリアルとし、ESP32-S3を前提にしない
- 既存機能とlocalStorageデータの互換性を不用意に壊さない
- 外部AI API、クラウド、カメラ診断、自動給水を追加しない
- 植物状態や水やりを断定する表現を避ける
- 確からしさを科学的な予測精度として表現しない
- 不必要な依存関係やビルド工程を追加しない
- 変更後はデモシナリオ、360px表示、ブラウザコンソールを確認する
- 機能追加時はREADME.md、バージョン変更時はCHANGELOG.mdを更新する
