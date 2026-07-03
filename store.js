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

function donneesDefaut() {
  return {
    schemaVersion: 1,
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
      data = JSON.parse(brut);
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

    addSession() {
      const session = {
        id: genererId('sea'),
        date: new Date().toISOString().slice(0, 10),
        startedAt: new Date().toISOString(),
        endedAt: null,
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
      if (!nouveau || nouveau.schemaVersion !== 1 || !Array.isArray(nouveau.sessions)) {
        throw new Error('Fichier invalide : ce n’est pas une sauvegarde MuscuLog.');
      }
      data = nouveau;
      ecrire();
    },
  };
}

export { CLE };
