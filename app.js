/* ---------------- 状態 ---------------- */
const state = {
  industry: INDUSTRIES[0].id,
  position: POSITIONS[0].id,
  tenure: TENURES[0].id,
  answers: {}, // qid -> text
  okng: {},    // qid -> 'OK'|'NG'
  checks: {},  // idx -> bool
  agendaItems: ['', '', ''],
};

function getIndustry(){ return INDUSTRIES.find(i => i.id === state.industry); }
function getPosition(){ return POSITIONS.find(p => p.id === state.position); }
function getTenure(){ return TENURES.find(t => t.id === state.tenure); }

function fillTemplate(tpl){
  const ind = getIndustry(), pos = getPosition(), ten = getTenure();
  return tpl
    .replaceAll('{ind}', ind.label)
    .replaceAll('{i0}', ind.issues[0])
    .replaceAll('{i1}', ind.issues[1])
    .replaceAll('{i2}', ind.issues[2])
    .replaceAll('{i3}', ind.issues[3])
    .replaceAll('{pos}', pos.phrase)
    .replaceAll('{ten}', ten.phrase);
}

/* ---------------- 描画 ---------------- */
function populateSelect(el, list){
  el.innerHTML = list.map(o => `<option value="${o.id}">${o.label}</option>`).join('');
}

function renderAll(){
  const container = document.getElementById('sections');
  container.innerHTML = '';
  SECTIONS.forEach(sec => {
    const secEl = document.createElement('div');
    secEl.className = 'section';
    secEl.innerHTML = `
      <div class="section-head">
        <div class="section-num">${sec.num}</div>
        <h2>${sec.title}</h2>
      </div>
      <div class="section-desc">${sec.desc}</div>
    `;
    const qWrap = document.createElement('div');
    sec.questions.forEach(q => {
      qWrap.appendChild(renderQCard(sec, q));
    });
    secEl.appendChild(qWrap);

    if(sec.isAgenda){
      secEl.appendChild(renderAgendaBuilder());
    }
    if(sec.isChecklist){
      secEl.appendChild(renderChecklist(sec.checklistItems));
    }

    container.appendChild(secEl);
  });
  updateProgress();
}

function renderQCard(sec, q){
  const card = document.createElement('div');
  card.className = 'qcard';
  const filled = q.templates.map(fillTemplate);
  const answerKey = q.qid;

  card.innerHTML = `
    <span class="qtag">${q.tag}</span>
    <p class="qtext">${q.text}</p>
    ${sec.isChecklist ? `
      <div class="okng">
        <button type="button" class="ok" data-k="${answerKey}">OK</button>
        <button type="button" class="ng" data-k="${answerKey}">NG</button>
      </div>` : ''}
    <div class="chips" data-key="${answerKey}"></div>
    <textarea placeholder="選択肢をタップして挿入、または自由に記入してください" data-key="${answerKey}"></textarea>
  `;

  const chipsEl = card.querySelector('.chips');
  filled.forEach(text => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const ta = card.querySelector('textarea');
      const lines = ta.value.split('\n').filter(Boolean);
      if(chip.classList.contains('selected')){
        if(!lines.includes('・' + text)) lines.push('・' + text);
      } else {
        const idx = lines.indexOf('・' + text);
        if(idx > -1) lines.splice(idx, 1);
      }
      ta.value = lines.join('\n');
      state.answers[answerKey] = ta.value;
      updateProgress();
    });
    chipsEl.appendChild(chip);
  });

  const ta = card.querySelector('textarea');
  ta.value = state.answers[answerKey] || '';
  ta.addEventListener('input', () => {
    state.answers[answerKey] = ta.value;
    updateProgress();
  });

  if(sec.isChecklist){
    const okBtn = card.querySelector('.ok');
    const ngBtn = card.querySelector('.ng');
    const setState = (val) => {
      state.okng[answerKey] = val;
      okBtn.classList.toggle('on', val === 'OK');
      ngBtn.classList.toggle('on', val === 'NG');
    };
    okBtn.addEventListener('click', () => setState(state.okng[answerKey] === 'OK' ? null : 'OK'));
    ngBtn.addEventListener('click', () => setState(state.okng[answerKey] === 'NG' ? null : 'NG'));
  }

  return card;
}

