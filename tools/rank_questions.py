#!/usr/bin/env python3
"""
Ranks the question pool against the professor's own emphasis, to decide which
questions belong in the trimmed quiz.

Two signals, both taken from the source material rather than taste:

  * HIGHLIGHTED terms. The list below was transcribed from the highlight runs
    in the lecture deck (the <a:highlight> spans in the .pptx). Highlighting is
    the professor's own marker of what is testable, so it outranks taste.
  * WORKED EXAMPLES from the assignment PDFs, the ERD practice document, the
    many-to-many review page and the foreign-key diagram -- the shapes the exam
    says it will reuse.

Prints each section ranked, with a * beside the questions currently marked
core, so the keep-list in tools/mark_core.py can be sanity-checked against the
score rather than trusted blind.

    python3 tools/rank_questions.py
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
SRC = os.path.join(HERE, "questions")

# Concepts the deck highlights, normalized to matchable phrases.
HIGHLIGHTED = [
    "data redundancy", "anomal", "field", "attribute", "record", "entity instance",
    "table", "entity", "unstructured", "structured", "cloud database",
    "logical", "physical", "data independence", "data dictionary",
    "structured query language", "sql",
    "relationship", "constraint", "business rule", "bidirectional", "chen",
    "relation", "rdbms", "object", "class",
    "determine", "primary key", "natural key", "surrogate", "composite key",
    "entity integrity", "null", "referential integrity", "foreign key",
    "database schema", "1:m", "one-to-many", "1:1", "one-to-one",
    "m:n", "many-to-many", "composite entity", "bridge", "associative",
    "cardinality", "conceptual",
    "normalization", "normal form", "1nf", "2nf", "3nf",
    "functional depend", "partial depend", "transitive depend",
    "minimize redundanc", "more tables",
    "ddl", "dml", "create database", "drop database", "create table", "drop table",
    "select", "from", "where", "order by", "date arithmetic", "distinct",
    "join using", "recursive join", "and, or", "logical operator",
    "between", " in ", "like", "aggregate", "count", "min", "max", "sum", "avg",
    "insert", "update", "delete", "crud",
]

# Shapes the source documents actually work through.
EXAMPLES = [
    "rover", "floater", "not assigned to any",          # optional participation
    "manages", "managed by", "runs each",               # 1:1
    "bridge", "composite primary key", "m:n", "many … many",
    "foreign key", "many side",
    "dependency set", "1nf", "2nf", "3nf", "determinant",
    "concat", "derived column", "full_name",
    "vowel", "last three characters",
    "distinct", "between", "three tables", "join",
    "select statement", "single field", "all of the fields",
]

# Topics the deck leaves un-highlighted -- real content, but not the emphasis.
DEPRIORITIZE = [
    "olap", "data warehouse", "business intelligence", "analytical database",
    "job title", "career", "database architect",
    "semistructured", "xml", "centralized", "distributed",
    "superkey", "candidate key", "secondary key",
    "bcnf", "boyce", "4nf", "multivalued",
    "group by", "having", "natural join", "outer join", "alias",
    "ansi data type", "commit", "rollback", "denormaliz",
    "inheritance", "class hierarchy", "parent class",
    "file system redux", "manual file system", "structural dependence",
]


def text_of(q):
    bits = [q.get("question", ""), q.get("explanation", "")]
    for p in q.get("pairs", []):
        bits.append(p.get("left", "")); bits.append(p.get("right", ""))
    bits.extend(q.get("options", []))
    bits.extend(q.get("answers", []))
    bits.append(q.get("solution", ""))
    bits.append(q.get("modelAnswer", ""))
    return " ".join(bits).lower()


def score(q):
    t = text_of(q)
    s = 0
    s += 3 * sum(1 for k in HIGHLIGHTED if k in t)
    s += 3 * sum(1 for k in EXAMPLES if k in t)
    s -= 4 * sum(1 for k in DEPRIORITIZE if k in t)
    if q.get("type") == "sql":
        s += 12                      # the exam has 3-5 of these; they are the point
    if q.get("type") == "short_answer" and q.get("category") == "Dependency Analysis":
        s += 10                      # Part 3 is dependency sets
    return s


def main():
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".json"):
            continue
        doc = json.load(open(os.path.join(SRC, name), encoding="utf-8"))
        ranked = sorted(
            ((score(q), i, q) for i, q in enumerate(doc["questions"])),
            key=lambda r: -r[0])
        keep = {i for i, q in enumerate(doc["questions"]) if q.get("core")}
        print("\n=== %s  (%s)  %d questions, %d marked core"
              % (name, doc["name"], len(doc["questions"]), len(keep)))
        for s, i, q in ranked:
            mark = "*" if i in keep else " "
            prompt = re.sub(r"\s+", " ", q.get("question", ""))[:78]
            print("%s %4d  [%-13s] %s" % (mark, s, q.get("type"), prompt))


if __name__ == "__main__":
    main()
