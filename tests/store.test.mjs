import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store.js';

function storageFactice() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _brut: m,
  };
}

test('initialisation : données par défaut avec exercices préchargés', () => {
  const store = createStore(storageFactice());
  const d = store.getData();
  assert.equal(d.schemaVersion, 1);
  assert.ok(d.exercises.length >= 10);
  assert.deepEqual(d.sessions, []);
  assert.equal(d.settings.restDuration, 90);
});

test('addSet persiste immédiatement dans le storage', () => {
  const storage = storageFactice();
  const store = createStore(storage);
  const session = store.addSession();
  const exo = store.getData().exercises[0];
  store.addSet(session.id, exo.id, { reps: 10, weight: 12 });

  const persiste = JSON.parse(storage.getItem('musculog-data'));
  assert.equal(persiste.sessions[0].entries[0].sets[0].reps, 10);
  assert.equal(persiste.sessions[0].entries[0].sets[0].weight, 12);
  assert.ok(persiste.settings.updatedAt, 'updatedAt doit être mis à jour');
});

test('lastPerf renvoie les séries de la dernière séance contenant l’exercice', () => {
  const store = createStore(storageFactice());
  const exo = store.getData().exercises[0];

  const s1 = store.addSession();
  store.addSet(s1.id, exo.id, { reps: 8, weight: 10 });
  store.endSession(s1.id);

  const s2 = store.addSession();
  store.addSet(s2.id, exo.id, { reps: 10, weight: 12 });
  store.addSet(s2.id, exo.id, { reps: 9, weight: 12 });
  store.endSession(s2.id);

  const perf = store.lastPerf(exo.id);
  assert.equal(perf.sets.length, 2);
  assert.equal(perf.sets[0].weight, 12);

  // Une séance en cours ne compte pas comme "dernière perf"
  const s3 = store.addSession();
  const perf2 = store.lastPerf(exo.id, s3.id);
  assert.equal(perf2.sets[0].weight, 12);
});

test('addExercise ajoute un exercice personnalisé', () => {
  const store = createStore(storageFactice());
  const avant = store.getData().exercises.length;
  const exo = store.addExercise({ name: 'Curl marteau', type: 'halteres' });
  assert.equal(store.getData().exercises.length, avant + 1);
  assert.equal(exo.custom, true);
});

test('import rejette un JSON sans schemaVersion', () => {
  const store = createStore(storageFactice());
  assert.throws(() => store.import('{"foo": 1}'));
  assert.throws(() => store.import('pas du json'));
});

test('export puis import restaure les données', () => {
  const storage = storageFactice();
  const store = createStore(storage);
  const s = store.addSession();
  store.addSet(s.id, store.getData().exercises[0].id, { reps: 5, weight: 20 });
  const json = store.export();

  const store2 = createStore(storageFactice());
  store2.import(json);
  assert.equal(store2.getData().sessions.length, 1);
  assert.equal(store2.getData().sessions[0].entries[0].sets[0].weight, 20);
});
