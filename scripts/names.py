"""Resolve spreadsheet species names to sprite filenames and dex species ids.

The boss sheet writes forms as 'Rattata-A', the location sheet as 'Rattata-Alola',
the sprite repo as 'RATTATA_A' and the dex as 'Rattata-Alola'. This module
normalises all of them.
"""
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# sheet suffix -> list of sprite-key suffix candidates (tried in order)
SPRITE_SUFFIX = {
    "GALAR": ["G"], "G": ["G"],
    "ALOLA": ["A"], "A": ["A"],
    "HISUI": ["H"], "H": ["H"],
    "PALDEA": ["P"], "P": ["P"],
    "ORIGIN": ["O", "ORIGIN"], "O": ["O", "ORIGIN"],
    "THERIAN": ["THERIAN", "T"], "T": ["THERIAN", "T"],
    "INCARNATE": [""], "I": [""],
    "MEGAX": ["MEGA_X"], "MEGAY": ["MEGA_Y"],
    "MEGA_X": ["MEGA_X"], "MEGA_Y": ["MEGA_Y"],
    "COMPLETE": ["COMPLETE"], "C": ["COMPLETE", "CROWNED", "C"],
    "CROWNED": ["CROWNED"],
    "PRIMAL": ["PRIMAL", "P"],
    "SPEED": ["SPEED"], "S": ["SPEED", "SKY", "SINGLE", "S"],
    "DEFENSE": ["DEFENSE"], "D": ["DEFENSE", "DUSK", "D"],
    "ATTACK": ["ATTACK"],
    "BM": ["BLOODMOON", "BM"], "BLOODMOON": ["BLOODMOON", "BM"],
    "WASH": ["WASH"], "W": ["WASH", "W"],
    "MOW": ["MOW"], "M": ["MOW", "M"],
    "HEAT": ["HEAT"], "FROST": ["FROST"], "FAN": ["FAN"],
    "SKY": ["SKY"],
    "SINGLE": ["SINGLE"], "RAPID": ["RAPID"],
    "COMBAT": ["P"], "BLAZE": ["P_FIRE"], "AQUA": ["P_WATER"],
    "WELLSPRING": ["W"], "HEARTHFLAME": ["F"], "CORNERSTONE": ["R"],
    "SA": ["SANDY"], "SANDY": ["SANDY"], "TR": ["TRASH"], "TRASH": ["TRASH"],
    "Z": ["ZEN", "Z"], "ZEN": ["ZEN"],
    "SM": [""], "LA": ["L"], "SU": ["XL"], "AVERAGE": [""], "LARGE": ["L"], "SUPER": ["XL"], "SMALL": ["S"],
    "F": ["F"], "MALE": ["M"], "FEMALE": ["F"],
    "PHD": ["PHD"], "POPSTAR": ["POP_STAR"], "ROCKSTAR": ["ROCK_STAR"], "BELLE": ["BELLE"], "LIBRE": ["LIBRE"],
    "ORIGINAL": ["ORIGINAL", "CAP_ORIGINAL"],
    "ICE": ["ICE"], "SHADOW": ["SHADOW"],
    "EAST": ["EAST"], "WEST": ["WEST"], "BLUE": ["BLUE"], "RED": ["RED"],
}

# sheet suffix -> dex key suffix candidates
DEX_SUFFIX = {
    "G": ["Galar"], "A": ["Alola"], "H": ["Hisui"], "P": ["Paldea", "Primal"],
    "O": ["Origin"], "T": ["Therian"], "I": [""], "INCARNATE": [""],
    "MEGAX": ["Mega-X"], "MEGAY": ["Mega-Y"],
    "C": ["Complete", "Crowned"], "S": ["Speed", "Sky", "Single-Strike", "Small"],
    "D": ["Defense", "Dusk"], "BM": ["Bloodmoon"], "W": ["Wash", "Paldea-Aqua"],
    "M": ["Mow"], "F": ["F", "Paldea-Blaze"], "Z": ["Galar-Zen", "Zen"],
    "SA": ["Sandy"], "TR": ["Trash"], "SM": ["Small"], "LA": ["Large"], "SU": ["Super"],
    "COMBAT": ["Paldea-Combat"], "BLAZE": ["Paldea-Blaze"], "AQUA": ["Paldea-Aqua"],
    "SINGLE": ["Single-Strike"], "RAPID": ["Rapid-Strike"],
    "POPSTAR": ["Pop-Star"], "ROCKSTAR": ["Rock-Star"], "PHD": ["PhD"],
    "MEGA": ["Mega"],
}

