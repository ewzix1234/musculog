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
  assert.equal(d.schemaVersion, 2);
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

/* ==================== v2 : modèles, planning, suppression ==================== */

test('v2 : les données par défaut ont templates et plans, et une v1 est migrée', () => {
  const storage = storageFactice();
  const store = createStore(storage);
  assert.equal(store.getData().schemaVersion, 2);
  assert.deepEqual(store.getData().templates, []);
  assert.deepEqual(store.getData().plans, []);

  // Migration : un jeu v1 existant gagne templates/plans sans perdre ses séances
  const v1 = JSON.parse(store.export());
  v1.schemaVersion = 1;
  delete v1.templates; delete v1.plans;
  v1.sessions = [{ id: 's1', date: '2026-07-01', startedAt: 'x', endedAt: 'y', entries: [] }];
  const storage2 = storageFactice();
  storage2.setItem('musculog-data', JSON.stringify(v1));
  const store2 = createStore(storage2);
  assert.equal(store2.getData().schemaVersion, 2);
  assert.equal(store2.getData().sessions.length, 1);
  assert.deepEqual(store2.getData().templates, []);
});

test('v2 : import accepte une sauvegarde v1 et la migre', () => {
  const store = createStore(storageFactice());
  const v1 = JSON.parse(store.export());
  v1.schemaVersion = 1;
  delete v1.templates; delete v1.plans;
  store.import(JSON.stringify(v1));
  assert.equal(store.getData().schemaVersion, 2);
});

test('v2 : CRUD des modèles de séance', () => {
  const store = createStore(storageFactice());
  const t = store.addTemplate({ name: 'Haut du corps', exerciseIds: ['exo-1', 'exo-7'] });
  assert.equal(store.getData().templates.length, 1);
  store.updateTemplate(t.id, { name: 'Haut du corps V2', exerciseIds: ['exo-1'] });
  assert.equal(store.getData().templates[0].name, 'Haut du corps V2');
  assert.deepEqual(store.getData().templates[0].exerciseIds, ['exo-1']);
  store.deleteTemplate(t.id);
  assert.equal(store.getData().templates.length, 0);
});

test('v2 : poser un modèle sur un jour crée une copie indépendante', () => {
  const store = createStore(storageFactice());
  const t = store.addTemplate({ name: 'Jambes', exerciseIds: ['exo-4', 'exo-5'] });
  const p = store.addPlan({ date: '2026-07-10', templateId: t.id });
  assert.equal(p.name, 'Jambes');
  assert.deepEqual(p.exerciseIds, ['exo-4', 'exo-5']);

  // Modifier l'instance du jour ne touche pas le modèle
  store.updatePlan(p.id, { name: 'Jambes light', exerciseIds: ['exo-4'] });
  assert.equal(store.getData().templates[0].name, 'Jambes');
  assert.deepEqual(store.getData().templates[0].exerciseIds, ['exo-4', 'exo-5']);
  assert.equal(store.getData().plans[0].name, 'Jambes light');

  store.deletePlan(p.id);
  assert.equal(store.getData().plans.length, 0);
});

test('v2 : deleteSession supprime une séance', () => {
  const store = createStore(storageFactice());
  const s = store.addSession();
  store.endSession(s.id);
  assert.equal(store.getData().sessions.length, 1);
  store.deleteSession(s.id);
  assert.equal(store.getData().sessions.length, 0);
});
