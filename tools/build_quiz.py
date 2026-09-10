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

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(HERE, "questions")
OUT = os.path.join(ROOT, "data", "itd256-midterm-review.json")

META = {
    "title": "ITD 256 Midterm Review",
    "description": "Every topic on the midterm: database concepts, the relational model and keys, "
                   "SQL you actually run, ERD completion, and normalization.",
    "guideFile": "data/itd256-midterm-guide.json",
    "dbFile": "data/harborview.sql",
}

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
    r"|\bin the (?:example|scenario|question) above\b)",
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
        print("%-24s %3d questions  %s" % (name, len(qs), doc["name"]))

    if problems:
        print("\n%d problem(s):" % len(problems))
        for p in problems:
            print("  " + p)
        return 1

    out = dict(META)
    out["sections"] = sections
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print("\n%d questions -> %s" % (total, os.path.relpath(OUT, ROOT)))
    print("  " + "  ".join("%s=%d" % kv for kv in sorted(by_type.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
