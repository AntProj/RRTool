#!/usr/bin/env node
// Imports the Pokémon Radical Red v4.1 Pokédex data published by the
// JwowSquared/Radical-Red-Pokedex site (data.js) and converts it into clean
// JSON files under public/data/dex/.
//
// Field semantics were established from the site's own source code
// (src/displayMethods.js, src/utility.js, src/tableMethods.js, src/onStartUp.js):
//   - stats[]      : [HP, Atk, Def, Spe, SpA, SpD]  (site renders stats[3] as "Spe",
//                    stats[4] as "SpA", stats[5] as "SpD")
//   - abilities[]  : three [abilityId, nameIndex] pairs; index 1 = primary,
//                    index 2 = secondary, index 0 = HIDDEN. Name is
//                    abilities[id].names[nameIndex]; id 0 = none.
//   - type[]       : 1 or 2 type ids into `types` (types[id].name)
//   - eggGroup[]   : 2 ids into `eggGroups` (string table)
//   - items[]      : [common, rare] held item ids into `items`; 0 = none
//   - levelupMoves : [[moveId, level], ...]  (level 0 = learned on evolution)
//   - tmMoves      : indices into the `tmMoves` table (index -> move id)
//   - tutorMoves   : indices into the `tutorMoves` table (index -> move id; 0 = empty slot)
//   - eggMoves     : move ids directly
//   - evolutions   : [[method, param, targetSpeciesId, extra], ...]; `evolutions`
//                    table holds template strings the site eval()s with `evo` in scope
//   - key          : display name incl. form suffix ("Charizard-Mega-X"); name = base name
//   - dexID        : national dex number (shared by all forms); order = form order
//   - ancestor     : species id of the root of the evolutionary family
//
// Usage: node scripts/import_dex.mjs [--force]   (--force re-downloads data.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO = 'JwowSquared/Radical-Red-Pokedex';
const BRANCH = 'master';
const SOURCE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data.js`;
const COMMIT_API = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`;
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'data.js');
const META_FILE = path.join(CACHE_DIR, 'data.meta.json');
const OUT_DIR = path.join(ROOT, 'public', 'data', 'dex');

const force = process.argv.includes('--force');

// ---------------------------------------------------------------- download

async function ensureDownloaded() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (fs.existsSync(CACHE_FILE) && !force) {
    console.log(`Using cached ${path.relative(ROOT, CACHE_FILE)}`);
    return;
  }
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(CACHE_FILE, text, 'utf8');
  console.log(`Saved ${(text.length / 1024 / 1024).toFixed(2)} MB to ${path.relative(ROOT, CACHE_FILE)}`);

  const meta = { sourceUrl: SOURCE_URL, fetchedAt: new Date().toISOString() };
  try {
    const cres = await fetch(COMMIT_API, { headers: { 'User-Agent': 'rrtool-import-dex' } });
    if (cres.ok) {
      const c = await cres.json();
      meta.commit = c.sha;
      meta.commitDate = c.commit?.committer?.date;
      meta.commitMessage = (c.commit?.message || '').split('\n')[0];
    }
  } catch (e) {
    console.warn('Could not fetch commit info:', e.message);
  }
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

function loadData() {
  const text = fs.readFileSync(CACHE_FILE, 'utf8');
  // The site does exactly this: new Function("return " + data + ";")()
  return new Function('return ' + text + ';')();
}

// ---------------------------------------------------------------- helpers

function typeName(types, id) {
  if (id === undefined || id === null) return undefined;
  const t = types[id];
  return t ? t.name : '???';
}

function abilityEntry(abilities, pair, hidden) {
  const [id, nameIndex] = pair;
  if (!id) return null;
  const a = abilities[id];
  if (!a) return null;
  const name = a.names[nameIndex] ?? a.names[0];
  return { id, name, hidden };
}

