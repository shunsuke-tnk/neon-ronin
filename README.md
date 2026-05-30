# NEON RONIN — 斬光帝都 / Severed Sky

雨に濡れたネオンの帝都を駆ける女浪人「骸（むくろ）」の、横スクロール型 居合アクションゲーム。
ブラウザだけで動作し、画像は AI 生成のキービジュアル＋スプライト、エフェクトとサウンドはすべて Canvas 2D / Web Audio API で手続き的に生成しています。

A neon-noir side-scrolling action game. Runs entirely in the browser — AI-generated key art & sprites, with all VFX and audio synthesised procedurally (Canvas 2D + Web Audio API).

## 遊び方 / Controls

| 操作 | キー |
|------|------|
| 移動 Move | ← → / A D |
| ジャンプ（二段）Jump (double) | Z / Space |
| ダッシュ（空中・無敵）Dash | Shift |
| 斬る（居合）Attack | X / J |
| 武器切替 Switch weapon | C |
| 残刃（必殺）Ultimate | B |
| ポーズ Pause | Esc |
| 音 ON/OFF Mute | M |

## 特徴 / Features

- 5 つのステージ（雨都・磁気鉄道・電脳神社・ネオン地下・天守）と多段フェーズボス
- 武器 4 種＋必殺「残刃」、魂片によるレベルアップと 3 択強化（ローグライト）
- 加算合成の発光トレイル・パーティクル・ヒットストップ・画面シェイク・グリッチ・時間減速
- ステージごとの手続き生成 BGM（和×シンセウェイブ）

## 開発 / Development

```bash
npm install
npm run dev      # 開発サーバー http://localhost:5173
npm run build    # 本番ビルド（dist/index.html に全アセットを内包した単一ファイル）
npm run preview  # ビルドのプレビュー
```

- **Stack**: Vite + TypeScript (strict) + HTML5 Canvas 2D。外部ゲームエンジン不使用。
- 本番ビルドは `vite-plugin-singlefile` により `dist/index.html` 1 ファイルに全アセットを内包するため、ダブルクリックでオフライン起動できます。

## クレジット / Credits

- キービジュアル・スプライト: OpenAI GPT-image で生成
- ゲーム実装・エフェクト・サウンド合成: Canvas 2D / Web Audio API
