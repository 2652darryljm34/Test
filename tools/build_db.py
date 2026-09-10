#!/usr/bin/env python3
"""
Generates data/harborview.sql -- the seed script for the Harborview Tool Library
practice database used by the SQL playground and the auto-graded SQL questions.

Deterministic: same seed in, same file out. Re-run after editing:

    python3 tools/build_db.py

The domain (a community tool-lending library) and every table/column name are
deliberately unrelated to the course's Sakila examples and to the homework
tables, so the practice here exercises the same SQL shapes on unfamiliar names.
"""

import datetime
import os
import random

SEED = 20256
rng = random.Random(SEED)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "harborview.sql")

# --------------------------------------------------------------------------
# Reference data (hand-curated so query results stay meaningful)
# --------------------------------------------------------------------------

REGIONS = [
    (1, "Northreach"),
    (2, "Cape Verity"),
    (3, "Ironbelt"),
    (4, "Sunder Flats"),
]

# (id, name, region_id) -- a deliberate mix of vowel- and consonant-final
# names, including two ending in "y" (a consonant for the usual vowel test).
LOCALITIES = [
    (1,  "Harborview",    1),
    (2,  "Millbrook",     1),
    (3,  "Alder Bay",     1),
    (4,  "Cinder Falls",  1),
    (5,  "Corva",         1),
    (6,  "Pelham",        2),
    (7,  "Westmarch",     2),
    (8,  "Sable Cove",    2),
    (9,  "Quarry Hollow", 2),
    (10, "Nettle Rise",   2),
    (11, "Thornfield",    3),
    (12, "Vantage",       3),
    (13, "Redlake",       3),
    (14, "Ironhaven",     3),
    (15, "Duskwater",     4),
    (16, "Larkspur",      4),
    (17, "Mesa Verde",    4),
    (18, "Bellamy",       4),
]

BRANCHES = [
    (1, "Harborview Main",    1,  "2016-03-14"),
    (2, "Millbrook Annex",    2,  "2018-07-02"),
    (3, "Pelham Depot",       6,  "2019-11-19"),
    (4, "Thornfield Outpost", 11, "2021-05-08"),
    (5, "Larkspur Shed",      16, "2023-01-23"),
]

# (id, given, surname, branch, supervisor, hired_on, hourly_rate)
STEWARDS = [
    (1,  "Marisol", "Vance",       1, None, "2016-03-14", 34.50),
    (2,  "Dev",     "Okonjo",      1, 1,    "2017-01-09", 28.75),
    (3,  "Priya",   "Raghavan",    2, 1,    "2018-07-02", 28.75),
    (4,  "Tomas",   "Kerrigan",    2, 3,    "2019-04-22", 22.00),
    (5,  "Nadia",   "Belmonte",    3, 2,    "2019-11-19", 22.00),
    (6,  "Owen",    "Strand",      3, 2,    "2020-06-15", 21.25),
    (7,  "Hazel",   "Quintero",    4, 3,    "2021-05-08", 21.25),
    (8,  "Rafael",  "Ibarra",      4, 3,    "2021-09-27", 20.50),
    (9,  "June",    "Whitlock",    5, 2,    "2023-01-23", 20.50),
    (10, "Camden",  "Fowler",      5, 2,    "2023-08-14", 19.75),
    (11, "Simone",  "Adeyemi",     1, 2,    "2024-02-05", 19.75),
    (12, "Bruno",   "Castellanos", 2, 3,    "2024-10-21", 19.00),
]

MAKERS = [
    (1,  "Ridgeline Tool Works",  "United States"),
    (2,  "Kestrel Machinery",     "Canada"),
    (3,  "Vosburg Werke",         "Germany"),
    (4,  "Tanaka Precision",      "Japan"),
    (5,  "Bandera Forge",         "Mexico"),
    (6,  "Northgale Industrial",  "United Kingdom"),
    (7,  "Aurelio Utensili",      "Italy"),
    (8,  "Solvang Hand Tools",    "Denmark"),
    (9,  "Pemberton and Sons",    "United Kingdom"),
    (10, "Halcyon Power",         "United States"),
    (11, "Zubiri Herramientas",   "Spain"),
    (12, "Meridian Garden Co",    "Canada"),
]