DEX_SUFFIX.update({
    "BLUE": ["Blue-Striped"], "SANDY": [""], "TRASH": [""], "I": [""],
    "MEGAS": ["Sevii-Mega"], "GORG": ["Gorging"], "GZ": ["Galar-Zen"],
    "AUTUMN": [""], "SUMMER": [""], "WINTER": [""], "SPRING": [""],
    "MAX": ["Eternamax"], "DOUSE": [""], "SU": [""], "LA": [""], "SM": [""],
    "U": ["Unbound"], "B": ["Black"], "W": ["White", "Wash", "Paldea-Aqua", "Wellspring"],
    "DM": ["Dusk-Mane"], "DW": ["Dawn-Wings"], "ULTRA": ["Ultra"],
    "C": ["Complete", "Crowned", "Cornerstone"], "H": ["Hisui", "Hearthflame", "Heat"],
    "F": ["F", "Frost", "Paldea-Blaze"], "EAST": [""], "G": ["Galar", "White"],
    "R": ["Rapid-Strike"], "S": ["Speed", "Sky", "Sevii", "Shadow", "Single-Strike", ""],
    "SSCH": ["Sevii-School"], "SCH": ["School"], "10": ["10%"], "SINGLE": [""],
    "A": ["Alola", "Attack"], "O": ["Origin", "Original"], "M": ["Mow", ""],
})

SPRITE_SUFFIX.update({
    "PALDEACOMBAT": ["P"], "PALDEAAQUA": ["P_WATER"], "PALDEABLAZE": ["P_FIRE"],
    "GALARZEN": ["G_ZEN", "GZEN"], "BLUESTRIPED": ["BLUE"], "WHITESTRIPED": ["WHITE"],
    "RAPIDSTRIKE": ["RAPID"], "SINGLESTRIKE": ["SINGLE"], "DUSKMANE": ["DUSK_MANE", "DM"],
    "DAWNWINGS": ["DAWN_WINGS", "DW"], "ETERNAMAX": ["ETERNAMAX", "MAX"], "UNBOUND": ["UNBOUND", "U"],
    "BLACK": ["BLACK", "B"], "WHITE": ["WHITE", "W"], "GORGING": ["GORGING", "GORG"], "GULPING": ["GULPING"],
    "SEVII": ["SEVII", "S"], "SEVIIMEGA": ["SEVII_MEGA", "S_MEGA"], "SEVIISCHOOL": ["SEVII_SCHOOL", "S_SCHOOL"],
    "SCHOOL": ["SCHOOL", "SCH"], "METEOR": ["SHIELD", "METEOR"], "TERASTAL": ["TERASTAL", ""],
    "LOWKEY": ["LOW_KEY", "LOWKEY"], "POMPOM": ["POM_POM", "POMPOM"], "PAU": ["PAU"], "SENSU": ["SENSU"],
    "10%": ["10", "10PERCENT"], "10": ["10", "10PERCENT"], "CAPORIGINAL": ["CAP_ORIGINAL"],
    "STRIKE": ["SINGLE"],
})

MANUAL_SPRITE = {
    "Minior": "MINIOR_SHIELD",
    "Any Cap Pikachu": "PIKACHU_CAP_ORIGINAL",
    "Pikachu-Popstar": "PIKACHU_POP_STAR",
    "Pikachu-Rockstar": "PIKACHU_ROCK_STAR",
}
MANUAL_DEX = {
    "Aegislash": "Aegislash-Shield",
    "Scream Tail": "Screamtail",
    "Terapagos": "Terapagos-Terastal",
    "Minior": "Minior-Meteor",
    "Magearna-Original": "Magearna",
    "Rotom-H": "Rotom-Heat",
    "Urshifu-S": "Urshifu",
    "Urshifu-Single": "Urshifu",
    "Ogerpon-W": "Ogerpon-Wellspring",
    "Ogerpon-H": "Ogerpon-Hearthflame",
    "Ogerpon-C": "Ogerpon-Cornerstone",
    "Squawkabilly-G": "Squawkabilly",
    "Squawkabilly-W": "Squawkabilly-White",
    "Any Cap Pikachu": "Pikachu-Original",
    "Indeedee": "Indeedee-M",
    "Meowstic": "Meowstic-M",
    "Basculegion": "Basculegion-M",
    "Oinkologne": "Oinkologne-M",
}


