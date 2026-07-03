import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store.js';
import { createSync, mergeData } from '../sync.js';

function storageFactice() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

function donnees(updatedAt, sessions = []) {
  return {
    schemaVersion: 1,
    exercises: [{ id: 'exo-1', name: 'Pompes', type: 'corps', custom: false }],
    sessions,
    settings: { restDuration: 90, gistToken: 't', gistId: '', lastSyncAt: null, updatedAt },
  };
}

test('mergeData garde le jeu de données le plus récent', () => {
  const ancien = donnees('2026-01-01T10:00:00Z', [{ id: 's1' }]);
  const recent = donnees('2026-06-01T10:00:00Z', [{ id: 's1' }, { id: 's2' }]);
  assert.equal(mergeData(ancien, recent).sessions.length, 2);
  assert.equal(mergeData(recent, ancien).sessions.length, 2);
});

test('mergeData fait l’union des exercices custom', () => {
  const local = donnees('2026-06-01T10:00:00Z');
  local.exercises.push({ id: 'exo-a', name: 'Curl', type: 'halteres', custom: true });
  const distant = donnees('2026-01-01T10:00:00Z');
  distant.exercises.push({ id: 'exo-b', name: 'Rowing', type: 'halteres', custom: true });

  const fusion = mergeData(local, distant);
  const ids = fusion.exercises.map((e) => e.id);
  assert.ok(ids.includes('exo-a') && ids.includes('exo-b'));
});

test('push crée un gist (POST) puis mémorise le gistId', async () => {
  const storage = storageFactice();
  const store = createStore(storage);
  store.save((d) => { d.settings.gistToken = 'ghp_test'; });

  const appels = [];
  const fetchFactice = async (url, opts) => {
    appels.push({ url, opts });
    return { ok: true, status: 201, json: async () => ({ id: 'gist123' }) };
  };

  const sync = createSync(store, fetchFactice);
  await sync.push();

  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, 'https://api.github.com/gists');
  assert.equal(appels[0].opts.method, 'POST');
  assert.equal(appels[0].opts.headers['Authorization'], 'Bearer ghp_test');
  const corps = JSON.parse(appels[0].opts.body);
  assert.equal(corps.public, false);
  assert.ok(corps.files['musculog-data.json'].content.includes('schemaVersion'));
  assert.equal(store.getData().settings.gistId, 'gist123');
  assert.equal(sync.status, 'ok');
});

test('push met à jour le gist existant (PATCH)', async () => {
  const store = createStore(storageFactice());
  store.save((d) => { d.settings.gistToken = 'ghp_test'; d.settings.gistId = 'gist123'; });

  const appels = [];
  const fetchFactice = async (url, opts) => {
    appels.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ id: 'gist123' }) };
  };

  await createSync(store, fetchFactice).push();
  assert.equal(appels[0].url, 'https://api.github.com/gists/gist123');
  assert.equal(appels[0].opts.method, 'PATCH');
});

test('push en échec réseau → statut attente, sans perte locale', async () => {
  const store = createStore(storageFactice());
  store.save((d) => { d.settings.gistToken = 'ghp_test'; });
  const sync = createSync(store, async () => { throw new Error('offline'); });
  await sync.push();
  assert.equal(sync.status, 'attente');
});

test('pull fusionne les données distantes plus récentes', async () => {
  const store = createStore(storageFactice());
  store.save((d) => { d.settings.gistToken = 'ghp_test'; d.settings.gistId = 'gist123'; });

  const distant = donnees('2099-01-01T00:00:00Z', [{ id: 'sX', date: '2099-01-01', entries: [] }]);
  const fetchFactice = async () => ({
    ok: true, status: 200,
    json: async () => ({ id: 'gist123', files: { 'musculog-data.json': { content: JSON.stringify(distant), truncated: false } } }),
  });

  await createSync(store, fetchFactice).pull();
  assert.equal(store.getData().sessions.length, 1);
  assert.equal(store.getData().sessions[0].id, 'sX');
});