GROUPS = [
    (1, "Power Drilling"),
    (2, "Cutting and Sawing"),
    (3, "Yard and Garden"),
    (4, "Plumbing"),
    (5, "Measuring"),
    (6, "Automotive"),
    (7, "Painting and Finishing"),
    (8, "Ladders and Access"),
]

# (id, title, maker, replacement_cost, daily_fee, loan_days, mass_kg,
#  power_source, [group ids])
GADGETS = [
    (1,  "Hammer Drill Compact",        1,  189.00,  4.50, 7,  2.4, "Battery", [1]),
    (2,  "Hammer Drill Rotary",         3,  412.00,  9.00, 3,  5.8, "Corded",  [1]),
    (3,  "Impact Driver Kit",           1,  164.00,  4.00, 7,  1.6, "Battery", [1]),
    (4,  "Right Angle Drill",           10, 228.00,  5.50, 5,  2.9, "Corded",  [1]),
    (5,  "Core Drilling Rig",           3,  1350.00, 22.00, 2, 24.0, "Corded", [1]),
    (6,  "Circular Saw Worm Drive",     1,  246.00,  6.00, 5,  6.2, "Corded",  [2]),
    (7,  "Reciprocating Saw",           10, 175.00,  4.50, 7,  3.7, "Battery", [2]),
    (8,  "Jigsaw Barrel Grip",          3,  198.00,  4.50, 7,  2.5, "Corded",  [2]),
    (9,  "Miter Saw Sliding",           1,  489.00, 11.00, 3, 18.5, "Corded",  [2]),
    (10, "Table Saw Jobsite",           6,  655.00, 15.00, 3, 22.7, "Corded",  [2]),
    (11, "Tile Saw Wet Cut",            5,  310.00,  8.00, 3, 14.1, "Corded",  [2, 4]),
    (12, "Chainsaw Battery Series",     2,  289.00,  7.50, 5,  4.9, "Battery", [2, 3]),
    (13, "Chainsaw Gas Ranger",         2,  345.00,  8.50, 5,  6.3, "Gas",     [2, 3]),
    (14, "Pole Saw Telescoping",        12, 212.00,  5.50, 5,  5.4, "Battery", [3, 8]),
    (15, "Hedge Trimmer Dual Blade",    12, 158.00,  4.00, 7,  3.8, "Battery", [3]),
    (16, "Lawn Aerator Tow Behind",     12, 402.00, 10.00, 2, 31.0, "Manual",  [3]),
    (17, "Rototiller Rear Tine",        2,  790.00, 18.00, 2, 48.5, "Gas",     [3]),
    (18, "Leaf Blower Backpack",        2,  268.00,  6.50, 3,  9.2, "Gas",     [3]),
    (19, "Post Hole Auger",             5,  355.00,  9.00, 2, 16.8, "Gas",     [3]),
    (20, "Wheelbarrow Contractor",      9,  135.00,  3.00, 7, 17.2, "Manual",  [3]),
    (21, "Pipe Threader Handheld",      5,  520.00, 13.00, 3, 11.4, "Corded",  [4]),
    (22, "Drain Auger Drum Fed",        5,  298.00,  7.50, 3, 10.6, "Corded",  [4]),
    (23, "Pipe Wrench Set",             9,   96.00,  2.50, 7,  6.7, "Manual",  [4]),
    (24, "Soldering Torch Kit",         8,  118.00,  3.00, 5,  2.1, "Manual",  [4]),
    (25, "Press Fitting Tool",          3,  845.00, 19.00, 2,  4.3, "Battery", [4]),
    (26, "Laser Level Rotary",          4,  475.00, 11.00, 3,  3.1, "Battery", [5]),
    (27, "Laser Distance Meter",        4,  148.00,  3.50, 7,  0.2, "Battery", [5]),
    (28, "Thermal Imaging Camera",      4,  1180.00, 25.00, 2, 0.6, "Battery", [5]),
    (29, "Moisture Meter Pinless",      8,   88.00,  2.50, 7,  0.4, "Battery", [5]),
    (30, "Stud Finder Deep Scan",       8,   72.00,  2.00, 7,  0.3, "Battery", [5]),
    (31, "Torque Wrench Digital",       7,  204.00,  5.00, 5,  2.2, "Manual",  [6, 5]),
    (32, "Engine Hoist Folding",        7,  486.00, 12.00, 2, 52.0, "Manual",  [6]),
    (33, "Transmission Jack",           7,  392.00, 10.00, 2, 41.5, "Manual",  [6]),
    (34, "Battery Charger Rolling",     10, 268.00,  6.50, 3, 13.9, "Corded",  [6]),
    (35, "OBD Scan Console",            4,  330.00,  8.00, 3,  1.1, "Battery", [6]),
    (36, "Paint Sprayer Airless",       11, 512.00, 12.00, 3, 15.3, "Corded",  [7]),
    (37, "Heat Gun Variable",           11,  84.00,  2.50, 7,  0.9, "Corded",  [7]),
    (38, "Drywall Sander Pole",         11, 296.00,  7.50, 3,  4.6, "Corded",  [7]),
    (39, "Orbital Sander Random",       1,  126.00,  3.00, 7,  1.4, "Corded",  [7]),
    (40, "Floor Buffer Rotary",         6,  610.00, 14.00, 2, 38.6, "Corded",  [7]),
    (41, "Extension Ladder Fiberglass", 9,  340.00,  8.00, 3, 24.9, "Manual",  [8]),
    (42, "Scaffold Tower Section",      6,  455.00, 11.00, 2, 33.4, "Manual",  [8]),
    (43, "Step Platform Wide",          9,  118.00,  3.00, 7,  9.8, "Manual",  [8]),
    (44, "Drywall Lift Panel Hoist",    6,  420.00, 10.00, 2, 29.5, "Manual",  [8, 7]),
    (45, "Attic Ladder Installer",      9,  152.00,  4.00, 5,  7.3, "Manual",  [8]),
]

