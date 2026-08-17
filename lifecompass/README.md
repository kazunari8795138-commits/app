# Life Compass — セッション記録アプリ

Lifecompass運営事務局のCLAUDE.md仕様書に基づく、Zoom文字起こし入力から診断カード（羅針盤カード）
Webページ作成までを行う静的Webアプリです。サーバー不要で、ブラウザだけで完結します。

## 使い方

1. `index.html` を開く（GitHub Pages等の静的ホスティング、またはローカルで `python3 -m http.server` などで配信）
2. 右上の「設定」から Anthropic APIキーを入力する（AI判定を使う場合のみ必須）
3. 「新しいセッションを記録する」からクライアント情報とZoom文字起こしを入力し、「AIで判定する」を押す
4. 8つの羅針盤（Self / Relationship / Career / Finance / Growth / Health / Purpose / Joy）の
   スコア・要約、今日の気づき、次の一歩が自動生成されるので、内容を確認・編集して保存する
5. 保存すると診断カード（レーダーチャート付き）が表示される。「共有リンクをコピー」でURLを発行し、
   クライアントに送付できる

AIを使わずすべて手動入力する場合は「AIを使わず手動で入力する」から編集フォームを開ける。

## 実装方針・CLAUDE.md「未決定事項」の解決

CLAUDE.mdの6章で未決定とされていた3点は、以下の方針で解決した。

- **ホスティング先**: サーバーを持たない静的Webアプリとして実装（GitHub Pages等にそのまま配置可能）
- **アクセス制御**: 診断カードのデータはURLに埋め込む方式（`card.html?data=...`）。
  リンクを知っている人だけが閲覧できる、簡易的なURLベースの制御とした
- **判定に使うAPI**: コーチ自身のAnthropic APIキーを設定画面に保存し、ブラウザから直接
  Claude APIを呼び出す（`anthropic-dangerous-direct-browser-access` ヘッダー使用）。
  モデルは設定画面で変更可能（既定値: `claude-sonnet-4-5`）

## データの保存について

セッション記録は各ブラウザの `localStorage` に保存される（`sessions/{client_id}/{session_date}.json`
のファイル単位蓄積という仕様書の方針を、ブラウザ環境向けに近似したもの）。セッション一覧画面から
JSONファイルとして書き出し・読み込みができるため、端末間の引き継ぎや、将来的なSQLite等への
移行の際のデータ移行にも利用できる。

## ファイル構成

- `index.html` — トップページ
- `input.html` — 文字起こし入力 → AI判定 → 編集 → 保存
- `sessions.html` — セッション一覧・エクスポート/インポート
- `card.html` — 診断カード（羅針盤カード）表示・共有
- `common.js` — 8つの羅針盤の定義、保存処理、Claude API呼び出し、共有URLエンコード
- `style.css` — G7ブランドのデザイン（紺 `#0B1B33` × ゴールド `#D4AF6A`）
