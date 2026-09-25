"""Import the two Radical Red Google Sheets into JSON for the app.

Usage:  python scripts/import_sheets.py [--offline]

Downloads both workbooks as XLSX (cached in scripts/cache/), walks their
visual grid layouts and writes:
  public/data/bosses.json      trainer order, level caps, every team block
  public/data/locations.json   encounters + every other obtain method
  public/data/sprite-keys.json display name -> sprite filename key
  scripts/cache/assets.json    external image URLs to vendor (fetch_sprites.py)
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request
from collections import OrderedDict

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from names import Resolver, local_asset_path  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", "cache")
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

SHEETS = {
    "bosses": "1g7PS5I1wh7w3zbaGV9_TWY1Oi4d-S1tU2f1YOE6zRa8",
    "locations": "1zOAcdEswTB5ps0olOmGyAJF1ebLWN_duDqyUdBvLtE8",
}
TEAM_TABS = [
    "Kanto Leaders", "Kanto Rematch", "Johto Leaders", "Rivals", "Team Rocket",
    "Mini Bosses", "Optional Bosses", "Indigo League", "Postgame",
]
MON_COLS = [5, 10, 15, 20, 25, 30]  # E J O T Y AD
BLOCK_HEIGHT = 20

warnings = []


def warn(msg):
    warnings.append(msg)
    print("  ! " + msg)


def fetch(name):
    path = os.path.join(CACHE, f"{name}.xlsx")
    if "--offline" in sys.argv and os.path.exists(path):
        return path
    url = f"https://docs.google.com/spreadsheets/d/{SHEETS[name]}/export?format=xlsx"
    print(f"downloading {name} ...")
    urllib.request.urlretrieve(url, path)
    return path


def s(v):
    """Cell value as stripped string ('' for None)."""
    if v is None:
        return ""
    if hasattr(v, "text"):  # ArrayFormula
        v = v.text
    t = str(v)
    t = re.sub(r"_x[0-9A-Fa-f]{4}_", "", t)  # openpyxl escapes for control chars
    return t.strip()


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def image_url(formula):
    m = re.search(r'IMAGE\("([^"]+)"', s(formula))
    return m.group(1) if m else None


def level_text(v):
    """Level ranges like 2-4 were auto-converted to dates by Sheets."""
    if isinstance(v, (dt.datetime, dt.date)):
        return f"{v.month}-{v.day}"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return s(v)


def parse_level(v):
    """'13.0' -> {'abs': 13};  'Highest Lv -2' -> {'offset': -2}."""
    t = s(v)
    n = num(t)
    if n is not None:
        return {"abs": n}
    m = re.match(r"(?:Highest\s*Lv|Player\s*Max\s*Level)\s*([+-]\s*\d+)?", t, re.I)
    if m:
        off = int(m.group(1).replace(" ", "")) if m.group(1) else 0
        return {"offset": off}
    return {"raw": t}


def parse_cap(v):
    """'16.0' -> [16], '28/36' -> [28, 36], '16+' -> [16] open."""
    t = s(v)
    open_ended = t.endswith("+")
    caps = [num(x) for x in t.rstrip("+").split("/") if num(x) is not None]
    return {"caps": caps, "open": open_ended, "raw": t}


# --------------------------------------------------------------------------
# Boss sheet
# --------------------------------------------------------------------------

def load_sprite_keys(wb_f):
    """Dex tab: col B display name, col C sprite key (darkbooker filename)."""
    ws = wb_f["Dex"]
    keys = OrderedDict()
    for r in range(3, ws.max_row + 1):
        name, key = s(ws.cell(r, 2).value), s(ws.cell(r, 3).value)
        if name and key:
            keys[name] = key.upper()
    return keys


PLUS_SPEED = {"Timid", "Hasty", "Jolly", "Naive"}
MINUS_SPEED = {"Brave", "Relaxed", "Quiet", "Sassy"}


def nature_mult(nature):
    if nature in PLUS_SPEED:
        return 1.1
    if nature in MINUS_SPEED:
        return 0.9
    return 1.0


def calc_speed(base, level, iv, mult):
    return int(int((2 * base + iv) * level / 100 + 5) * mult)


def solve_iv(base, level, mult, stat):
    hits = [iv for iv in range(32) if calc_speed(base, level, iv, mult) == stat]
    if not hits:
        return None
    for pref in (31, 0):
        if pref in hits:
            return pref
    return hits[-1]


SPEED_RE = re.compile(r"\(2\*[A-Z]+\d+\+(\d+)\)\*([A-Z]*\d+)\)/100\+5\)\),0\)\)\*([\d.]+)")


def parse_speed_formula(f, abs_level=None):
    m = SPEED_RE.search(s(f))
    if not m:
        return None
    lvl = m.group(2)
    level = int(lvl) if lvl.isdigit() else abs_level  # some tabs reference the level cell
    if level is None:
        return None
    return {"iv": int(m.group(1)), "level": level, "mult": float(m.group(3))}


def parse_block(wf, wv, r, assets):
    """One trainer block anchored at the row holding the trainer title in C."""
    title = s(wv.cell(r, 3).value)
    lines = [ln.strip() for ln in title.split("\n") if ln.strip()]
    portrait = image_url(wf.cell(r - 1, 3).value)
    if portrait:
        assets["trainers"].add(portrait)
    mons = []
    for c in MON_COLS:
        species = s(wv.cell(r, c).value)
        if not species:
            continue
        item = s(wv.cell(r + 6, c).value)
        item_icon = image_url(wf.cell(r + 6, c + 3).value)
        if item_icon:
            assets["items"].add(item_icon)
            item_icon = local_asset_path(item_icon)
        moves = []
        for k in range(7, 11):
            mv = s(wv.cell(r + k, c).value)
            if mv and mv != "-":
                icon = image_url(wf.cell(r + k, c + 3).value)
                mtype = None
                if icon:
                    mm = re.search(r"/types/gen\d+/(\w+)\.png", icon)
                    mtype = mm.group(1).capitalize() if mm else None
                moves.append({"name": mv, "type": mtype})
        stats = {}
        for i, key in enumerate(["hp", "atk", "def", "spa", "spd", "spe"]):
            label = s(wv.cell(r + 13 + i, c).value).lower()
            if label != key:
                warn(f"{wv.title} r{r} col{c} {species}: expected {key} at r{r + 13 + i}, got {label!r}")
            stats[key] = num(wv.cell(r + 13 + i, c + 1).value)
        speed_val = num(wv.cell(r + 19, c + 3).value)
        speed_raw = s(wv.cell(r + 19, c + 3).value)
        speed = parse_speed_formula(wf.cell(r + 19, c + 3).value, parse_level(wv.cell(r + 1, c).value).get("abs"))
        if speed is None and s(wv.cell(r + 19, c).value).upper().startswith("SPEED"):
            speed = {"raw": speed_raw}  # plain value; level/IV resolved after the block is read
        extras = []
        for k in range(20, 23):
            label = s(wv.cell(r + k, c).value)
            if not label or label.upper().startswith("BASE"):
                break
            extras.append({"label": label.rstrip(":"), "value": s(wv.cell(r + k, c + 3).value)})
        ability = s(wv.cell(r + 5, c).value)
        nature = s(wv.cell(r + 4, c).value)
        if speed and "iv" not in speed and speed_val is not None:
            hint = None
            for k in range(15, 22):
                m = re.search(r"LEVEL\s*(\d+)", s(wv.cell(r + k, 3).value), re.I)
                if m:
                    hint = int(m.group(1))
            speed["hintLevel"] = hint
        mons.append({
            "species": species,
            "level": parse_level(wv.cell(r + 1, c).value),
            "nature": nature,
            "ability": [a.strip() for a in ability.split("\n") if a.strip()],
            "item": item,
            "itemIcon": item_icon,
            "moves": moves,
            "base": stats,
            "speed": {"stat": speed_val, **(speed or {})},
            "extras": extras,
        })
    known = [m["speed"]["level"] for m in mons if "level" in m["speed"]]
    for m in mons:
        sp = m["speed"]
        if "iv" in sp or sp.get("stat") is None:
            continue
        level = (sp.pop("hintLevel", None) or m["level"].get("abs") or (known[0] if known else None)
                 or (100 if wv.title == "Postgame" else None))
        if level is None:
            warn(f"{wv.title} r{r} {m['species']}: speed {sp.get('raw')!r} has no level to solve against")
            continue
        mult = nature_mult(m["nature"])
        iv = solve_iv(m["base"]["spe"] or 0, level, mult, sp["stat"])
        if iv is None:
            warn(f"{wv.title} r{r} {m['species']}: speed {sp['stat']} not reproducible at Lv{level} (base {m['base']['spe']}, {m['nature']})")
            continue
        sp.update({"iv": iv, "level": level, "mult": mult, "inferred": True})
    portrait_local = local_asset_path(portrait) if portrait else None
    return {"tab": wv.title, "row": r, "titleLines": lines, "portrait": portrait_local, "mons": mons}


def is_anchor(wv, r):
    c3 = wv.cell(r, 3).value
    if not isinstance(c3, str) or not c3.strip() or c3.startswith("=") or c3.startswith("("):
        return False
    if not s(wv.cell(r, 5).value):
        return False
    lvl = parse_level(wv.cell(r + 1, 5).value)
    return "raw" not in lvl


def find_blocks(wf, wv, assets):
    blocks = []
    r = 1
    while r <= wv.max_row:
        if is_anchor(wv, r):
            blocks.append(parse_block(wf, wv, r, assets))
            r += BLOCK_HEIGHT
        else:
            r += 1
    prev_end = 0
    for b in blocks:
        notes, effects = [], []
        for rr in range(prev_end + 1, b["row"] - 1):
            for cc in (3, 5):
                t = s(wv.cell(rr, cc).value)
                if not t or t.startswith("=") or t == "SPEED STAT:":
                    continue
                if re.match(r"IF YOU'RE|LEVEL \d+", t):
                    continue
                if t.upper().startswith("BATTLE EFFECT"):
                    effects.append(t.split(":", 1)[1].strip() if ":" in t else t)
                elif t.startswith("(!") or re.search(r"IF RIVAL HAS", t, re.I):
                    notes.append(t)
        b["notes"] = notes
        b["battleEffects"] = effects
        starter = None
        for n in notes:
            m = re.search(r"IF RIVAL HAS (\w+)", n, re.I)
            if m:
                starter = m.group(1).capitalize()
        b["starter"] = starter
        prev_end = b["row"] + BLOCK_HEIGHT
    return blocks


STARTER_LINES = {
    "Bulbasaur": ("Bulbasaur", "Ivysaur", "Venusaur"),
    "Charmander": ("Charmander", "Charmeleon", "Charizard"),
    "Squirtle": ("Squirtle", "Wartortle", "Blastoise"),
}


def variant_label(b):
    """Short label distinguishing alternate blocks of one trainer order entry."""
    if b.get("starter"):
        return f"If rival has {b['starter']}"
    for n in b["notes"]:
        m = re.match(r"\(!+\)\s*(.+)", n)
        if m and len(m.group(1)) < 40 and not m.group(1).upper().startswith("IF RIVAL"):
            return m.group(1).strip().capitalize()
    if b["titleLines"] and b["titleLines"][0].upper() == "PARTNER":
        return "Partner " + b["titleLines"][-1].title()
    if any("RIVAL" in ln.upper() for ln in b["titleLines"]):
        for starter, line in STARTER_LINES.items():
            if any(m["species"].split("-")[0] in line for m in b["mons"]):
                b["starter"] = starter
                return f"If rival has {starter}"
    if b.get("variantOf"):
        return "Alternate"
    return None


def import_bosses():
    path = fetch("bosses")
    wb_f = openpyxl.load_workbook(path)
    wb_v = openpyxl.load_workbook(path, data_only=True)
    assets = {"trainers": set(), "items": set()}
    sprite_keys = load_sprite_keys(wb_f)
    resolver = Resolver(sprite_keys)

    all_blocks = {}
    by_anchor = {}
    for tab in TEAM_TABS:
        blocks = find_blocks(wb_f[tab], wb_v[tab], assets)
        for b in blocks:
            b["id"] = f"{tab.lower().replace(' ', '-')}-{b['row']}"
            by_anchor[(tab, b["row"])] = b
        all_blocks[tab] = blocks
        print(f"  {tab}: {len(blocks)} blocks, {sum(len(b['mons']) for b in blocks)} mons")

    # Level caps from the Main tab
    ws = wb_v["Main"]
    caps = []
    for r in range(1, ws.max_row + 1):
        t = s(ws.cell(r, 5).value)
        m = re.match(r"(.+?)\s*\((\d+)\)\s*$", t)
        if m and (t.startswith("Pre-") or t.startswith("Post")):
            caps.append({"label": m.group(1).strip(), "cap": int(m.group(2))})
    print(f"  level caps: {[c['cap'] for c in caps]}")

    # Trainer Order
    wo_f, wo_v = wb_f["Trainer Order"], wb_v["Trainer Order"]
    order = []
    for r in range(1, wo_v.max_row + 1):
        name = s(wo_v.cell(r, 4).value)
        cap = wo_v.cell(r, 6).value
        if not name or cap is None:
            continue
        link = wo_f.cell(r, 4).hyperlink
        loc = link.location if link else None
        anchor = None
        if loc:
            m = re.match(r"'?([^'!]+)'?!([A-Z]+)(\d+)", loc)
            if m:
                anchor = (m.group(1), int(m.group(3)) + 1)  # link hits the portrait row
        block = by_anchor.get(anchor) if anchor else None
        if block is None:
            last = name.split()[-1].upper()
            cands = [b for tab in TEAM_TABS for b in all_blocks[tab]
                     if last in " ".join(b["titleLines"]).upper() and not b.get("inOrder")]
            if len(cands) == 1:
                block = cands[0]
                warn(f"order r{r} {name}: no usable link ({loc!r}), matched by name to {block['id']}")
            else:
                warn(f"order r{r} {name}: unresolved link {loc!r} ({len(cands)} name matches)")
        entry = {
            "name": name,
            "location": s(wo_v.cell(r + 1, 4).value),
            "cap": parse_cap(cap),
            "optional": s(wo_v.cell(r - 1, 3).value).upper().startswith("(OPTIONAL"),
            "blockIds": [],
        }
        if block:
            entry["blockIds"].append(block["id"])
            block["inOrder"] = True
            block["entry"] = len(order)
        order.append(entry)
    print(f"  trainer order: {len(order)} entries")

    # Blocks not linked from the order are alternate teams / partners / starter
    # variants of the nearest linked block above them in the same tab.
    for tab in TEAM_TABS:
        if tab in ("Kanto Rematch", "Postgame"):
            continue
        current = None
        for b in all_blocks[tab]:
            if b.get("inOrder"):
                current = b
                continue
            if current is None:
                warn(f"{tab}: block {b['id']} precedes any linked block")
                continue
            order[current["entry"]]["blockIds"].append(b["id"])
            b["inOrder"] = True
            b["variantOf"] = current["id"]
    for tab in TEAM_TABS:
        for b in all_blocks[tab]:
            b["variant"] = variant_label(b)
            b.pop("entry", None)

    for tab in TEAM_TABS:
        for b in all_blocks[tab]:
            for m in b["mons"]:
                resolver.entry(m["species"])

    out = {
        "source": f"https://docs.google.com/spreadsheets/d/{SHEETS['bosses']}",
        "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "levelCaps": caps,
        "order": order,
        "tabs": TEAM_TABS,
        "blocks": [b for tab in TEAM_TABS for b in all_blocks[tab]],
    }
    with open(os.path.join(OUT, "bosses.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    return assets, resolver


# --------------------------------------------------------------------------
# Location sheet
# --------------------------------------------------------------------------

def source_label(wb_v, cell):
    """'=Source!$C5' -> the label one row up in the Source tab ('DAY')."""
    m = re.match(r"=Source!\$?([A-Z]+)\$?(\d+)", s(cell))
    if not m:
        return None
    src = wb_v["Source"]
    col = openpyxl.utils.column_index_from_string(m.group(1))
    return s(src.cell(int(m.group(2)) - 1, col).value)


def read_slots(wv, r0, rarity_col):
    """Encounter rows: rarity | sprite | name | level, from r0 down until blank."""
    slots = []
    r = r0
    while r <= wv.max_row:
        rate = wv.cell(r, rarity_col).value
        name = s(wv.cell(r, rarity_col + 2).value)
        if rate is None and not name:
            break
        if name:
            slots.append({"species": name, "rate": float(rate) if isinstance(rate, (int, float)) else None,
                          "level": level_text(wv.cell(r, rarity_col + 3).value)})
        r += 1
    return slots


def merge_slots(slots):
    merged = OrderedDict()
    for sl in slots:
        key = (sl["species"], sl["level"])
        if key in merged:
            merged[key]["rate"] = round((merged[key]["rate"] or 0) + (sl["rate"] or 0), 4)
        else:
            merged[key] = dict(sl)
    return list(merged.values())


def method_id(label):
    return {
        "DAY": "grass-day", "NIGHT": "grass-night", "DAY TIME": "grass-day", "NIGHT TIME": "grass-night",
        "OLD ROD": "old-rod", "GOOD ROD": "good-rod", "SUPER ROD": "super-rod", "SURFING": "surf",
        "GRASS": "grass",
    }.get(label.upper(), label.lower().replace(" ", "-"))


def import_locations(resolver):
    path = fetch("locations")
    wb_f = openpyxl.load_workbook(path)
    wb_v = openpyxl.load_workbook(path, data_only=True)
    enc = []
    loc_order = []

    def add(location, method, slots, note=None):
        if not slots:
            return
        if location not in loc_order:
            loc_order.append(location)
        e = {"location": location, "method": method, "slots": merge_slots(slots)}
        if note:
            e["note"] = note
        enc.append(e)

    # Grass & Caves: header rows hold '=Source!$C5' (DAY) / '=Source!$C9' (NIGHT) in the rarity col
    wf, wv = wb_f["Grass & Caves"], wb_v["Grass & Caves"]
    for r in range(1, wv.max_row + 1):
        label = source_label(wb_v, wf.cell(r, 3).value)
        if not label:
            continue
        c = 3
        while c <= wv.max_column:
            name = s(wv.cell(r, c + 1).value)
            if name:
                add(name.title(), method_id(label), read_slots(wv, r + 2, c))
            c += 5
    print(f"  grass & caves: {len(enc)} tables")

    # Fishing & Surfing: method in D of header row, locations at G+5k, rarity at F+5k
    wv = wb_v["Fishing & Surfing"]
    rod_notes = {}
    n0 = len(enc)
    for r in range(1, wv.max_row + 1):
        label = s(wv.cell(r, 4).value)
        if label.upper() not in ("OLD ROD", "GOOD ROD", "SUPER ROD", "SURFING"):
            continue
        note = s(wv.cell(r + 1, 3).value).lstrip("- ").strip()
        if note:
            rod_notes[method_id(label)] = note
        c = 6
        while c <= wv.max_column:
            name = s(wv.cell(r, c + 1).value)
            if name:
                add(name.title(), method_id(label), read_slots(wv, r + 2, c))
            c += 5
    print(f"  fishing & surfing: {len(enc) - n0} tables")

    # Safari Zone: zone title in C, method headers next row at D+5k
    wv = wb_v["Safari Zone"]
    n0 = len(enc)
    for r in range(1, wv.max_row + 1):
        zone = s(wv.cell(r, 3).value)
        if "ZONE" not in zone.upper() or not s(wv.cell(r + 1, 4).value):
            continue
        location = "Safari Zone " + zone.title()
        c = 3
        while c <= wv.max_column:
            label = s(wv.cell(r + 1, c + 1).value)
            if label:
                add(location, method_id(label), read_slots(wv, r + 3, c))
            c += 5
    print(f"  safari: {len(enc) - n0} tables")

    # Statics & Special
    wv = wb_v["Statics & Special Pokemon"]
    statics = []
    for r in range(1, wv.max_row + 1):
        name, text = s(wv.cell(r, 4).value), s(wv.cell(r, 6).value)
        if name and text and name.upper() != "POKEMON":
            m = re.match(r"Lv\.?\s*(\S+)\s*-\s*(.*)", text, re.S)
            statics.append({"species": name, "level": m.group(1) if m else None,
                            "text": (m.group(2) if m else text).strip()})
    print(f"  statics: {len(statics)}")

    # Raid Dens
    wv = wb_v["Raid Dens"]
    raids = []
    raid_notes = []
    for r in range(1, wv.max_row + 1):
        t = s(wv.cell(r, 3).value)
        if t.startswith("- ") or re.match(r"\d Gym Badge|After Entering", t):
            raid_notes.append(t.lstrip("- ").strip())
        m = re.match(r"--\s*(.+?)\s*--\s*(★*)", t)
        if not m:
            continue
        loc, stars = m.group(1).strip(), len(m.group(2))
        mons = []
        for c in (3, 8, 13, 18, 23):
            name = s(wv.cell(r + 1, c).value)
            if not name:
                continue
            drops = []
            rr = r + 3
            while rr <= wv.max_row and s(wv.cell(rr, c + 1).value):
                item = s(wv.cell(rr, c + 1).value)
                rate = wv.cell(rr, c + 3).value
                if item not in ("—", "-"):
                    drops.append({"item": item, "rate": float(rate) if isinstance(rate, (int, float)) else None})
                rr += 1
            mons.append({"species": name, "drops": drops})
        raids.append({"location": loc.title(), "stars": stars, "mons": mons})
    print(f"  raids: {len(raids)} dens")

    # Fossils
    wv = wb_v["Fossils"]
    fossils = []
    fossil_notes = []
    for r in range(1, wv.max_row + 1):
        t = s(wv.cell(r, 3).value)
        if t.startswith("-"):
            fossil_notes.append(t.lstrip("- ").strip())
        if "SHARD" in s(wv.cell(r, 4).value).upper():
            for c in range(1, wv.max_column + 1):
                h = s(wv.cell(r, c).value)
                if not h:
                    continue
                names = []
                for rr in range(r + 1, r + 6):
                    for cc in (c, c + 1):
                        n = s(wv.cell(rr, cc).value)
                        if n:
                            names.append(n)
                fossils.append({"group": h.title(), "species": names})
    print(f"  fossils: {len(fossils)} groups")

    # Egg vendor & game corner
    wv = wb_v["Egg Vendor & Game Corner"]
    egg_vendor, game_corner, egg_notes, gc_notes = [], [], [], []
    section = None
    for r in range(1, wv.max_row + 1):
        t = s(wv.cell(r, 3).value)
        if "SHARD TRADES" in t.upper():
            section = "egg"
        elif "GAME CORNER" in t.upper():
            section = "gc"
        elif t.startswith("-"):
            (egg_notes if section == "egg" else gc_notes).append(t.lstrip("- ").strip())
        if section == "egg" and "SHARD" in s(wv.cell(r, 4).value).upper():
            for c in range(1, wv.max_column + 1):
                h = s(wv.cell(r, c).value)
                if not h:
                    continue
                names = [s(wv.cell(rr, c).value) for rr in range(r + 1, r + 15) if s(wv.cell(rr, c).value)]
                egg_vendor.append({"shard": h.title(), "species": names})
        if section == "gc":
            for c in range(4, wv.max_column + 1):
                n = s(wv.cell(r, c).value)
                if n and not n.startswith("-") and num(n) is None and n not in game_corner:
                    game_corner.append(n)
    print(f"  egg vendor: {len(egg_vendor)} shards, game corner: {len(game_corner)}")

    # Trades
    wv = wb_v["Trades"]
    trades = []
    for r in range(1, wv.max_row + 1):
        if s(wv.cell(r, 3).value).lower().startswith("looking for"):
            for c in (3, 9):
                loc = s(wv.cell(r - 1, c).value)
                give, get = s(wv.cell(r + 1, c).value), s(wv.cell(r + 1, c + 4).value)
                if loc and give:
                    trades.append({"location": loc.title(), "give": give, "get": get})
    print(f"  trades: {len(trades)}")

    # Gifts
    wv = wb_v["Gifts"]
    gifts = []
    section = "Main game"
    for r in range(1, wv.max_row + 1):
        t = s(wv.cell(r, 3).value)
        if t.upper() == "POST-GAME":
            section = "Post-game"
            continue
        if t.upper() == "POKEMON":
            loc = s(wv.cell(r - 1, 3).value).title()
            rr = r + 1
            while s(wv.cell(rr, 4).value):
                gifts.append({"location": loc, "section": section, "species": s(wv.cell(rr, 4).value),
                              "requirement": s(wv.cell(rr, 5).value), "info": s(wv.cell(rr, 9).value)})
                rr += 1
    print(f"  gifts: {len(gifts)}")

    # Mystery gifts
    wv = wb_v["Mystery Gifts"]
    mystery, mystery_notes = [], []
    for r in range(1, wv.max_row + 1):
        t = s(wv.cell(r, 3).value)
        if t.startswith("-"):
            mystery_notes.append(t.lstrip("- ").strip())
        name, code = s(wv.cell(r, 4).value), s(wv.cell(r, 6).value)
        if name and code and name.upper() != "POKEMON":
            mystery.append({"species": name, "code": code, "info": s(wv.cell(r, 8).value)})
    print(f"  mystery gifts: {len(mystery)}")

    # Unobtainables
    wv = wb_v["Unobtainables"]
    unob = [s(wv.cell(r, 4).value) for r in range(1, wv.max_row + 1) if s(wv.cell(r, 4).value)]
    print(f"  unobtainables: {len(unob)}")

    names = set()
    for e in enc:
        names.update(sl["species"] for sl in e["slots"])
    for coll in (statics, mystery, gifts):
        names.update(x["species"] for x in coll)
    for rd in raids:
        names.update(m["species"] for m in rd["mons"])
    for t in trades:
        names.update([t["give"], t["get"]])
    for f in fossils + egg_vendor:
        names.update(f["species"])
    names.update(game_corner)
    for n in names:
        if n and not n.startswith("?"):
            resolver.entry(n)

    out = {
        "source": f"https://docs.google.com/spreadsheets/d/{SHEETS['locations']}",
        "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "locationOrder": loc_order,
        "encounters": enc,
        "rodNotes": rod_notes,
        "statics": statics,
        "raids": raids,
        "raidNotes": raid_notes,
        "fossils": fossils,
        "fossilNotes": fossil_notes,
        "eggVendor": egg_vendor,
        "eggVendorNotes": egg_notes,
        "gameCorner": game_corner,
        "gameCornerNotes": gc_notes,
        "trades": trades,
        "gifts": gifts,
        "mysteryGifts": mystery,
        "mysteryGiftNotes": mystery_notes,
        "unobtainable": unob,
    }
    with open(os.path.join(OUT, "locations.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    print("== bosses ==")
    assets, resolver = import_bosses()
    print("== locations ==")
    import_locations(resolver)
    with open(os.path.join(CACHE, "assets.json"), "w", encoding="utf-8") as f:
        json.dump({k: sorted(v) for k, v in assets.items()}, f, indent=1)
    # every dex key gets a sprite too, so the dex can render without its own resolver
    with open(os.path.join(OUT, "dex", "index.json"), encoding="utf-8") as f:
        for sp in json.load(f):
            if sp["key"] not in resolver.cache:
                resolver.cache[sp["key"]] = {"sprite": resolver.sprite(sp["key"]), "dex": sp["id"]}
    with open(os.path.join(OUT, "name-map.json"), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(resolver.cache.items())), f, ensure_ascii=False, indent=0)
    print(f"  name map: {len(resolver.cache)} names")
    if resolver.unresolved_sprite:
        warn(f"sprite unresolved ({len(resolver.unresolved_sprite)}): {sorted(resolver.unresolved_sprite)}")
    if resolver.unresolved_dex:
        warn(f"dex unresolved ({len(resolver.unresolved_dex)}): {sorted(resolver.unresolved_dex)}")
    print(f"\n{len(warnings)} warnings")
