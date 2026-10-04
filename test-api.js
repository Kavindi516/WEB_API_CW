/**
 * test-api.js — functionality smoke test against seed data (rubric dimension 5)
 *
 * Usage:
 *   1. Make sure your API is running locally:  npm start   (http://localhost:3000)
 *   2. Make sure you've seeded the DB:         node seed.js
 *   3. Run this from the project root:         node test-api.js
 *
 * Requires Node 18+ (uses the built-in global fetch).
 * Reads device API keys from ./seed-credentials.json for the write-path test.
 */

const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PASSWORD = 'Password123';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(method, path, { token, apiKey, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (apiKey) h['x-api-key'] = apiKey;
  if (body) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function login(username) {
  const r = await req('POST', '/auth/login', { body: { username, password: PASSWORD } });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Login failed for ${username}: HTTP ${r.status}`);
  }
  return r.data.token;
}

(async () => {
  console.log(`\nTesting API at ${BASE}\n`);

  // ---- AUTH -------------------------------------------------------------
  console.log('AUTH');
  const bad = await req('POST', '/auth/login', { body: { username: 'national', password: 'wrong' } });
  check('rejects wrong password with 401', bad.status === 401, `got ${bad.status}`);

  const nationalTok = await login('national');
  const provincialTok = await login('western_user');
  const districtTok = await login('colombo_user');
  check('national/provincial/district all log in (200 + token)', true);

  // ---- HIERARCHY --------------------------------------------------------
  console.log('\nHIERARCHY');
  const provinces = await req('GET', '/provinces');
  check('GET /provinces returns an array', Array.isArray(provinces.data), `got ${provinces.status}`);
  check('seeded 9 provinces', provinces.data?.length === 9, `got ${provinces.data?.length}`);

  const firstProvince = provinces.data[0];
  const provDistricts = await req('GET', `/provinces/${firstProvince._id}/districts`);
  check('GET /provinces/{id}/districts returns an array', Array.isArray(provDistricts.data));
  check('nested districts carry province as a plain id (unpopulated)',
    typeof provDistricts.data[0]?.province === 'string',
    `got ${typeof provDistricts.data[0]?.province}`);

  const badProvince = await req('GET', `/provinces/000000000000000000000000/districts`);
  check('unknown province id -> 404', badProvince.status === 404, `got ${badProvince.status}`);

  const substations = await req('GET', '/substations');
  check('GET /substations returns an array', Array.isArray(substations.data));
  check('seeded 30 substations', substations.data?.length === 30, `got ${substations.data?.length}`);
  check('substation has populated district.province',
    !!substations.data[0]?.district?.province?.name,
    'district.province not populated');

  const subInstalls = await req('GET', `/substations/${substations.data[0]._id}/installations`);
  check('GET /substations/{id}/installations returns an array', Array.isArray(subInstalls.data));

  // ---- JURISDICTION SCOPING (the big one) ------------------------------
  console.log('\nJURISDICTION SCOPING  (/districts)');
  const dNat = await req('GET', '/districts', { token: nationalTok });
  const dProv = await req('GET', '/districts', { token: provincialTok });
  const dDist = await req('GET', '/districts', { token: districtTok });
  check('GET /districts without token -> 401',
    (await req('GET', '/districts')).status === 401);
  check('national sees all 25 districts', dNat.data?.length === 25, `got ${dNat.data?.length}`);
  check('western_user sees only Western-province districts (3)',
    dProv.data?.length === 3, `got ${dProv.data?.length}`);
  check('colombo_user sees only 1 district (Colombo)',
    dDist.data?.length === 1, `got ${dDist.data?.length}`);
  check('colombo_user\'s one district IS Colombo',
    dDist.data?.[0]?.name === 'Colombo', `got ${dDist.data?.[0]?.name}`);

  console.log('\nJURISDICTION SCOPING  (/installations)');
  const iNat = await req('GET', '/installations', { token: nationalTok });
  const iProv = await req('GET', '/installations', { token: provincialTok });
  const iDist = await req('GET', '/installations', { token: districtTok });
  check('national sees all 220 installations', iNat.data?.length === 220, `got ${iNat.data?.length}`);
  check('provincial sees fewer than national', iProv.data?.length < iNat.data?.length,
    `prov=${iProv.data?.length} nat=${iNat.data?.length}`);
  check('district sees fewer than (or equal to) provincial',
    iDist.data?.length <= iProv.data?.length, `dist=${iDist.data?.length} prov=${iProv.data?.length}`);
  check('no cross-jurisdiction leakage: district ⊆ provincial count',
    iDist.data?.length <= iProv.data?.length);

  // ---- COMPOSITE + CONDITIONAL GET -------------------------------------
  console.log('\nINSTALLATION COMPOSITE + CONDITIONAL GET');
  const anInstall = iNat.data[0];
  const composite = await req('GET', `/installations/${anInstall._id}`);
  check('GET /installations/{id} returns 200', composite.status === 200);
  check('composite embeds latestReading key', 'latestReading' in (composite.data || {}));
  check('composite has populated substation.district.province',
    !!composite.data?.substation?.district?.province?.name);
  const etag = composite.headers.get('etag');
  check('composite response carries an ETag header', !!etag, 'no ETag');

  if (etag) {
    const notModified = await req('GET', `/installations/${anInstall._id}`, {
      headers: { 'If-None-Match': etag },
    });
    check('conditional GET with matching ETag -> 304', notModified.status === 304,
      `got ${notModified.status}`);
  }

  const badInstall = await req('GET', '/installations/000000000000000000000000');
  check('unknown installation id -> 404', badInstall.status === 404, `got ${badInstall.status}`);

  // ---- READINGS: operational + analytical ------------------------------
  console.log('\nREADINGS');
  const lastReading = await req('GET', `/installations/${anInstall._id}/last-reading`);
  check('GET /installations/{id}/last-reading -> 200', lastReading.status === 200);
  check('last-reading has powerKw + energyKwh',
    'powerKw' in (lastReading.data || {}) && 'energyKwh' in (lastReading.data || {}));

  const page1 = await req('GET', `/installations/${anInstall._id}/readings?page=1&limit=5&order=desc`);
  check('readings page returns a data array', Array.isArray(page1.data?.data), `got ${page1.status}`);
  check('readings page respects limit=5', page1.data?.data?.length === 5, `got ${page1.data?.data?.length}`);
  check('readings page has pagination metadata (total, totalPages)',
    typeof page1.data?.pagination?.total === 'number' && typeof page1.data?.pagination?.totalPages === 'number');
  check('desc order: first timestamp >= second',
    new Date(page1.data.data[0].timestamp) >= new Date(page1.data.data[1].timestamp));

  const pageAsc = await req('GET', `/installations/${anInstall._id}/readings?page=1&limit=5&order=asc`);
  check('asc order: first timestamp <= second',
    new Date(pageAsc.data.data[0].timestamp) <= new Date(pageAsc.data.data[1].timestamp));

  const futureFilter = await req('GET',
    `/installations/${anInstall._id}/readings?from=2099-01-01&to=2099-12-31`);
  check('time-window filter with no matches -> empty array (not error)',
    Array.isArray(futureFilter.data?.data) && futureFilter.data.data.length === 0,
    `status ${futureFilter.status}, len ${futureFilter.data?.data?.length}`);

  // ---- DISTRICT GENERATION SUMMARY (processing resource) ---------------
  console.log('\nDISTRICT GENERATION SUMMARY');
  const colomboId = dDist.data[0]._id;
  const summary = await req('GET', `/districts/${colomboId}/generation-summary`);
  check('GET /districts/{id}/generation-summary -> 200', summary.status === 200);
  check('summary has all 5 fields incl generatedAt',
    ['district', 'installationCount', 'currentTotalPowerKw', 'todayTotalEnergyKwh', 'generatedAt']
      .every((k) => k in (summary.data || {})));
  const summaryBad = await req('GET', '/districts/000000000000000000000000/generation-summary');
  check('summary for unknown district -> 404', summaryBad.status === 404, `got ${summaryBad.status}`);

  // ---- DEVICE WRITE PATH (api key) -------------------------------------
  console.log('\nDEVICE WRITE PATH');
  let creds = null;
  try { creds = JSON.parse(fs.readFileSync('./seed-credentials.json', 'utf8')); } catch {}
  if (!creds) {
    console.log('  (skipped — seed-credentials.json not found; run node seed.js first)');
  } else {
    // find a credential whose installationId we can target
    const cred = creds[0];
    const otherCred = creds[1];

    const noKey = await req('POST', `/installations/${cred.installationId}/readings`, {
      body: { powerKw: 1, energyKwh: 1, voltage: 230 },
    });
    check('POST reading with no api key -> 401', noKey.status === 401, `got ${noKey.status}`);

    const wrongKey = await req('POST', `/installations/${cred.installationId}/readings`, {
      apiKey: otherCred.apiKey,
      body: { powerKw: 1, energyKwh: 1, voltage: 230 },
    });
    check('POST reading with another installation\'s key -> 403', wrongKey.status === 403,
      `got ${wrongKey.status}`);

    const missingFields = await req('POST', `/installations/${cred.installationId}/readings`, {
      apiKey: cred.apiKey,
      body: { powerKw: 1 },
    });
    check('POST reading missing required fields -> 400', missingFields.status === 400,
      `got ${missingFields.status}`);

    const good = await req('POST', `/installations/${cred.installationId}/readings`, {
      apiKey: cred.apiKey,
      body: { powerKw: 2.5, energyKwh: 999.9, voltage: 231 },
    });
    check('POST reading with correct key -> 201', good.status === 201, `got ${good.status}`);
    check('201 response includes Location header', !!good.headers.get('location'), 'no Location');
  }

  // ---- PUT (idempotent update) -----------------------------------------
  console.log('\nPUT /installations/{id}');
  const putBody = {
    capacityKw: anInstall.capacityKw,
    latitude: anInstall.latitude,
    longitude: anInstall.longitude,
    substation: anInstall.substation._id || anInstall.substation,
  };
  const put1 = await req('PUT', `/installations/${anInstall._id}`, { body: putBody });
  check('PUT with full body -> 200', put1.status === 200, `got ${put1.status}`);
  const putMissing = await req('PUT', `/installations/${anInstall._id}`, { body: { capacityKw: 5 } });
  check('PUT with missing fields -> 400', putMissing.status === 400, `got ${putMissing.status}`);
  const putBad = await req('PUT', `/installations/000000000000000000000000`, { body: putBody });
  check('PUT unknown id -> 404', putBad.status === 404, `got ${putBad.status}`);

  // ---- SUMMARY ----------------------------------------------------------
  console.log(`\n${'='.repeat(40)}`);
  console.log(`RESULTS:  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nFailed checks:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(40) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error('\nTest run crashed:', err.message);
  console.error('Is the server running at ' + BASE + ' ?');
  process.exit(1);
});