BLURBS = [
    "Checked and serviced after every loan. Eye protection required.",
    "Popular with weekend renovators; reserve early in spring.",
    "Comes in a hard case with the full accessory set.",
    "Heavy item -- bring a helper and a vehicle with a flat load bed.",
    "Requires a short safety walkthrough before first checkout.",
    "Battery and charger included; return both or a fee applies.",
    "Consumables such as blades and bits are not included.",
    "Best for small indoor jobs where noise matters.",
]

GIVEN_NAMES = [
    "Amara", "Bennett", "Clara", "Desmond", "Elena", "Farid", "Gemma", "Hugo",
    "Imani", "Jonas", "Kaveri", "Lucian", "Mira", "Nikolai", "Orla", "Pascal",
    "Quinn", "Rosalind", "Soren", "Tamsin", "Ulises", "Vera", "Wendell",
    "Xiomara", "Yusuf", "Zadie", "Adrian", "Beatriz", "Caleb", "Delphine",
    "Emory", "Fiona", "Gideon", "Halina", "Ines", "Jasper", "Kirsten",
    "Leonel", "Maeve", "Nadir", "Odalys", "Perrin", "Rhea", "Silas", "Thea",
    "Ursula", "Viggo", "Willa", "Yara", "Zeno", "Anwen", "Bodhi", "Cassian",
    "Dilara", "Everett", "Freya", "Gustav", "Hana", "Ivor", "Juno",
]

SURNAMES = [
    "Alderton", "Baptiste", "Calloway", "Dunmore", "Estrada", "Fairbanks",
    "Gallardo", "Hollis", "Ingram", "Jessup", "Kowalski", "Lindqvist",
    "Marchetti", "Nakamura", "Ostrowski", "Pettigrew", "Quiroga", "Ravenel",
    "Sandoval", "Thackeray", "Uriarte", "Vandermeer", "Wexler", "Yoshida",
    "Zeleny", "Ashworth", "Brannigan", "Corrigan", "Delacroix", "Ellsworth",
    "Fontaine", "Grimaldi", "Hargreaves", "Isaksson", "Jerome", "Kingsley",
    "Larrabee", "Montrose", "Nesbitt", "Ojeda", "Prentice", "Rousseau",
    "Stavros", "Tremblay", "Ulloa", "Verhoeven", "Whitaker", "Ximenes",
    "Yarborough", "Zarate", "Beaumont", "Cavanaugh", "Duquesne", "Erdmann",
    "Falconer", "Guillory", "Hawthorne", "Ivanov", "Jankowski", "Kilbride",
]

COURSES = [
    (1, "Shop Safety Basics",        1),
    (2, "Ladder and Fall Awareness", 1),
    (3, "Small Engine Handling",     0),
    (4, "Power Saw Certification",   1),
    (5, "Sprayer and Solvent Care",  0),
]

