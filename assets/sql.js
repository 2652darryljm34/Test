/* ===========================================================================
 * The SQL playground page: a scratchpad over the Harborview practice database.
 *
 * Everything runs in the browser through sql.js, so this works on GitHub Pages
 * with no server and no account. The database is per-tab and in memory --
 * reloading, or hitting Reset, restores the shipped data.
 * =========================================================================== */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const seedFile = params.get('db') || 'data/harborview.sql';

  const loadingEl = document.getElementById('loading');
  const appEl = document.getElementById('app');
  const editor = document.getElementById('editor');
  const outEl = document.getElementById('out');
  const statusEl = document.getElementById('status');
  const schemaEl = document.getElementById('schema');
  const recipesEl = document.getElementById('recipes');

  let session = null;

  /* Warm-ups: one per idea the midterm covers, in the order the lectures
   * introduce them. Each is a starting point to edit, not an answer to copy. */
  const RECIPES = [
    ['Every column, every row',
     'SELECT *\nFROM gadget;'],
    ['Pick specific columns',
     'SELECT gadget_title, daily_fee, power_source\nFROM gadget;'],
    ['Filter with WHERE',
     "SELECT gadget_title, replacement_cost\nFROM gadget\nWHERE replacement_cost > 400;"],
    ['Sort the result',
     'SELECT gadget_title, mass_kg\nFROM gadget\nORDER BY mass_kg DESC;'],
    ['Unique values only',
     'SELECT DISTINCT power_source\nFROM gadget;'],
    ['Pattern match with LIKE',
     "SELECT gadget_title\nFROM gadget\nWHERE gadget_title LIKE '%saw%';"],
    ['A range with BETWEEN',
     "SELECT checkout_id, checked_out_on\nFROM checkout\nWHERE checked_out_on BETWEEN '2024-06-01' AND '2024-06-30';"],
    ['A list with IN',
     "SELECT maker_name, home_region\nFROM maker\nWHERE home_region IN ('Canada', 'Japan');"],
    ['Missing values with IS NULL',
     'SELECT checkout_id, unit_id, due_on\nFROM checkout\nWHERE returned_on IS NULL;'],
    ['Aggregate over all rows',
     'SELECT count(*) AS loans,\n       round(avg(amount), 2) AS avg_amount,\n       max(amount) AS biggest\nFROM ledger_entry;'],
    ['Group and count',
     'SELECT power_source, count(*) AS how_many\nFROM gadget\nGROUP BY power_source\nORDER BY how_many DESC;'],
    ['Filter groups with HAVING',
     'SELECT patron_id, count(*) AS loans\nFROM checkout\nGROUP BY patron_id\nHAVING count(*) >= 8\nORDER BY loans DESC;'],
    ['Join two tables (USING)',
     'SELECT locality_name, region_name\nFROM locality\nINNER JOIN region USING (region_id)\nORDER BY region_name, locality_name;'],
    ['Join two tables (ON)',
     'SELECT b.branch_label, l.locality_name\nFROM branch b\nINNER JOIN locality l ON b.locality_id = l.locality_id;'],
    ['Join three tables',
     "SELECT g.gadget_title, gg.group_label\nFROM gadget g\nINNER JOIN gadget_group_map m USING (gadget_id)\nINNER JOIN gadget_group gg USING (group_id)\nWHERE gg.group_label = 'Plumbing';"],
    ['Outer join finds the gaps',
     'SELECT p.patron_id, p.surname, count(c.checkout_id) AS loans\nFROM patron p\nLEFT JOIN checkout c ON c.patron_id = p.patron_id\nGROUP BY p.patron_id, p.surname\nHAVING loans = 0;'],
    ['Recursive (self) join',
     'SELECT worker.surname AS steward, boss.surname AS reports_to\nFROM steward worker\nINNER JOIN steward boss ON worker.supervisor_id = boss.steward_id\nORDER BY reports_to, steward;'],
    ['A derived column',
     "SELECT concat(given_name, ' ', surname) AS full_name, joined_on\nFROM patron\nORDER BY surname, given_name;"],
    ['INSERT a row (C in CRUD)',
     "INSERT INTO gadget_group (group_id, group_label)\nVALUES (9, 'Concrete and Masonry');"],
    ['UPDATE rows (U in CRUD)',
     "UPDATE gadget\nSET daily_fee = daily_fee * 1.10\nWHERE power_source = 'Gas';"],
    ['DELETE rows (D in CRUD)',
     'DELETE FROM gadget_group\nWHERE group_id = 9;'],
    ['Referential integrity, live',
     "-- The library will not let a loan point at a patron who doesn't exist.\nINSERT INTO checkout (checkout_id, unit_id, patron_id, steward_id, checked_out_on, due_on)\nVALUES (9001, 1, 9999, 1, '2025-09-01', '2025-09-08');"]
  ];

  function setStatus(msg) { statusEl.textContent = msg || ''; }

  function run() {
    if (!session) return;
    const sql = editor.value.trim();
    if (!sql) { outEl.innerHTML = '<div class="sql-empty">Type a query first.</div>'; return; }

    const started = performance.now();
    try {
      const results = session.execAll(sql);
      const ms = Math.max(1, Math.round(performance.now() - started));

      if (!results.length) {
        outEl.innerHTML = SqlView.resultTable(null, { changes: session.changes() });
      } else {
        outEl.innerHTML = results.map(function (r) {
          return SqlView.resultTable(r);
        }).join('');
      }
      setStatus('Ran in ' + ms + ' ms.');
      refreshSchemaCounts();
    } catch (err) {
      outEl.innerHTML = '<div class="sql-error"><strong>SQL error</strong> ' +
        SqlView.esc(err.message) + '</div>';
      setStatus('');
    }
  }

  function refreshSchemaCounts() {
    schemaEl.innerHTML = SqlView.schemaHtml(session);
  }

  function buildRecipes() {
    recipesEl.innerHTML = '';
    RECIPES.forEach(function (r) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recipe';
      b.textContent = r[0];
      b.addEventListener('click', function () {
        editor.value = r[1];
        SqlHL.refresh(editor);
        editor.focus();
        run();
        editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      recipesEl.appendChild(b);
    });
  }

  HarborDB.create(seedFile).then(function (s) {
    session = s;
    loadingEl.hidden = true;
    appEl.hidden = false;

    SqlHL.attach(editor);
    refreshSchemaCounts();
    buildRecipes();
    editor.value = RECIPES[0][1];
    SqlHL.refresh(editor);
    run();

    document.getElementById('run').addEventListener('click', run);
    document.getElementById('reset').addEventListener('click', function () {
      session.reset();
      refreshSchemaCounts();
      outEl.innerHTML = '';
      setStatus('Database reset to the shipped data.');
    });
    editor.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
  }).catch(function (err) {
    loadingEl.classList.add('load-error');
    loadingEl.textContent = "Couldn't start the database. " + err.message;
  });
})();
