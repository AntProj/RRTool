# Radical Red Pokédex data

Source: https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js (JwowSquared/Radical-Red-Pokedex, branch master, RR v4.1 dex).
Fetched: 2026-09-25T14:47:00.000Z; upstream commit 488a0918194d567b5f7b02c396118d51fb9c81ce (2025-06-30T05:32:46Z). Regenerate with `node scripts/import_dex.mjs` (`--force` re-downloads).
Field mapping (from the site's src/displayMethods.js + src/utility.js): raw `stats` = [HP, Atk, Def, Spe, SpA, SpD] -> emitted as {hp, atk, def, spa, spd, spe}.
Abilities: raw `abilities` = [hidden, primary, secondary] pairs of [abilityId, nameIndex]; name = abilities[id].names[nameIndex] (some ids share a mechanic with alternate names, e.g. Battle Armor/Shell Armor).
Learnsets: `levelupMoves` = [moveId, level] (emitted as [level, moveId]; level 0 = learned on evolution); `tmMoves`/`tutorMoves` are indices into the tm/tutor tables (resolved to move ids); `eggMoves` are move ids.
Evolutions: raw [method, param, target, extra]; method text reconstructed from the site's `evolutions` template table (4 = level, 7 = item, 254 = Mega/Primal/Ultra/Eternamax, etc.).
Identity: `id` = internal species id (unique), `key` = display name with form suffix (e.g. "Charizard-Mega-X", "Tauros-Paldea-Combat"; NOT unique for cosmetic forms like Unown), `name` = base name, `dexId` = national dex number shared by forms, `ancestor` = root species id of the evolutionary family, `formOrder` = form order within a dexId.
Files: species.json (1265 KB), moves.json (255 KB), abilities.json (29 KB), items.json (116 KB), index.json (337 KB), areas.json (502 KB), caps.json (1 KB). areas.json = wild encounters/gifts/raids/items keyed by level-cap stage; caps.json = level caps. Sprites and trainers are not converted.
