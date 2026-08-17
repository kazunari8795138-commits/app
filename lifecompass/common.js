/* ===========================================================
   Lifecompass — セッション記録アプリ 共通ロジック
   ・8つの羅針盤の定義
   ・セッションデータのlocalStorage保存/取得
   ・Claude APIを直接ブラウザから呼び出して文字起こしを判定
   ・診断カード共有用URLのエンコード/デコード
   =========================================================== */

const COMPASSES = [
  { key: "self",         en: "Self",         ja: "自分の土台" },
  { key: "relationship", en: "Relationship", ja: "つながり" },
  { key: "career",       en: "Career",       ja: "才能と役割" },
  { key: "finance",      en: "Finance",      ja: "価値と豊かさ" },
  { key: "growth",       en: "Growth",       ja: "学びと挑戦" },
  { key: "health",       en: "Health",       ja: "心身の輝き" },
  { key: "purpose",      en: "Purpose",      ja: "人生の軸" },
  { key: "joy",          en: "Joy",          ja: "喜びと余白" },
];

const DEFAULT_MODEL = "claude-sonnet-4-5";

/* ---------- 設定（APIキー・モデル）: localStorageに保存 ---------- */

const Settings = {
  get apiKey() {
    return localStorage.getItem("lc_api_key") || "";
  },
  set apiKey(v) {
    localStorage.setItem("lc_api_key", v || "");
  },
  get model() {
    return localStorage.getItem("lc_model") || DEFAULT_MODEL;
  },
  set model(v) {
    localStorage.setItem("lc_model", v || DEFAULT_MODEL);
  },
};

/* ---------- セッションデータ保存（localStorageを簡易DBとして使用） ---------- */
/* 将来的なファイル/SQLite移行を見据え、レコードは仕様書のJSONスキーマに準拠する */

const STORAGE_KEY = "lc_sessions";

const Store = {
  all() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("セッションデータの読み込みに失敗しました", e);
      return [];
    }
  },
  save(session) {
    const list = Store.all();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx >= 0) list[idx] = session;
    else list.push(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return session;
  },
  get(id) {
    return Store.all().find((s) => s.id === id) || null;
  },
  remove(id) {
    const list = Store.all().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },
  importMany(sessions) {
    const list = Store.all();
    sessions.forEach((s) => {
      if (!s.id) s.id = makeId(s.client_name, s.session_date);
      const idx = list.findIndex((x) => x.id === s.id);
      if (idx >= 0) list[idx] = s;
      else list.push(s);
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  },
};

function slugify(name) {
  return (name || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-一-龠ぁ-んァ-ヶー]/g, "");
}

function makeId(clientName, sessionDate) {
  const base = `${slugify(clientName)}_${sessionDate || ""}`;
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}_${suffix}`;
}

function nextSessionNumber(clientName) {
  const list = Store.all().filter((s) => s.client_name === clientName);
  if (list.length === 0) return 1;
  const max = Math.max(...list.map((s) => Number(s.session_number) || 0));
  return max + 1;
}

/* ---------- 文字起こしテキストの簡易クレンジング（.vtt対応） ---------- */

function cleanTranscript(text) {
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const isTimestampLine = (l) => /\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l);
  const isCueNumber = (l) => /^\d+$/.test(l.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "WEBVTT") continue;
    if (isTimestampLine(trimmed)) continue;
    if (isCueNumber(trimmed)) continue;
    out.push(trimmed);
  }
  return out.join("\n");
}

/* ---------- Claude APIでの判定 ---------- */

const JUDGE_SYSTEM_PROMPT = `あなたはライフコーチ「Lifecompass運営事務局」のセッション記録アシスタントです。
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

必ず record_diagnosis ツールを使って結果を構造化データとして返してください。`;

function buildToolSchema() {
  const compassProp = {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 1, maximum: 10 },
      summary: { type: "string" },
    },
    required: ["score", "summary"],
  };
  const compassesProps = {};
  COMPASSES.forEach((c) => (compassesProps[c.key] = compassProp));
  return {
    name: "record_diagnosis",
    description: "文字起こしから判定した8つの羅針盤の診断結果を記録する",
    input_schema: {
      type: "object",
      properties: {
        theme: { type: "string" },
        compasses: {
          type: "object",
          properties: compassesProps,
          required: COMPASSES.map((c) => c.key),
        },
        overall_summary: { type: "string" },
        next_step: { type: "string" },
      },
      required: ["theme", "compasses", "overall_summary", "next_step"],
    },
  };
}

async function judgeTranscript(transcriptText) {
  const apiKey = Settings.apiKey;
  if (!apiKey) {
    throw new Error("APIキーが設定されていません。右上の「設定」からAnthropic APIキーを入力してください。");
  }
  const cleaned = cleanTranscript(transcriptText);
  const body = {
    model: Settings.model,
    max_tokens: 3000,
    system: JUDGE_SYSTEM_PROMPT,
    tools: [buildToolSchema()],
    tool_choice: { type: "tool", name: "record_diagnosis" },
    messages: [
      {
        role: "user",
        content: `以下はセッションの文字起こしです。8つの羅針盤に沿って判定してください。\n\n---\n${cleaned}\n---`,
      },
    ],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude APIの呼び出しに失敗しました (HTTP ${res.status})。${errText}`);
  }

  const data = await res.json();
  const toolBlock = (data.content || []).find((b) => b.type === "tool_use" && b.name === "record_diagnosis");
  if (!toolBlock) {
    throw new Error("判定結果を取得できませんでした。もう一度お試しください。");
  }
  return toolBlock.input;
}

/* ---------- 診断カード共有用URLエンコード/デコード ---------- */

function encodeSessionForUrl(session) {
  const json = JSON.stringify(session);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSessionFromUrl(encoded) {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function emptySession() {
  const compasses = {};
  COMPASSES.forEach((c) => (compasses[c.key] = { score: 5, summary: "" }));
  return {
    id: "",
    client_name: "",
    session_date: new Date().toISOString().slice(0, 10),
    session_number: 1,
    theme: "",
    compasses,
    overall_summary: "",
    next_step: "",
    created_at: new Date().toISOString(),
  };
}
