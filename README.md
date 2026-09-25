# RR Tool

A companion app for **Pokémon Radical Red v4.1 (Hardcore)** that runs entirely on GitHub Pages:
<https://antproj.github.io/RRTool/>

- **Locations** – every wild encounter (grass day/night, rods, surfing, Safari Zone) with level ranges and rates, plus statics, raid dens, fossils, the egg vendor, Game Corner, trades, gifts and Mystery Gift codes.
- **Bosses** – all 113 fights in progression order with full teams: level, nature, ability, item, moves, base stats and the exact speed stat. Set your current level cap in the top bar and every "Highest Lv −2" team resolves to real numbers. Rival teams follow your chosen starter.
- **Dex** – the game's own Pokédex data (stats, abilities, evolutions, learnsets), cross-referenced with where to catch each Pokémon and which bosses use it.

Everything you do (beaten bosses, caught Pokémon, last page, scroll position, chosen teams) is remembered in the browser. Settings has separate resets and an export/import so progress can move between devices.

## Development

```bash
npm install
npm run dev
```

Pushes to `main` deploy automatically through `.github/workflows/deploy.yml`. In the repo settings, set **Pages → Source** to "GitHub Actions" once.

## Updating the data

The app never talks to Google. Data is imported into `public/data/` by scripts and committed.

| Script | What it does |
| --- | --- |
| `python scripts/import_sheets.py` | Downloads the two community Google Sheets as XLSX, walks their visual layouts and writes `bosses.json`, `locations.json` and `name-map.json`. Add `--offline` to reuse the cached download. Needs `pip install openpyxl`. |
| `node scripts/import_dex.mjs` | Converts the JwowSquared Radical Red Pokédex `data.js` (v4.1) into `public/data/dex/*.json`. |
| `python scripts/fetch_sprites.py` | Vendors Pokémon sprites (darkbooker/RadicalRedSprites), trainer portraits and item icons into `public/sprites/`. Skips files already present. |

Run them in that order; the sheet importer uses the dex index to map names, and the sprite fetcher uses the importer's asset list. Warnings printed by the importer list anything it could not resolve.

### Sources

- Boss sheet: <https://docs.google.com/spreadsheets/d/1g7PS5I1wh7w3zbaGV9_TWY1Oi4d-S1tU2f1YOE6zRa8>
- Location sheet: <https://docs.google.com/spreadsheets/d/1zOAcdEswTB5ps0olOmGyAJF1ebLWN_duDqyUdBvLtE8>
- Dex data: <https://github.com/JwowSquared/Radical-Red-Pokedex>
- Sprites: <https://github.com/darkbooker/RadicalRedSprites>

### How boss stats are computed

The sheet stores each boss Pokémon's speed as a formula that encodes its level, speed IV and nature multiplier. The importer reads those back, so speed is recomputed exactly at whatever cap you pick. For the few cells that hold plain numbers the IV is solved from the value. Other stats assume 31 IVs and no EVs, which is what the sheet itself assumes.