CONDITIONS = ["Excellent", "Good", "Fair", "Needs Service"]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def q(v):
    """Render a Python value as a SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return "%.2f" % v
    return "'" + str(v).replace("'", "''") + "'"


def add_days(iso, n):
    return (datetime.date.fromisoformat(iso) + datetime.timedelta(days=n)).isoformat()


def days_between(later, earlier):
    return (datetime.date.fromisoformat(later) - datetime.date.fromisoformat(earlier)).days


def insert(table, cols, rows):
    head = "INSERT INTO %s (%s) VALUES" % (table, ", ".join(cols))
    body = ",\n".join("  (%s)" % ", ".join(q(v) for v in r) for r in rows)
    return head + "\n" + body + ";"


# --------------------------------------------------------------------------
# Generated (transactional) data
# --------------------------------------------------------------------------

# --- patrons -------------------------------------------------------------
patrons = []
used = set()
for pid in range(1, 61):
    while True:
        gn = rng.choice(GIVEN_NAMES)
        sn = rng.choice(SURNAMES)
        if (gn, sn) not in used:
            used.add((gn, sn))
            break
    email = "%s.%s@harborviewtools.example" % (gn.lower(), sn.lower())
    loc = rng.choice(LOCALITIES)[0]
    joined = add_days("2022-01-05", rng.randint(0, 1180))
    active = 0 if rng.random() < 0.12 else 1
    patrons.append((pid, gn, sn, email, loc, joined, active))

# --- units (the physical copies of each catalog gadget) ------------------
units = []
uid = 0
for g in GADGETS:
    for _ in range(rng.choice([1, 2, 2, 3, 3, 4])):
        uid += 1
        units.append((
            uid,
            g[0],
            rng.choice(BRANCHES)[0],
            rng.choices(CONDITIONS, weights=[30, 45, 20, 5])[0],
            add_days("2021-02-01", rng.randint(0, 1500)),
        ))

# --- checkouts -----------------------------------------------------------
# A deliberate handful of patrons never borrow anything, so LEFT JOIN and
# NOT IN questions have something real to find.
never_borrowed = {7, 23, 41, 55, 60}
borrowers = [p[0] for p in patrons if p[0] not in never_borrowed]

checkouts = []
for cid in range(1, 281):
    unit = rng.choice(units)
    gadget = GADGETS[unit[1] - 1]
    loan_days = gadget[5]
    out_on = add_days("2024-03-01", rng.randint(0, 548))
    due_on = add_days(out_on, loan_days)
    if rng.random() < 0.065:
        returned = None                       # still out
    else:
        slip = rng.choices([0, 1, 2, 3, 5, 9], weights=[46, 20, 14, 10, 7, 3])[0]
        early = rng.randint(0, max(loan_days - 1, 1))
        returned = add_days(due_on, slip - early)
        if returned < out_on:
            returned = out_on
    checkouts.append((cid, unit[0], rng.choice(borrowers),
                      rng.choice([s[0] for s in STEWARDS]),
                      out_on, due_on, returned))

# --- ledger entries ------------------------------------------------------
ledger = []
eid = 0
for cid, unit_id, patron_id, steward_id, out_on, due_on, returned in checkouts:
    gadget = GADGETS[units[unit_id - 1][1] - 1]
    eid += 1
    ledger.append((eid, patron_id, steward_id, cid, "Loan fee",
                   round(gadget[4] * gadget[5], 2), out_on))
    if returned and returned > due_on:
        late = days_between(returned, due_on)
        eid += 1
        ledger.append((eid, patron_id, steward_id, cid, "Late fee",
                       round(min(late, 14) * 3.25, 2), returned))
    if returned and rng.random() < 0.04:
        eid += 1
        ledger.append((eid, patron_id, steward_id, cid, "Damage fee",
                       round(rng.uniform(12, 95), 2), returned))

# Annual dues are not tied to any checkout, so checkout_id is NULL there.
for p in patrons:
    if rng.random() < 0.75:
        eid += 1
        ledger.append((eid, p[0], rng.choice([s[0] for s in STEWARDS]), None,
                       "Membership dues", 40.00, add_days(p[5], rng.randint(0, 60))))

# --- course results ------------------------------------------------------
results = []
rid = 0
for p in patrons:
    for c in COURSES:
        if rng.random() < 0.42:
            rid += 1
            results.append((rid, p[0], c[0], rng.randint(52, 100),
                            add_days(p[5], rng.randint(1, 400))))

# --- gadget/group bridge -------------------------------------------------
group_map = [(g[0], grp) for g in GADGETS for grp in g[8]]


# --------------------------------------------------------------------------
# Emit
# --------------------------------------------------------------------------

HEADER = """-- ===========================================================================
-- Harborview Tool Library -- practice database
-- ---------------------------------------------------------------------------
-- A community tool-lending library. Members ("patrons") borrow physical
-- "units" of a catalog "gadget" from a "branch"; the staff are "stewards".
--
-- Generated by tools/build_db.py -- edit that script, not this file.
--
-- Written for SQLite (the browser runs it through sql.js) but kept to the SQL
-- subset this course teaches, so the same statements work in MySQL with little
-- or no change. TEXT columns are COLLATE NOCASE so string comparisons behave
-- the way they do under MySQL's default collation.
-- ===========================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE region (
  region_id    INTEGER PRIMARY KEY,
  region_name  TEXT COLLATE NOCASE NOT NULL UNIQUE
);

