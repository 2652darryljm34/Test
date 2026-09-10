const chevronSvg = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

async function loadClasses(){
  const listEl = document.getElementById('class-list');
  const emptyEl = document.getElementById('empty');
  try{
    const res = await fetch('classes.json');
    if(!res.ok) throw new Error('Could not load classes.json');
    const data = await res.json();
    const classes = data.classes || [];

    if(classes.length === 0){
      emptyEl.hidden = false;
      return;
    }

    listEl.innerHTML = classes.map((cls, i) => renderClass(cls, i)).join('');
  }catch(err){
    listEl.innerHTML = `<div class="load-error">Couldn't load classes.json. ${escapeHtml(err.message)}</div>`;
  }
}

function renderClass(cls, index){
  const guides = cls.guides || [];
  const quizzes = cls.quizzes || [];
  const count = quizzes.length;
  const countLabel = count === 1 ? '1 quiz' : `${count} quizzes`;

  const guideRows = guides.map(g => `
    <a class="quiz-row guide-row" href="review.html?file=${encodeURIComponent(g.file)}">
      <div>
        <div class="quiz-row-title"><span class="guide-badge">Study guide</span>${escapeHtml(g.title)}</div>
        ${g.description ? `<div class="quiz-row-desc">${escapeHtml(g.description)}</div>` : ''}
      </div>
      <div class="quiz-row-go">Read &rarr;</div>
    </a>
  `).join('');

  // Interactive extras (the SQL playground, say) -- anything with its own page.
  const toolRows = (cls.tools || []).map(t => `
    <a class="quiz-row tool-row" href="${escapeHtml(t.href)}">
      <div>
        <div class="quiz-row-title"><span class="guide-badge tool-badge">Interactive</span>${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="quiz-row-desc">${escapeHtml(t.description)}</div>` : ''}
      </div>
      <div class="quiz-row-go">Open &rarr;</div>
    </a>
  `).join('');

  const rows = quizzes.map(q => `
    <a class="quiz-row" href="quiz.html?file=${encodeURIComponent(q.file)}">
      <div>
        <div class="quiz-row-title">${escapeHtml(q.title)}</div>
        ${q.description ? `<div class="quiz-row-desc">${escapeHtml(q.description)}</div>` : ''}
      </div>
      <div class="quiz-row-go">Start &rarr;</div>
    </a>
  `).join('');

  return `
    <details class="class-card" ${index === 0 ? 'open' : ''}>
      <summary>
        <div class="class-heading">
          <span class="class-code">${escapeHtml(cls.name)}</span>
          ${cls.fullName ? `<span class="class-full">${escapeHtml(cls.fullName)}</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="class-count">${countLabel}</span>
          ${chevronSvg}
        </div>
      </summary>
      <div class="quiz-rows">
        ${guideRows}
        ${toolRows}
        ${rows || '<div class="quiz-row"><span class="quiz-row-desc">No quizzes yet.</span></div>'}
      </div>
    </details>
  `;
}

loadClasses();
