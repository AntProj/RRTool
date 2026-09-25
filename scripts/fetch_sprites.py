"""Vendor every sprite the app needs into public/sprites/.

  mons/     darkbooker/RadicalRedSprites  (all 1300+ files, ~1.4 MB)
  trainers/ portraits referenced by the boss sheet (i.ibb.co)
  items/    item + move-type icons referenced by the boss sheet (msikma/pokesprite)

Run after import_sheets.py (needs scripts/cache/assets.json and sprite-files.json).
Skips files that already exist.
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from names import local_asset_path  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "sprites")
CACHE = os.path.join(ROOT, "scripts", "cache")
MON_BASE = "https://raw.githubusercontent.com/darkbooker/RadicalRedSprites/main/Sprites/"


def download(url, dest):
    if os.path.exists(dest):
        return "skip"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "rrtool-importer"})
            with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
                f.write(r.read())
            return "ok"
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(1 + attempt)
    return f"FAIL {url}: {err}"


def main():
    jobs = []
    with open(os.path.join(CACHE, "sprite-files.json"), encoding="utf-8") as f:
        for key in json.load(f):
            jobs.append((MON_BASE + key + ".png", os.path.join(OUT, "mons", key + ".png")))
    with open(os.path.join(CACHE, "assets.json"), encoding="utf-8") as f:
        assets = json.load(f)
    for group in ("trainers", "items"):
        for url in assets.get(group, []):
            jobs.append((url, os.path.join(OUT, local_asset_path(url))))
    print(f"{len(jobs)} files")
    with ThreadPoolExecutor(max_workers=12) as ex:
        results = list(ex.map(lambda j: download(*j), jobs))
    ok = results.count("ok")
    skip = results.count("skip")
    fails = [r for r in results if r.startswith("FAIL")]
    print(f"downloaded {ok}, skipped {skip}, failed {len(fails)}")
    for r in fails:
        print("  " + r)


if __name__ == "__main__":
    main()