CREATE TABLE locality (
  locality_id    INTEGER PRIMARY KEY,
  locality_name  TEXT COLLATE NOCASE NOT NULL,
  region_id      INTEGER NOT NULL REFERENCES region(region_id)
);

CREATE TABLE branch (
  branch_id     INTEGER PRIMARY KEY,
  branch_label  TEXT COLLATE NOCASE NOT NULL,
  locality_id   INTEGER NOT NULL REFERENCES locality(locality_id),
  opened_on     TEXT NOT NULL
);

CREATE TABLE steward (
  steward_id     INTEGER PRIMARY KEY,
  given_name     TEXT COLLATE NOCASE NOT NULL,
  surname        TEXT COLLATE NOCASE NOT NULL,
  contact_email  TEXT COLLATE NOCASE NOT NULL,
  branch_id      INTEGER NOT NULL REFERENCES branch(branch_id),
  supervisor_id  INTEGER          REFERENCES steward(steward_id),
  hired_on       TEXT NOT NULL,
  hourly_rate    REAL NOT NULL
);

CREATE TABLE patron (
  patron_id      INTEGER PRIMARY KEY,
  given_name     TEXT COLLATE NOCASE NOT NULL,
  surname        TEXT COLLATE NOCASE NOT NULL,
  contact_email  TEXT COLLATE NOCASE NOT NULL,
  locality_id    INTEGER NOT NULL REFERENCES locality(locality_id),
  joined_on      TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE maker (
  maker_id     INTEGER PRIMARY KEY,
  maker_name   TEXT COLLATE NOCASE NOT NULL,
  home_region  TEXT COLLATE NOCASE NOT NULL
);

CREATE TABLE gadget (
  gadget_id         INTEGER PRIMARY KEY,
  gadget_title      TEXT COLLATE NOCASE NOT NULL,
  blurb             TEXT COLLATE NOCASE,
  maker_id          INTEGER NOT NULL REFERENCES maker(maker_id),
  replacement_cost  REAL    NOT NULL,
  daily_fee         REAL    NOT NULL,
  loan_days         INTEGER NOT NULL,
  mass_kg           REAL    NOT NULL,
  power_source      TEXT COLLATE NOCASE NOT NULL
);

CREATE TABLE gadget_group (
  group_id     INTEGER PRIMARY KEY,
  group_label  TEXT COLLATE NOCASE NOT NULL
);

-- Bridge (composite / associative) entity resolving the M:N between gadget
-- and gadget_group. Its primary key is the pair of foreign keys.
CREATE TABLE gadget_group_map (
  gadget_id  INTEGER NOT NULL REFERENCES gadget(gadget_id),
  group_id   INTEGER NOT NULL REFERENCES gadget_group(group_id),
  PRIMARY KEY (gadget_id, group_id)
);

CREATE TABLE unit (
  unit_id          INTEGER PRIMARY KEY,
  gadget_id        INTEGER NOT NULL REFERENCES gadget(gadget_id),
  branch_id        INTEGER NOT NULL REFERENCES branch(branch_id),
  condition_grade  TEXT COLLATE NOCASE NOT NULL,
  acquired_on      TEXT NOT NULL
);

CREATE TABLE checkout (
  checkout_id     INTEGER PRIMARY KEY,
  unit_id         INTEGER NOT NULL REFERENCES unit(unit_id),
  patron_id       INTEGER NOT NULL REFERENCES patron(patron_id),
  steward_id      INTEGER NOT NULL REFERENCES steward(steward_id),
  checked_out_on  TEXT NOT NULL,
  due_on          TEXT NOT NULL,
  returned_on     TEXT             -- NULL means the unit is still out
);

CREATE TABLE ledger_entry (
  entry_id     INTEGER PRIMARY KEY,
  patron_id    INTEGER NOT NULL REFERENCES patron(patron_id),
  steward_id   INTEGER NOT NULL REFERENCES steward(steward_id),
  checkout_id  INTEGER          REFERENCES checkout(checkout_id),
  entry_kind   TEXT COLLATE NOCASE NOT NULL,
  amount       REAL NOT NULL,
  posted_on    TEXT NOT NULL
);

CREATE TABLE safety_course (
  course_id      INTEGER PRIMARY KEY,
  course_title   TEXT COLLATE NOCASE NOT NULL,
  required_flag  INTEGER NOT NULL
);

CREATE TABLE course_result (
  result_id  INTEGER PRIMARY KEY,
  patron_id  INTEGER NOT NULL REFERENCES patron(patron_id),
  course_id  INTEGER NOT NULL REFERENCES safety_course(course_id),
  score_pct  INTEGER NOT NULL,
  taken_on   TEXT NOT NULL
);
"""

parts = [HEADER]
parts.append(insert("region", ["region_id", "region_name"], REGIONS))
parts.append(insert("locality", ["locality_id", "locality_name", "region_id"], LOCALITIES))
parts.append(insert("branch", ["branch_id", "branch_label", "locality_id", "opened_on"], BRANCHES))
parts.append(insert(
    "steward",
    ["steward_id", "given_name", "surname", "contact_email",
     "branch_id", "supervisor_id", "hired_on", "hourly_rate"],
    [(s[0], s[1], s[2], "%s.%s@harborviewtools.example" % (s[1].lower(), s[2].lower()),
      s[3], s[4], s[5], s[6]) for s in STEWARDS]))
parts.append(insert(
    "patron",
    ["patron_id", "given_name", "surname", "contact_email",
     "locality_id", "joined_on", "is_active"], patrons))
parts.append(insert("maker", ["maker_id", "maker_name", "home_region"], MAKERS))
parts.append(insert(
    "gadget",
    ["gadget_id", "gadget_title", "blurb", "maker_id", "replacement_cost",
     "daily_fee", "loan_days", "mass_kg", "power_source"],
    [(g[0], g[1], BLURBS[(g[0] - 1) % len(BLURBS)], g[2], g[3], g[4], g[5], g[6], g[7])
     for g in GADGETS]))
parts.append(insert("gadget_group", ["group_id", "group_label"], GROUPS))
parts.append(insert("gadget_group_map", ["gadget_id", "group_id"], group_map))
parts.append(insert("unit", ["unit_id", "gadget_id", "branch_id", "condition_grade", "acquired_on"], units))
parts.append(insert(
    "checkout",
    ["checkout_id", "unit_id", "patron_id", "steward_id",
     "checked_out_on", "due_on", "returned_on"], checkouts))
parts.append(insert(
    "ledger_entry",
    ["entry_id", "patron_id", "steward_id", "checkout_id",
     "entry_kind", "amount", "posted_on"], ledger))
parts.append(insert("safety_course", ["course_id", "course_title", "required_flag"], COURSES))
parts.append(insert(
    "course_result",
    ["result_id", "patron_id", "course_id", "score_pct", "taken_on"], results))

parts.append("""CREATE INDEX idx_checkout_patron ON checkout(patron_id);
CREATE INDEX idx_checkout_unit   ON checkout(unit_id);
CREATE INDEX idx_ledger_patron   ON ledger_entry(patron_id);
CREATE INDEX idx_unit_gadget     ON unit(gadget_id);""")

with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n\n".join(parts).rstrip() + "\n")

print("wrote", os.path.relpath(OUT, os.path.join(HERE, "..")))
print("  patrons=%d units=%d checkouts=%d ledger=%d results=%d group_map=%d"
      % (len(patrons), len(units), len(checkouts), len(ledger), len(results), len(group_map)))
