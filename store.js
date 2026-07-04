// MuscuLog — store : lecture/écriture localStorage, source de vérité des données

const CLE = 'musculog-data';

const EXERCICES_DEFAUT = [
  { nom: 'Pompes', type: 'corps' },
  { nom: 'Tractions', type: 'corps' },
  { nom: 'Dips', type: 'corps' },
  { nom: 'Squats', type: 'corps' },
  { nom: 'Fentes', type: 'corps' },
  { nom: 'Gainage (secondes)', type: 'corps' },
  { nom: 'Curl biceps haltères', type: 'halteres' },
  { nom: 'Développé épaules haltères', type: 'halteres' },
  { nom: 'Élévations latérales', type: 'halteres' },
  { nom: 'Rowing haltère', type: 'halteres' },
];

// Amène un jeu de données v1/v2 (ou incomplet) au schéma courant
function migrer(data) {
  if (data.schemaVersion === 1) data.schemaVersion = 2;
  if (!Array.isArray(data.templates)) data.templates = [];
  if (!Array.isArray(data.plans)) data.plans = [];
  if (data.schemaVersion === 2) {
    data.schemaVersion = 3;
    for (const t of [...data.templates, ...data.plans]) {
      if (!Array.isArray(t.items)) {
        t.items = (t.exerciseIds || []).map((id) => ({ exerciseId: id, sets: 3, reps: 10 }));
        delete t.exerciseIds;
      }
    }
  }
  return data;
}

function donneesDefaut() {
  return {
    schemaVersion: 3,
    templates: [],
    plans: [],
    exercises: EXERCICES_DEFAUT.map((e, i) => ({
      id: `exo-${i + 1}`,
      name: e.nom,
      type: e.type,
      custom: false,
    })),
    sessions: [],
    settings: {
      restDuration: 90,
      gistToken: '',
      gistId: '',
      lastSyncAt: null,
      updatedAt: null,
    },
  };
}

function genererId(prefixe) {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createStore(storage) {
  let data;
  const brut = storage.getItem(CLE);
  if (brut) {
    try {
      data = migrer(JSON.parse(brut));
    } catch {
      data = donneesDefaut();
    }
  } else {
    data = donneesDefaut();
  }

  function ecrire() {
    data.settings.updatedAt = new Date().toISOString();
    storage.setItem(CLE, JSON.stringify(data));
  }

  return {
    getData() {
      return data;
    },

    // Toute mutation externe passe par save() pour garantir la persistance immédiate
    save(mutator) {
      if (mutator) mutator(data);
      ecrire();
    },

    addSession(planId = null) {
      const session = {
        id: genererId('sea'),
        date: new Date().toISOString().slice(0, 10),
        startedAt: new Date().toISOString(),
        endedAt: null,
        planId,
        entries: [],
      };
      data.sessions.push(session);
      ecrire();
      return session;
    },

    endSession(sessionId) {
      const s = data.sessions.find((x) => x.id === sessionId);
      if (s) {
        s.endedAt = new Date().toISOString();
        ecrire();
      }
      return s;
    },

    addSet(sessionId, exerciseId, { reps, weight }) {
      const s = data.sessions.find((x) => x.id === sessionId);
      if (!s) throw new Error(`Séance introuvable : ${sessionId}`);
      let entry = s.entries.find((e) => e.exerciseId === exerciseId);
      if (!entry) {
        entry = { exerciseId, sets: [] };
        s.entries.push(entry);
      }
      entry.sets.push({ reps: Number(reps) || 0, weight: Number(weight) || 0 });
      ecrire();
      return entry;
    },

    addExercise({ name, type }) {
      const exo = { id: genererId('exo'), name: String(name).trim(), type, custom: true };
      data.exercises.push(exo);
      ecrire();
      return exo;
    },

    // Dernière performance sur un exercice, hors séance en cours (excludeSessionId)
    lastPerf(exerciseId, excludeSessionId = null) {
      for (let i = data.sessions.length - 1; i >= 0; i--) {
        const s = data.sessions[i];
        if (s.id === excludeSessionId) continue;
        const entry = s.entries.find((e) => e.exerciseId === exerciseId);
        if (entry && entry.sets.length) {
          return { date: s.date, sets: entry.sets };
        }
      }
      return null;
    },

    deleteSession(sessionId) {
      data.sessions = data.sessions.filter((s) => s.id !== sessionId);
      ecrire();
    },

    addTemplate({ name, items }) {
      const t = { id: genererId('mod'), name: String(name).trim(), items: items.map((i) => ({ ...i })) };
      data.templates.push(t);
      ecrire();
      return t;
    },

    updateTemplate(id, { name, items }) {
      const t = data.templates.find((x) => x.id === id);
      if (!t) return;
      if (name !== undefined) t.name = String(name).trim();
      if (items !== undefined) t.items = items.map((i) => ({ ...i }));
      ecrire();
    },

    deleteTemplate(id) {
      data.templates = data.templates.filter((t) => t.id !== id);
      ecrire();
    },

    // Copie indépendante du modèle : modifier le plan ne touche jamais le modèle
    addPlan({ date, templateId }) {
      const modele = data.templates.find((t) => t.id === templateId);
      const p = {
        id: genererId('plan'),
        date,
        templateId: templateId || null,
        name: modele ? modele.name : 'Séance',
        items: modele ? modele.items.map((i) => ({ ...i })) : [],
      };
      data.plans.push(p);
      ecrire();
      return p;
    },

    updatePlan(id, { name, items, date }) {
      const p = data.plans.find((x) => x.id === id);
      if (!p) return;
      if (name !== undefined) p.name = String(name).trim();
      if (items !== undefined) p.items = items.map((i) => ({ ...i }));
      if (date !== undefined) p.date = date;
      ecrire();
    },

    deletePlan(id) {
      data.plans = data.plans.filter((p) => p.id !== id);
      ecrire();
    },

    export() {
      return JSON.stringify(data, null, 2);
    },

    import(json) {
      let nouveau;
      try {
        nouveau = JSON.parse(json);
      } catch {
        throw new Error('Fichier illisible : ce n’est pas du JSON valide.');
      }
      if (!nouveau || ![1, 2, 3].includes(nouveau.schemaVersion) || !Array.isArray(nouveau.sessions)) {
        throw new Error('Fichier invalide : ce n’est pas une sauvegarde MuscuLog.');
      }
      data = migrer(nouveau);
      ecrire();
    },
  };
}

export { CLE };
