/* ===========================================================================
 * Exercises assets/db.js against the real sql.js WebAssembly build -- the same
 * files the browser downloads -- so the shims and the result-set grader are
 * verified before anything ships.
 *
 *     node tools/test_runtime.js
 *
 * The CDN files are cached in tools/.cache/ on first run.
 * =========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const VERSION = '1.13.0';
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/' + VERSION + '/';

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) +
    ', expected ' + JSON.stringify(expected));
}

async function cached(file) {
  fs.mkdirSync(CACHE, { recursive: true });
  const local = path.join(CACHE, file);
  if (!fs.existsSync(local)) {
    const res = await fetch(CDN + file);
    if (!res.ok) throw new Error('download failed: ' + file + ' ' + res.status);
    fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  }
  return local;
}

/* Stand in for the browser APIs assets/db.js uses, then load it unmodified. */
async function loadHarborDB() {
  const jsPath = await cached('sql-wasm.js');
  await cached('sql-wasm.wasm');

  global.window = {};
  global.document = {
    head: { appendChild: function (el) { el.onload(); } },
    createElement: function () {
      return {
        set src(v) {
          // Same URL the browser would request; serve it from the cache, and
          // point Emscripten's locateFile at the cached .wasm as well (node
          // reads it from disk instead of fetching it).
          if (!v.startsWith(CDN)) throw new Error('unexpected script url ' + v);
          const realInit = require(jsPath);
          global.window.initSqlJs = function () {
            return realInit({ locateFile: function (f) { return path.join(CACHE, f); } });
          };
        },
        get src() { return CDN + 'sql-wasm.js'; }
      };
    }
  };

  const realFetch = global.fetch;
  global.fetch = async function (url) {
    if (/^https?:/.test(url)) return realFetch(url);
    const file = path.join(ROOT, url);
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    return { ok: true, status: 200, text: async () => fs.readFileSync(file, 'utf8') };
  };

  const mod = new Module('harbordb', null);
  mod.paths = Module._nodeModulePaths(path.join(ROOT, 'assets'));
  mod._compile(fs.readFileSync(path.join(ROOT, 'assets', 'db.js'), 'utf8'),
    path.join(ROOT, 'assets', 'db.js'));
  return mod.exports;
}

