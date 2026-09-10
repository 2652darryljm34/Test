# Class Quiz Hub

A static site for sharing self-study quizzes with classmates via GitHub Pages. No build step to publish, no dependencies, no server — but the SQL questions run a **real database in the browser**, so a query is graded by actually executing it.

## What's here

| Path | What it is |
|---|---|
| `index.html` | Home page — lists every class with its guides, tools and quizzes (reads `classes.json`) |
| `quiz.html` | The quiz screen. Works for *any* quiz: `quiz.html?file=data/itd256-midterm-review.json` |
| `review.html` | The study guide screen. Same pattern: `review.html?file=data/itd256-midterm-guide.json` |
| `sql.html` | The SQL playground — a scratchpad over the practice database |
| `classes.json` | The registry of classes, guides, tools and quizzes. **The one file you edit to reorganize content.** |
| `data/*.json` | One file per quiz or guide |
| `data/harborview.sql` | The practice database (schema + seed). Generated — see `tools/build_db.py` |
| `assets/` | Shared CSS/JS |
| `tools/` | Content sources and checkers. Never fetched by the site; only used when authoring |

### assets/

| File | Role |
|---|---|
| `style.css` | Everything visual |
| `app.js` | Home page |
| `quiz.js` | The quiz engine — one render function per question type |
| `review.js` | The study guide renderer |
| `db.js` | Loads SQLite (via [sql.js](https://sql.js.org/)) from a CDN, seeds it, and grades queries by comparing result sets |
| `sqlview.js` | Renders result grids and the schema browser — shared by the quiz and the playground |
| `sql.js` | The playground page |

## The practice database

`data/harborview.sql` is a 14-table SQLite database for a fictional community tool-lending library. It is loaded into WebAssembly SQLite in the browser — nothing is installed and nothing is uploaded.

It is shaped like the examples used in class (a catalog, physical copies, loans, payments, an M:N bridge table, a self-referencing staff hierarchy) but shares no names with them, so practising against it exercises the reasoning rather than recall.

Regenerate it after editing the generator:

```bash
python3 tools/build_db.py
```

Two details worth knowing when writing questions against it:

- **`PRAGMA foreign_keys = ON`.** Referential integrity really is enforced — deleting a parent row that has children is refused. That's deliberate; it makes the concept demonstrable.
- **MySQL shims.** `assets/db.js` registers `MONTH()`, `YEAR()`, `DAY()`, `LEFT()`, `RIGHT()`, `DATEDIFF()`, `CURDATE()` and `NOW()`, so the MySQL forms used in the lectures work. `CONCAT()` is native in the bundled SQLite. TEXT columns are `COLLATE NOCASE` so string comparison behaves like MySQL's default collation.

## Question types

Every question can also include `category` (a short badge, e.g. `"Multiple Choice"`) and `explanation` (shown after answering and in the final review).

| type | fields | notes |
|---|---|---|
| `mc` | `options` (array), `correct` (index) | standard multiple choice |
| `tf` | `correct` (`true`/`false`) | rendered as True/False |
| `fill_blank` | `answers` (array of acceptable strings) | matched case-insensitively with `.,;:'"` stripped |
| `matching` | `pairs` (array of `{left, right}`) | learner matches via dropdown; right side is shuffled |
| `short_answer` | `modelAnswer`, `rubric` (array) | self-graded: reveals the model answer, learner checks off which rubric criteria they met, and gets that fraction as partial credit |
| `sql` | `solution`, plus the options below | **auto-graded by running it** |

### The `sql` type

The learner gets an editor, a **Run** button (free, unlimited) and a **Check answer** button (grades once). Their query and `solution` both run against the same database and the two *result sets* are compared — so any correct formulation scores, and a wrong one is told how it differs ("Right shape, wrong data", "Your rows are right but repeated — try DISTINCT", "Every row is correct, but they come back in the wrong order").

```json
{
  "type": "sql",
  "category": "SQL Writing",
  "question": "List every distinct power_source in the gadget table, alphabetically.",
  "tables": ["gadget"],
  "hint": "The result should have no repeats.",
  "solution": "SELECT DISTINCT power_source\nFROM gadget\nORDER BY power_source;",
  "orderMatters": true,
  "expectedRows": 4,
  "explanation": "DISTINCT collapses the 45 rows down to the four values that occur."
}
```

| field | meaning |
|---|---|
| `solution` | The reference query. Required. |
| `tables` | Which tables to show in the collapsible schema panel. Omit and it shows all 14. |
| `hint` | Optional nudge shown above the editor. |
| `orderMatters` | Set when the prompt asks for a sort. **Make sure the ordering is total** — add a tiebreaker column and say so in the prompt, or a correct answer can fail by chance. |
| `requireColumns` | Column names (or aliases) the answer must expose, e.g. `["full_name"]`. |
| `expectedRows` | Optional sanity check used by `tools/check_sql.py`. |
| `verify` | For INSERT/UPDATE/DELETE — a SELECT that reads the data back. |

**Grading an INSERT/UPDATE/DELETE.** A DML statement returns no rows, so it can't be compared directly. Give it a `verify` SELECT instead: the learner's statement and `solution` each run on their own throwaway copy of the database, then `verify` reads both copies and the readings are compared. The statement is graded on the effect it had, and neither copy touches the database the rest of the page is using.

```json
{
  "type": "sql",
  "question": "Raise daily_fee by exactly 2.00 for every gas-powered gadget.",
  "tables": ["gadget"],
  "solution": "UPDATE gadget\nSET daily_fee = daily_fee + 2.00\nWHERE power_source = 'Gas';",
  "verify": "SELECT gadget_id, power_source, daily_fee FROM gadget ORDER BY gadget_id"
}
```

If the CDN can't be reached, a `sql` question degrades to showing the model answer with a self-grade toggle rather than stranding the learner.

## Editing the ITD 256 question pool

At 233 questions, one file was unmanageable, so the sections live in `tools/questions/` and are stitched together in filename order:

```bash
python3 tools/build_quiz.py       # tools/questions/*.json -> data/itd256-midterm-review.json
```

Edit the section files, not `data/itd256-midterm-review.json` — it is overwritten. The build validates as it goes and **refuses to write** on any of these:

- an `mc` whose `correct` index is out of range, or with duplicate options
- a `matching` with duplicate right-hand values (which makes a pair ungradeable)
- a `fill_blank` whose answer normalizes to something unmatchable — e.g. `"1:1"` becomes `"11"`; use `mc` for those
- a `short_answer` with no rubric, or fewer than two criteria
- a `sql` with no solution, DML without `verify`, or `orderMatters` set on a solution with no `ORDER BY`
- **a question that refers to "the example above" or "the previous question"** — questions are shuffled within a section, so nothing may depend on its neighbours

Other classes can keep using a single hand-written file; nothing requires this layout.

## Checking your work

```bash
python3 tools/check_sql.py            # run every shipped SQL solution against the database
python3 tools/check_sql.py --explore  # print the schema and row counts
node tools/test_runtime.js            # exercise assets/db.js against the real sql.js build
```

`check_sql.py` catches a solution that errors, returns nothing, disagrees with its own `expectedRows`, or — for DML — changes nothing the `verify` query can see.

`test_runtime.js` downloads the same sql.js files the browser uses (cached in `tools/.cache/`) and checks the shims, the result-set grader's messages, session isolation, referential integrity, every playground warm-up, and that **every shipped `sql` question grades as correct** while a wrong answer is rejected with an explanation. Run it after touching `assets/db.js` or any SQL question.

## Adding a quiz to an existing class

1. Create `data/<class>-<topic>-review.json`. Quizzes are organized into **sections**, which always run in the order you list them (handy for mirroring an exam's structure), while questions are **shuffled within** each section.

```json
{
  "title": "ITD 256 Final Review",
  "description": "Optional one-line description.",
  "guideFile": "data/itd256-final-guide.json",
  "dbFile": "data/harborview.sql",
  "sections": [
    { "name": "Theory & SQL", "questions": [ /* ... */ ] }
  ]
}
```

`dbFile` is only needed if the quiz has `sql` questions; it defaults to `data/harborview.sql`.

2. Add an entry to that class's `quizzes` array in `classes.json`:

```json
{
  "id": "final-review",
  "title": "Final Review",
  "description": "Cumulative review for the final exam.",
  "file": "data/itd256-final-review.json"
}
```

## Adding a study guide

Long-form reference notes rather than question-and-answer. Create `data/<class>-<topic>-guide.json`, organized into **sections** of **blocks**:

| type | fields | notes |
|---|---|---|
| `heading` | `text` | also listed in that section's "jump to" nav |
| `subheading` | `text` | smaller heading, not in the jump nav |
| `paragraph` | `text` | plain text |
| `list` | `items` (array), optional `ordered: true` | bullets, or numbered |
| `table` | `headers` (array), `rows` (array of arrays) | every row must match the header count |
| `code` | `text` | monospace block |
| `note` | `text`, optional `label` | callout box |

Any `text` field supports `**bold**` and `` `code` ``. Top-level fields: `title`, `description`, and optionally `quizFile` (adds a "Take the quiz" button). The quiz can point back with `guideFile`.

Then add it to that class's `guides` array in `classes.json`.

## Adding an interactive tool

A `tools` entry links to any page in the repo:

```json
"tools": [
  { "id": "sql-playground", "title": "SQL Playground",
    "description": "A real database in your browser.", "href": "sql.html" }
]
```

## Adding a whole new class

Add an object to the `classes` array in `classes.json`. Classes with no quizzes still show up.

```json
{ "id": "cs201", "name": "CS 201", "fullName": "Data Structures", "quizzes": [] }
```

## Briefing an AI assistant to build a new quiz or guide

A model in a **new chat** has no memory of this project. Give it:

1. **This README** for the schema, and one existing pair as a working example of the house style: `data/itd256-midterm-review.json` and `data/itd256-midterm-guide.json`.
2. **The actual source material** — don't make it guess at course content:
   - The syllabus or exam study guide (part breakdown, question types, point weights, time limit — anything that shapes what's tested)
   - The lecture slides, and whether parts are **highlighted** — usually the professor's own signal of what's testable
   - Any real example questions the professor has shared. These reveal conventions worth copying exactly: this class's ERD questions use a specific six-symbol connector legend, which is why the ITD 256 material references it directly instead of inventing generic ERD questions.
3. **What to produce**: which class, the file names, quiz or guide or both, whether they cross-link, and roughly how much coverage. For a study tool, more coverage beats matching the exam's question count.
4. **The conventions that are easy to get wrong**:
   - Every `short_answer` needs a `rubric` of 2–4 concrete criteria — that's what turns self-grading into partial credit instead of a vague binary.
   - `matching` pairs need unique `right` values.
   - Avoid `fill_blank` answers that lose meaning once punctuation is stripped.
   - **Questions are shuffled**, so each one must stand alone. A question saying "same business rules as above" will be unanswerable half the time — restate the scenario in every question that needs it.
   - Don't invent facts or terminology beyond the material provided. A confidently wrong "fact" in a study tool is worse than a missing one.
   - Ask it to run `python3 tools/build_quiz.py`, `python3 tools/check_sql.py` and `node tools/test_runtime.js`, and to load the result locally before calling it done.

## Publishing on GitHub Pages

1. Push this folder to a GitHub repo.
2. **Settings → Pages**, source = your default branch, root folder.
3. Share `https://<username>.github.io/<repo>/`.

`.nojekyll` is already present so nothing is filtered out. The only external requests the site makes are the Google Fonts stylesheet and, on pages with SQL, the sql.js runtime from cdnjs.

## Local preview

The pages `fetch()` JSON and SQL files, so opening `index.html` from disk (`file://`) fails in most browsers. Serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