function renderAgendaBuilder(){
  const wrap = document.createElement('div');
  wrap.className = 'qcard';
  wrap.innerHTML = `
    <span class="qtag">3. Agenda</span>
    <p class="qtext">当日のAgenda項目（1〜7）を自由に組み立ててください</p>
    <div id="agenda-list"></div>
    <button type="button" class="add-row" id="agenda-add">＋ 項目を追加</button>
  `;
  const list = wrap.querySelector('#agenda-list');
  function renderRows(){
    list.innerHTML = '';
    state.agendaItems.forEach((val, i) => {
      const row = document.createElement('div');
      row.className = 'agenda-item';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = val;
      input.placeholder = '例）ダイアードワーク：お互いの印象をフィードバックし合う';
      input.addEventListener('input', (e) => {
        state.agendaItems[i] = e.target.value;
      });
      const badge = document.createElement('div');
      badge.className = 'agenda-badge';
      badge.textContent = i + 1;
      row.appendChild(badge);
      row.appendChild(input);
      list.appendChild(row);
    });
  }
  wrap.querySelector('#agenda-add').addEventListener('click', () => {
    state.agendaItems.push('');
    renderRows();
  });
  renderRows();
  return wrap;
}

function renderChecklist(items){
  const wrap = document.createElement('div');
  wrap.className = 'qcard';
  wrap.innerHTML = `<span class="qtag">Checklist</span><p class="qtext">最終確認項目</p><ul class="checklist"></ul>`;
  const ul = wrap.querySelector('.checklist');
  items.forEach((text, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" id="chk-${i}"><label for="chk-${i}">${text}</label>`;
    li.querySelector('input').addEventListener('change', (e) => {
      state.checks[i] = e.target.checked;
      updateProgress();
    });
    ul.appendChild(li);
  });
  return wrap;
}

function updateProgress(){
  const totalQ = SECTIONS.reduce((n, s) => n + s.questions.length, 0);
  const answered = Object.values(state.answers).filter(v => v && v.trim()).length;
  document.getElementById('progress').textContent = `${answered} / ${totalQ} 問 回答済み`;
}

/* 業種/職位/勤続 が変わったら選択肢の文言を再生成 */
function attachSelectors(){
  const indSel = document.getElementById('f-industry');
  const posSel = document.getElementById('f-position');
  const tenSel = document.getElementById('f-tenure');
  populateSelect(indSel, INDUSTRIES);
  populateSelect(posSel, POSITIONS);
  populateSelect(tenSel, TENURES);
  indSel.value = state.industry;
  posSel.value = state.position;
  tenSel.value = state.tenure;

  const otherNote = document.getElementById('other-note');
  function syncOtherNote(){
    otherNote.classList.toggle('show', indSel.value === 'other');
  }
  syncOtherNote();

  indSel.addEventListener('change', () => { state.industry = indSel.value; syncOtherNote(); renderAll(); });
  posSel.addEventListener('change', () => { state.position = posSel.value; renderAll(); });
  tenSel.addEventListener('change', () => { state.tenure = tenSel.value; renderAll(); });
}

/* ---------------- テキスト書き出し ---------------- */
function buildTextOutput(){
  const ind = getIndustry(), pos = getPosition(), ten = getTenure();
  const title = document.getElementById('f-title').value || '（研修名未入力）';
  let out = `研修設計シート\n研修名：${title}\n業種：${ind.label} / 対象階層：${pos.label} / 勤続年数：${ten.label}\n\n`;
  SECTIONS.forEach(sec => {
    out += `\n${sec.num}. ${sec.title}\n`;
    sec.questions.forEach(q => {
      out += `\n${q.text}\n`;
      if(sec.isChecklist && state.okng[q.qid]) out += `[${state.okng[q.qid]}]\n`;
      out += (state.answers[q.qid] || '（未回答）') + '\n';
    });
    if(sec.isAgenda){
      out += '\nAgenda項目：\n' + state.agendaItems.filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n';
    }
    if(sec.isChecklist){
      out += '\nチェックリスト：\n' + sec.checklistItems.map((t, i) => `[${state.checks[i] ? 'x' : ' '}] ${t}`).join('\n') + '\n';
    }
  });
  return { out, title };
}

