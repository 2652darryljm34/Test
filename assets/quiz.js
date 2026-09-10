const params = new URLSearchParams(window.location.search);
const file = params.get('file');

const appEl = document.getElementById('app');
const loadingEl = document.getElementById('loading');
const subtitleEl = document.getElementById('quiz-subtitle');

const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

let quizData = null;
let flat = [];        // flattened, ordered list of { sectionName, ...question }
let current = 0;
let answers = [];      // { item, correct, detail }
let dbPromise = null;  // shared practice-database session for `sql` questions

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

function nl2br(str){
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function shuffle(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeAnswer(str){
  return String(str).toLowerCase().trim().replace(/[.,;:'"]/g, '').replace(/\s+/g, ' ');
}

async function init(){
  if(!file){
    loadingEl.textContent = 'No quiz specified.';
    loadingEl.classList.add('load-error');
    return;
  }
  try{
    const res = await fetch(file);
    if(!res.ok) throw new Error('Quiz file not found: ' + file);
    quizData = await res.json();

    const sections = quizData.sections || (quizData.questions ? [{ name: null, questions: quizData.questions }] : []);
    if(sections.length === 0 || sections.every(s => (s.questions || []).length === 0)){
      throw new Error('This quiz has no questions yet.');
    }

    document.title = quizData.title || 'Quiz';
    subtitleEl.textContent = quizData.title || '';
    loadingEl.hidden = true;
    quizData._sections = sections;

    // Start downloading the SQL engine now if any question needs it, so it is
    // usually ready by the time the learner reaches the first SQL question.
    const needsDb = sections.some(s => (s.questions || []).some(q => q.type === 'sql'));
    if(needsDb) ensureDb();

    startQuiz();
  }catch(err){
    loadingEl.textContent = "Couldn't load this quiz. " + err.message;
    loadingEl.classList.add('load-error');
  }
}

function startQuiz(){
  flat = [];
  quizData._sections.forEach(section => {
    const qs = shuffle(section.questions || []);
    qs.forEach(q => flat.push(Object.assign({ sectionName: section.name }, q)));
  });
  current = 0;
  answers = [];
  render();
}

function render(){
  if(current >= flat.length){
    renderResults();
    return;
  }
  const item = flat[current];
  const total = flat.length;
  const pct = Math.round((current / total) * 100);

  const earnedSoFar = answers.reduce((sum, a) => sum + a.score, 0);

  appEl.innerHTML = `
    <div class="page-head" style="padding-top:20px;">
      <h1>${escapeHtml(quizData.title || 'Quiz')}</h1>
      ${quizData.description ? `<p>${escapeHtml(quizData.description)}</p>` : ''}
      ${quizData.guideFile ? `<div class="q-actions" style="justify-content:flex-start; margin-top:14px;"><a class="btn ghost" href="review.html?file=${encodeURIComponent(quizData.guideFile)}">Review the study guide &rarr;</a></div>` : ''}
    </div>

    <div class="quiz-meta">
      <span>${item.sectionName ? escapeHtml(item.sectionName) + ' &middot; ' : ''}Question ${current + 1} of ${total}</span>
      <span id="score-tally">Score: ${fmtScore(earnedSoFar)}/${answers.length}</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>

    <div class="q-card" id="q-card"></div>
  `;

  const card = document.getElementById('q-card');
  const badge = item.category ? `<span class="cat-badge">${escapeHtml(item.category)}</span>` : '';

  if(item.type === 'mc'){
    renderMC(card, item, badge, item.options, item.correct);
  } else if(item.type === 'tf'){
    renderMC(card, item, badge, ['True', 'False'], item.correct ? 0 : 1);
  } else if(item.type === 'fill_blank'){
    renderFillBlank(card, item, badge);
  } else if(item.type === 'matching'){
    renderMatching(card, item, badge);
  } else if(item.type === 'short_answer'){
    renderShortAnswer(card, item, badge);
  } else if(item.type === 'sql'){
    renderSql(card, item, badge);
  } else {
    card.innerHTML = `<p>Unsupported question type: ${escapeHtml(item.type)}</p>`;
  }
}

function fmtScore(n){
  return Math.round(n * 100) / 100 % 1 === 0 ? String(Math.round(n)) : (Math.round(n * 100) / 100).toString();
}

function finishQuestion(score, detail){
  // score is 0..1 credit for this question (1 = fully correct, fractional = partial credit)
  answers.push({ item: flat[current], score, correct: score === 1, detail: detail || null });
  const earned = answers.reduce((sum, a) => sum + a.score, 0);
  document.getElementById('score-tally').textContent = `Score: ${fmtScore(earned)}/${answers.length}`;
}

function appendNextButton(card, isLast){
  const actions = document.createElement('div');
  actions.className = 'q-actions';
  actions.innerHTML = `<button class="btn primary" id="next-btn">${isLast ? 'See results' : 'Next question'}</button>`;
  card.appendChild(actions);
  document.getElementById('next-btn').addEventListener('click', () => { current += 1; render(); });
}

/* A model answer is rendered as highlighted SQL when the question says it is
 * one: `sql` questions always, and any other question that sets answerLang. */
function answerBlock(text, item, extraClass){
  const isSql = item && (item.type === 'sql' || item.answerLang === 'sql');
  if(isSql && typeof SqlHL !== 'undefined') return SqlHL.block(text, extraClass);
  return `<pre class="model-answer${extraClass ? ' ' + extraClass : ''}">${nl2br(text)}</pre>`;
}

/* ---------- Multiple choice / True-False ---------- */
function renderMC(card, item, badge, options, correctIndex){
  card.innerHTML = `
    ${badge}
    <p class="q-prompt">${nl2br(item.question)}</p>
    <div class="options" id="options"></div>
    <div id="feedback"></div>
  `;
  const optionsEl = document.getElementById('options');
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.innerHTML = `<span class="option-letter">${letters[i] || i+1}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener('click', () => {
      const correct = i === correctIndex;
      finishQuestion(correct ? 1 : 0, { yourAnswer: opt, correctAnswer: options[correctIndex] });

      document.querySelectorAll('#options .option').forEach((b, idx) => {
        b.disabled = true;
        if(idx === correctIndex) b.classList.add('correct');
        else if(idx === i) b.classList.add('incorrect');
        else b.classList.add('dim');
      });

      const feedbackEl = document.getElementById('feedback');
      feedbackEl.innerHTML = correct
        ? `<div class="feedback good"><strong>Correct.</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`
        : `<div class="feedback bad"><strong>Not quite \u2014 correct answer highlighted above.</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`;

      appendNextButton(card, current + 1 === flat.length);
    });
    optionsEl.appendChild(btn);
  });
}

/* ---------- Fill in the blank ---------- */
function renderFillBlank(card, item, badge){
  card.innerHTML = `
    ${badge}
    <p class="q-prompt">${nl2br(item.question)}</p>
    <input type="text" id="fb-input" class="fb-input" placeholder="Type your answer" autocomplete="off">
    <div class="q-actions" style="justify-content:flex-start; margin-top:14px;">
      <button class="btn primary" id="fb-check">Check answer</button>
    </div>
    <div id="feedback"></div>
  `;
  const input = document.getElementById('fb-input');
  input.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); document.getElementById('fb-check').click(); } });

  document.getElementById('fb-check').addEventListener('click', () => {
    const userVal = input.value;
    const norm = normalizeAnswer(userVal);
    const accepted = (item.answers || []).map(normalizeAnswer);
    const correct = accepted.includes(norm) && norm.length > 0;

    finishQuestion(correct ? 1 : 0, { yourAnswer: userVal, correctAnswer: (item.answers || [])[0] });

    input.disabled = true;
    document.getElementById('fb-check').disabled = true;
    input.style.borderColor = correct ? 'var(--good)' : 'var(--bad)';

    const feedbackEl = document.getElementById('feedback');
    const acceptedDisplay = escapeHtml((item.answers || []).join(' / '));
    feedbackEl.innerHTML = correct
      ? `<div class="feedback good"><strong>Correct.</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`
      : `<div class="feedback bad"><strong>Not quite \u2014 accepted answer: ${acceptedDisplay}</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`;

    appendNextButton(card, current + 1 === flat.length);
  });
}

/* ---------- Matching ---------- */
function renderMatching(card, item, badge){
  const rightShuffled = shuffle(item.pairs.map(p => p.right));

  card.innerHTML = `
    ${badge}
    <p class="q-prompt">${nl2br(item.question)}</p>
    <div class="matching" id="matching"></div>
    <div class="q-actions" style="justify-content:flex-start; margin-top:14px;">
      <button class="btn primary" id="match-check">Check matches</button>
    </div>
    <div id="feedback"></div>
  `;

  const matchEl = document.getElementById('matching');
  item.pairs.forEach((pair, i) => {
    const row = document.createElement('div');
    row.className = 'match-row';
    const options = rightShuffled.map((r, ri) => `<option value="${ri}">${escapeHtml(r)}</option>`).join('');
    row.innerHTML = `
      <div class="match-left">${escapeHtml(pair.left)}</div>
      <select class="match-select" data-index="${i}">
        <option value="" selected disabled>Choose a match&hellip;</option>
        ${options}
      </select>
    `;
    matchEl.appendChild(row);
  });

  document.getElementById('match-check').addEventListener('click', () => {
    const selects = document.querySelectorAll('.match-select');
    let allAnswered = true;
    selects.forEach(sel => { if(sel.value === '') allAnswered = false; });
    if(!allAnswered){
      alert('Match every item before checking.');
      return;
    }

    let allCorrect = true;
    selects.forEach(sel => {
      const leftIndex = Number(sel.dataset.index);
      const chosenRight = rightShuffled[Number(sel.value)];
      const correctRight = item.pairs[leftIndex].right;
      const rowCorrect = chosenRight === correctRight;
      if(!rowCorrect) allCorrect = false;
      sel.disabled = true;
      sel.parentElement.style.background = rowCorrect ? 'var(--good-bg)' : 'var(--bad-bg)';
      sel.parentElement.style.borderColor = rowCorrect ? 'var(--good)' : 'var(--bad)';
    });

    document.getElementById('match-check').disabled = true;
    finishQuestion(allCorrect ? 1 : 0);

    const feedbackEl = document.getElementById('feedback');
    feedbackEl.innerHTML = allCorrect
      ? `<div class="feedback good"><strong>All matched correctly.</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`
      : `<div class="feedback bad"><strong>A few pairs were off \u2014 see highlights above.</strong>${item.explanation ? escapeHtml(item.explanation) : ''}</div>`;

    appendNextButton(card, current + 1 === flat.length);
  });
}

/* ---------- Short answer (self-graded: SQL writing, dependency sets) ---------- */
function renderShortAnswer(card, item, badge){
  card.innerHTML = `
    ${badge}
    <p class="q-prompt">${nl2br(item.question)}</p>
    <textarea id="sa-input" class="sa-input" rows="4" placeholder="Write your answer here" spellcheck="false"></textarea>
    <div class="q-actions" style="justify-content:flex-start; margin-top:14px;">
      <button class="btn primary" id="sa-reveal">Show model answer</button>
    </div>
    <div id="feedback"></div>
  `;

  document.getElementById('sa-reveal').addEventListener('click', () => {
    document.getElementById('sa-input').disabled = true;
    document.getElementById('sa-reveal').remove();

    const feedbackEl = document.getElementById('feedback');
    const rubric = item.rubric || [];

    if(rubric.length === 0){
      renderBinarySelfGrade(card, feedbackEl, item);
      return;
    }

    feedbackEl.innerHTML = `
      <div class="feedback" style="background:#eef1f6; color:var(--ink);">
        <strong>Model answer</strong>
        ${answerBlock(item.modelAnswer, item)}
        ${item.explanation ? `<div style="margin-top:8px;">${escapeHtml(item.explanation)}</div>` : ''}
      </div>
      <div class="rubric-box">
        <div class="rubric-title">Compare your answer against the model above, then check off what you actually got right:</div>
        <div class="rubric-list" id="rubric-list">
          ${rubric.map((c, i) => `
            <label class="rubric-item">
              <input type="checkbox" data-rubric-index="${i}">
              <span>${escapeHtml(c)}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="q-actions" style="justify-content:flex-start; margin-top:14px;">
        <button class="btn primary" id="sa-score">Score my answer</button>
      </div>
    `;

    document.getElementById('sa-score').addEventListener('click', () => {
      const boxes = Array.from(document.querySelectorAll('#rubric-list input[type=checkbox]'));
      const checked = boxes.map(b => b.checked);
      const numChecked = checked.filter(Boolean).length;
      const fraction = numChecked / rubric.length;

      finishQuestion(fraction, {
        yourAnswer: document.getElementById('sa-input').value,
        correctAnswer: item.modelAnswer,
        selfGraded: true,
        rubric,
        checked
      });

      boxes.forEach(b => b.disabled = true);
      document.getElementById('sa-score').remove();

      const summary = document.createElement('div');
      summary.className = 'feedback ' + (fraction === 1 ? 'good' : fraction === 0 ? 'bad' : 'partial');
      summary.innerHTML = `<strong>Self-scored ${numChecked}/${rubric.length} on this question.</strong>`;
      feedbackEl.appendChild(summary);

      appendNextButton(card, current + 1 === flat.length);
    });
  });
}

/* Fallback for any short_answer question written without a rubric, and for a
 * SQL question whose engine never loaded -- so read whichever editor exists. */
function typedAnswer(){
  const el = document.getElementById('sa-input') || document.getElementById('sql-input');
  return el ? el.value : '';
}

function renderBinarySelfGrade(card, feedbackEl, item){
  feedbackEl.innerHTML = `
    <div class="feedback" style="background:#eef1f6; color:var(--ink);">
      <strong>Model answer</strong>
      ${answerBlock(item.modelAnswer, item)}
      ${item.explanation ? `<div style="margin-top:8px;">${escapeHtml(item.explanation)}</div>` : ''}
    </div>
    <div class="q-actions" style="justify-content:flex-start; margin-top:14px; gap:10px;">
      <button class="btn primary" id="sa-got-it">I had this right</button>
      <button class="btn ghost" id="sa-missed">I need to review this</button>
    </div>
  `;

  document.getElementById('sa-got-it').addEventListener('click', () => {
    finishQuestion(1, { yourAnswer: typedAnswer(), correctAnswer: item.modelAnswer, selfGraded: true });
    document.getElementById('sa-got-it').disabled = true;
    document.getElementById('sa-missed').disabled = true;
    appendNextButton(card, current + 1 === flat.length);
  });
  document.getElementById('sa-missed').addEventListener('click', () => {
    finishQuestion(0, { yourAnswer: typedAnswer(), correctAnswer: item.modelAnswer, selfGraded: true });
    document.getElementById('sa-got-it').disabled = true;
    document.getElementById('sa-missed').disabled = true;
    appendNextButton(card, current + 1 === flat.length);
  });
}

/* ---------- Live SQL (auto-graded against the practice database) ----------
 * The learner's query and the reference query both run against the same
 * database, and the two result sets are compared -- so any correct way of
 * writing it scores, and a wrong answer gets told *how* it differs.          */

function ensureDb(){
  if(!dbPromise){
    dbPromise = HarborDB.create((quizData && quizData.dbFile) || 'data/harborview.sql');
  }
  return dbPromise;
}

function renderSql(card, item, badge){
  card.innerHTML = `
    ${badge}
    <p class="q-prompt">${nl2br(item.question)}</p>
    ${item.hint ? `<div class="sql-hint"><strong>Hint</strong> ${escapeHtml(item.hint)}</div>` : ''}
    <details class="schema-panel">
      <summary>Tables you'll need</summary>
      <div class="schema-body" id="schema-body">Loading the schema&hellip;</div>
    </details>
    <textarea id="sql-input" class="sql-input" rows="6" spellcheck="false"
      placeholder="SELECT ..." autocomplete="off" autocapitalize="off"></textarea>
    <div class="sql-toolbar">
      <button class="btn ghost" id="sql-run" disabled>Run</button>
      <button class="btn primary" id="sql-check" disabled>Check answer</button>
      <span class="sql-status" id="sql-status">Starting the database&hellip;</span>
    </div>
    <div id="sql-out"></div>
    <div id="feedback"></div>
  `;

  const input = document.getElementById('sql-input');
  if(typeof SqlHL !== 'undefined') SqlHL.attach(input);
  const runBtn = document.getElementById('sql-run');
  const checkBtn = document.getElementById('sql-check');
  const statusEl = document.getElementById('sql-status');
  const outEl = document.getElementById('sql-out');
  const feedbackEl = document.getElementById('feedback');

  let session = null;
  let scored = false;

  ensureDb().then(s => {
    session = s;
    runBtn.disabled = false;
    checkBtn.disabled = false;
    statusEl.textContent = 'Ctrl+Enter runs your query.';
    document.getElementById('schema-body').innerHTML =
      SqlView.schemaHtml(s, item.tables || []);
  }).catch(err => {
    statusEl.textContent = '';
    outEl.innerHTML = `<div class="feedback bad"><strong>The SQL engine didn't load.</strong>${escapeHtml(err.message)}</div>`;
    // Don't strand the learner on a question they can no longer answer.
    appendSelfGradeFallback(card, item, feedbackEl);
  });

  function runOnly(){
    if(!session) return;
    const sql = input.value.trim();
    if(!sql){ outEl.innerHTML = '<div class="sql-empty">Type a query first.</div>'; return; }
    try{
      const res = session.exec(sql);
      outEl.innerHTML = SqlView.resultTable(res, { changes: session.changes() });
      statusEl.textContent = '';
    }catch(err){
      outEl.innerHTML = `<div class="sql-error"><strong>SQL error</strong> ${escapeHtml(err.message)}</div>`;
    }
  }

  runBtn.addEventListener('click', runOnly);
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); runOnly(); }
  });

  checkBtn.addEventListener('click', () => {
    if(!session) return;
    const sql = input.value.trim();
    if(!sql){ outEl.innerHTML = '<div class="sql-empty">Type a query first.</div>'; return; }

    const opts = {
      orderMatters: !!item.orderMatters,
      requireColumns: item.requireColumns || []
    };

    // A question with `verify` is an INSERT/UPDATE/DELETE: it's graded on the
    // state of the data afterwards, on throwaway copies of the database.
    if(item.verify){
      checkBtn.disabled = true;
      statusEl.textContent = 'Checking…';
      HarborDB.checkMutation(
        (quizData && quizData.dbFile) || 'data/harborview.sql',
        sql, item.solution, item.verify, opts
      ).then(verdict => {
        statusEl.textContent = '';
        settle(verdict, true);
      });
      return;
    }

    settle(HarborDB.check(session, sql, item.solution, opts), false);
  });

  function settle(verdict, isMutation){
    const sql = input.value.trim();
    outEl.innerHTML = verdict.error ? '' :
      (isMutation ? '<div class="sql-label">The data after your statement</div>' : '') +
      SqlView.resultTable(verdict.actual);

    if(!scored){
      scored = true;
      finishQuestion(verdict.ok ? 1 : 0, {
        yourAnswer: sql,
        correctAnswer: item.solution,
        sqlGraded: true,
        verdict: verdict.message
      });
      checkBtn.disabled = true;
      checkBtn.textContent = 'Checked';
    }

    feedbackEl.innerHTML = `
      <div class="feedback ${verdict.ok ? 'good' : 'bad'}">
        <strong>${verdict.ok ? 'Correct.' : 'Not there yet.'}</strong>${escapeHtml(verdict.message)}
      </div>
      <div class="feedback" style="background:#eef1f6; color:var(--ink);">
        <strong>One correct way to write it</strong>
        ${answerBlock(item.solution, item)}
        ${item.explanation ? `<div style="margin-top:8px;">${escapeHtml(item.explanation)}</div>` : ''}
      </div>
      <div class="sql-note">Your score for this question is recorded. Keep editing and hit
        <em>Run</em> as much as you like &mdash; it won't change it.</div>
    `;

    if(!document.getElementById('next-btn')){
      appendNextButton(card, current + 1 === flat.length);
    }
  }
}

