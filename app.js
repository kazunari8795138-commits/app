/* ===========================================================
   自己否定パターン診断 - アプリケーションロジック
   =========================================================== */

const state = {
  step: 0, // 現在の設問インデックス（メイン18問）
  answers: {}, // { questionId: value }
  tiebreakQueue: [], // 実施するタイブレーク質問の配列（最大2件）
  tiebreakStep: 0,
  tiebreakAnswers: {}, // { typeCode: value }
  baseScores: null, // { typeCode: number }
};

const el = {
  screenIntro: document.getElementById("screen-intro"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenTiebreak: document.getElementById("screen-tiebreak"),
  screenResult: document.getElementById("screen-result"),

  btnStart: document.getElementById("btn-start"),
  btnBack: document.getElementById("btn-back"),
  btnRestart: document.getElementById("btn-restart"),

  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  questionText: document.getElementById("question-text"),
  options: document.getElementById("options"),

  tiebreakIntro: document.getElementById("tiebreak-intro"),
  tiebreakProgressFill: document.getElementById("tiebreak-progress-fill"),
  tiebreakProgressLabel: document.getElementById("tiebreak-progress-label"),
  tiebreakQuestionText: document.getElementById("tiebreak-question-text"),
  tiebreakOptions: document.getElementById("tiebreak-options"),

  resultTitle: document.getElementById("result-title"),
  resultSub: document.getElementById("result-sub"),
  resultDescription: document.getElementById("result-description"),
  adviceText: document.getElementById("advice-text"),
  scoreChart: document.getElementById("score-chart"),
};

function showScreen(screen) {
  [el.screenIntro, el.screenQuiz, el.screenTiebreak, el.screenResult].forEach((s) => {
    s.hidden = s !== screen;
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------- メイン設問フェーズ ---------- */

function renderQuestion() {
  const q = MAIN_QUESTIONS[state.step];
  const answered = state.answers[q.id];

  el.progressFill.style.width = `${(state.step / MAIN_QUESTIONS.length) * 100}%`;
  el.progressLabel.textContent = `質問 ${state.step + 1} / ${MAIN_QUESTIONS.length}`;
  el.questionText.textContent = q.text;
  el.btnBack.disabled = state.step === 0;

  el.options.innerHTML = "";
  SCALE.forEach((opt) => {
    const div = document.createElement("div");
    div.className = "option" + (answered === opt.value ? " selected" : "");
    div.innerHTML = `
      <span class="dot"></span>
      <span class="option-label">${opt.label}</span>
      <span class="option-scale">${opt.value}</span>
    `;
    div.addEventListener("click", () => selectAnswer(q.id, opt.value));
    el.options.appendChild(div);
  });

  showScreen(el.screenQuiz);
}

function selectAnswer(questionId, value) {
  state.answers[questionId] = value;
  // 少し間を置いて次へ（選択の視覚フィードバックのため）
  renderQuestion();
  setTimeout(() => {
    if (state.step < MAIN_QUESTIONS.length - 1) {
      state.step += 1;
      renderQuestion();
    } else {
      finishMainQuestions();
    }
  }, 180);
}

el.btnBack.addEventListener("click", () => {
  if (state.step > 0) {
    state.step -= 1;
    renderQuestion();
  }
});

el.btnStart.addEventListener("click", () => {
  state.step = 0;
  state.answers = {};
  renderQuestion();
});

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
  // TYPES配列の並び順を安定した優先順位として使う
  return TYPES.map((t, index) => ({ code: t.code, score: scores[t.code], index })).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
}

function finishMainQuestions() {
  state.baseScores = computeBaseScores();
  const sorted = sortTypesByScore(state.baseScores);

  // 2位と3位の境界が同点の場合のみ、タイブレークが必要
  const boundaryTie = sorted[1].score === sorted[2].score;

  if (boundaryTie) {
    const tieValue = sorted[1].score;
    const tieGroup = sorted.filter((t) => t.score === tieValue);
    // 最大2問までしか出題しない
    state.tiebreakQueue = tieGroup.slice(0, 2).map((t) => t.code);
    state.tiebreakStep = 0;
    state.tiebreakAnswers = {};
    renderTiebreak();
  } else {
    showResult();
  }
}

/* ---------- タイブレークフェーズ ---------- */

function renderTiebreak() {
  const code = state.tiebreakQueue[state.tiebreakStep];
  const q = TIEBREAK_QUESTIONS[code];

  el.tiebreakIntro.textContent = `上位タイプが僅差だったため、確認の質問です（全${state.tiebreakQueue.length}問）。`;
  el.tiebreakProgressFill.style.width = `${(state.tiebreakStep / state.tiebreakQueue.length) * 100}%`;
  el.tiebreakProgressLabel.textContent = `確認質問 ${state.tiebreakStep + 1} / ${state.tiebreakQueue.length}`;
  el.tiebreakQuestionText.textContent = q.text;

  el.tiebreakOptions.innerHTML = "";
  SCALE.forEach((opt) => {
    const div = document.createElement("div");
    div.className = "option";
    div.innerHTML = `
      <span class="dot"></span>
      <span class="option-label">${opt.label}</span>
      <span class="option-scale">${opt.value}</span>
    `;
    div.addEventListener("click", () => selectTiebreakAnswer(code, opt.value));
    el.tiebreakOptions.appendChild(div);
  });

  showScreen(el.screenTiebreak);
}

function selectTiebreakAnswer(code, value) {
  state.tiebreakAnswers[code] = value;
  setTimeout(() => {
    if (state.tiebreakStep < state.tiebreakQueue.length - 1) {
      state.tiebreakStep += 1;
      renderTiebreak();
    } else {
      showResult();
    }
  }, 180);
}

/* ---------- 結果算出 & 表示 ---------- */

function computeFinalTop2() {
  const scores = { ...state.baseScores };

  // タイブレークで答えたタイプにのみ、僅かな加点をして順位を確定させる
  Object.entries(state.tiebreakAnswers).forEach(([code, value]) => {
    scores[code] += value * 0.01;
  });

  const sorted = sortTypesByScore(scores);
  return { top2: [sorted[0].code, sorted[1].code], finalScores: scores };
}

function showResult() {
  const { top2, finalScores } = computeFinalTop2();
  const key = pairKey(top2[0], top2[1]);
  const result = RESULTS[key];
  const typeA = getType(top2[0]);
  const typeB = getType(top2[1]);

  el.resultTitle.textContent = result.title;
  el.resultSub.textContent = `${typeA.name} × ${typeB.name}`;

  el.resultDescription.innerHTML = "";

  const chipRow = document.createElement("div");
  chipRow.className = "type-pair";
  [typeA, typeB].forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "type-chip";
    chip.innerHTML = `<span class="swatch" style="background:${t.color}"></span>${t.name}`;
    chipRow.appendChild(chip);
  });
  el.resultDescription.appendChild(chipRow);

  [typeA, typeB].forEach((t) => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${t.name}</strong>：${t.description}`;
    el.resultDescription.appendChild(p);
  });

  const combined = document.createElement("p");
  combined.textContent = result.description;
  el.resultDescription.appendChild(combined);

  el.adviceText.textContent = result.advice;

  // スコアチャート（元スコア、3〜15の範囲を0-100%に正規化）
  el.scoreChart.innerHTML = "";
  const sortedForChart = sortTypesByScore(state.baseScores);
  sortedForChart.forEach(({ code, score }) => {
    const t = getType(code);
    const pct = Math.max(0, Math.min(100, ((score - 3) / (15 - 3)) * 100));
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span class="score-name">${t.name}</span>
      <span class="score-track"><span class="score-fill" style="width:${pct}%; background:${t.color}"></span></span>
      <span class="score-value">${score}</span>
    `;
    el.scoreChart.appendChild(row);
  });

  showScreen(el.screenResult);
}

el.btnRestart.addEventListener("click", () => {
  state.step = 0;
  state.answers = {};
  state.tiebreakQueue = [];
  state.tiebreakStep = 0;
  state.tiebreakAnswers = {};
  state.baseScores = null;
  showScreen(el.screenIntro);
});
