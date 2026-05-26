#!/usr/bin/env node
// Sync match shooters from CSV (squad assignment, division, category, club, gender).
// Updates existing shooters by name; creates missing ones; never deletes.
import fs from 'fs';

const BASE = process.env['API_BASE'] || 'http://124.222.233.30/api/v1';
const USERNAME = process.env['API_USERNAME'] || 'superadmin';
const PASSWORD = process.env['API_PASSWORD'] || 'admin123456';
const MATCH_ID = Number(process.env['MATCH_ID'] || '4');
const CSV_PATH = process.env['CSV_PATH'] || '/Users/kai/Desktop/四周年武汉赛分组名单.csv';
const DRY_RUN = process.env['DRY_RUN'] === '1';

const DIVISION_BY_CN = {
  '原厂组': 'production',
  '原厂光学组': 'optics',
  '标准组': 'standard',
  '开放组': 'open',
  '经典组': 'classic',
};

function mapCategory(input) {
  const v = String(input || '').trim().toUpperCase();
  if (['J', 'S', 'SJ', 'L'].includes(v)) return v;
  return null;
}

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    return {
      squad: (parts[0] || '').trim(),
      name: (parts[1] || '').trim(),
      division_cn: (parts[2] || '').trim(),
      category_code: mapCategory(parts[3] || ''),
      club: (parts[4] || '').trim() || null,
    };
  }).filter((r) => r.squad && r.name);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok || json.success === false) {
    throw new Error(`${method} ${path} -> ${r.status}: ${json.error || JSON.stringify(json)}`);
  }
  return json.data;
}

function diffPayload(shooter, want) {
  const payload = {};
  for (const k of Object.keys(want)) {
    const cur = shooter[k];
    const next = want[k];
    if (next === undefined) continue;
    // Treat null and undefined as equivalent for comparison
    const curN = cur == null ? null : cur;
    const nextN = next == null ? null : next;
    if (curN !== nextN) payload[k] = next;
  }
  return payload;
}

async function main() {
  const csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

  const auth = await api('/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  const token = auth.token || auth.access_token;
  if (!token) throw new Error('No token returned from login');

  const divisions = await api(`/matches/${MATCH_ID}/divisions`, { token });
  const divIdByCode = new Map(divisions.map((d) => [d.code, d.id]));

  const squads = await api(`/matches/${MATCH_ID}/squads`, { token });
  const squadIdByName = new Map(squads.map((s) => [s.name, s.id]));

  // Ensure all squads in CSV exist
  const csvSquadNames = [...new Set(csvRows.map((r) => r.squad))];
  let nextSort = (squads.reduce((m, s) => Math.max(m, s.sort_order || 0), 0)) + 1;
  for (const name of csvSquadNames) {
    if (!squadIdByName.has(name)) {
      if (DRY_RUN) {
        console.log(`[DRY] CREATE squad ${name}`);
        squadIdByName.set(name, -nextSort);
      } else {
        const created = await api(`/matches/${MATCH_ID}/squads`, {
          method: 'POST', token, body: { name, sort_order: nextSort },
        });
        squadIdByName.set(name, created.id);
      }
      nextSort++;
    }
  }

  const shooters = await api(`/matches/${MATCH_ID}/shooters`, { token });
  const shooterByName = new Map();
  for (const s of shooters) {
    if (!shooterByName.has(s.name)) shooterByName.set(s.name, s);
  }
  const existingBibs = new Set(shooters.map((s) => String(s.bib_number)));
  let nextBibNum = shooters.reduce((m, s) => {
    const n = parseInt(String(s.bib_number), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  function nextBib() {
    let bib;
    do {
      nextBibNum += 1;
      bib = String(nextBibNum).padStart(3, '0');
    } while (existingBibs.has(bib));
    existingBibs.add(bib);
    return bib;
  }

  let updated = 0, unchanged = 0, created = 0, skippedNoDivision = 0;
  const updates = [], creates = [], skips = [];

  for (const row of csvRows) {
    const code = DIVISION_BY_CN[row.division_cn];
    const divisionId = code ? divIdByCode.get(code) : undefined;
    if (!divisionId) {
      skippedNoDivision++;
      skips.push(`${row.squad}|${row.name}|${row.division_cn}`);
      continue;
    }
    const squadId = squadIdByName.get(row.squad);
    const want = {
      division_id: divisionId,
      squad_id: squadId,
      category_code: row.category_code,
      club: row.club,
    };
    if (row.category_code === 'L') want.gender = 'female';

    const existing = shooterByName.get(row.name);
    if (existing) {
      const payload = diffPayload(existing, want);
      if (Object.keys(payload).length === 0) { unchanged++; continue; }
      if (DRY_RUN) {
        console.log(`[DRY] UPDATE ${existing.id} ${row.name}`, payload);
      } else {
        await api(`/shooters/${existing.id}`, { method: 'PUT', token, body: payload });
      }
      updates.push(`${row.name}: ${JSON.stringify(payload)}`);
      updated++;
    } else {
      const body = {
        division_id: divisionId,
        squad_id: squadId,
        name: row.name,
        bib_number: nextBib(),
        ...(row.category_code ? { category_code: row.category_code } : {}),
        ...(row.club ? { club: row.club } : {}),
        ...(row.category_code === 'L' ? { gender: 'female' } : {}),
      };
      if (DRY_RUN) {
        console.log(`[DRY] CREATE ${row.name}`, body);
      } else {
        const newShooter = await api(`/matches/${MATCH_ID}/shooters`, {
          method: 'POST', token, body,
        });
        shooterByName.set(row.name, newShooter);
      }
      creates.push(`${row.name} -> ${row.squad}/${code}`);
      created++;
    }
  }

  console.log(JSON.stringify({
    base: BASE,
    match_id: MATCH_ID,
    csv_rows: csvRows.length,
    dry_run: DRY_RUN,
    updated,
    unchanged,
    created,
    skipped_no_division: skippedNoDivision,
  }, null, 2));
  if (skips.length) console.log('\nSkipped (no division):\n  ' + skips.join('\n  '));
  if (creates.length) console.log('\nCreated:\n  ' + creates.join('\n  '));
  if (updates.length && updates.length <= 50) console.log('\nUpdates:\n  ' + updates.join('\n  '));
}

main().catch((err) => { console.error(String(err)); process.exit(1); });
