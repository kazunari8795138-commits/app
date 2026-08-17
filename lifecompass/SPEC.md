# Life Compass セッション記録アプリ — 最終仕様書

Lifecompass運営事務局「セッション記録自動化プロジェクト」の実装仕様。
Zoom文字起こし入力 → AI判定（8つの羅針盤）→ クライアント向け診断カード（Webページ）作成、までを
サーバーレス（静的Webページのみ）で実現する。

実装コード一式: `lifecompass/`（本リポジトリ、ブランチ `claude/diagnostic-card-app-afgud8`）

---

## 1. 全体構成

サーバーを持たない静的Webアプリ（HTML/CSS/JSのみ）。任意の静的ホスティング
（自社サーバー、GitHub Pages、Netlify、Jimdoの外部ファイル埋め込み等）にそのまま配置できる。

```
lifecompass/
├── index.html      トップページ（導線・8羅針盤の説明）
├── input.html       文字起こし入力 → AI判定 → 編集 → 保存
├── sessions.html    セッション一覧・エクスポート/インポート
├── card.html        診断カード（羅針盤カード）表示・共有
├── common.js         定数・保存処理・API呼び出し・共有URLエンコード（全ページ共通）
├── style.css          デザインシステム（下記4章）
└── vendor/
    └── chart.umd.min.js   Chart.js本体（CDN不使用・ローカル同梱）
```

画面遷移:

```
index.html ──「新しいセッションを記録する」──▶ input.html
                                                    │ 保存
                                                    ▼
sessions.html ◀──「セッション一覧」── card.html?id=... （共有URLは ?data=...）
```

---

## 2. データスキーマ

CLAUDE.md記載のJSONスキーマをそのまま採用し、`id` と `created_at` を追加している。

```json
{
  "id": "山田-花子_2026-08-17_a1b2c",
  "client_name": "山田 花子",
  "session_date": "2026-08-17",
  "session_number": 3,
  "theme": "キャリアの方向性について",
  "compasses": {
    "self":         { "score": 7, "summary": "…" },
    "relationship": { "score": 8, "summary": "…" },
    "career":       { "score": 6, "summary": "…" },
    "finance":      { "score": 4, "summary": "…" },
    "growth":       { "score": 7, "summary": "…" },
    "health":       { "score": 3, "summary": "…" },
    "purpose":      { "score": 8, "summary": "…" },
    "joy":          { "score": 5, "summary": "…" }
  },
  "overall_summary": "セッション全体の総括（今日の気づき）",
  "next_step": "次の一歩",
  "created_at": "2026-08-17T05:40:00.000Z"
}
```

### 8つの羅針盤

| key | ラベル(en) | ラベル(ja) |
|---|---|---|
| self | Self | 自分の土台 |
| relationship | Relationship | つながり |
| career | Career | 才能と役割 |
| finance | Finance | 価値と豊かさ |
| growth | Growth | 学びと挑戦 |
| health | Health | 心身の輝き |
| purpose | Purpose | 人生の軸 |
| joy | Joy | 喜びと余白 |

score は 1〜10 の整数。`lifecompass/common.js` の `COMPASSES` 配列が定義の一元管理場所。

---

## 3. AI判定（機能①）の仕様

### 方式

コーチ自身のAnthropic APIキーをブラウザ内（`localStorage`）に保存し、**ブラウザから直接**
Anthropic Messages APIを呼び出す（サーバー・バックエンド不要）。判定結果はJSONで構造化して受け取る。

> CLAUDE.md 6章で未決定とされていた「判定に使うClaude APIのモデル・呼び出し方法」は、この方式で解決した。
> サーバーを持たない構成のため、コーチ個人のAPIキーを都度使う形とした（第三者に渡すアプリではなく、
> コーチ本人が使う業務ツールという前提）。

### リクエスト仕様

```
POST https://api.anthropic.com/v1/messages
Headers:
  content-type: application/json
  x-api-key: <コーチが設定画面で入力したAPIキー>
  anthropic-version: 2023-06-01
  anthropic-dangerous-direct-browser-access: true   ← ブラウザから直接叩くために必須
```

- `model`: 既定値 `claude-sonnet-4-5`（設定画面でユーザーが変更可能）
- `max_tokens`: 3000
- `tool_choice`: `{ "type": "tool", "name": "record_diagnosis" }`（必ず構造化データで返させる）

### systemプロンプト（全文）

