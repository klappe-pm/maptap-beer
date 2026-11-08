// Browser implementation of the MapTap.beer /api routes for the static GitHub Pages edition.
// It mirrors the Worker route handlers in the prebuilt release: same flight selection, scoring,
// and validation, with games kept in this browser's localStorage instead of a D1 database.
import {
  a as scoreFor,
  c as normalizeSettings,
  i as clean,
  n as distanceKm,
  o as pickFlight,
  r as questionFor,
  s as dailySettings,
  t as breweries,
} from './game.js';

const STORE_KEY = 'maptap:pages:v1';
const PLAYER = 'Beer explorer';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { games: raw.games || {}, challenges: raw.challenges || [] };
  } catch {
    return { games: {}, challenges: [] };
  }
}

function save(state) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    throw new Error('Your browser storage is full or disabled, so this flight could not be saved.');
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function view(row) {
  const settings = normalizeSettings(row.settings);
  const ids = row.breweryIds;
  return {
    id: row.id,
    mode: row.mode,
    date: row.date,
    round: row.round,
    total: row.total,
    results: row.results,
    settings,
    complete: row.round >= ids.length,
    question: row.round < ids.length ? questionFor(ids[row.round], settings) : null,
    challengeId: row.challengeId,
  };
}

// Crew challenges travel inside their own id, so a shared link works without a server.
function encodeChallenge(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'c1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeChallenge(id) {
  if (typeof id !== 'string' || !id.startsWith('c1.')) return null;
  try {
    const b64 = id.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const title = clean(data.t);
    const crew = clean(data.c);
    if (title.length < 3 || crew.length < 2) return null;
    return {
      id,
      title,
      crew,
      country: clean(data.k) || 'World',
      settings: normalizeSettings(data.s),
      createdAt: Number(data.at) || 0,
    };
  } catch {
    return null;
  }
}

function publicChallenge(c) {
  return { id: c.id, title: c.title, crew: c.crew, settings: c.settings, createdAt: c.createdAt };
}

function body(init) {
  try {
    const parsed = JSON.parse(init?.body || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error('Invalid request body.');
  }
}

function getMe() {
  return json({ user: { name: PLAYER, email: null, local: true } });
}

function getChallenges(url) {
  const id = url.searchParams.get('id');
  if (id) {
    const c = decodeChallenge(id);
    return c ? json({ challenge: publicChallenge(c) }) : json({ error: 'Challenge not found.' }, 404);
  }
  const list = load().challenges
    .map(decodeChallenge)
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30)
    .map(publicChallenge);
  return json({ challenges: list });
}

function postChallenge(init) {
  const d = body(init);
  const title = clean(d.title);
  const crew = clean(d.crew);
  if (title.length < 3 || crew.length < 2) return json({ error: 'Add a challenge title and a crew name.' }, 400);
  const country = clean(d.country) || 'World';
  const settings = normalizeSettings(d.settings);
  const createdAt = Date.now();
  const id = encodeChallenge({ t: title, c: crew, k: country, s: settings, at: createdAt });
  if (pickFlight(id, country).length < 5) return json({ error: 'Choose a country with at least five breweries.' }, 400);
  const state = load();
  state.challenges = [id, ...state.challenges.filter((x) => x !== id)].slice(0, 30);
  save(state);
  return json({ challenge: { id, title, crew, settings, createdAt } }, 201);
}

function postGame(init) {
  const d = body(init);
  const date = today();
  const mode = d.challengeId ? 'challenge' : d.mode === 'practice' ? 'practice' : 'daily';
  let settings = mode === 'daily' ? dailySettings : normalizeSettings(d.settings);
  let ids;
  let challenge = null;
  if (mode === 'challenge') {
    challenge = decodeChallenge(String(d.challengeId));
    if (!challenge) return json({ error: 'This challenge could not be found.' }, 404);
    ids = pickFlight(challenge.id, challenge.country);
    settings = challenge.settings;
  } else {
    ids = pickFlight(
      mode === 'daily' ? date : uuid(),
      mode === 'daily' ? 'World' : typeof d.country === 'string' ? d.country : 'World',
      mode === 'daily',
    );
  }
  if (ids.length < 5) {
    return json({ error: 'This country needs at least five geocoded breweries. Choose a different country.' }, 400);
  }
  const state = load();
  if (mode === 'daily') {
    const existing = Object.values(state.games).find((g) => g.mode === 'daily' && g.date === date);
    if (existing) return json(view(existing), 200);
  }
  const row = {
    id: uuid(),
    player: PLAYER,
    mode,
    date,
    challengeId: challenge?.id ?? null,
    breweryIds: ids,
    settings,
    round: 0,
    total: 0,
    results: [],
    createdAt: Date.now(),
    finishedAt: null,
  };
  state.games[row.id] = row;
  prune(state);
  save(state);
  return json(view(row), 201);
}

// Keep storage bounded: finished practice flights older than the newest 200 games are dropped.
function prune(state) {
  const rows = Object.values(state.games).sort((a, b) => b.createdAt - a.createdAt);
  for (const row of rows.slice(200)) {
    if (row.mode === 'practice') delete state.games[row.id];
  }
}

function getGame(url) {
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing game.' }, 400);
  const row = load().games[id];
  return row ? json(view(row)) : json({ error: 'Game not found.' }, 404);
}

function postGuess(init) {
  const { lat, lng, round, id } = body(init);
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180 ||
    !Number.isInteger(round)
  ) {
    return json({ error: 'Choose a valid location on the globe.' }, 400);
  }
  const state = load();
  const row = state.games[String(id)];
  if (!row) return json({ error: 'Flight not found.' }, 404);
  if (row.round !== round || row.round >= 5) {
    return json({ error: 'This round has already been scored. Reload your flight.' }, 409);
  }
  const brewery = breweries.find((b) => b.id === row.breweryIds[round]);
  const km = distanceKm({ lat, lng }, brewery);
  const score = scoreFor(km);
  const result = { brewery, guess: { lat, lng }, distance: Math.round(km), score };
  row.results = [...row.results, result];
  row.round = round + 1;
  row.total += score;
  row.finishedAt = round === 4 ? Date.now() : null;
  save(state);
  return json({ result, game: view(row) });
}

function getLeaderboard(url) {
  const challenge = url.searchParams.get('challenge');
  const date = url.searchParams.get('date') || today();
  const finished = Object.values(load().games).filter(
    (g) => g.finishedAt && (challenge ? g.challengeId === challenge : g.mode === 'daily' && g.date === date),
  );
  if (!finished.length) return json({ entries: [] });
  const best = Math.max(...finished.map((g) => g.total));
  return json({ entries: [{ rank: 1, player: 'You (this device)', score: best }] });
}

const routes = {
  'GET me': getMe,
  'GET challenges': getChallenges,
  'POST challenges': (_url, init) => postChallenge(init),
  'GET game': getGame,
  'POST game': (_url, init) => postGame(init),
  'POST guess': (_url, init) => postGuess(init),
  'GET leaderboard': getLeaderboard,
};

export async function handle(url, init) {
  const method = (init?.method || 'GET').toUpperCase();
  const name = url.pathname.split('/api/').pop().replace(/\/$/, '');
  const route = routes[`${method} ${name}`];
  if (!route) return json({ error: 'Not found.' }, 404);
  try {
    return route(url, init);
  } catch (error) {
    return json({ error: error?.message || 'Something went wrong. Please try again.' }, error?.message === 'Invalid request body.' ? 400 : 500);
  }
}
