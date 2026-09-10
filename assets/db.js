/* ===========================================================================
 * HarborDB -- the in-browser practice database.
 *
 * Loads SQLite (compiled to WebAssembly by sql.js) from a CDN, runs
 * data/harborview.sql into a fresh in-memory database, and grades a learner's
 * query by comparing its *result set* against a reference query's -- so any
 * correct formulation counts, not just one exact string.
 *
 * Nothing here needs a server: it works from GitHub Pages, or from any local
 * static server. Exposed as a global, matching the rest of assets/.
 * =========================================================================== */
const HarborDB = (function () {
  'use strict';

  const SQLJS_VERSION = '1.13.0';
  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/' + SQLJS_VERSION + '/';
  const DEFAULT_SEED = 'data/harborview.sql';

  let enginePromise = null;
  const seedPromises = Object.create(null);

  /* ---------- loading ---------- */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
  }

  function engine() {
    if (!enginePromise) {
      enginePromise = loadScript(CDN + 'sql-wasm.js')
        .then(function () {
          return window.initSqlJs({ locateFile: function (f) { return CDN + f; } });
        })
        .catch(function (err) {
          enginePromise = null;                 // let a later attempt retry
          throw new Error(
            'The SQL engine could not be downloaded. Check your connection and reload. (' +
            err.message + ')'
          );
        });
    }
    return enginePromise;
  }

  function seedText(path) {
    if (!seedPromises[path]) {
      seedPromises[path] = fetch(path).then(function (res) {
        if (!res.ok) throw new Error('Could not read ' + path + ' (' + res.status + ')');
        return res.text();
      }).catch(function (err) {
        delete seedPromises[path];
        throw err;
      });
    }
    return seedPromises[path];
  }

  /* ---------- MySQL-flavoured helpers ----------
   * The course teaches MySQL. SQLite covers most of the same ground, but a
   * few functions the lectures use by name are missing, so define them here.
   * Everything else (upper, lower, round, substr, count, sum, avg, min, max,
   * concat, LIKE, BETWEEN, IN, IS NULL, the joins) is already native.        */

  function isoParts(d) {
    if (d === null || d === undefined) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function toDays(d) {
    const p = isoParts(d);
    return p === null ? null : Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function addShims(db) {
    db.create_function('month', function (d) { const p = isoParts(d); return p && p.m; });
    db.create_function('year', function (d) { const p = isoParts(d); return p && p.y; });
    db.create_function('day', function (d) { const p = isoParts(d); return p && p.d; });

    db.create_function('datediff', function (a, b) {
      const x = toDays(a), y = toDays(b);
      return (x === null || y === null) ? null : x - y;
    });

    db.create_function('left', function (s, n) {
      return s === null ? null : String(s).slice(0, Math.max(0, n | 0));
    });
    db.create_function('right', function (s, n) {
      n = Math.max(0, n | 0);
      return s === null ? null : (n === 0 ? '' : String(s).slice(-n));
    });

    db.create_function('curdate', function () {
      const t = new Date();
      return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    });
    db.create_function('now', function () {
      const t = new Date();
      return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) +
        ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
    });
  }

  /* ---------- the session object ---------- */

  /**
   * Build a fresh, isolated database. Two callers get two databases, so a
   * DELETE typed into the playground can never affect a graded question.
   */
  function create(seedPath) {
    const path = seedPath || DEFAULT_SEED;
    return Promise.all([engine(), seedText(path)]).then(function (both) {
      const SQL = both[0], seed = both[1];

      function build() {
        const db = new SQL.Database();
        db.run(seed);
        addShims(db);
        return db;
      }

      let db = build();

      return {
        /** Run one or more statements; returns the LAST result set, or null. */
        exec: function (sql) {
          const out = db.exec(sql);
          return out.length ? out[out.length - 1] : null;
        },
        /** Run and return every result set (the playground shows all of them). */
        execAll: function (sql) { return db.exec(sql); },
        /** Rows affected by the most recent INSERT/UPDATE/DELETE. */
        changes: function () { return db.getRowsModified(); },
        /** Throw away all edits and start from the shipped data again. */
        reset: function () { db.close(); db = build(); },
        tables: function () {
          const res = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' " +
            "AND name NOT LIKE 'sqlite_%' ORDER BY name"
          );
          return res.length ? res[0].values.map(function (r) { return r[0]; }) : [];
        },
        columns: function (table) {
          const res = db.exec('PRAGMA table_info(' + quoteIdent(table) + ')');
          if (!res.length) return [];
          return res[0].values.map(function (r) {
            return { name: r[1], type: r[2], notNull: !!r[3], pk: !!r[5] };
          });
        },
        foreignKeys: function (table) {
          const res = db.exec('PRAGMA foreign_key_list(' + quoteIdent(table) + ')');
          if (!res.length) return [];
          return res[0].values.map(function (r) {
            return { column: r[3], refTable: r[2], refColumn: r[4] };
          });
        },
        rowCount: function (table) {
          const res = db.exec('SELECT count(*) FROM ' + quoteIdent(table));
          return res.length ? res[0].values[0][0] : 0;
        }
      };
    });
  }

  function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  /* ---------- grading ---------- */

  function normCell(v) {
    if (v === null || v === undefined) return '\u0000null';       // a sentinel no real value can collide with
    if (typeof v === 'number') {
      // Money and averages shouldn't fail on floating-point dust.
      return 'n:' + (Math.round(v * 10000) / 10000);
    }
    if (v instanceof Uint8Array) return 'b:' + Array.from(v).join(',');
    const s = String(v).trim();
    // A whole-number float and the same integer should compare equal.
    if (/^-?\d+(\.\d+)?$/.test(s)) return 'n:' + (Math.round(parseFloat(s) * 10000) / 10000);
    return 's:' + s.toLowerCase();
  }

  function normRow(row) { return row.map(normCell).join('\u0001'); }

  function sortedRows(result) {
    return result.values.map(normRow).sort();
  }

  function orderedRows(result) {
    return result.values.map(normRow);
  }

  function sameList(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /**
   * Compare a learner's result set against the reference one.
   *
   * opts.orderMatters    -- the question said "sort by ...", so row order counts
   * opts.requireColumns  -- column names (or aliases) the answer must expose
   *
   * Returns { ok, message } where message explains the *first* thing that is
   * off, phrased as a nudge rather than the answer.
   */
  function compare(actual, expected, opts) {
    opts = opts || {};

    if (!actual) {
      return { ok: false, message: 'That statement did not return a result set. A SELECT is what this question wants.' };
    }

    const wantCols = actual.columns.length;
    const haveCols = expected.columns.length;
    if (wantCols !== haveCols) {
      return {
        ok: false,
        message: 'Wrong number of columns: the answer needs ' + plural(haveCols, 'column') +
          ', yours returned ' + plural(wantCols, 'column') + '.'
      };
    }

    if (opts.requireColumns && opts.requireColumns.length) {
      const have = actual.columns.map(function (c) { return String(c).toLowerCase(); });
      const missing = opts.requireColumns.filter(function (c) {
        return have.indexOf(String(c).toLowerCase()) === -1;
      });
      if (missing.length) {
        return {
          ok: false,
          message: 'The result is missing a required column name: ' + missing.join(', ') +
            '. Alias it with AS.'
        };
      }
    }

    const actSorted = sortedRows(actual);
    const expSorted = sortedRows(expected);

    if (actual.values.length !== expected.values.length) {
      let hint = '';
      const actUniq = Array.from(new Set(actSorted));
      const expUniq = Array.from(new Set(expSorted));
      if (sameList(actUniq, expUniq) && actual.values.length > expected.values.length) {
        hint = ' Your rows are right but repeated — the question wants unique values, so try DISTINCT.';
      } else if (sameList(actUniq, expUniq)) {
        hint = ' You have the right distinct values but too few rows.';
      }
      return {
        ok: false,
        message: 'Wrong number of rows: expected ' + plural(expected.values.length, 'row') +
          ', yours returned ' + plural(actual.values.length, 'row') + '.' + hint
      };
    }

    if (!sameList(actSorted, expSorted)) {
      return {
        ok: false,
        message: 'Right shape, wrong data — the row count matches but the values do not. ' +
          'Check the WHERE clause and which columns you selected.'
      };
    }

    if (opts.orderMatters && !sameList(orderedRows(actual), orderedRows(expected))) {
      return {
        ok: false,
        message: 'Every row is correct, but they come back in the wrong order. Check your ORDER BY.'
      };
    }

    return { ok: true, message: 'Correct.' };
  }

  /**
   * Grade an INSERT / UPDATE / DELETE, which returns no rows of its own.
   *
   * The learner's statement and the reference statement each run against their
   * own fresh copy of the database; a `verify` SELECT then reads both copies
   * and the two readings are compared. So the question is graded on the effect
   * the statement had, not on how it was written -- and neither statement can
   * disturb the database the rest of the page is using.
   */
  function checkMutation(seedPath, userSql, referenceSql, verifySql, opts) {
    return Promise.all([create(seedPath), create(seedPath)]).then(function (pair) {
      const mine = pair[0], theirs = pair[1];

      try {
        mine.exec(userSql);
      } catch (err) {
        return { ok: false, error: true, message: 'SQL error: ' + err.message };
      }
      theirs.exec(referenceSql);

      let actual, expected;
      try {
        actual = mine.exec(verifySql);
        expected = theirs.exec(verifySql);
      } catch (err) {
        return { ok: false, error: true, message: 'Could not check the result: ' + err.message };
      }

      const verdict = compare(actual, expected, opts);
      if (!verdict.ok && !/column/i.test(verdict.message)) {
        verdict.message = 'The data does not look right afterwards. ' + verdict.message;
      }
      verdict.actual = actual;
      verdict.expected = expected;
      return verdict;
    });
  }

  /** Convenience: run the learner's SQL and the reference SQL, then compare. */
  function check(session, userSql, referenceSql, opts) {
    let actual;
    try {
      actual = session.exec(userSql);
    } catch (err) {
      return { ok: false, error: true, message: 'SQL error: ' + err.message };
    }
    const expected = session.exec(referenceSql);
    const verdict = compare(actual, expected, opts);
    verdict.actual = actual;
    verdict.expected = expected;
    return verdict;
  }

  return {
    create: create,
    compare: compare,
    check: check,
    checkMutation: checkMutation,
    version: SQLJS_VERSION
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HarborDB;
