#!/usr/bin/env python3
"""
Loads data/harborview.sql into an in-memory SQLite database and runs every
reference query used by the auto-graded SQL questions, so a query that returns
nothing (or something uninteresting) is caught before it ships.

    python3 tools/check_sql.py            # run the shipped challenges
    python3 tools/check_sql.py --explore  # print schema + row counts
"""

import json
import os
import re
import sqlite3
import sys

# Windows consoles default to cp1252, which cannot print the em dashes and
# arrows that appear in the question text. Never let that crash a report.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")


def month(d):
    return int(d[5:7]) if d else None


def year(d):
    return int(d[0:4]) if d else None


def day(d):
    return int(d[8:10]) if d else None


def left(s, n):
    return None if s is None else str(s)[: int(n)]


def right(s, n):
    n = int(n)
    return None if s is None else (str(s)[-n:] if n > 0 else "")


def datediff(a, b):
    import datetime
    if a is None or b is None:
        return None
    return (datetime.date.fromisoformat(a[:10]) - datetime.date.fromisoformat(b[:10])).days


def connect():
    db = sqlite3.connect(":memory:")
    with open(os.path.join(ROOT, "data", "harborview.sql"), encoding="utf-8") as fh:
        db.executescript(fh.read())
    db.create_function("month", 1, month)
    db.create_function("year", 1, year)
    db.create_function("day", 1, day)
    db.create_function("left", 2, left)
    db.create_function("right", 2, right)
    db.create_function("datediff", 2, datediff)
    return db


def explore(db):
    print("sqlite", sqlite3.sqlite_version)
    tables = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    for t in tables:
        n = db.execute("SELECT count(*) FROM %s" % t).fetchone()[0]
        cols = [r[1] for r in db.execute("PRAGMA table_info(%s)" % t)]
        print("%-18s %5d  %s" % (t, n, ", ".join(cols)))


def collect_queries():
    """Pull every `sql` question's reference solution out of the quiz files."""
    found = []
    data_dir = os.path.join(ROOT, "data")
    for name in sorted(os.listdir(data_dir)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(data_dir, name), encoding="utf-8") as fh:
            doc = json.load(fh)
        for section in doc.get("sections", []):
            for q in section.get("questions", []):
                if q.get("type") == "sql" and q.get("solution"):
                    found.append(q | {"_src": name})
    return found


def main():
    if "--explore" in sys.argv:
        explore(connect())
        return 0

    queries = collect_queries()
    if not queries:
        print("no sql questions found yet")
        return 0

    bad = 0
    for q in queries:
        label = re.sub(r"\s+", " ", q.get("question", ""))[:66]
        sql = q["solution"]
        verify = q.get("verify")

        # DML gets its own throwaway database, then is read back through
        # `verify` -- exactly how assets/db.js grades it in the browser.
        db = connect()
        try:
            db.executescript(sql) if verify else None
            rows = db.execute(verify).fetchall() if verify else db.execute(sql).fetchall()
        except Exception as exc:                       # noqa: BLE001
            print("FAIL  %s\n      %s\n      %s" % (label, sql.replace("\n", " "), exc))
            bad += 1
            continue

        notes = []
        if not rows:
            notes.append("EMPTY RESULT")
        expected = q.get("expectedRows")
        if expected is not None and len(rows) != expected:
            notes.append("expected %d rows, got %d" % (expected, len(rows)))
        if q.get("orderMatters") and not re.search(r"order\s+by", sql, re.I):
            notes.append("orderMatters but no ORDER BY")

        # A DML question is only meaningful if it actually changed something.
        if verify:
            before = connect().execute(verify).fetchall()
            if before == rows:
                notes.append("the statement changed nothing that `verify` can see")

        bad += len(notes)
        print("%4d rows  %-66s%s" % (len(rows), label,
                                     ("  <-- " + "; ".join(notes)) if notes else ""))

    print("\n%d queries, %d problems" % (len(queries), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