// Mirrors the template strings in data.evolutions (evaluated by the site via
// eval with `evo`, `items`, `types`, `moves`, `species` in scope), rewritten
// as plain human-readable text.
function evolutionMethod(data, evo) {
  const [method, param, target, extra] = evo;
  const item = (id) => data.items[id]?.name ?? `Item #${id}`;
  const type = (id) => typeName(data.types, id) ?? `Type #${id}`;
  const move = (id) => data.moves[id]?.name ?? `Move #${id}`;
  const spec = (id) => data.species[id]?.key ?? `Species #${id}`;
  const targetKey = data.species[target]?.key ?? '';

  switch (method) {
    case 1: return 'Level up with high Friendship';
    case 2: return 'Level up with high Friendship (Day)';
    case 3: return 'Level up with high Friendship (Night)';
    case 4: return `Level ${param}`;
    case 7: {
      // Site special-cases Dawn Stone (item 101): extra === 254 -> Female, else Male
      let s = `Use ${item(param)}`;
      if (param === 101) s += extra === 254 ? ' (Female)' : ' (Male)';
      return s;
    }
    case 8: return `Level ${param} when Attack > Defense`;
    case 9: return `Level ${param} when Attack = Defense`;
    case 10: return `Level ${param} when Attack < Defense`;
    case 11: return `Level ${param} (50% chance)`;
    case 12: return `Level ${param} (50% chance)`;
    case 13: return `Level ${param}`;
    case 14: return 'Evolve into Ninjask with an open party slot and a Poké Ball';
    case 16: return `Level ${param} while raining in the overworld`;
    case 17: return `Level up with high Friendship knowing a ${type(param)}-type move`;
    case 18: return `Level ${param} with a ${type(extra)}-type Pokémon in the party`;
    case 20: return `Level ${param} (Male)`;
    case 21: return `Level ${param} (Female)`;
    case 22: return `Level ${param} (Night)`;
    case 23: return `Level ${param} (Day)`;
    case 26: return `Level up knowing ${move(param)}`;
    case 27: return `Level up with ${spec(param)} in the party`;
    case 28: {
      const when = extra === 1041 ? 'Day' : extra === 5144 ? 'Night' : 'Dusk';
      return `Level ${param} (${when})`;
    }
    case 30: return `Level ${param} with an Adamant, Brave, Docile, Hardy, Hasty, Impish, Jolly, Lax, Naive, Naughty, Rash, Quirky, or Sassy nature`;
    case 31: return `Level ${param} with a Bashful, Bold, Calm, Careful, Gentle, Lonely, Mild, Modest, Quiet, Relaxed, Serious, or Timid nature`;
    case 254: {
      // Battle-only transformations. extra === 2 -> requires a move instead of an item.
      const req = extra === 2 ? `knowing ${move(param)}` : `with ${item(param)}`;
      if (targetKey.includes('-Primal')) return `Primal Reversion ${req}`;
      if (targetKey.includes('-Ultra')) return `Ultra Burst ${req}`;
      if (targetKey.includes('-Eternamax')) return `Eternamax ${req}`;
      return `Mega Evolve ${req}`;
    }
    default:
      return `Unknown method ${method} (param ${param}, extra ${extra})`;
  }
}

function stableSortByLevel(pairs) {
  return pairs
    .map((p, i) => [p[1], p[0], i])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2])
    .map(([level, moveId]) => [level, moveId]);
}

function writeJson(file, value, { compactArrays = false } = {}) {
  let text = compactArrays ? compactJson(value) : JSON.stringify(value, null, 2);
  fs.writeFileSync(file, text + '\n', 'utf8');
  return fs.statSync(file).size;
}

