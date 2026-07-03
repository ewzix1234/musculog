// MuscuLog — synchro GitHub Gist : push/pull du JSON complet, merge par horodatage

const API = 'https://api.github.com/gists';
const FICHIER = 'musculog-data.json';

// Le jeu de données au updatedAt le plus récent gagne ; les exercices custom
// des deux côtés sont conservés (union par id).
export function mergeData(local, remote) {
  const tLocal = Date.parse(local?.settings?.updatedAt || 0) || 0;
  const tRemote = Date.parse(remote?.settings?.updatedAt || 0) || 0;
  const gagnant = tRemote > tLocal ? remote : local;
  const perdant = gagnant === remote ? local : remote;

  const ids = new Set(gagnant.exercises.map((e) => e.id));
  for (const exo of perdant?.exercises || []) {
    if (exo.custom && !ids.has(exo.id)) gagnant.exercises.push(exo);
  }
  return gagnant;
}

export function createSync(store, fetchFn = fetch) {
  const sync = {
    status: 'local', // local | ok | attente | erreur
    onStatusChange: null,
  };

  function setStatus(s) {
    sync.status = s;
    if (sync.onStatusChange) sync.onStatusChange(s);
  }

  function entetes(token) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  sync.push = async function push() {
    const { gistToken, gistId } = store.getData().settings;
    if (!gistToken) { setStatus('local'); return; }

    // Le token ne doit jamais partir dans le gist
    const contenu = JSON.parse(store.export());
    contenu.settings = { ...contenu.settings, gistToken: '' };
    const body = JSON.stringify({
      description: 'Sauvegarde MuscuLog',
      public: false,
      files: { [FICHIER]: { content: JSON.stringify(contenu, null, 2) } },
    });

    try {
      const rep = gistId
        ? await fetchFn(`${API}/${gistId}`, { method: 'PATCH', headers: entetes(gistToken), body })
        : await fetchFn(API, { method: 'POST', headers: entetes(gistToken), body });

      if (!rep.ok) {
        setStatus(rep.status === 401 || rep.status === 404 ? 'erreur' : 'attente');
        return;
      }
      const gist = await rep.json();
      store.save((d) => {
        d.settings.gistId = gist.id;
        d.settings.lastSyncAt = new Date().toISOString();
      });
      setStatus('ok');
    } catch {
      setStatus('attente'); // hors-ligne : on réessaiera
    }
  };

  sync.pull = async function pull() {
    const { gistToken, gistId } = store.getData().settings;
    if (!gistToken || !gistId) return;

    try {
      const rep = await fetchFn(`${API}/${gistId}`, { method: 'GET', headers: entetes(gistToken) });
      if (!rep.ok) { setStatus('erreur'); return; }
      const gist = await rep.json();
      const fichier = gist.files?.[FICHIER];
      if (!fichier) { setStatus('erreur'); return; }

      let contenu = fichier.content;
      if (fichier.truncated && fichier.raw_url) {
        contenu = await (await fetchFn(fichier.raw_url)).text();
      }
      const distant = JSON.parse(contenu);
      const local = store.getData();
      // Les réglages locaux (token, durée de repos) restent locaux
      const reglagesLocaux = { gistToken: local.settings.gistToken, gistId, restDuration: local.settings.restDuration };
      const fusion = mergeData(local, distant);
      fusion.settings = { ...fusion.settings, ...reglagesLocaux };
      store.import(JSON.stringify(fusion));
      store.save((d) => { d.settings.lastSyncAt = new Date().toISOString(); });
      setStatus('ok');
    } catch {
      setStatus('attente');
    }
  };

  return sync;
}