/* If the engine can't be reached, the question still has to be answerable. */
function appendSelfGradeFallback(card, item, feedbackEl){
  const wrap = document.createElement('div');
  wrap.className = 'q-actions';
  wrap.style.justifyContent = 'flex-start';
  wrap.innerHTML = '<button class="btn primary" id="sql-fallback">Show the answer instead</button>';
  card.appendChild(wrap);
  document.getElementById('sql-fallback').addEventListener('click', () => {
    wrap.remove();
    renderBinarySelfGrade(card, feedbackEl, {
      modelAnswer: item.solution,
      explanation: item.explanation
    });
  });
}

/* ---------- Results ---------- */
function renderResults(){
  const total = flat.length;
  const earned = answers.reduce((sum, a) => sum + a.score, 0);
  const pct = Math.round((earned / total) * 100);

  let headline = "Nice work.";
  if(pct === 100) headline = "Perfect score.";
  else if(pct >= 80) headline = "Strong showing.";
  else if(pct >= 50) headline = "Getting there.";
  else headline = "Worth another pass.";

  appEl.innerHTML = `
    <div class="results">
      <div class="score-label">${escapeHtml(quizData.title || 'Quiz')} \u2014 results</div>
      <div class="score">${fmtScore(earned)}/${total}</div>
      <div class="score-label">${pct}% &middot; ${headline}</div>
      <div class="results-actions">
        <button class="btn primary" id="retry-btn">Retake quiz</button>
        <a class="btn ghost" href="index.html">Back to classes</a>
      </div>
    </div>
    <div class="review" id="review"></div>
  `;

  document.getElementById('retry-btn').addEventListener('click', startQuiz);

  const reviewEl = document.getElementById('review');
  answers.forEach(a => {
    const q = a.item;
    const tagClass = a.score === 1 ? 'good' : a.score === 0 ? 'bad' : 'partial';
    let tagText = a.score === 1 ? 'Correct' : a.score === 0 ? 'Incorrect' : 'Partial credit';
    if(a.score !== 1 && a.score !== 0 && a.detail && a.detail.checked){
      const numChecked = a.detail.checked.filter(Boolean).length;
      tagText = `Partial credit (${numChecked}/${a.detail.checked.length})`;
    }
    const item = document.createElement('div');
    item.className = 'review-item';

    let bodyHtml = '';
    if(a.detail && a.detail.rubric){
      const rows = a.detail.rubric.map((c, i) => `
        <div class="rubric-review-item ${a.detail.checked[i] ? 'checked' : 'unchecked'}">
          <span class="rubric-mark">${a.detail.checked[i] ? '\u2713' : '\u2717'}</span> ${escapeHtml(c)}
        </div>
      `).join('');
      bodyHtml = `
        ${answerBlock(a.detail.correctAnswer, q)}
        <div class="rubric-review">${rows}</div>
      `;
    } else if(a.detail && a.detail.sqlGraded){
      bodyHtml = `
        <div class="review-sub">What you wrote</div>
        ${answerBlock(a.detail.yourAnswer || '(nothing)', q, 'your-sql')}
        ${a.detail.verdict && !a.correct ? `<div class="review-answer">${escapeHtml(a.detail.verdict)}</div>` : ''}
        <div class="review-sub">One correct way to write it</div>
        ${answerBlock(a.detail.correctAnswer, q)}
      `;
    } else if(a.detail && a.detail.selfGraded){
      bodyHtml = answerBlock(a.detail.correctAnswer, q);
    } else if(a.detail){
      bodyHtml = `
        <div class="review-answer">Your answer: ${escapeHtml(a.detail.yourAnswer)}</div>
        ${!a.correct ? `<div class="review-answer">Correct answer: ${escapeHtml(a.detail.correctAnswer)}</div>` : ''}
      `;
    }

    item.innerHTML = `
      <span class="review-tag ${tagClass}">${tagText}</span>
      <div class="rq">${nl2br(q.question)}</div>
      ${bodyHtml}
      ${q.explanation ? `<div class="review-explain">${escapeHtml(q.explanation)}</div>` : ''}
    `;
    reviewEl.appendChild(item);
  });
}

init();
