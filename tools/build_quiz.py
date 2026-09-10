#!/usr/bin/env python3
"""
Merges tools/questions/*.json into data/itd256-midterm-review.json.

The question pool is large enough that keeping it in one file makes it painful
to edit, so each exam section lives in its own file and this stitches them
together in filename order. Edit the section files, then:

    python3 tools/build_quiz.py

It also validates as it goes, which catches the mistakes that are invisible
until a learner hits the question:

  * an `mc` whose `correct` index is out of range
  * a `matching` with duplicate right-hand values (ungradeable)
  * a `fill_blank` whose answer normalizes to something unmatchable
  * a `short_answer` with no rubric, or a `sql` with no solution
  * a question that refers to "above" or "the previous question" -- questions
    are shuffled within a section, so nothing may depend on its neighbours
"""

import json
import os
import re
import sys

# Windows consoles default to cp1252, which cannot print the em dashes and
# arrows that appear in the question text. Never let that crash a report.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(HERE, "questions")
OUT = os.path.join(ROOT, "data", "itd256-midterm-review.json")

# Questions carrying "core": true make up the main quiz, sized to mirror the
# exam's own question counts doubled (see tools/mark_core.py). The rest ship as
# a separate, optional extra-practice quiz so nothing written is thrown away.
CORE = {
    "title": "ITD 256 Midterm Review",
    "description": "Database concepts, the relational model and keys, SQL you actually run, "
                   "ERD and Crow's Foot notation, and normalization.",
    "guideFile": "data/itd256-midterm-guide.json",
    "dbFile": "data/harborview.sql",
}
EXTRA = {
    "title": "ITD 256 Extra Practice",
    "description": "Everything outside the core review — broader coverage of the same "
                   "topics, for when you want more reps.",
    "guideFile": "data/itd256-midterm-guide.json",
    "dbFile": "data/harborview.sql",
}
OUT_EXTRA = os.path.join(ROOT, "data", "itd256-midterm-extra.json")

# Questions are shuffled inside a section, so a question that leans on its
# neighbour will make no sense when it comes up first.
# Deliberately narrow: "above 75" and "below the dividing line" are fine, while
# "the example above" and "same rules as above" are not.
DANGLING = re.compile(
    r"(?:\b(?:the|shown|listed|given|described|as|see)\s+(?:above|below)\b"
    r"|\b(?:above|below)\s*[:,.]"
    r"|\bprevious question\b"
    r"|\bpreceding\b"
    r"|\bas noted earlier\b"
    r"|\bsame (?:business )?rules as\b"
    r"|\bin the (?:example|scenario|question) above\b"
    # Wording that reads as a continuation of the question before it.
    r"|\bthat same\b"
    r"|\bcontinuing (?:with|from)\b"
    r"|\bfinish the job\b"
    r"|\bin the [A-Za-z_/]+ example\b"
    r"|\bearlier (?:example|question|table)\b)",
    re.I,
)

problems = []


def fault(where, msg):
    problems.append("%s: %s" % (where, msg))


def normalize(s):
    """Mirror of normalizeAnswer() in assets/quiz.js."""
    s = str(s).lower().strip()
    s = re.sub(r"[.,;:'\"]", "", s)
    return re.sub(r"\s+", " ", s)


