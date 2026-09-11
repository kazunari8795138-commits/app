/* ===========================================================
   価値観診断 - アプリケーションロジック
   フロー: intro → quiz(35問・5段階) → loading → result(ベスト10/ワースト10)
   =========================================================== */

const state = {
  index: 0,
  answers: {}, // { questionId: 1〜5 }
};

const el = {
  screenIntro: document.getElementById("screen-intro"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenLoading: document.getElementById("screen-loading"),
  screenResult: document.getElementById("screen-result"),

  introEyebrow: document.getElementById("intro-eyebrow"),
  introTitle: document.getElementById("intro-title"),
  introSubtitle: document.getElementById("intro-subtitle"),
  introLead: document.getElementById("intro-lead"),
  introGuidance: document.getElementById("intro-guidance"),
  introDisclaimer: document.getElementById("intro-disclaimer"),
  btnStart: document.getElementById("btn-start"),
  btnBack: document.getElementById("btn-back"),
  btnRestart: document.getElementById("btn-restart"),
  btnPdf: document.getElementById("btn-pdf"),

  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  questionText: document.getElementById("question-text"),
  options: document.getElementById("options"),

  loadingText: document.getElementById("loading-text"),

  primaryTypeName: document.getElementById("primary-type-name"),
  primaryTypeDesc: document.getElementById("primary-type-desc"),
  secondaryTypeName: document.getElementById("secondary-type-name"),
  secondaryTypeDesc: document.getElementById("secondary-type-desc"),
  resultLead: document.getElementById("result-lead"),
  worstNote: document.getElementById("worst-note"),
  bestList: document.getElementById("best-list"),
  worstList: document.getElementById("worst-list"),
  nextStepText: document.getElementById("next-step-text"),
};

function fillIntroCopy() {
  el.introEyebrow.textContent = COPY.eyebrow;
  el.introTitle.textContent = COPY.title;
  el.introSubtitle.textContent = COPY.subtitle;
  el.introLead.textContent = COPY.lead;
  el.introGuidance.textContent = COPY.guidance;
  el.introDisclaimer.textContent = COPY.disclaimer;
}
fillIntroCopy();

function showScreen(screen) {
  [el.screenIntro, el.screenQuiz, el.screenLoading, el.screenResult].forEach((s) => {
    s.hidden = s !== screen;
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

/* ---------- 質問フェーズ ---------- */

function startQuiz() {
  state.index = 0;
  state.answers = {};
  renderQuestion();
}

function renderQuestion() {
  const q = QUESTIONS[state.index];
  const answered = state.answers[q.id];

  el.progressFill.style.width = `${(state.index / QUESTIONS.length) * 100}%`;
  el.progressLabel.textContent = `質問 ${state.index + 1} / ${QUESTIONS.length}`;
  el.questionText.textContent = q.text;
  el.btnBack.disabled = state.index === 0;

  el.options.innerHTML = "";
  SCALE.forEach((opt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option" + (answered === opt.value ? " selected" : "");
    button.innerHTML = `<span class="dot"></span><span class="option-label">${opt.label}</span>`;
    button.addEventListener("click", () => selectAnswer(q.id, opt.value));
    el.options.appendChild(button);
  });

  showScreen(el.screenQuiz);
}

function selectAnswer(questionId, value) {
  state.answers[questionId] = value;
  renderQuestion();
  setTimeout(() => {
    if (state.index < QUESTIONS.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      goToResult();
    }
  }, 180);
}

el.btnBack.addEventListener("click", () => {
  if (state.index > 0) {
    state.index -= 1;
    renderQuestion();
  }
});

el.btnStart.addEventListener("click", startQuiz);

/* ---------- スコア集計（重み付け・正規化） ---------- */

function computeRanking() {
  const actual = {};
  const totalWeight = {};
  VALUES.forEach((v) => {
    actual[v.code] = 0;
    totalWeight[v.code] = 0;
  });

  QUESTIONS.forEach((q) => {
    const answer = state.answers[q.id] || 1;
    Object.entries(q.weights).forEach(([code, weight]) => {
      actual[code] += answer * weight;
      totalWeight[code] += weight;
    });
  });

  const scored = VALUES.map((v) => {
    const w = totalWeight[v.code];
    const min = w * 1;
    const max = w * 5;
    const normalized = max > min ? ((actual[v.code] - min) / (max - min)) * 100 : 50;
    return { ...v, score: Math.max(0, Math.min(100, normalized)) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function computeTypeRanking(scoredValues) {
  const scoreByCode = {};
  scoredValues.forEach((v) => (scoreByCode[v.code] = v.score));

  const typeScores = TYPES.map((t) => {
    const avg = t.values.reduce((sum, code) => sum + scoreByCode[code], 0) / t.values.length;
    return { ...t, score: avg };
  });

  typeScores.sort((a, b) => b.score - a.score);
  return typeScores;
}

/* ---------- ローディング演出 ---------- */

function goToResult() {
  showScreen(el.screenLoading);
  let i = 0;
  el.loadingText.textContent = COPY.loadingMessages[0];
  const rotate = setInterval(() => {
    i += 1;
    if (i < COPY.loadingMessages.length) {
      el.loadingText.textContent = COPY.loadingMessages[i];
    }
  }, 480);
  setTimeout(() => {
    clearInterval(rotate);
    showResult();
  }, 1450);
}

/* ---------- 結果表示 ---------- */

function renderRankList(container, items, colorVar, startRank) {
  container.innerHTML = "";
  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    row.style.setProperty("--rc", colorVar);
    row.innerHTML = `
      <span class="rank-num">${startRank + i}</span>
      <div>
        <p class="rank-name">${item.code}</p>
        <p class="rank-desc">${item.description}</p>
        <div class="rank-track"><div class="rank-fill" style="width:${item.score}%"></div></div>
      </div>
    `;
    container.appendChild(row);
  });
}

function showResult() {
  const ranked = computeRanking();
  const best = ranked.slice(0, 10);
  const worst = ranked.slice(-10).reverse(); // 最も優先度が低いものを1位として表示
  const rankedTypes = computeTypeRanking(ranked);
  const primaryType = rankedTypes[0];
  const secondaryType = rankedTypes[1];

  el.primaryTypeName.textContent = primaryType.name;
  el.primaryTypeDesc.textContent = primaryType.description;
  el.secondaryTypeName.textContent = secondaryType.name;
  el.secondaryTypeDesc.textContent = secondaryType.description;

  el.resultLead.textContent = COPY.resultIntro;
  el.worstNote.textContent = COPY.worstNote;

  renderRankList(el.bestList, best, "var(--best)", 1);
  renderRankList(el.worstList, worst, "var(--worst)", 1);

  el.nextStepText.textContent = COPY.nextStep;

  showScreen(el.screenResult);
}

el.btnRestart.addEventListener("click", () => {
  state.index = 0;
  state.answers = {};
  showScreen(el.screenIntro);
});

el.btnPdf.addEventListener("click", () => {
  window.print();
});
