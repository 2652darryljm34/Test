/* ===========================================================================
 * SqlHL -- SQL syntax highlighting.
 *
 * Two jobs:
 *   highlight(sql)        -> HTML for a read-only block (model answers, guide)
 *   attach(textarea)      -> live highlighting as you type, via an overlay
 *
 * Hand-rolled rather than pulled from a CDN: it is a few hundred bytes of
 * tokenizer, it works offline, and it means the editors keep working even when
 * the sql.js download fails.
 *
 * Everything emitted goes through esc() first. The editor overlay renders text
 * the learner typed, so nothing may reach innerHTML unescaped.
 * =========================================================================== */
const SqlHL = (function () {
  'use strict';

  const KEYWORDS = new Set(('select from where group by having order asc desc ' +
    'insert into values update set delete create table database view index alter drop add ' +
    'join inner left right full outer cross natural on using as and or not null is in ' +
    'between like escape distinct all union except intersect exists case when then else end ' +
    'primary key foreign references unique default check constraint collate cascade ' +
    'commit rollback begin transaction work limit offset pragma with recursive ' +
    'grant revoke truncate rename column if temp temporary autoincrement ' +
    'integer int text real varchar char number numeric date datetime decimal boolean blob'
  ).split(' '));

  // Names that are keywords in one place and functions in another (LEFT JOIN
  // vs. left(text, n)) are settled by whether a "(" follows.
  const FUNCTIONS = new Set(('count sum avg min max round upper lower length substr substring ' +
    'trim ltrim rtrim replace concat coalesce ifnull nullif abs cast typeof ' +
    'month year day datediff curdate now date time strftime julianday ' +
    'left right instr printf random group_concat total'
  ).split(' '));

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + esc(text) + '</span>';
  }

  /** Tokenize one SQL string into highlighted HTML. */
  function highlight(sql) {
    const src = String(sql == null ? '' : sql);
    let out = '';
    let i = 0;

    while (i < src.length) {
      const rest = src.slice(i);
      let m;

      // Line comment
      if ((m = /^--[^\n]*/.exec(rest))) {
        out += span('comment', m[0]); i += m[0].length; continue;
      }
      // Block comment
      if ((m = /^\/\*[\s\S]*?(\*\/|$)/.exec(rest))) {
        out += span('comment', m[0]); i += m[0].length; continue;
      }
      // String literal -- '' is an escaped quote inside one
      if ((m = /^'(?:[^']|'')*'?/.exec(rest))) {
        out += span('string', m[0]); i += m[0].length; continue;
      }
      // Quoted / backticked identifier
      if ((m = /^"(?:[^"]|"")*"?/.exec(rest)) || (m = /^`[^`]*`?/.exec(rest))) {
        out += span('ident-quoted', m[0]); i += m[0].length; continue;
      }
      // Number
      if ((m = /^\d+(?:\.\d+)?/.exec(rest))) {
        out += span('number', m[0]); i += m[0].length; continue;
      }
      // Word
      if ((m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(rest))) {
        const word = m[0];
        const lower = word.toLowerCase();
        const callsAhead = /^\s*\(/.test(rest.slice(word.length));
        let cls;
        if (FUNCTIONS.has(lower) && callsAhead) cls = 'func';
        else if (KEYWORDS.has(lower)) cls = 'keyword';
        else if (FUNCTIONS.has(lower)) cls = 'func';
        else cls = 'ident';
        out += span(cls, word); i += word.length; continue;
      }
      // Operators and punctuation
      if ((m = /^(?:<>|!=|>=|<=|\|\||[-+*/%=<>(),;.])/.exec(rest))) {
        out += span('op', m[0]); i += m[0].length; continue;
      }
      // Whitespace and anything else: pass through, escaped
      if ((m = /^\s+/.exec(rest))) {
        out += esc(m[0]); i += m[0].length; continue;
      }
      out += esc(src[i]); i += 1;
    }

    return out;
  }

  /** Wrap SQL in a highlighted <pre>, for read-only display. */
  function block(sql, extraClass) {
    return '<pre class="model-answer sql-hl' + (extraClass ? ' ' + extraClass : '') +
      '"><code>' + highlight(sql) + '</code></pre>';
  }

  /* ---------- live editor ----------
   * A textarea can't render markup, so the standard trick: put a <pre> behind
   * it holding the highlighted copy, make the textarea's own text transparent
   * (keeping its caret), and keep the two scrolled together. Both elements
   * carry identical metrics in CSS, or the characters drift apart.            */

  function paint(ta) {
    const pre = ta._sqlhl;
    if (!pre) return;
    // A trailing newline collapses in a <pre>, so the last line would lose its
    // height and the overlay would sit one line short.
    pre.innerHTML = highlight(ta.value) + '\n';
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }

  function attach(ta) {
    if (!ta || ta._sqlhl) return ta;

    const wrap = document.createElement('div');
    wrap.className = 'sql-editor';
    ta.parentNode.insertBefore(wrap, ta);

    const pre = document.createElement('pre');
    pre.className = 'sql-editor-hl';
    pre.setAttribute('aria-hidden', 'true');

    wrap.appendChild(pre);
    wrap.appendChild(ta);
    ta.classList.add('sql-input-live');
    ta._sqlhl = pre;

    ta.addEventListener('input', function () { paint(ta); });
    ta.addEventListener('scroll', function () {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    });

    paint(ta);
    return ta;
  }

  /** Repaint after setting .value from code (the playground's warm-ups). */
  function refresh(ta) { paint(ta); }

  return { highlight: highlight, block: block, attach: attach, refresh: refresh, esc: esc };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SqlHL;