(async function main() {
  const HarborDB = await loadHarborDB();

  console.log('\nloading database...');
  const s = await HarborDB.create('data/harborview.sql');

  console.log('\nschema');
  const tables = s.tables();
  eq('table count', tables.length, 14);
  ok('checkout has returned_on', s.columns('checkout').some(c => c.name === 'returned_on'));
  ok('gadget_group_map has composite pk',
    s.columns('gadget_group_map').filter(c => c.pk).length === 2);
  ok('checkout declares foreign keys', s.foreignKeys('checkout').length === 3);
  eq('patron rows', s.rowCount('patron'), 60);

  console.log('\nMySQL shims');
  const one = sql => s.exec(sql).values[0][0];
  eq('MONTH()', one("SELECT month('2024-06-14')"), 6);
  eq('YEAR()', one("SELECT year('2024-06-14')"), 2024);
  eq('DAY()', one("SELECT day('2024-06-14')"), 14);
  eq('DATEDIFF()', one("SELECT datediff('2024-06-14','2024-06-01')"), 13);
  eq('LEFT()', one("SELECT left('Harborview',6)"), 'Harbor');
  eq('RIGHT()', one("SELECT right('Harborview',4)"), 'view');
  ok('CURDATE() (zero-arg shim)', /^\d{4}-\d{2}-\d{2}$/.test(one('SELECT curdate()')));
  ok('NOW() (zero-arg shim)', /^\d{4}-\d{2}-\d{2} /.test(one('SELECT now()')));
  eq('native concat()', one("SELECT concat('Harbor','view')"), 'Harborview');
  eq('COLLATE NOCASE equality', one("SELECT count(*) FROM region WHERE region_name='ironbelt'"), 1);
  eq('LIKE is case-insensitive', one("SELECT count(*) FROM gadget WHERE gadget_title LIKE '%saw%'"), 9);

  console.log('\ngrading');
  const REF = 'SELECT gadget_title FROM gadget WHERE power_source = \'Gas\' ORDER BY gadget_title';

  let v = HarborDB.check(s, REF, REF, { orderMatters: true });
  ok('identical query passes', v.ok, v.message);

  v = HarborDB.check(s,
    "SELECT g.gadget_title FROM gadget g WHERE g.power_source='gas' ORDER BY 1", REF,
    { orderMatters: true });
  ok('alias + different case + ORDER BY 1 passes', v.ok, v.message);

  v = HarborDB.check(s, "SELECT gadget_title FROM gadget WHERE power_source='Gas'", REF,
    { orderMatters: true });
  ok('unordered answer fails an ordered question', !v.ok, v.message);
  ok('  ...and says so', /order by/i.test(v.message), v.message);

  // Many patrons share a locality, so the un-DISTINCT version really does
  // repeat rows -- which is the mistake this message needs to catch.
  v = HarborDB.check(s,
    'SELECT locality_name FROM locality JOIN patron USING(locality_id)',
    'SELECT DISTINCT locality_name FROM locality JOIN patron USING(locality_id)', {});
  ok('duplicate rows are flagged', !v.ok, v.message);
  ok('  ...and suggests DISTINCT', /distinct/i.test(v.message), v.message);

  v = HarborDB.check(s, 'SELECT gadget_title, power_source FROM gadget', REF, {});
  ok('wrong column count is flagged', !v.ok, v.message);
  ok('  ...and says so', /column/i.test(v.message), v.message);

  v = HarborDB.check(s, 'SELECT gadget_title FROM gadget WHERE power_source=\'Corded\'', REF, {});
  ok('wrong rows are flagged', !v.ok, v.message);

  v = HarborDB.check(s, 'SELCT bad syntax', REF, {});
  ok('syntax error is reported, not thrown', !v.ok && v.error, v.message);

  v = HarborDB.check(s,
    "SELECT concat(given_name,' ',surname) AS full_name FROM patron",
    "SELECT given_name || ' ' || surname AS full_name FROM patron",
    { requireColumns: ['full_name'] });
  ok('CONCAT and || agree, alias satisfied', v.ok, v.message);

  v = HarborDB.check(s,
    "SELECT given_name || ' ' || surname FROM patron",
    "SELECT given_name || ' ' || surname AS full_name FROM patron",
    { requireColumns: ['full_name'] });
  ok('missing required alias is flagged', !v.ok, v.message);

  v = HarborDB.check(s, 'SELECT round(sum(amount),2) FROM ledger_entry',
    'SELECT sum(amount) FROM ledger_entry', {});
  ok('float dust does not fail a sum', v.ok, v.message);

  console.log('\nreferential integrity is actually enforced');
  const ri = await HarborDB.create('data/harborview.sql');
  let blocked = false;
  try { ri.exec('DELETE FROM patron WHERE patron_id = 1'); }
  catch (e) { blocked = /foreign key/i.test(e.message); }
  ok('deleting a parent row with children is refused', blocked);
  blocked = false;
  try { ri.exec('INSERT INTO branch (branch_id,branch_label,locality_id,opened_on) ' +
                "VALUES (91,'Nowhere',999,'2025-01-01')"); }
  catch (e) { blocked = /foreign key/i.test(e.message); }
  ok('inserting a dangling foreign key is refused', blocked);
  // Patron 41 never borrowed anything but still has dues and course results,
  // so the parent row only becomes deletable once its children are gone.
  ri.exec('DELETE FROM ledger_entry WHERE patron_id = 41');
  ri.exec('DELETE FROM course_result WHERE patron_id = 41');
  ri.exec('DELETE FROM patron WHERE patron_id = 41');
  eq('deleting children first lets the parent go', ri.rowCount('patron'), 59);

  console.log('\nisolation');
  const other = await HarborDB.create('data/harborview.sql');
  other.exec('DELETE FROM course_result');
  eq('deleting in one session leaves the other alone', s.rowCount('course_result'), 131);
  eq('...and does delete in its own', other.rowCount('course_result'), 0);
  other.reset();
  eq('reset() restores the shipped data', other.rowCount('course_result'), 131);

  console.log('\nDML round-trip (the CRUD the course teaches)');
  const t = await HarborDB.create('data/harborview.sql');
  t.exec("INSERT INTO region (region_id, region_name) VALUES (99,'Testland')");
  eq('INSERT', t.rowCount('region'), 5);
  t.exec("UPDATE region SET region_name='Renamed' WHERE region_id=99");
  eq('UPDATE', t.exec('SELECT region_name FROM region WHERE region_id=99').values[0][0], 'Renamed');
  eq('rows modified', t.changes(), 1);
  t.exec('DELETE FROM region WHERE region_id=99');
  eq('DELETE', t.rowCount('region'), 4);

  console.log('\nsyntax highlighting');
  const SqlHL = require(path.join(ROOT, 'assets', 'sqlhl.js'));
  const hl = SqlHL.highlight.bind(SqlHL);
  const strip = s => s.replace(/<[^>]*>/g, '');

  ok('keywords are tagged', /tok-keyword">SELECT</.test(hl('SELECT 1')));
  ok('keywords are case-insensitive', /tok-keyword">select</.test(hl('select 1')));
  ok('identifiers are not keywords', /tok-ident">gadget_title</.test(hl('SELECT gadget_title')));
  ok('strings are tagged', /tok-string">&#39;Gas&#39;</.test(hl("WHERE power_source = 'Gas'")));
  ok('numbers are tagged', /tok-number">2\.00</.test(hl('SET fee = 2.00')));
  ok('line comments are tagged', /tok-comment">-- note</.test(hl('-- note\nSELECT 1')));
  ok('block comments are tagged', /tok-comment">\/\* x \*\//.test(hl('/* x */ SELECT 1')));
  ok('function calls are tagged', /tok-func">count</.test(hl('SELECT count(*)')));

  // LEFT is a keyword in a join and a function in a call; "(" decides.
  ok('LEFT JOIN reads as a keyword', /tok-keyword">LEFT</.test(hl('FROM a LEFT JOIN b')));
  ok('left( reads as a function', /tok-func">left</.test(hl('SELECT left(name, 3)')));

  // The editor overlay renders typed text through innerHTML.
  const nasty = `SELECT '<img src=x onerror=alert(1)>' AS "a&b" -- <script>`;
  const out = hl(nasty);
  ok('no raw < survives', !/<(?!\/?span)/.test(out), out.slice(0, 120));
  ok('angle brackets are escaped', out.includes('&lt;img'));
  ok('ampersands are escaped', out.includes('a&amp;b'));
  ok('text round-trips unchanged', strip(out)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&') === nasty);

  // An unterminated string must not swallow the rest or drop characters.
  // Half-typed SQL is the normal state of an editor, so it must not break.
  ok('unterminated string is survivable',
    strip(hl("SELECT 'oops")).replace(/&#39;/g, "'").endsWith("'oops"));
  ok('empty input is fine', hl('') === '');

  let roundTrips = true;
  for (const q of ['SELECT * FROM gadget;', "UPDATE g SET f = f + 2.00 WHERE p = 'Gas';",
                   'SELECT a.x, b.y\nFROM a\nINNER JOIN b USING (id)\nORDER BY 1 DESC;']) {
    const back = strip(hl(q)).replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    if (back !== q) { roundTrips = false; console.log('  round-trip lost: ' + JSON.stringify(q)); }
  }
  ok('highlighting never loses characters', roundTrips);

  ok('block() wraps in a pre/code', /^<pre class="model-answer sql-hl"><code>/.test(SqlHL.block('SELECT 1')));

  // Every SQL string that ships must survive the tokenizer intact.
  const guide = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'itd256-midterm-guide.json'), 'utf8'));
  let marked = 0, guideOk = true;
  guide.sections.forEach(s => s.blocks.forEach(b => {
    if (b.type === 'code' && b.lang === 'sql') {
      marked++;
      const back = strip(hl(b.text)).replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      if (back !== b.text) { guideOk = false; console.log('  guide block altered: ' + b.text.slice(0, 40)); }
    }
  }));
  ok('guide SQL blocks are marked (' + marked + ')', marked > 0);
  ok('guide SQL blocks round-trip', guideOk);

  console.log('\nplayground warm-ups');
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'sql.js'), 'utf8');
  const m = /const RECIPES = (\[[\s\S]*?\n  \]);/.exec(src);
  ok('warm-up list is parseable', !!m);
  if (m) {
    const RECIPES = eval(m[1]);                          // a plain array literal
    const w = await HarborDB.create('data/harborview.sql');
    RECIPES.forEach(function (r) {
      const label = r[0], sql = r[1];
      // One warm-up exists precisely to be refused by the FK constraint.
      const shouldFail = /referential integrity/i.test(label);
      let threw = null;
      try { w.execAll(sql); } catch (e) { threw = e.message; }
      if (shouldFail) ok('"' + label + '" is refused, as intended', !!threw, 'it succeeded');
      else ok('"' + label + '" runs', !threw, threw);
    });
    eq('warm-up count', RECIPES.length, 22);
  }

  console.log('\nshipped quiz questions, graded through the real code path');
  const quizFiles = ['itd256-midterm-review.json', 'itd256-midterm-extra.json'];
  const sqlQs = [];
  let quiz = null;
  quizFiles.forEach(f => {
    const p = path.join(ROOT, 'data', f);
    if (!fs.existsSync(p)) return;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    quiz = quiz || doc;
    doc.sections.forEach(s => s.questions.forEach(q => { if (q.type === 'sql') sqlQs.push(q); }));
  });
  eq('sql questions found', sqlQs.length > 0, true);

  const graded = await HarborDB.create(quiz.dbFile);
  let allPass = true;
  let allMsgs = true;
  for (const q of sqlQs) {
    const opts = {
      orderMatters: !!q.orderMatters,
      requireColumns: q.requireColumns || []
    };
    let v;
    if (q.verify) {
      v = await HarborDB.checkMutation(quiz.dbFile, q.solution, q.solution, q.verify, opts);
    } else {
      v = HarborDB.check(graded, q.solution, q.solution, opts);
    }
    if (!v.ok) {
      allPass = false;
      console.log('  FAIL ' + q.question.slice(0, 60) + '\n       ' + v.message);
    }

    // A wrong answer must be rejected, and must say something useful about why.
    if (!q.verify) {
      const wrong = HarborDB.check(graded, 'SELECT region_name FROM region', q.solution, opts);
      if (wrong.ok || !wrong.message || wrong.message.length < 12) {
        allMsgs = false;
        console.log('  FAIL wrong answer not rejected for: ' + q.question.slice(0, 50));
      }
    }
  }
  ok('every shipped solution grades as correct (' + sqlQs.length + ')', allPass);
  ok('a wrong answer is rejected with an explanation', allMsgs);

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