// Pretty JSON that keeps small leaf arrays (numbers/strings) on one line so the
// learnsets do not explode into thousands of lines.
function compactJson(value, indent = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allLeaf = value.every(
      (v) => v === null || typeof v !== 'object' ||
        (Array.isArray(v) && v.every((x) => typeof x !== 'object'))
    );
    if (allLeaf) return JSON.stringify(value);
    const inner = indent + '  ';
    return '[\n' + value.map((v) => inner + compactJson(v, inner)).join(',\n') + '\n' + indent + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const inner = indent + '  ';
    return '{\n' + keys
      .map((k) => inner + JSON.stringify(k) + ': ' + compactJson(value[k], inner))
      .join(',\n') + '\n' + indent + '}';
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------- convert

function convert(data) {
  const { types, abilities, items, moves, eggGroups, splits, tmMoves, tutorMoves } = data;
  const warnings = [];

  // ---- moves
  const movesOut = {};
  for (const m of Object.values(moves)) {
    movesOut[String(m.ID)] = {
      id: m.ID,
      name: m.name,
      type: typeName(types, m.type),
      split: splits[m.split] ?? 'Status',
      power: m.power ?? 0,
      accuracy: m.accuracy ?? 0,
      pp: m.pp ?? 0,
      priority: m.priority ?? 0,
      description: m.description ?? '',
    };
  }

  // ---- abilities (id -> names[0]; alternate names are listed separately)
  const abilitiesOut = {};
  for (const a of Object.values(abilities)) {
    const entry = { id: a.ID, name: a.names[0], description: a.description ?? '' };
    if (a.names.length > 1) entry.altNames = a.names.slice(1);
    abilitiesOut[String(a.ID)] = entry;
  }

  // ---- items
  const itemsOut = {};
  for (const it of Object.values(items)) {
    const entry = { id: it.ID, name: it.name };
    if (it.description) entry.description = it.description;
    itemsOut[String(it.ID)] = entry;
  }

  // ---- species
  const speciesOut = [];
  const indexOut = [];
  const speciesList = Object.values(data.species).sort((a, b) => a.ID - b.ID);
  for (const s of speciesList) {
    if (!s.stats || s.stats.length !== 6) warnings.push(`species ${s.ID} ${s.key}: bad stats`);
    if (!s.type || s.type.length === 0) warnings.push(`species ${s.ID} ${s.key}: no type`);

    const [hp, atk, def, spe, spa, spd] = s.stats;
    const stats = { hp, atk, def, spa, spd, spe };
    const bst = hp + atk + def + spa + spd + spe;

    const typeNames = [];
    for (const t of s.type) {
      const n = typeName(types, t);
      if (n && !typeNames.includes(n)) typeNames.push(n);
    }

    // Site order: primary = [1], secondary = [2], hidden = [0]
    const abils = [
      abilityEntry(abilities, s.abilities[1], false),
      abilityEntry(abilities, s.abilities[2], false),
      abilityEntry(abilities, s.abilities[0], true),
    ].filter(Boolean);

    const eggs = [];
    for (const g of s.eggGroup ?? []) {
      const n = eggGroups[g];
      if (n && n !== 'None' && !eggs.includes(n)) eggs.push(n);
    }

    const heldItems = [];
    for (const i of s.items ?? []) {
      if (i && items[i]) heldItems.push(items[i].name);
    }

    const evolutions = (s.evolutions ?? []).map((evo) => {
      if (!data.species[evo[2]]) warnings.push(`species ${s.ID} ${s.key}: evolution target ${evo[2]} missing`);
      return { method: evolutionMethod(data, evo), target: evo[2] };
    });

    const level = stableSortByLevel(
      (s.levelupMoves ?? []).filter((p) => {
        if (!moves[p[0]]) { warnings.push(`species ${s.ID} ${s.key}: level-up move ${p[0]} missing`); return false; }
        return true;
      })
    );
    const tm = [...new Set((s.tmMoves ?? []).map((i) => tmMoves[i]).filter((id) => id && moves[id]))];
    const tutor = [...new Set((s.tutorMoves ?? []).map((i) => tutorMoves[i]).filter((id) => id && moves[id]))];
    const egg = [...new Set((s.eggMoves ?? []).filter((id) => id && moves[id]))];

    const entry = {
      id: s.ID,
      key: s.key,
      name: s.name,
      dexId: s.dexID,
      ancestor: s.ancestor,
      types: typeNames,
      abilities: abils.map(({ name, hidden }) => ({ name, hidden })),
      stats,
      bst,
      eggGroups: eggs,
      heldItems,
      evolutions,
      learnset: { level, tm, tutor, egg },
    };
    if (s.order !== undefined) entry.formOrder = s.order;
    speciesOut.push(entry);

    indexOut.push({ id: s.ID, key: s.key, name: s.name, dexId: s.dexID, types: typeNames, bst, stats });
  }

  // ---- areas (wild encounters / gifts / raids etc.), keyed by level-cap stage
  const capNames = {};
  for (const [name, c] of Object.entries(data.caps ?? {})) capNames[c.ID] = name;
  const stageName = (k) => capNames[Number(k)] ?? String(k);

  const areasOut = data.areas.map((a, idx) => {
    const out = { id: idx, name: a.name };
    for (const [key, byStage] of Object.entries(a)) {
      if (key === 'name') continue;
      const entries = [];
      for (const [stage, list] of Object.entries(byStage)) {
        for (const e of list) {
          const base = { stage: Number(stage), stageName: stageName(stage) };
          if (key.startsWith('wild-')) {
            entries.push({ ...base, species: e[0], minLevel: e[1], maxLevel: e[2] });
          } else if (key.startsWith('raid')) {
            entries.push({ ...base, species: e[0], drops: e[1] });
          } else if (key.startsWith('fixed-')) {
            entries.push({ ...base, species: e });
          } else if (key.startsWith('item-')) {
            entries.push({ ...base, item: e });
          } else if (key === 'trainers') {
            entries.push({ ...base, trainer: e });
          } else if (key === 'tutors') {
            entries.push({ ...base, tutorMove: tutorMoves[e] ?? null, tutorIndex: e });
          } else {
            entries.push({ ...base, value: e });
          }
        }
      }
      out[key] = entries;
    }
    return out;
  });

  const caps = Object.entries(data.caps ?? {}).map(([name, c]) => ({
    id: c.ID, name, normal: c.cap[0], hardcore: c.cap[1],
  })).sort((a, b) => a.id - b.id);

  return { movesOut, abilitiesOut, itemsOut, speciesOut, indexOut, areasOut, caps, warnings };
}

// ---------------------------------------------------------------- sanity

function sanityCheck(speciesOut, movesOut) {
  const bulba = speciesOut.find((s) => s.id === 1);
  const problems = [];
  const expect = (cond, msg) => { if (!cond) problems.push(msg); };
  expect(bulba && bulba.name === 'Bulbasaur', 'species 1 is not Bulbasaur');
  if (bulba) {
    expect(bulba.types.join('/') === 'Grass/Poison', `Bulbasaur types ${bulba.types.join('/')}`);
    const st = bulba.stats;
    expect([st.hp, st.atk, st.def, st.spa, st.spd, st.spe].join('/') === '45/49/49/65/65/45',
      `Bulbasaur stats ${JSON.stringify(st)}`);
    expect(bulba.abilities.some((a) => a.name === 'Overgrow' && !a.hidden), 'Bulbasaur lacks Overgrow');
    expect(bulba.abilities.some((a) => a.name === 'Chlorophyll' && a.hidden), 'Bulbasaur lacks hidden Chlorophyll');
    expect(bulba.evolutions.some((e) => e.target === 2 && e.method === 'Level 16'), `Bulbasaur evolutions ${JSON.stringify(bulba.evolutions)}`);
    const tackleId = Object.values(movesOut).find((m) => m.name === 'Tackle')?.id;
    expect(bulba.learnset.level.some(([lvl, id]) => lvl === 1 && id === tackleId), 'Bulbasaur does not learn Tackle at level 1');
    expect(bulba.eggGroups.join('/') === 'Monster/Grass', `Bulbasaur egg groups ${bulba.eggGroups.join('/')}`);
  }
  return problems;
}

// ---------------------------------------------------------------- readme

function writeReadme(meta, sizes) {
  const lines = [
    '# Radical Red Pokédex data',
    '',
    `Source: ${SOURCE_URL} (JwowSquared/Radical-Red-Pokedex, branch ${BRANCH}, RR v4.1 dex).`,
    `Fetched: ${meta.fetchedAt ?? 'unknown'}; upstream commit ${meta.commit ?? 'unknown'}${meta.commitDate ? ` (${meta.commitDate})` : ''}. Regenerate with \`node scripts/import_dex.mjs\` (\`--force\` re-downloads).`,
    'Field mapping (from the site\'s src/displayMethods.js + src/utility.js): raw `stats` = [HP, Atk, Def, Spe, SpA, SpD] -> emitted as {hp, atk, def, spa, spd, spe}.',
    'Abilities: raw `abilities` = [hidden, primary, secondary] pairs of [abilityId, nameIndex]; name = abilities[id].names[nameIndex] (some ids share a mechanic with alternate names, e.g. Battle Armor/Shell Armor).',
    'Learnsets: `levelupMoves` = [moveId, level] (emitted as [level, moveId]; level 0 = learned on evolution); `tmMoves`/`tutorMoves` are indices into the tm/tutor tables (resolved to move ids); `eggMoves` are move ids.',
    'Evolutions: raw [method, param, target, extra]; method text reconstructed from the site\'s `evolutions` template table (4 = level, 7 = item, 254 = Mega/Primal/Ultra/Eternamax, etc.).',
    'Identity: `id` = internal species id (unique), `key` = display name with form suffix (e.g. "Charizard-Mega-X", "Tauros-Paldea-Combat"; NOT unique for cosmetic forms like Unown), `name` = base name, `dexId` = national dex number shared by forms, `ancestor` = root species id of the evolutionary family, `formOrder` = form order within a dexId.',
    `Files: ${sizes.map(([f, s]) => `${f} (${(s / 1024).toFixed(0)} KB)`).join(', ')}. areas.json = wild encounters/gifts/raids/items keyed by level-cap stage; caps.json = level caps. Sprites and trainers are not converted.`,
  ];
  const file = path.join(OUT_DIR, 'README.md');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------- main

async function main() {
  await ensureDownloaded();
  const data = loadData();
  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : {
    fetchedAt: fs.statSync(CACHE_FILE).mtime.toISOString(),
  };

  const { movesOut, abilitiesOut, itemsOut, speciesOut, indexOut, areasOut, caps, warnings } = convert(data);

  const problems = sanityCheck(speciesOut, movesOut);
  if (problems.length) {
    console.error('SANITY CHECK FAILED:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sizes = [];
  const emit = (name, value, opts) => sizes.push([name, writeJson(path.join(OUT_DIR, name), value, opts)]);
  emit('species.json', speciesOut, { compactArrays: true });
  emit('moves.json', movesOut);
  emit('abilities.json', abilitiesOut);
  emit('items.json', itemsOut);
  emit('index.json', indexOut, { compactArrays: true });
  emit('areas.json', areasOut, { compactArrays: true });
  emit('caps.json', caps);
  writeReadme(meta, sizes);

  const uniq = new Set(warnings);
  if (uniq.size) {
    console.log(`\n${uniq.size} warning(s):`);
    for (const w of [...uniq].slice(0, 30)) console.log('  - ' + w);
    if (uniq.size > 30) console.log(`  ... ${uniq.size - 30} more`);
  }

  console.log('\nSanity check passed (Bulbasaur OK).');
  console.log('Wrote to', path.relative(ROOT, OUT_DIR) + ':');
  for (const [f, s] of sizes) console.log(`  ${f.padEnd(16)} ${(s / 1024).toFixed(1).padStart(8)} KB`);
  console.log(`\nSummary: ${speciesOut.length} species, ${Object.keys(movesOut).length} moves, ` +
    `${Object.keys(abilitiesOut).length} abilities, ${Object.keys(itemsOut).length} items, ` +
    `${areasOut.length} areas, ${caps.length} level caps.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
