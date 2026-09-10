const chevronSvg = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

const params = new URLSearchParams(window.location.search);
const file = params.get('file');

const appEl = document.getElementById('app');
const loadingEl = document.getElementById('loading');
const subtitleEl = document.getElementById('guide-subtitle');

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

/* Minimal inline markup: **bold** and `code`, applied after escaping so raw text stays safe */
function formatInline(str){
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function nl2br(str){
  return formatInline(str).replace(/\n/g, '<br>');
}

function slugify(str){
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function init(){
  if(!file){
    loadingEl.textContent = 'No study guide specified.';
    loadingEl.classList.add('load-error');
    return;
  }
  try{
    const res = await fetch(file);
    if(!res.ok) throw new Error('Study guide file not found: ' + file);
    const data = await res.json();

    const sections = data.sections || [];
    if(sections.length === 0){
      throw new Error('This study guide has no content yet.');
    }

    document.title = data.title || 'Study Guide';
    subtitleEl.textContent = data.title || '';
    loadingEl.hidden = true;
    render(data);
  }catch(err){
    loadingEl.textContent = "Couldn't load this study guide. " + err.message;
    loadingEl.classList.add('load-error');
  }
}

function renderBlock(block){
  switch(block.type){
    case 'heading':
      return `<h3 id="${slugify(block.text)}" class="guide-h3">${formatInline(block.text)}</h3>`;
    case 'subheading':
      return `<h4 class="guide-h4">${formatInline(block.text)}</h4>`;
    case 'paragraph':
      return `<p class="guide-p">${nl2br(block.text)}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = (block.items || []).map(i => `<li>${formatInline(i)}</li>`).join('');
      return `<${tag} class="guide-list">${items}</${tag}>`;
    }
    case 'table': {
      const head = (block.headers || []).map(h => `<th>${formatInline(h)}</th>`).join('');
      const rows = (block.rows || []).map(row => `<tr>${row.map(c => `<td>${nl2br(c)}</td>`).join('')}</tr>`).join('');
      return `<div class="guide-table-wrap"><table class="guide-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case 'code':
      // Only blocks that declare themselves SQL get tokenized -- the guide also
      // uses code blocks for ASCII diagrams and dependency sets, which are not.
      if(block.lang === 'sql' && typeof SqlHL !== 'undefined'){
        return `<pre class="model-answer guide-code sql-hl"><code>${SqlHL.highlight(block.text)}</code></pre>`;
      }
      return `<pre class="model-answer guide-code">${escapeHtml(block.text)}</pre>`;
    case 'note':
      return `<div class="guide-note"><strong>${escapeHtml(block.label || 'Note')}</strong> ${nl2br(block.text)}</div>`;
    default:
      return '';
  }
}

function render(data){
  const total = data.sections.length;

  const sectionsHtml = data.sections.map((section, i) => {
    const headingBlocks = (section.blocks || []).filter(b => b.type === 'heading');
    const jumpNav = headingBlocks.length ? `
      <div class="guide-jumpnav">
        ${headingBlocks.map(b => `<a href="#${slugify(b.text)}">${escapeHtml(b.text)}</a>`).join('')}
      </div>
    ` : '';

    return `
      <details class="guide-section-card" open>
        <summary>
          <div class="guide-section-heading">
            <span class="guide-eyebrow">Section ${i + 1} of ${total}</span>
            <span class="guide-section-name">${escapeHtml(section.name)}</span>
          </div>
          ${chevronSvg}
        </summary>
        <div class="guide-section-body">
          ${jumpNav}
          ${(section.blocks || []).map(renderBlock).join('')}
        </div>
      </details>
    `;
  }).join('');

  appEl.innerHTML = `
    <div class="page-head" style="padding-top:20px;">
      <h1>${escapeHtml(data.title || 'Study Guide')}</h1>
      ${data.description ? `<p>${escapeHtml(data.description)}</p>` : ''}
      ${data.quizFile ? `<div class="q-actions" style="justify-content:flex-start; margin-top:14px;"><a class="btn primary" href="quiz.html?file=${encodeURIComponent(data.quizFile)}">Take the quiz &rarr;</a></div>` : ''}
    </div>

    <div class="guide-sections">
      ${sectionsHtml}
    </div>
  `;
}

init();