def ascii_fold(t):
    return "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))


def clean(name):
    name = ascii_fold(name).replace("’", "").replace("'", "")
    name = re.sub(r"[^\x20-\x7e]", "", name)  # control chars like _x0010_ artefacts are handled below
    name = re.sub(r"_x[0-9a-f]{4}_", "", name, flags=re.I)
    return name.strip()


def split_form(name):
    """'Charizard-MegaX' -> ('Charizard', 'MEGAX');  'Jangmo-o' -> ('Jangmo-o', '')."""
    n = clean(name)
    if n.lower() in ("jangmo-o", "hakamo-o", "kommo-o", "ho-oh", "porygon-z", "wo-chien", "chien-pao",
                     "ting-lu", "chi-yu", "type: null", "nidoran-f", "nidoran-m"):
        return n, ""
    if "-" in n:
        base, form = n.split("-", 1)
        return base, form.replace("-", "").replace(" ", "").upper()
    return n, ""


def sprite_key_for(base):
    b = clean(base).upper().replace(" ", "_").replace(".", "").replace(":", "").replace("-", "_")
    return b


class Resolver:
    def __init__(self, sheet_keys):
        self.sheet_keys = dict(sheet_keys)
        with open(os.path.join(ROOT, "scripts", "cache", "sprite-files.json"), encoding="utf-8") as f:
            self.sprites = set(json.load(f))
        with open(os.path.join(ROOT, "public", "data", "dex", "index.json"), encoding="utf-8") as f:
            dex = json.load(f)
        self.dex_by_key = {}
        for sp in dex:
            k = clean(sp["key"]).lower()
            if k not in self.dex_by_key:  # first form wins for shared keys (Unown etc)
                self.dex_by_key[k] = sp["id"]
        self.unresolved_sprite = set()
        self.unresolved_dex = set()
        self.cache = {}

    def sprite(self, name):
        if name in MANUAL_SPRITE:
            return MANUAL_SPRITE[name]
        if name in self.sheet_keys and self.sheet_keys[name] in self.sprites:
            return self.sheet_keys[name]
        base, form = split_form(name)
        b = sprite_key_for(base)
        cands = []
        if form:
            for sfx in SPRITE_SUFFIX.get(form, [form]):
                cands.append(f"{b}_{sfx}" if sfx else b)
            cands.append(f"{b}_{form}")
        cands.append(b)
        for c in cands:
            if c in self.sprites:
                if form and c == b:
                    self.unresolved_sprite.add(f"{name} -> base form")
                return c
        self.unresolved_sprite.add(name)
        return None

    def dex(self, name):
        if name in MANUAL_DEX:
            return self.dex_by_key.get(MANUAL_DEX[name].lower())
        n = clean(name).lower()
        if n in self.dex_by_key:
            return self.dex_by_key[n]
        base, form = split_form(name)
        cands = []
        if form:
            for sfx in DEX_SUFFIX.get(form, [form.capitalize()]):
                cands.append(f"{base}-{sfx}" if sfx else base)
            cands.append(f"{base}-{form.capitalize()}")
            cands.append(f"{base}-{form}")
        cands.append(base)
        for c in cands:
            hit = self.dex_by_key.get(clean(c).lower())
            if hit is not None:
                if form and c == base and "" not in DEX_SUFFIX.get(form, []):
                    self.unresolved_dex.add(f"{name} -> base form")
                return hit
        self.unresolved_dex.add(name)
        return None

    def entry(self, name):
        if name not in self.cache:
            self.cache[name] = {"sprite": self.sprite(name), "dex": self.dex(name)}
        return self.cache[name]


def local_asset_path(url):
    """Deterministic local path for an external image URL (shared with fetch_sprites.py)."""
    m = re.match(r"https?://i\.ibb\.co/([^/]+)/([^/?]+)", url)
    if m:
        return f"trainers/{m.group(1)}_{m.group(2)}"
    m = re.search(r"pokesprite/master/(.+)$", url)
    if m:
        return "items/" + m.group(1).replace("/", "_")
    return "misc/" + re.sub(r"[^A-Za-z0-9._-]", "_", url.split("//", 1)[-1])