document.getElementById('export-btn').addEventListener('click', () => {
  const { out, title } = buildTextOutput();
  const blob = new Blob([out], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `研修設計シート_${title}.txt`;
  a.click();
});

attachSelectors();
renderAll();

/* ---------------- PowerPoint 書き出し ---------------- */
const PPTX_NAVY = '26415A';
const PPTX_TEAL = '3C6E64';
const PPTX_HIGHLIGHT = 'F2B705';
const PPTX_INK = '1E2A32';
const PPTX_PAPER = 'EEF0EC';

function answerLines(qid){
  const raw = (state.answers[qid] || '').split('\n').map(s => s.trim()).filter(Boolean);
  return raw.length ? raw : ['（未回答）'];
}

async function buildPptx(){
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'A', width: 10, height: 5.625 });
  pptx.layout = 'A';

  const ind = getIndustry(), pos = getPosition(), ten = getTenure();
  const title = document.getElementById('f-title').value || '研修';

  // タイトルスライド
  let s = pptx.addSlide();
  s.background = { color: PPTX_NAVY };
  s.addText('研修設計スライド', { x: 0.6, y: 1.35, w: 8.8, h: 0.5, fontSize: 14, color: PPTX_HIGHLIGHT, bold: true, charSpacing: 2 });
  s.addText(title, { x: 0.6, y: 1.9, w: 8.8, h: 1.2, fontFace: 'Yu Mincho', fontSize: 40, bold: true, color: 'FFFFFF' });
  s.addText(`業種：${ind.label}　｜　対象：${pos.label}　｜　勤続：${ten.label}`,
    { x: 0.6, y: 3.2, w: 8.8, h: 0.5, fontSize: 13, color: 'D8DEE4' });

  // 各セクション
  SECTIONS.forEach(sec => {
    // セクション区切りスライド
    let ds = pptx.addSlide();
    ds.background = { color: PPTX_PAPER };
    ds.addShape('rect', { x: 0, y: 2.55, w: 10, h: 0.05, fill: { color: PPTX_NAVY } });
    ds.addText(sec.num, { x: 0.6, y: 1.4, w: 2, h: 1, fontFace: 'Yu Mincho', fontSize: 34, bold: true, color: PPTX_TEAL });
    ds.addText(sec.title, { x: 0.6, y: 2.7, w: 8.8, h: 0.8, fontFace: 'Yu Mincho', fontSize: 28, bold: true, color: PPTX_INK });
    ds.addText(sec.desc || '', { x: 0.6, y: 3.5, w: 8.8, h: 0.5, fontSize: 13, color: '5B6870' });

    if(sec.isAgenda){
      let as_ = pptx.addSlide();
      as_.background = { color: 'FFFFFF' };
      as_.addText('Agenda', { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: 'Yu Mincho', fontSize: 22, bold: true, color: PPTX_NAVY });
      const flowRows = [
        ['checkin', answerLines('checkin')],
        ['purpose', answerLines('purpose')],
      ];
      let y = 1.15;
      flowRows.forEach(([label, lines]) => {
        as_.addText(label, { x: 0.5, y, w: 1.6, h: 0.4, fontSize: 12, bold: true, color: PPTX_TEAL });
        as_.addText(lines.join('\n'), { x: 2.2, y, w: 7.2, h: 0.4 * lines.length, fontSize: 12, color: PPTX_INK, valign: 'top' });
        y += 0.35 * lines.length + 0.25;
      });
      as_.addText('Agenda 項目', { x: 0.5, y, w: 2, h: 0.4, fontSize: 12, bold: true, color: PPTX_TEAL });
      y += 0.4;
      const items = state.agendaItems.filter(Boolean);
      const itemsText = items.length ? items.map((t, i) => `${i + 1}. ${t}`).join('\n') : '（未入力）';
      as_.addText(itemsText, { x: 0.5, y, w: 9, h: 5.4 - y, fontSize: 13, color: PPTX_INK, valign: 'top' });

      let cs = pptx.addSlide();
      cs.background = { color: 'FFFFFF' };
      cs.addText('checkout', { x: 0.5, y: 0.35, w: 9, h: 0.6, fontFace: 'Yu Mincho', fontSize: 22, bold: true, color: PPTX_NAVY });
      cs.addText(answerLines('checkout').join('\n'), { x: 0.5, y: 1.15, w: 9, h: 3.8, fontSize: 14, color: PPTX_INK, valign: 'top' });
      return;
    }

    if(sec.isChecklist){
      sec.questions.forEach(q => {
        let qs = pptx.addSlide();
        qs.background = { color: 'FFFFFF' };
        qs.addText(q.text, { x: 0.5, y: 0.4, w: 9, h: 0.9, fontFace: 'Yu Mincho', fontSize: 18, bold: true, color: PPTX_NAVY, valign: 'top' });
        if(state.okng[q.qid]){
          qs.addText(state.okng[q.qid], {
            x: 8.0, y: 0.4, w: 1.4, h: 0.5,
            fontSize: 14, bold: true, color: 'FFFFFF',
            fill: { color: state.okng[q.qid] === 'OK' ? PPTX_TEAL : 'B4482F' }, align: 'center',
          });
        }
        qs.addText(answerLines(q.qid).map(t => '・' + t).join('\n'),
          { x: 0.5, y: 1.5, w: 9, h: 3.6, fontSize: 14, color: PPTX_INK, valign: 'top', lineSpacingMultiple: 1.3 });
      });
      let chk = pptx.addSlide();
      chk.background = { color: 'FFFFFF' };
      chk.addText('最終チェックリスト', { x: 0.5, y: 0.4, w: 9, h: 0.6, fontFace: 'Yu Mincho', fontSize: 20, bold: true, color: PPTX_NAVY });
      const chkText = sec.checklistItems.map((t, i) => `${state.checks[i] ? '☑' : '☐'} ${t}`).join('\n\n');
      chk.addText(chkText, { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 13, color: PPTX_INK, valign: 'top', lineSpacingMultiple: 1.3 });
      return;
    }

    sec.questions.forEach(q => {
      let qs = pptx.addSlide();
      qs.background = { color: 'FFFFFF' };
      qs.addShape('rect', { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: PPTX_TEAL } });
      qs.addText(q.tag, { x: 0.5, y: 0.35, w: 8.8, h: 0.35, fontSize: 11, bold: true, color: PPTX_TEAL, charSpacing: 1 });
      qs.addText(q.text, { x: 0.5, y: 0.65, w: 9, h: 0.9, fontFace: 'Yu Mincho', fontSize: 18, bold: true, color: PPTX_NAVY, valign: 'top' });
      qs.addText(answerLines(q.qid).map(t => '・' + t).join('\n'),
        { x: 0.5, y: 1.7, w: 9, h: 3.6, fontSize: 14, color: PPTX_INK, valign: 'top', lineSpacingMultiple: 1.3 });
    });
  });

  const title2 = document.getElementById('f-title').value || '研修設計';
  await pptx.writeFile({ fileName: `${title2}_研修資料.pptx` });
}

const pptxBtn = document.getElementById('pptx-btn');
pptxBtn.addEventListener('click', async () => {
  pptxBtn.disabled = true;
  const original = pptxBtn.textContent;
  pptxBtn.textContent = '作成中…';
  try {
    await buildPptx();
  } catch(e){
    alert('PowerPoint作成中にエラーが発生しました：' + e.message);
    console.error(e);
  } finally {
    pptxBtn.disabled = false;
    pptxBtn.textContent = original;
  }
});
