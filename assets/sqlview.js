/* ===========================================================================
 * SqlView -- the bits of SQL presentation the quiz page and the playground
 * both need: rendering a result set as a table, and rendering the schema.
 * Pure string building, no state.
 * =========================================================================== */
const SqlView = (function () {
  'use strict';

  const MAX_ROWS = 60;

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (s) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
    });
  }

  function cell(v) {
    if (v === null || v === undefined) return '<span class="sql-null">NULL</span>';
    if (v instanceof Uint8Array) return '<span class="sql-null">' + v.length + ' bytes</span>';
    return esc(v);
  }

  /** Render one { columns, values } result set. */
  function resultTable(res, opts) {
    opts = opts || {};
    const max = opts.maxRows || MAX_ROWS;

    if (!res) {
      return '<div class="sql-empty">Statement ran. It returned no rows' +
        (opts.changes ? ' (' + opts.changes + ' row' + (opts.changes === 1 ? '' : 's') +
          ' affected)' : '') + '.</div>';
    }
    if (!res.values.length) {
      return '<div class="sql-empty">0 rows.</div>';
    }

    const head = res.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('');
    const body = res.values.slice(0, max).map(function (row) {
      return '<tr>' + row.map(function (v) { return '<td>' + cell(v) + '</td>'; }).join('') + '</tr>';
    }).join('');

    const n = res.values.length;
    const caption = n > max
      ? 'Showing the first ' + max + ' of ' + n + ' rows.'
      : n + ' row' + (n === 1 ? '' : 's') + '.';

    return '<div class="sql-rowcount">' + caption + '</div>' +
      '<div class="sql-table-wrap"><table class="sql-table">' +
      '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /**
   * Render the schema as a set of tables with their columns, marking primary
   * and foreign keys the way an ERD would. `only` limits it to named tables.
   */
  function schemaHtml(session, only) {
    const names = session.tables().filter(function (t) {
      return !only || !only.length || only.indexOf(t) !== -1;
    });

    return names.map(function (t) {
      const fks = session.foreignKeys(t);
      const fkBy = {};
      fks.forEach(function (f) { fkBy[f.column] = f; });

      const rows = session.columns(t).map(function (c) {
        const f = fkBy[c.name];
        let mark = '';
        if (c.pk) mark = '<span class="key-tag pk">PK</span>';
        else if (f) mark = '<span class="key-tag fk">FK</span>';
        const ref = f ? ' <span class="fk-ref">&rarr; ' + esc(f.refTable) + '.' +
          esc(f.refColumn) + '</span>' : '';
        const name = c.pk ? '<strong>' + esc(c.name) + '</strong>'
          : (f ? '<em>' + esc(c.name) + '</em>' : esc(c.name));
        return '<li>' + mark + name + ' <span class="col-type">' + esc(c.type) + '</span>' +
          ref + '</li>';
      }).join('');

      return '<div class="schema-table">' +
        '<div class="schema-table-name">' + esc(t) +
        ' <span class="schema-count">' + session.rowCount(t) + ' rows</span></div>' +
        '<ul class="schema-cols">' + rows + '</ul></div>';
    }).join('');
  }

  return { resultTable: resultTable, schemaHtml: schemaHtml, esc: esc };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SqlView;
