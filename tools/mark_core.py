#!/usr/bin/env python3
"""
Marks which questions belong in the trimmed quiz, by setting "core": true.

Sizing mirrors the exam's own question counts, doubled:

  Part 1 theory  ~18  -> 37   (concepts 15, keys 12, SQL theory 10)
  Part 1 SQL      ~4  ->  8   (the eight assignment queries, re-skinned)
  Part 2 ERD     ~11  -> 21
  Part 3 normal.  ~6  -> 12
                        ----
                          78

Selection is driven by the lecture deck's highlighted runs and by the worked
examples in the assignment PDFs, the ERD practice document, the many-to-many
review page and the foreign-key diagram. Everything not marked core stays in
the pool and ships as a separate "Extra practice" quiz.

    python3 tools/mark_core.py
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

# Each entry is a distinctive substring of the question text.
KEEP = {
"10-concepts.json": [
    "Match each basic file-system term to its definition",          # data/field/record/table
    "Each file-system term has a database equivalent",              # attribute/entity instance/entity
    "classified by the degree of structure",                        # unstructured / structured
    "Match each anomaly to what goes wrong",                        # anomalies
    "Unnecessarily storing the same data at different places",      # data redundancy
    "practical significance of data dependence",                    # logical vs physical format
    "correctly separates the logical model from the physical model",
    "Which DBMS function stores the definitions of data elements",  # data dictionary
    "SQL stands for ______ Query Language",                         # Structured Query Language
    "four basic building blocks of a data model",                   # entity/attribute/relationship/constraint
    "translating business rules into data model components",        # business rules
    "Relationships are always bidirectional",                       # highlighted verbatim
    "The relational model is based on the relation",                # relation = table or entity
    "What does an RDBMS do that the raw relational model does not",
],
"20-keys.json": [
    "A key is one or more attributes that ______ other attributes", # determine
    "Match each kind of primary key to its description",            # natural / surrogate / composite
    "Match each integrity rule to its requirement",                 # entity + referential
    "Every table row must have a primary key",                     # highlighted verbatim
    "The absence of any data value in a column",                    # null
    "Match each catalogue-style term",                              # data dictionary / database schema
    "In entity relationship modeling, an M:N relationship is valid",# highlighted verbatim
    "How is a many-to-many relationship implemented",               # composite entity
    "What does a composite (bridge) entity contain",                # holds the PKs as FKs
    "One DIVISION operates many DEPARTMENTs",                       # the foreign-key diagram
    "An EMPLOYEE/PROJECT design shows that you CANNOT represent",   # the M:N review page
    "In an ASSIGNMENT bridge table holding emp_id and proj_id",     # same page, composite PK
],
"30-sql.json": [
    # --- theory: every highlighted SQL run ---
    "Match each SQL data definition command to its effect",         # CREATE / DROP TABLE
    "correctly contrasts DROP TABLE with DELETE FROM",
    "Match each SELECT clause to the job it performs",              # SELECT/FROM/WHERE/ORDER BY
    "produces a list of only unique values",                        # listing unique values
    "Match each special operator to what it tests",                 # BETWEEN / IN / LIKE
    "three logical operators SQL uses",                             # AND, OR, NOT
    "Match each aggregate function to what it computes",            # COUNT/MIN/MAX/SUM/AVG
    "Match each letter of CRUD",                                    # (C)(R)(U)(D)
    "with no WHERE clause",                                         # UPDATE ... [WHERE conditionlist]
    "Sabrina (9) reports to Sarah (1)",                             # recursive joins (highlighted twice)
    # --- the eight assignment queries, on the practice schema ---
    "pulls all of the rows from a single field",
    "pulls all of the rows from all of the fields",
    "plus a derived column that joins given_name and surname",
    "do NOT end with a vowel",
    "Sort by the last three characters of the surname",
    "Return hourly_rate, surname, branch_label and locality_name",
    "List the unique given_name and surname of every patron who took out a loan",
    "every gadget in the group whose group_label is 'Plumbing'",
],
"40-erd.json": [
    "marks each end of a relationship line with one of six connectors",  # the legend
    "what does a circle on a relationship line always add",
    "does not have to participate",                                  # optional participation
    "Match each business-rule phrase to the cardinality pair",
    "shown in bold and underlined at the top of the entity box",      # PK notation
    "shown in italics below the dividing line",                       # FK notation
    "What belongs in slot P1",
    "what belongs in slot P3",
    "which connector belongs on the DEPOT end",
    "which connector belongs on the CRATE end",
    "known as 'floaters', are not assigned to any WORKSHOP",          # the "rovers" rule
    "Which connector belongs on the PLAYER end",                      # youth-league doc
    "Which connector belongs on the TEAM end",                        # youth-league doc
    "A PLAYER must have a PARENT",                                    # youth-league M:N
    "where does the foreign key go for a 1:M relationship",
    "A VOLUNTEER can sign up for many SHIFTs",                        # M:N -> bridge
    "would most likely use a ______ primary key",                     # composite PK on the bridge
    "One of the STEWARDs manages each BRANCH",                        # the 1:1 "manages" rule
    "How is a recursive 1:M relationship",
    "An ERD models COURSE and CLASS",                                 # ERD practice doc
    "Business rules for a delivery firm",                             # combines all of it
],
"50-normalization.json": [
    "evaluating and correcting table structures to minimize data redundancies",
    "Match each normal form to its defining characteristic",
    "All valid relational tables satisfy the 1NF requirements",     # highlighted verbatim
    "Going from 1NF to 2NF removes",                                  # partial
    "Going from 2NF to 3NF removes",                                  # transitive
    "fully functionally dependent on attribute A",                    # functional dependence
    "single attribute can still contain a partial dependency",
    "CATERING_ORDER is in 1NF with the following columns",            # dependency set
    "Write the 2NF relational schemas",
    "Finish the job on CATERING_ORDER",                               # 3NF schemas
    "SEMINAR_ROSTER is in 1NF",                                       # second dependency set
    "Write the 3NF relational schemas for SEMINAR_ROSTER",
    "More tables require more I/O operations",                     # highlighted verbatim
],
}


def main():
    total_core = 0
    total_all = 0
    bad = 0

    for name, wanted in KEEP.items():
        path = os.path.join(SRC, name)
        doc = json.load(open(path, encoding="utf-8"))
        qs = doc["questions"]
        total_all += len(qs)

        for q in qs:
            q.pop("core", None)

        for needle in wanted:
            hits = [q for q in qs if needle in re.sub(r"\s+", " ", q.get("question", ""))]
            if len(hits) != 1:
                print("  %-22s %d matches for %r" % (name, len(hits), needle[:50]))
                bad += 1
                continue
            hits[0]["core"] = True

        n = sum(1 for q in qs if q.get("core"))
        total_core += n
        print("%-24s %3d core of %3d" % (name, n, len(qs)))

        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(doc, fh, indent=2, ensure_ascii=False)
            fh.write("\n")

    print("\n%d core, %d extra, %d total" % (total_core, total_all - total_core, total_all))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