def check(q, where):
    kind = q.get("type")
    prompt = q.get("question", "")

    if not prompt:
        fault(where, "no question text")

    # "above" is fine when the question carries its own legend inline.
    hit = DANGLING.search(prompt)
    if hit and "legend" not in prompt.lower() and "layout" not in prompt.lower():
        fault(where, "refers to %r, but questions are shuffled" % hit.group(0))

    if kind == "mc":
        opts = q.get("options") or []
        if len(opts) < 2:
            fault(where, "fewer than two options")
        if not isinstance(q.get("correct"), int) or not (0 <= q["correct"] < len(opts)):
            fault(where, "correct index %r is out of range" % q.get("correct"))
        if len(set(opts)) != len(opts):
            fault(where, "duplicate options")

    elif kind == "tf":
        if not isinstance(q.get("correct"), bool):
            fault(where, "tf needs a boolean `correct`")

    elif kind == "fill_blank":
        answers = q.get("answers") or []
        if not answers:
            fault(where, "no accepted answers")
        for a in answers:
            if not normalize(a):
                fault(where, "answer %r normalizes to nothing" % a)
            if re.fullmatch(r"[\d:.]+", str(a)):
                fault(where, "answer %r loses meaning once punctuation is stripped; "
                             "use mc instead" % a)

    elif kind == "matching":
        pairs = q.get("pairs") or []
        if len(pairs) < 2:
            fault(where, "fewer than two pairs")
        rights = [p["right"] for p in pairs]
        if len(set(rights)) != len(rights):
            fault(where, "duplicate right-hand values make a pair ungradeable")
        lefts = [p["left"] for p in pairs]
        if len(set(lefts)) != len(lefts):
            fault(where, "duplicate left-hand values")

    elif kind == "short_answer":
        if not q.get("modelAnswer"):
            fault(where, "no model answer")
        # answerLang only makes sense when the whole model answer is SQL --
        # tagging a mixed prose-and-SQL answer highlights the prose too.
        if q.get("answerLang") == "sql":
            first = (q.get("modelAnswer") or "").strip().split(None, 1)[:1]
            starters = {"select", "insert", "update", "delete", "create", "drop",
                        "alter", "with", "--"}
            if first and first[0].lower() not in starters:
                fault(where, "answerLang is 'sql' but the model answer starts with "
                             "%r, so it looks like prose" % first[0])
        elif q.get("answerLang"):
            fault(where, "unknown answerLang %r" % q["answerLang"])
        if not q.get("rubric"):
            fault(where, "no rubric, so it can only be self-graded pass/fail")
        elif len(q["rubric"]) < 2:
            fault(where, "a rubric needs at least two criteria to give partial credit")

    elif kind == "sql":
        if not q.get("solution"):
            fault(where, "no reference solution")
        if not q.get("tables"):
            fault(where, "no `tables` list, so the schema panel shows everything")
        sol = q.get("solution", "")
        is_dml = re.match(r"\s*(insert|update|delete)\b", sol, re.I)
        if is_dml and not q.get("verify"):
            fault(where, "an INSERT/UPDATE/DELETE needs a `verify` SELECT to be gradeable")
        if not is_dml and q.get("verify"):
            fault(where, "`verify` is only for INSERT/UPDATE/DELETE")
        if q.get("orderMatters") and not re.search(r"order\s+by", sol, re.I):
            fault(where, "orderMatters is set but the solution has no ORDER BY")
        if not q.get("orderMatters") and re.search(r"order\s+by", sol, re.I) and not is_dml:
            fault(where, "solution has ORDER BY but orderMatters is not set "
                         "(harmless, but the prompt probably asked for a sort)")

    else:
        fault(where, "unknown type %r" % kind)


def main():
    files = sorted(f for f in os.listdir(SRC) if f.endswith(".json"))
    if not files:
        print("no section files in %s" % SRC)
        return 1

    sections = []
    total = 0
    by_type = {}

    for name in files:
        with open(os.path.join(SRC, name), encoding="utf-8") as fh:
            try:
                doc = json.load(fh)
            except json.JSONDecodeError as exc:
                print("FAIL %s is not valid JSON: %s" % (name, exc))
                return 1

        qs = doc.get("questions", [])
        for i, q in enumerate(qs):
            check(q, "%s[%d]" % (name, i))
            by_type[q.get("type")] = by_type.get(q.get("type"), 0) + 1
        total += len(qs)
        sections.append({"name": doc["name"], "questions": qs})
        print("%-24s %3d core of %3d  %s"
              % (name, sum(1 for q in qs if q.get("core")), len(qs), doc["name"]))

    if problems:
        print("\n%d problem(s):" % len(problems))
        for p in problems:
            print("  " + p)
        return 1

    def emit(path, meta, want_core):
        """Write one quiz file, keeping section order and dropping the flag."""
        out = dict(meta)
        out["sections"] = []
        n = 0
        for s in sections:
            picked = [{k: v for k, v in q.items() if k != "core"}
                      for q in s["questions"] if bool(q.get("core")) == want_core]
            if picked:
                out["sections"].append({"name": s["name"], "questions": picked})
                n += len(picked)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        return n

    n_core = emit(OUT, CORE, True)
    n_extra = emit(OUT_EXTRA, EXTRA, False)

    if n_core == 0:
        print("\nNothing is marked core -- run tools/mark_core.py first.")
        return 1

    core_types = {}
    for s in sections:
        for q in s["questions"]:
            if q.get("core"):
                core_types[q["type"]] = core_types.get(q["type"], 0) + 1

    print("\n%3d core  -> %s" % (n_core, os.path.relpath(OUT, ROOT)))
    print("           " + "  ".join("%s=%d" % kv for kv in sorted(core_types.items())))
    print("%3d extra -> %s" % (n_extra, os.path.relpath(OUT_EXTRA, ROOT)))
    print("%3d in the pool" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