```
あなたはライフコーチ「Lifecompass運営事務局」のセッション記録アシスタントです。
コーチとクライアントのZoomセッションの文字起こしを読み、以下の「8つの羅針盤」フレームワークに沿って
セッション内容を判定・要約します。

8つの羅針盤:
- self (自分の土台)
- relationship (つながり)
- career (才能と役割)
- finance (価値と豊かさ)
- growth (学びと挑戦)
- health (心身の輝き)
- purpose (人生の軸)
- joy (喜びと余白)

各羅針盤について、以下の2つを判定してください。
1. score: 発言内容から推定する満足度スコア（1〜10の整数。1=非常に不満、10=非常に満足）。
   その羅針盤について文字起こし中に手がかりがほとんど無い場合は5(中立)を基準にしてよい。
2. summary: 「今、感じていること」「本当はどうしたいか」など、深掘りメモの問いかけを評価軸として、
   関連する発言を2〜3文程度で要約する（日本語・である/です調は問わず自然な文で）。

加えて以下も生成してください。
- theme: このセッションの主題・テーマを短いフレーズで
- overall_summary: セッション全体の「今日の気づき」の総括（3〜4文程度）
- next_step: クライアントが次に取り組む「次の一歩」（1〜2文、具体的な行動として）

必ず record_diagnosis ツールを使って結果を構造化データとして返してください。
```

### ツール（tool_use）スキーマ

```json
{
  "name": "record_diagnosis",
  "description": "文字起こしから判定した8つの羅針盤の診断結果を記録する",
  "input_schema": {
    "type": "object",
    "properties": {
      "theme": { "type": "string" },
      "compasses": {
        "type": "object",
        "properties": {
          "self":         { "type": "object", "properties": { "score": {"type":"integer","minimum":1,"maximum":10}, "summary": {"type":"string"} }, "required": ["score","summary"] },
          "relationship": { "...": "同上" },
          "career":       { "...": "同上" },
          "finance":      { "...": "同上" },
          "growth":       { "...": "同上" },
          "health":       { "...": "同上" },
          "purpose":      { "...": "同上" },
          "joy":          { "...": "同上" }
        },
        "required": ["self","relationship","career","finance","growth","health","purpose","joy"]
      },
      "overall_summary": { "type": "string" },
      "next_step": { "type": "string" }
    },
    "required": ["theme", "compasses", "overall_summary", "next_step"]
  }
}
```

### レスポンス処理

`response.content` 配列から `type === "tool_use" && name === "record_diagnosis"` のブロックを探し、
その `.input` を判定結果JSONとして使用する（`lifecompass/common.js` の `judgeTranscript()`）。

### 文字起こしの前処理

`.vtt` 形式（`WEBVTT` ヘッダー・連番・タイムスタンプ行）は送信前に自動除去し、発言テキストのみ抽出する
（`cleanTranscript()`）。`.txt` はそのまま使用可能。

### フォールバック

APIキー未設定・API呼び出し失敗時はエラーメッセージを表示。AIを使わず「手動で入力する」ボタンから
同じ編集フォーム（score=5初期値）を開いて、すべて手入力でカードを作成することも可能。

---

## 4. デザインシステム

### カラートークン

| トークン | 値 | 用途 |
|---|---|---|
| `--navy` | `#0B1B33` | 背景 |
| `--navy-panel` | `#101F3D` | パネル・カード面 |
| `--navy-panel-2` | `#142449` | モーダル面 |
| `--gold` | `#D4AF6A` | アクセント・ボタン |
| `--gold-heading` | `#B8925A` | 見出し |
| `--text` | `#E4E9F2` | 本文 |
| `--text-muted` | `#8B9BB5` | 補足テキスト |
| `--border` | `rgba(212,175,106,0.25)` | 枠線 |

### タイポグラフィ

- フォント: `"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif`（システムフォント、CDN依存なし）
- 見出し: ゴールド系 (`--gold-heading`)、太字
- 本文: `--text` / 補足: `--text-muted`

### コンポーネント

- ボタン: 角丸999px（ピル型）。primary=ゴールドグラデーション背景、ghost=枠線のみ、danger=赤枠
- パネル: `border-radius:16px`、`border:1px solid var(--border)`、背景 `var(--navy-panel)`
- フォーム: 入力欄背景 `var(--navy)`、フォーカス時ゴールド枠線
- モーダル: 半透明黒背景 + 中央配置パネル（APIキー設定用）

---

## 5. 診断カード仕様（機能②）

### 構成（上から順に）

1. ヘッダー: 羅針盤アイコン(SVG) + "Life Compass Session" ラベル + クライアント名 + セッション日・回数・テーマ
2. レーダーチャート（Chart.js、0〜10スケール、8軸）
3. 「今日の気づき」= `overall_summary`
4. 「次の一歩」= `next_step`
5. フッター: `G7 — Believe in Possibilities.`

