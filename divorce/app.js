/* ===========================================================
   夫婦関係 危機度セルフチェック - アプリケーションロジック
   フロー: intro → quiz(24問) → loading → result
   =========================================================== */

const RING_RADIUS = 68;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const state = {
  sequence: [], // 出題する質問の配列（24件）
  index: 0,
  answers: {}, // { questionId: 1(YES) | 0(NO) }
};

let lastResult = null; // シェアボタン用に最後の結果を保持

const el = {
  screenIntro: document.getElementById("screen-intro"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenLoading: document.getElementById("screen-loading"),
  screenResult: document.getElementById("screen-result"),

  btnStart: document.getElementById("btn-start"),
  btnBack: document.getElementById("btn-back"),
  btnYes: document.getElementById("btn-yes"),
  btnNo: document.getElementById("btn-no"),
  btnShare: document.getElementById("btn-share"),
  btnRestart: document.getElementById("btn-restart"),

  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  questionText: document.getElementById("question-text"),

  loadingText: document.getElementById("loading-text"),

  ringProgress: document.getElementById("ring-progress"),
  ringPercentNum: document.getElementById("ring-percent-num"),
  riskBadge: document.getElementById("risk-badge"),
  riskTitle: document.getElementById("risk-title"),
  riskLead: document.getElementById("risk-lead"),
  riskBody: document.getElementById("risk-body"),

  resultNote: document.getElementById("result-note"),

  safetyNotice: document.getElementById("safety-notice"),
  safetyTitle: document.getElementById("safety-title"),
  safetyBody: document.getElementById("safety-body"),
  safetyContacts: document.getElementById("safety-contacts"),

  riskFocus: document.getElementById("risk-focus"),
  scoreChart: document.getElementById("score-chart"),

  commonMessageBody: document.getElementById("common-message-body"),
  commonMessageFooter: document.getElementById("common-message-footer"),
  disclaimerText: document.getElementById("disclaimer-text"),
};

el.ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
el.ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;

function showScreen(screen) {
  [el.screenIntro, el.screenQuiz, el.screenLoading, el.screenResult].forEach((s) => {
    s.hidden = s !== screen;
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------- 質問の出題順シャッフル ---------- */

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 8カテゴリー×3問を「3ラウンド」に分け、ラウンドごとにカテゴリーの出題順をシャッフルする。
   これにより毎回異なる順番になりつつ、8問ごとに必ず8カテゴリーが1問ずつ出る。 */
function buildQuestionSequence() {
  const byCat = {};
  CATEGORIES.forEach((c) => (byCat[c.code] = []));
  QUESTIONS.forEach((q) => byCat[q.cat].push(q));

  const sequence = [];
  for (let round = 0; round < 3; round++) {
    const catOrder = shuffle(CATEGORIES.map((c) => c.code));
    catOrder.forEach((code) => sequence.push(byCat[code][round]));
  }
  return sequence;
}

/* ---------- 質問フェーズ ---------- */

function startQuiz() {
  state.sequence = buildQuestionSequence();
  state.index = 0;
  state.answers = {};
  renderQuestion();
}

function renderQuestion() {
  const q = state.sequence[state.index];
  const total = state.sequence.length;
  const answered = state.answers[q.id];

  el.progressFill.style.width = `${(state.index / total) * 100}%`;
  el.progressLabel.textContent = `Q${state.index + 1} / ${total}`;
  el.questionText.textContent = q.text;
  el.btnBack.disabled = state.index === 0;

  el.btnYes.classList.toggle("selected", answered === 1);
  el.btnNo.classList.toggle("selected", answered === 0);

  showScreen(el.screenQuiz);
}

function selectAnswer(value) {
  const q = state.sequence[state.index];
  state.answers[q.id] = value;
  renderQuestion();
  setTimeout(() => {
    if (state.index < state.sequence.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      goToResult();
    }
  }, 180);
}

el.btnYes.addEventListener("click", () => selectAnswer(1));
el.btnNo.addEventListener("click", () => selectAnswer(0));

el.btnBack.addEventListener("click", () => {
  if (state.index > 0) {
    state.index -= 1;
    renderQuestion();
  }
});

el.btnStart.addEventListener("click", startQuiz);

/* ---------- スコア集計 ---------- */

function computeScores() {
  const scores = {};
  CATEGORIES.forEach((c) => (scores[c.code] = 0));
  QUESTIONS.forEach((q) => {
    scores[q.cat] += state.answers[q.id] || 0;
  });
  return scores;
}

function sortCategoriesByScore(scores) {
  return CATEGORIES.map((c, index) => ({ code: c.code, score: scores[c.code], index })).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
}

/* ---------- ローディング演出 ---------- */

function goToResult() {
  showScreen(el.screenLoading);
  let i = 0;
  el.loadingText.textContent = LOADING_MESSAGES[0];
  const rotate = setInterval(() => {
    i += 1;
    if (i < LOADING_MESSAGES.length) {
      el.loadingText.textContent = LOADING_MESSAGES[i];
    }
  }, 480);
  setTimeout(() => {
    clearInterval(rotate);
    showResult();
  }, 1450);
}

/* ---------- 結果算出 & 表示 ---------- */

function showResult() {
  const scores = computeScores();
  const totalScore = Object.values(scores).reduce((sum, v) => sum + v, 0);
  const pct = Math.round((totalScore / TOTAL_QUESTIONS) * 100);
  const level = getRiskLevel(pct);
  const sorted = sortCategoriesByScore(scores);
  const allZero = totalScore === 0;
  const topRisks = sorted.filter((c) => c.score > 0).slice(0, 2);

  lastResult = { pct, level };

  // リング描画
  el.ringProgress.style.stroke = level.ring;
  const offset = RING_CIRCUMFERENCE * (1 - pct / 100);
  requestAnimationFrame(() => {
    el.ringProgress.style.strokeDashoffset = `${offset}`;
  });
  el.ringPercentNum.textContent = pct;

  el.riskBadge.textContent = level.label;
  el.riskBadge.style.color = level.ring;
  el.riskTitle.textContent = level.label;
  el.riskLead.textContent = level.lead;
  el.riskBody.textContent = level.body;

  el.resultNote.hidden = !allZero;
  if (allZero) el.resultNote.textContent = ALL_NO_MESSAGE;

  // 精神的すれ違いタイプに該当がある場合は、スコアに関わらず相談窓口を案内
  const safetyTriggered = scores.RESPECT > 0;
  el.safetyNotice.hidden = !safetyTriggered;
  if (safetyTriggered) {
    el.safetyTitle.textContent = SAFETY_NOTICE.title;
    el.safetyBody.textContent = SAFETY_NOTICE.body;
    el.safetyContacts.innerHTML = "";
    SAFETY_NOTICE.contacts.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${c.label}</strong>${c.value}`;
      el.safetyContacts.appendChild(li);
    });
  }

  // 特に気になるポイント（上位2カテゴリー）
  el.riskFocus.innerHTML = "";
  if (topRisks.length === 0) {
    const p = document.createElement("p");
    p.className = "lead small";
    p.style.margin = "0";
    p.textContent = "今回は、特に強く出ているすれ違いのポイントはありませんでした。";
    el.riskFocus.appendChild(p);
  } else {
    topRisks.forEach((item, i) => {
      const cat = getCategory(item.code);
      const row = document.createElement("div");
      row.className = "risk-focus-row";
      row.style.setProperty("--tc", cat.color);
      row.innerHTML = `
        <span class="rf-dot"></span>
        <div>
          <p class="rf-rank">${i === 0 ? "最も気になるポイント" : "次に気になるポイント"}</p>
          <p class="rf-name">${cat.name}</p>
          <p class="rf-catch">「${cat.catchCopy}」</p>
          <p class="rf-advice">${cat.advice}</p>
        </div>`;
      el.riskFocus.appendChild(row);
    });
  }

  // 8タイプスコア一覧
  el.scoreChart.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const score = scores[c.code];
    const row = document.createElement("div");
    row.className = "score-row";
    row.style.setProperty("--tc", c.color);
    const dots = [0, 1, 2]
      .map((i) => `<span class="score-dot${i < score ? " filled" : ""}"></span>`)
      .join("");
    row.innerHTML = `<span class="score-name">${c.name}</span><span class="score-dots">${dots}</span>`;
    el.scoreChart.appendChild(row);
  });

  el.commonMessageBody.textContent = COMMON_MESSAGE.body;
  el.commonMessageFooter.textContent = COMMON_MESSAGE.footer;
  el.disclaimerText.textContent = DISCLAIMER_TEXT;

  showScreen(el.screenResult);
}

/* ---------- シェア & 再診断 ---------- */

el.btnShare.addEventListener("click", () => {
  if (!lastResult) return;
  const { pct, level } = lastResult;
  const text = `夫婦関係の危機度セルフチェックをやってみました💭\n私の危機度は\n『${pct}%（${level.label}）』\nでした。\nあなたの関係は何%？\n#夫婦関係セルフチェック`;
  const params = new URLSearchParams({ text });
  if (location.protocol.indexOf("http") === 0) {
    params.set("url", location.href);
  }
  window.open(`https://twitter.com/intent/tweet?${params.toString()}`, "_blank", "noopener");
});

el.btnRestart.addEventListener("click", () => {
  state.sequence = [];
  state.index = 0;
  state.answers = {};
  lastResult = null;
  el.ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
  showScreen(el.screenIntro);
});
