#!/usr/bin/env node
import fs from 'fs';

const BASE = process.env['API_BASE'] || 'http://124.222.233.30/api/v1';
const USERNAME = process.env['API_USERNAME'] || 'superadmin';
const PASSWORD = process.env['API_PASSWORD'] || 'admin123456';
const MATCH_ID = Number(process.env['MATCH_ID'] || '4');
const CSV_PATH = process.env['CSV_PATH'] || '/Users/kai/Desktop/四周年武汉赛分组名单.csv';

function mapCsvCategory(input) {
  const value = String(input || '').trim().toUpperCase();
  if (value === 'J') return 'J';
  if (value === 'S') return 'S';
  if (value === 'SJ') return 'SJ';
  if (value === 'L') return 'L';
  return null;
}

function parseCsv(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  return lines
    .slice(1)
    .map((line) => {
      const parts = line.split(',');
      return {
        squad: (parts[0] || '').trim(),
        name: (parts[1] || '').trim(),
        category_code: mapCsvCategory(parts[3] || ''),
      };
    })
    .filter((row) => row.squad && row.name && row.category_code);
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok || json.success === false) {
    throw new Error(`${method} ${path} -> ${response.status}: ${json.error || JSON.stringify(json)}`);
  }

  return json.data;
}

async function main() {
  const csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

  const auth = await api('/auth/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  const token = auth.token || auth.access_token;
  if (!token) {
    throw new Error('Login succeeded but no token returned');
  }

  const shooters = await api(`/matches/${MATCH_ID}/shooters`, { token });
  const shooterByKey = new Map(shooters.map((s) => [`${s.squad_name}|${s.name}`, s]));

  let updated = 0;
  let missing = 0;

  for (const row of csvRows) {
    const shooter = shooterByKey.get(`${row.squad}|${row.name}`);
    if (!shooter) {
      missing++;
      continue;
    }

    const payload = {
      category_code: row.category_code,
      ...(row.category_code === 'L' ? { gender: 'female' } : {}),
    };

    await api(`/shooters/${shooter.id}`, {
      method: 'PUT',
      token,
      body: payload,
    });
    updated++;
  }

  const verify = await api(`/matches/${MATCH_ID}/shooters`, { token });
  const hasCategoryField = verify.length > 0 && Object.prototype.hasOwnProperty.call(verify[0], 'category_code');
  const categoryCount = hasCategoryField ? verify.filter((s) => s.category_code).length : 0;

  console.log(
    JSON.stringify(
      {
        base: BASE,
        match_id: MATCH_ID,
        csv_category_rows: csvRows.length,
        updated,
        missing,
        has_category_field_in_api: hasCategoryField,
        non_null_category_count: categoryCount,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});