### Chart.js設定

```js
new Chart(ctx, {
  type: 'radar',
  data: {
    labels: ['Self','Relationship','Career','Finance','Growth','Health','Purpose','Joy'],
    datasets: [{
      data: [/* 8羅針盤のscoreを順番に */],
      backgroundColor: 'rgba(212,175,106,0.18)',
      borderColor: '#D4AF6A',
      borderWidth: 2,
      pointBackgroundColor: '#D4AF6A',
      pointBorderColor: '#0B1B33',
      pointRadius: 4
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      r: {
        min: 0, max: 10,
        ticks: { display: false, stepSize: 2 },
        grid: { color: 'rgba(255,255,255,0.12)' },
        angleLines: { color: 'rgba(255,255,255,0.15)' },
        pointLabels: { color: '#C9D2E0', font: { size: 11 } }
      }
    }
  }
});
```

Chart.js本体はCDNを使わず `lifecompass/vendor/chart.umd.min.js` にローカル同梱している
（外部CDNが遮断される環境でも動作させるため）。

---

## 6. 共有・アクセス制御（機能②の配布方式）

`card.html` はURLパラメータ2種類に対応する。

- `card.html?id=<セッションID>` — この端末の `localStorage` から読み込む（コーチ本人の閲覧用）
- `card.html?data=<base64url化したセッションJSON>` — **URLだけで誰でも閲覧できる共有リンク**
  （`localStorage` 不要。クライアントに送付するのはこちらのURL）

エンコードは `encodeSessionForUrl()` / `decodeSessionFromUrl()`（`common.js`）。
UTF-8バイト列 → Base64 → URLセーフ化（`+`→`-`, `/`→`_`, パディング除去）。

> CLAUDE.md 6章の「クライアントごとのアクセス制御」は、この
> **URLにデータを埋め込む方式**（リンクを知っている人だけが閲覧可）で解決している。
> 認証機能は持たない。機密性の高い内容を扱う場合は認証付きホスティングへの変更を検討すること。

---

## 7. データ蓄積（セッション一覧・バックアップ）

- 保存先: ブラウザの `localStorage`（キー: `lc_sessions`、値: セッションJSON配列）
- `sessions.html` から全セッションをJSONファイルとしてエクスポート／インポート可能
  （ファイル名例: `lifecompass_sessions_2026-08-17.json`）

> CLAUDE.md 3章の「ファイル単位保存（`sessions/{client_id}/{session_date}.json`）」は、
> 静的フロントエンドの制約上、`localStorage` を実質DBとして使う形に変更している。
> 将来SQLite等へ移行する際は、このエクスポートJSON（配列）がそのまま移行データソースとして使える。

---

## 8. デプロイ手順（サイトへの反映）

1. `lifecompass/` フォルダ一式（`index.html`, `input.html`, `sessions.html`, `card.html`,
   `common.js`, `style.css`, `vendor/chart.umd.min.js`）を静的ホスティング先にそのままアップロードする
   （相対パス参照のみなので、フォルダ構成を保てばどこに置いても動作する）
2. `index.html` をエントリーポイントとして公開する
3. コーチが初回アクセス時に、右上「設定」からAnthropic APIキーを登録する
   （HTTPS配信必須。`anthropic-dangerous-direct-browser-access` ヘッダーを使うため）
4. Jimdo等の既存サイトに組み込む場合は、iframe埋め込み、またはサブディレクトリ/サブドメインでの
   静的ファイルホスティングを利用する

---

## 9. 未決定事項の解決まとめ（CLAUDE.md 6章対応）

| CLAUDE.mdの未決定事項 | 本実装での解決 |
|---|---|
| Webページのホスティング先 | サーバー不要の静的アプリ。任意の静的ホスティングに配置可能 |
| クライアントごとのアクセス制御 | 診断カードのデータをURLに埋め込む方式（リンクを知っている人のみ閲覧可） |
| 判定に使うClaude APIのモデル・呼び出し方法 | コーチ個人のAPIキーでブラウザから直接Anthropic Messages APIを呼び出し（既定モデル `claude-sonnet-4-5`、tool useで構造化JSON取得） |

---

## 10. 既知の制約

- APIキーはブラウザの `localStorage` に平文で保存される（コーチ本人の端末のみで使う前提）。
  複数人で使う共有PC等では注意が必要
- `localStorage` は端末・ブラウザ単位のため、複数端末で使う場合はエクスポート/インポートで手動同期する
- 共有リンク（`?data=`）はURL長に依存するため、要約が極端に長い場合はURLが長大になる（実運用上は問題にならない想定だが、将来的にサーバー保存方式への切替も可能な設計にしてある）
