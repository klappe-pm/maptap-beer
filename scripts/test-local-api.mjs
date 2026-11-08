// Exercises the in-browser API against the built site: a full daily flight, a practice flight,
// a crew challenge round trip, and the error paths. Run after build-pages.mjs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { handle } = await import(fileURLToPath(new URL('../site/local-api/local-api.mjs', import.meta.url)));
const base = 'https://example.test/maptap-beer/api/';

async function call(path, body) {
  const res = await handle(new URL(base + path), body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
  return { status: res.status, data: await res.json() };
}

const me = await call('me');
assert.equal(me.status, 200);
assert.equal(me.data.user.name, 'Beer explorer');

const daily = await call('game', { mode: 'daily', country: 'World', settings: {} });
assert.equal(daily.status, 201);
assert.equal(daily.data.mode, 'daily');
assert.equal(daily.data.round, 0);
assert.ok(daily.data.question.clue);

const again = await call('game', { mode: 'daily' });
assert.equal(again.status, 200, 'second daily start resumes the same flight');
assert.equal(again.data.id, daily.data.id);

let game = daily.data;
for (let round = 0; round < 5; round++) {
  const g = await call('guess', { id: game.id, round, lat: 48.1, lng: 11.6 });
  assert.equal(g.status, 200);
  assert.ok(g.data.result.score >= 0 && g.data.result.score <= 1000);
  game = g.data.game;
}
assert.equal(game.complete, true);
assert.equal(game.question, null);
assert.equal((await call('guess', { id: game.id, round: 5, lat: 0, lng: 0 })).status, 409);
assert.equal((await call('guess', { id: game.id, round: 0, lat: 120, lng: 0 })).status, 400);

const board = await call('leaderboard');
assert.equal(board.data.entries[0].score, game.total);

const loaded = await call('game?id=' + encodeURIComponent(game.id));
assert.equal(loaded.data.total, game.total);
assert.equal((await call('game?id=nope')).status, 404);

const practice = await call('game', { mode: 'practice', country: 'Belgium', settings: { map: 'night' } });
assert.equal(practice.status, 201);
assert.equal(practice.data.settings.map, 'night');

assert.equal((await call('challenges', { title: 'x', crew: 'y' })).status, 400);
const made = await call('challenges', { title: 'Friday flight', crew: 'Tapistas', country: 'World', settings: { rivers: true } });
assert.equal(made.status, 201);
const fetched = await call('challenges?id=' + encodeURIComponent(made.data.challenge.id));
assert.equal(fetched.data.challenge.title, 'Friday flight');
assert.equal(fetched.data.challenge.settings.rivers, true);
assert.equal((await call('challenges')).data.challenges.length, 1);
assert.equal((await call('challenges?id=garbage')).status, 404);

const crewA = await call('game', { challengeId: made.data.challenge.id });
const crewB = await call('game', { challengeId: made.data.challenge.id });
assert.equal(crewA.data.question.id, crewB.data.question.id, 'every crew member gets the same first brewery');

// Place filters: every brewery in a filtered practice flight sits inside the chosen place.
const meta = JSON.parse((await import('node:fs')).readFileSync(new URL('../site/local-api/meta.json', import.meta.url), 'utf8'));
const { t: breweries } = await import(fileURLToPath(new URL('../site/local-api/game.js', import.meta.url)));
const byId = new Map(breweries.map((b) => [b.id, b]));
async function placeFlight(place) {
  const res = await call('game', { mode: 'practice', country: place, settings: {} });
  assert.equal(res.status, 201, `flight for ${place}: ${JSON.stringify(res.data)}`);
  const ids = [res.data.question.id];
  let game = res.data;
  for (let round = 0; round < 5; round++) {
    const g = await call('guess', { id: game.id, round, lat: 0, lng: 0 });
    ids[round] = g.data.result.brewery.id;
    game = g.data.game;
  }
  return ids.map((id) => byId.get(id));
}
for (const b of await placeFlight('Europe')) assert.equal(meta.continents[b.country], 'Europe');
for (const b of await placeFlight('Europe › Germany')) assert.equal(b.country, 'Germany');
for (const b of await placeFlight('Europe › Germany › Bavaria')) assert.equal(meta.regions[b.id], 'Bavaria');
for (const b of await placeFlight('North America › United States › Colorado › Denver')) assert.equal(b.city, 'Denver');
for (const b of await placeFlight('Germany')) assert.equal(b.country, 'Germany', 'bare country names still work');
assert.equal((await call('game', { mode: 'practice', country: 'Europe › Czechia', settings: {} })).status, 400, 'fewer than five breweries');

// GABF: a scored result carries the brewery's medal summary and region.
const medalist = Object.keys(meta.gabf).find((id) => byId.has(id) && meta.regions[id]);
const state = JSON.parse(store.get('maptap:pages:v1'));
const rigged = { ...Object.values(state.games)[0], id: 'gabf-check', round: 0, total: 0, results: [], finishedAt: null, breweryIds: [medalist, ...Object.values(state.games)[0].breweryIds.slice(1)] };
state.games['gabf-check'] = rigged;
store.set('maptap:pages:v1', JSON.stringify(state));
const scored = await call('guess', { id: 'gabf-check', round: 0, lat: 0, lng: 0 });
assert.equal(scored.data.result.brewery.gabf.slug, meta.gabf[medalist].slug);
assert.equal(scored.data.result.brewery.region, meta.regions[medalist]);

assert.equal((await call('unknown')).status, 404);
console.log('local api: all checks passed');
