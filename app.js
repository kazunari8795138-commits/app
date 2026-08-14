/* ===========================================================
   自己否定パターン診断 - アプリケーションロジック
   フロー: intro → quiz(18問, 同点時のみ+最大2問) → loading → result
   タイブレークは専用画面を作らず、同じ質問UIの延長として自然に出題する。
   =========================================================== */

const state = {
  sequence: [], // 出題する質問の配列（最初は18件、同点時のみ最大2件追加）
  index: 0,
  answers: {}, // { questionId: 1(YES) | 0(NO) }
  baseScores: null, // 18問終了時点の各タイプ得点
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

  resultNote: document.getElementById("result-note"),
  primaryDot: document.getElementById("primary-dot"),
  primaryName: document.getElementById("primary-name"),
  primaryCatch: document.getElementById("primary-catch"),
  secondaryDot: document.getElementById("secondary-dot"),
  secondaryName: document.getElementById("secondary-name"),
  secondaryCatch: document.getElementById("secondary-catch"),
  comboNames: document.getElementById("combo-names"),
  comboTitleText: document.getElementById("combo-title-text"),
  comboFeature: document.getElementById("combo-feature"),
  comboPattern: document.getElementById("combo-pattern"),
  scoreChart: document.getElementById("score-chart"),
  heartHabits: document.getElementById("heart-habits"),
  adviceText: document.getElementById("advice-text"),
  commonMessageBody: document.getElementById("common-message-body"),
  commonMessageFooter: document.getElementById("common-message-footer"),
  disclaimerText: document.getElementById("disclaimer-text"),
};

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

/* 6タイプ×3問を「3ラウンド」に分け、ラウンドごとにタイプの出題順をシャッフルする。
   これにより毎回異なる順番になりつつ、6問ごとに必ず6タイプが1問ずつ出る。 */
function buildQuestionSequence() {
  const byType = {};
  TYPES.forEach((t) => (byType[t.code] = []));
  MAIN_QUESTIONS.forEach((q) => byType[q.type].push(q));

  const sequence = [];
  for (let round = 0; round < 3; round++) {
    const typeOrder = shuffle(TYPES.map((t) => t.code));
    typeOrder.forEach((code) => sequence.push(byType[code][round]));
  }
  return sequence;
}

/* ---------- 質問フェーズ ---------- */

function startQuiz() {
  state.sequence = buildQuestionSequence();
  state.index = 0;
  state.answers = {};
  state.baseScores = null;
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
      finishCurrentBatch();
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

/* ---------- スコア集計 & タイブレーク判定 ---------- */

function computeBaseScores() {
  const scores = {};
  TYPES.forEach((t) => (scores[t.code] = 0));
  MAIN_QUESTIONS.forEach((q) => {
    scores[q.type] += state.answers[q.id] || 0;
  });
  return scores;
}

function sortTypesByScore(scores) {
  // TYPES配列の並び順を安定した優先順位（同点時の最終フォールバック）として使う
  return TYPES.map((t, index) => ({ code: t.code, score: scores[t.code], index })).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
}

function finishCurrentBatch() {
  if (state.sequence.length === 18) {
    // 18問終了。1位・2位の境界（2位と3位）が同点の場合のみ、最大2問を追加出題する
    state.baseScores = computeBaseScores();
    const sorted = sortTypesByScore(state.baseScores);
    const boundaryTie = sorted[1].score === sorted[2].score;

    if (boundaryTie) {
      const tieValue = sorted[1].score;
      const tieGroup = sorted.filter((t) => t.score === tieValue);
      const queue = tieGroup.slice(0, 2).map((t) => t.code);
      queue.forEach((code) => state.sequence.push(TIEBREAK_QUESTIONS[code]));
      state.index += 1;
      renderQuestion();
      return;
    }
  }
  goToResult();
}

function computeFinalScores() {
  const scores = { ...state.baseScores };
  Object.values(TIEBREAK_QUESTIONS).forEach((tq) => {
    if (state.answers[tq.id] !== undefined) {
      scores[tq.type] += state.answers[tq.id];
    }
  });
  return scores;
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
  const finalScores = computeFinalScores();
  const sorted = sortTypesByScore(finalScores);
  const primary = getType(sorted[0].code);
  const secondary = getType(sorted[1].code);
  const allZero = TYPES.every((t) => finalScores[t.code] === 0);

  lastResult = { primary, secondary };

  el.resultNote.hidden = !allZero;
  if (allZero) el.resultNote.textContent = ALL_NO_MESSAGE;

  el.primaryDot.style.background = primary.color;
  el.primaryName.textContent = primary.name;
  el.primaryCatch.textContent = `「${primary.catchCopy}」`;

  el.secondaryDot.style.background = secondary.color;
  el.secondaryName.textContent = secondary.name;
  el.secondaryCatch.textContent = `「${secondary.catchCopy}」`;

  const combo = RESULTS[pairKey(primary.code, secondary.code)];
  el.comboNames.textContent = `${primary.name} × ${secondary.name}`;
  el.comboTitleText.textContent = combo.title;
  el.comboFeature.textContent = combo.feature;
  el.comboPattern.textContent = combo.pattern;
  el.adviceText.textContent = combo.hint;

  el.scoreChart.innerHTML = "";
  TYPES.forEach((t) => {
    const score = finalScores[t.code];
    const row = document.createElement("div");
    row.className = "score-row";
    row.style.setProperty("--tc", t.color);
    const dots = [0, 1, 2]
      .map((i) => `<span class="score-dot${i < score ? " filled" : ""}"></span>`)
      .join("");
    row.innerHTML = `<span class="score-name">${t.name}</span><span class="score-dots">${dots}</span>`;
    el.scoreChart.appendChild(row);
  });

  el.heartHabits.innerHTML = "";
  [primary, secondary].forEach((t) => {
    const row = document.createElement("div");
    row.className = "heart-habit-row";
    row.style.setProperty("--tc", t.color);
    row.innerHTML = `<span class="hh-dot"></span><span><span class="hh-quote">「${t.heartHabit}」</span><br>${t.name}に多い心のクセ</span>`;
    el.heartHabits.appendChild(row);
  });

  el.commonMessageBody.textContent = COMMON_MESSAGE.body;
  el.commonMessageFooter.textContent = COMMON_MESSAGE.footer;
  el.disclaimerText.textContent = DISCLAIMER_TEXT;

  showScreen(el.screenResult);
}

/* ---------- シェア & 再診断 ---------- */

el.btnShare.addEventListener("click", () => {
  if (!lastResult) return;
  const { primary, secondary } = lastResult;
  const text = `自己否定パターン診断をやってみました🌱\n私のタイプは\n『${primary.name} × ${secondary.name}』\nでした。\nあなたはどのタイプ？\n#自己否定パターン診断`;
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
  state.baseScores = null;
  lastResult = null;
  showScreen(el.screenIntro);
});
