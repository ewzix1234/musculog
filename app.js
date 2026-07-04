// MuscuLog — couche UI : rendu des écrans et orchestration store/sync/timer

import { createStore } from './store.js';
import { createSync } from './sync.js';
import { createTimer, debloquerAudio } from './timer.js';

const store = createStore(localStorage);
const sync = createSync(store);

/* ==================== Synchro : statut + push différé ==================== */

const pillule = document.getElementById('statut-sync');
const pilluleTexte = document.getElementById('statut-sync-texte');
const LIBELLES_SYNC = { local: 'Local', ok: 'Synchronisé', attente: 'En attente', erreur: 'Erreur' };

sync.onStatusChange = (etat) => {
  pillule.dataset.etat = etat;
  pilluleTexte.textContent = LIBELLES_SYNC[etat] || etat;
};

let pushPrevu = null;
function planifierPush() {
  clearTimeout(pushPrevu);
  pushPrevu = setTimeout(() => sync.push(), 1500);
}

window.addEventListener('online', () => {
  if (sync.status === 'attente') sync.push();
});

/* ==================== Timer de repos ==================== */

const overlay = document.getElementById('timer-overlay');
const chiffre = document.getElementById('timer-chiffre');
const anneau = document.getElementById('timer-anneau');
const CIRCONFERENCE = 282.74;

function formaterSecondes(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const timer = createTimer({
  onTick(restant, total) {
    chiffre.textContent = formaterSecondes(restant);
    anneau.style.strokeDashoffset = total > 0 ? String(CIRCONFERENCE * (1 - restant / total)) : '0';
  },
  onEnd() {
    overlay.hidden = true;
    // Signal visuel : flash vert (utile iPhone en mode silencieux, sans vibration)
    const flash = document.createElement('div');
    flash.className = 'flash-fin';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 900);
  },
});

function ouvrirTimer() {
  const duree = store.getData().settings.restDuration;
  for (const b of overlay.querySelectorAll('.timer-durees button')) {
    b.classList.toggle('actif', Number(b.dataset.duree) === duree);
  }
  document.getElementById('timer-pause').textContent = 'Pause';
  overlay.classList.remove('en-pause');
  overlay.hidden = false;
  timer.start(duree);
}

overlay.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  debloquerAudio();
  if (btn.dataset.duree) {
    store.save((d) => { d.settings.restDuration = Number(btn.dataset.duree); });
    planifierPush();
    ouvrirTimer();
  } else if (btn.id === 'timer-plus30') {
    timer.addSeconds(30);
  } else if (btn.id === 'timer-pause') {
    if (timer.paused) timer.resume();
    else timer.pause();
    btn.textContent = timer.paused ? 'Reprendre' : 'Pause';
    overlay.classList.toggle('en-pause', timer.paused);
  } else if (btn.id === 'timer-passer') {
    timer.skip();
  }
});

/* ==================== Aides données ==================== */

function exoParId(id) {
  return store.getData().exercises.find((e) => e.id === id);
}

function sessionEnCours() {
  return store.getData().sessions.findLast?.((s) => !s.endedAt)
    || [...store.getData().sessions].reverse().find((s) => !s.endedAt)
    || null;
}

function nbSeries(session) {
  return session.entries.reduce((n, e) => n + e.sets.length, 0);
}

function formaterDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formaterSet(set) {
  return set.weight > 0 ? `${set.reps} × ${set.weight} kg` : `${set.reps} reps`;
}

function echapper(txt) {
  const div = document.createElement('div');
  div.textContent = txt;
  return div.innerHTML;
}

/* ==================== Écran Séance ==================== */

const ecranSeance = document.getElementById('ecran-seance');
let exoActifId = null;     // exercice en cours de saisie
let enSelection = false;   // sélecteur d'exercice ouvert

function rendreSeance() {
  const session = sessionEnCours();
  if (!session) return rendreAccueil();
  if (enSelection) return rendreSelecteur(session);
  rendreSessionActive(session);
}

function rendreAccueil() {
  const d = store.getData();
  const derniere = [...d.sessions].reverse().find((s) => s.endedAt);
  const plansAujourdhui = plansDuJour(dateISO(new Date()));
  ecranSeance.innerHTML = `
    <p class="date-jour">${formaterDate(new Date().toISOString())}</p>
    ${plansAujourdhui.map((p) => `
      <div class="carte carte-plan">
        <div>
          <h3>${echapper(p.name)}</h3>
          <p class="texte-attenue">Prévue aujourd’hui · ${p.exerciseIds.length} exercices</p>
        </div>
        <button type="button" class="btn btn-succes" data-demarrer-plan="${p.id}">Démarrer cette séance</button>
      </div>`).join('')}
    <button type="button" id="btn-demarrer" class="btn ${plansAujourdhui.length ? 'btn-secondaire' : 'btn-primaire'} btn-geant">Démarrer une séance libre</button>
    ${derniere ? `
      <div class="carte">
        <h3>Dernière séance</h3>
        <p class="texte-attenue">${formaterDate(derniere.date)} · ${derniere.entries.length} exercices · ${nbSeries(derniere)} séries</p>
      </div>` : ''}
  `;
  document.getElementById('btn-demarrer').addEventListener('click', () => {
    store.addSession();
    planifierPush();
    exoActifId = null;
    enSelection = true;
    rendreSeance();
  });
  ecranSeance.querySelectorAll('[data-demarrer-plan]').forEach((b) => b.addEventListener('click', () => {
    const plan = store.getData().plans.find((p) => p.id === b.dataset.demarrerPlan);
    store.addSession(plan?.id || null);
    planifierPush();
    exoActifId = plan?.exerciseIds[0] || null;
    enSelection = !exoActifId;
    rendreSeance();
  }));
}

function rendreSelecteur(session) {
  const d = store.getData();
  const groupes = [];
  const plan = session.planId ? d.plans.find((p) => p.id === session.planId) : null;
  if (plan) {
    const restants = plan.exerciseIds
      .filter((id) => !session.entries.some((e) => e.exerciseId === id))
      .map((id) => exoParId(id)).filter(Boolean);
    if (restants.length) groupes.push({ titre: 'Prévu dans cette séance', exos: restants });
  }
  groupes.push(
    { titre: 'Poids du corps', exos: d.exercises.filter((e) => e.type === 'corps') },
    { titre: 'Haltères', exos: d.exercises.filter((e) => e.type === 'halteres') },
  );
  ecranSeance.innerHTML = `
    <div class="selecteur-tete">
      <h2>Choisir un exercice</h2>
      <button type="button" id="btn-fermer-selecteur" class="btn-lien">Annuler</button>
    </div>
    ${groupes.map((g) => `
      <h3 class="groupe-titre">${g.titre}</h3>
      <div class="liste-exos">
        ${g.exos.map((e) => {
          const perf = store.lastPerf(e.id, session.id);
          return `<button type="button" class="exo-item" data-exo="${e.id}">
            <span>${echapper(e.name)}</span>
            ${perf ? `<span class="texte-attenue">${perf.sets.map(formaterSet).join(' · ')}</span>` : ''}
          </button>`;
        }).join('')}
      </div>`).join('')}
    <form id="form-exo-perso" class="carte form-exo">
      <h3>Nouvel exercice</h3>
      <input type="text" name="nom" placeholder="Nom de l’exercice" required maxlength="60" aria-label="Nom de l’exercice">
      <div class="choix-type">
        <label><input type="radio" name="type" value="corps" checked> Poids du corps</label>
        <label><input type="radio" name="type" value="halteres"> Haltères</label>
      </div>
      <button type="submit" class="btn btn-secondaire">Ajouter</button>
    </form>
  `;

  ecranSeance.querySelectorAll('.exo-item').forEach((b) => b.addEventListener('click', () => {
    exoActifId = b.dataset.exo;
    enSelection = false;
    rendreSeance();
  }));
  document.getElementById('btn-fermer-selecteur').addEventListener('click', () => {
    enSelection = false;
    rendreSeance();
  });
  document.getElementById('form-exo-perso').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const nom = String(fd.get('nom')).trim();
    if (!nom) return;
    const exo = store.addExercise({ name: nom, type: fd.get('type') });
    planifierPush();
    exoActifId = exo.id;
    enSelection = false;
    rendreSeance();
  });
}

function rendreSessionActive(session) {
  const exoActif = exoActifId ? exoParId(exoActifId) : null;
  const entreesFaites = session.entries.filter((e) => e.exerciseId !== exoActifId || !exoActif);

  ecranSeance.innerHTML = `
    <div class="seance-tete">
      <div>
        <h2>Séance en cours</h2>
        <p class="texte-attenue">${session.entries.length} exercices · ${nbSeries(session)} séries</p>
      </div>
      <button type="button" id="btn-terminer" class="btn-lien btn-lien-danger">Terminer</button>
    </div>

    ${entreesFaites.map((entree) => `
      <div class="carte carte-entree">
        <h3>${echapper(exoParId(entree.exerciseId)?.name || '?')}</h3>
        <div class="chips">${entree.sets.map((s) => `<span class="chip">${formaterSet(s)}</span>`).join('')}</div>
      </div>`).join('')}

    ${exoActif ? rendreExoActif(session, exoActif) : ''}

    <button type="button" id="btn-choisir-exo" class="btn ${exoActif ? 'btn-secondaire' : 'btn-primaire'}">
      ${exoActif ? 'Exercice suivant' : session.entries.length ? 'Ajouter un exercice' : 'Choisir un exercice'}
    </button>
  `;

  document.getElementById('btn-choisir-exo').addEventListener('click', () => {
    enSelection = true;
    rendreSeance();
  });
  document.getElementById('btn-terminer').addEventListener('click', () => terminerSeance(session));

  if (exoActif) brancherSaisie(session, exoActif);
}

function rendreExoActif(session, exo) {
  const entree = session.entries.find((e) => e.exerciseId === exo.id);
  const derniereSerie = entree?.sets[entree.sets.length - 1];
  const perf = store.lastPerf(exo.id, session.id);
  const repsDefaut = derniereSerie?.reps ?? perf?.sets[0]?.reps ?? 10;
  const poidsDefaut = derniereSerie?.weight ?? perf?.sets[0]?.weight ?? 0;

  return `
    <div class="carte carte-active" id="carte-active">
      <h3>${echapper(exo.name)}</h3>
      <p class="texte-attenue perf">${perf
        ? `Dernière fois (${new Date(perf.date).toLocaleDateString('fr-FR')}) : ${perf.sets.map(formaterSet).join(' · ')}`
        : 'Première fois sur cet exercice'}</p>
      ${entree?.sets.length ? `<div class="chips">${entree.sets.map((s) => `<span class="chip chip-ok">${formaterSet(s)}</span>`).join('')}</div>` : ''}

      <div class="saisie">
        <div class="stepper">
          <span class="stepper-label">Répétitions</span>
          <div class="stepper-ctrl">
            <button type="button" data-champ="reps" data-delta="-1" aria-label="Moins une répétition">−</button>
            <input id="champ-reps" type="number" inputmode="numeric" min="0" max="999" step="1" value="${repsDefaut}" aria-label="Répétitions">
            <button type="button" data-champ="reps" data-delta="1" aria-label="Plus une répétition">+</button>
          </div>
        </div>
        <div class="stepper">
          <span class="stepper-label">Charge (kg)</span>
          <div class="stepper-ctrl">
            <button type="button" data-champ="poids" data-delta="-1" aria-label="Moins un kilo">−</button>
            <input id="champ-poids" type="number" inputmode="decimal" min="0" max="999" step="0.5" value="${poidsDefaut}" aria-label="Charge en kilogrammes">
            <button type="button" data-champ="poids" data-delta="1" aria-label="Plus un kilo">+</button>
          </div>
          <span class="stepper-aide">0 = poids du corps</span>
        </div>
      </div>
      <button type="button" id="btn-valider-serie" class="btn btn-succes">Valider la série</button>
    </div>
  `;
}

function brancherSaisie(session, exo) {
  const carte = document.getElementById('carte-active');
  carte.querySelectorAll('.stepper-ctrl button').forEach((b) => b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.champ === 'reps' ? 'champ-reps' : 'champ-poids');
    // Boutons : pas de 1 ; le pas fin (0,5 kg) reste possible au clavier
    const v = (Number(input.value) || 0) + Number(b.dataset.delta);
    input.value = String(Math.max(0, Math.round(v * 2) / 2));
  }));

  document.getElementById('btn-valider-serie').addEventListener('click', () => {
    debloquerAudio(); // geste utilisateur : indispensable pour que le bip sonne sur iPhone
    const reps = Number(document.getElementById('champ-reps').value) || 0;
    const poids = Number(document.getElementById('champ-poids').value) || 0;
    if (reps <= 0) return;
    store.addSet(session.id, exo.id, { reps, weight: poids });
    planifierPush();
    ouvrirTimer();
    rendreSeance();
  });
}

function terminerSeance(session) {
  const resume = `${session.entries.length} exercices, ${nbSeries(session)} séries`;
  if (!nbSeries(session)) {
    if (confirm('Séance vide : la supprimer ?')) {
      store.save((d) => { d.sessions = d.sessions.filter((s) => s.id !== session.id); });
      planifierPush();
    }
  } else if (confirm(`Terminer la séance ? (${resume})`)) {
    store.endSession(session.id);
    planifierPush();
  } else {
    return;
  }
  exoActifId = null;
  enSelection = false;
  rendreSeance();
}

/* ==================== Écran Agenda : calendrier + séances types ==================== */

function dateISO(d) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

let moisAffiche = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let jourSelectionne = dateISO(new Date());
let editeur = null;        // { type: 'template'|'plan', id: string|null } → éditeur ouvert
let choixModelePourJour = false;
let vueAgenda = 'calendrier'; // 'calendrier' | 'modeles'

function sessionsDuJour(date) {
  return store.getData().sessions.filter((s) => s.endedAt && s.date === date);
}

function plansDuJour(date) {
  return store.getData().plans.filter((p) => p.date === date);
}

function rendreCalendrier() {
  const annee = moisAffiche.getFullYear(), mois = moisAffiche.getMonth();
  const nomMois = moisAffiche.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const aujourdHui = dateISO(new Date());

  // Grille du lundi précédant le 1er au dimanche suivant la fin du mois
  const premier = new Date(annee, mois, 1);
  const debut = new Date(premier);
  debut.setDate(1 - ((premier.getDay() + 6) % 7));
  const cases = [];
  for (let d = new Date(debut); cases.length < 42; d.setDate(d.getDate() + 1)) {
    cases.push(new Date(d));
    if (d.getMonth() !== mois && d.getDay() === 0 && cases.length >= 28) break;
  }

  return `
    <div class="cal-tete">
      <button type="button" id="cal-prec" aria-label="Mois précédent">‹</button>
      <h2>${nomMois.charAt(0).toUpperCase() + nomMois.slice(1)}</h2>
      <button type="button" id="cal-suiv" aria-label="Mois suivant">›</button>
    </div>
    <div class="cal-grille" role="grid">
      ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j) => `<span class="cal-jour-nom">${j}</span>`).join('')}
      ${cases.map((d) => {
        const iso = dateISO(d);
        const faites = sessionsDuJour(iso).length;
        const prevues = plansDuJour(iso).length;
        return `<button type="button" class="cal-jour
          ${d.getMonth() !== mois ? 'autre-mois' : ''}
          ${iso === aujourdHui ? 'aujourdhui' : ''}
          ${iso === jourSelectionne ? 'selectionne' : ''}
          ${faites ? 'fait' : ''} ${prevues ? 'a-plan' : ''}" data-jour="${iso}">
          <span>${d.getDate()}</span>
        </button>`;
      }).join('')}
    </div>
    <p class="cal-legende"><i class="leg-fait"></i> faite <i class="leg-plan"></i> prévue</p>`;
}

function rendreJourDetail() {
  const faites = sessionsDuJour(jourSelectionne);
  const prevues = plansDuJour(jourSelectionne);
  const modeles = store.getData().templates;
  const titre = formaterDate(jourSelectionne);

  return `
    <div class="carte">
      <h3 class="jour-titre">${titre}</h3>

      ${faites.map((s) => `
        <div class="jour-ligne">
          <div>
            <strong>Séance faite</strong>
            <span class="texte-attenue">${s.entries.length} exos · ${nbSeries(s)} séries</span>
          </div>
          <button type="button" class="btn-lien btn-lien-danger" data-suppr-session="${s.id}">Supprimer</button>
        </div>`).join('')}

      ${prevues.map((p) => `
        <div class="jour-ligne">
          <div>
            <strong>${echapper(p.name)}</strong>
            <span class="texte-attenue">Prévue · ${p.exerciseIds.length} exercices</span>
          </div>
          <div class="jour-actions">
            <button type="button" class="btn-lien" data-modif-plan="${p.id}">Modifier</button>
            <button type="button" class="btn-lien btn-lien-danger" data-retirer-plan="${p.id}">Retirer</button>
          </div>
        </div>`).join('')}

      ${choixModelePourJour ? `
        <div class="choix-modele">
          ${modeles.map((t) => `<button type="button" class="exo-item" data-poser-modele="${t.id}">
            <span>${echapper(t.name)}</span><span class="texte-attenue">${t.exerciseIds.length} exercices</span>
          </button>`).join('')}
          ${!modeles.length ? '<button type="button" id="btn-creer-depuis-jour" class="btn btn-secondaire">Créer une séance type</button>' : ''}
          <button type="button" id="btn-annuler-choix" class="btn-lien">Annuler</button>
        </div>` : `
        <button type="button" id="btn-planifier" class="btn btn-primaire">Ajouter une séance</button>`}
    </div>`;
}

function rendreModeles() {
  const modeles = store.getData().templates;
  return `
    ${modeles.map((t) => `
      <div class="carte jour-ligne">
        <div>
          <strong>${echapper(t.name)}</strong>
          <span class="texte-attenue">${t.exerciseIds.map((id) => echapper(exoParId(id)?.name || '?')).join(', ') || 'Vide'}</span>
        </div>
        <div class="jour-actions">
          <button type="button" class="btn-lien" data-modif-modele="${t.id}">Modifier</button>
          <button type="button" class="btn-lien btn-lien-danger" data-suppr-modele="${t.id}">Supprimer</button>
        </div>
      </div>`).join('')}
    <button type="button" id="btn-nouveau-modele" class="btn btn-primaire">Créer une séance type</button>`;
}

// Éditeur commun : séance type (modèle) ou séance posée sur un jour (plan)
function rendreEditeur() {
  const d = store.getData();
  const objet = editeur.type === 'template'
    ? d.templates.find((t) => t.id === editeur.id)
    : d.plans.find((p) => p.id === editeur.id);
  const nom = objet?.name || '';
  const coches = new Set(objet?.exerciseIds || []);
  const groupes = [
    { titre: 'Poids du corps', exos: d.exercises.filter((e) => e.type === 'corps') },
    { titre: 'Haltères', exos: d.exercises.filter((e) => e.type === 'halteres') },
  ];

  const ecran = document.getElementById('ecran-agenda');
  ecran.innerHTML = `
    <div class="selecteur-tete">
      <h2>${editeur.type === 'template' ? (editeur.id ? 'Modifier la séance type' : 'Nouvelle séance type') : 'Modifier la séance du jour'}</h2>
      <button type="button" id="btn-editeur-annuler" class="btn-lien">Annuler</button>
    </div>
    <label class="reglage-label" for="editeur-nom">Nom</label>
    <input id="editeur-nom" type="text" maxlength="60" value="${echapper(nom)}" placeholder="Ex. Haut du corps" class="champ-nom">
    ${groupes.map((g) => `
      <h3 class="groupe-titre">${g.titre}</h3>
      <div class="liste-exos">
        ${g.exos.map((e) => `
          <label class="exo-item exo-coche">
            <input type="checkbox" value="${e.id}" ${coches.has(e.id) ? 'checked' : ''}>
            <span>${echapper(e.name)}</span>
          </label>`).join('')}
      </div>`).join('')}
    <button type="button" id="btn-editeur-enregistrer" class="btn btn-succes" style="margin-top:20px">Enregistrer</button>
  `;

  document.getElementById('btn-editeur-annuler').addEventListener('click', () => {
    editeur = null;
    rendreAgenda();
  });
  document.getElementById('btn-editeur-enregistrer').addEventListener('click', () => {
    const nomSaisi = document.getElementById('editeur-nom').value.trim() || 'Séance';
    const ids = [...ecran.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
    if (editeur.type === 'template') {
      if (editeur.id) store.updateTemplate(editeur.id, { name: nomSaisi, exerciseIds: ids });
      else store.addTemplate({ name: nomSaisi, exerciseIds: ids });
    } else {
      store.updatePlan(editeur.id, { name: nomSaisi, exerciseIds: ids });
    }
    planifierPush();
    editeur = null;
    rendreAgenda();
  });
}

function rendreAgenda() {
  if (editeur) return rendreEditeur();
  const ecran = document.getElementById('ecran-agenda');
  const segments = `
    <div class="segments">
      <button type="button" data-vue="calendrier" class="${vueAgenda === 'calendrier' ? 'actif' : ''}">Calendrier</button>
      <button type="button" data-vue="modeles" class="${vueAgenda === 'modeles' ? 'actif' : ''}">Séances types</button>
    </div>`;
  ecran.innerHTML = segments + (vueAgenda === 'calendrier'
    ? rendreCalendrier() + rendreJourDetail()
    : rendreModeles());

  ecran.querySelectorAll('.segments button').forEach((b) => b.addEventListener('click', () => {
    vueAgenda = b.dataset.vue;
    choixModelePourJour = false;
    rendreAgenda();
  }));

  if (vueAgenda === 'modeles') {
    document.getElementById('btn-nouveau-modele').addEventListener('click', () => {
      editeur = { type: 'template', id: null };
      rendreAgenda();
    });
    ecran.querySelectorAll('[data-modif-modele]').forEach((b) => b.addEventListener('click', () => {
      editeur = { type: 'template', id: b.dataset.modifModele };
      rendreAgenda();
    }));
    ecran.querySelectorAll('[data-suppr-modele]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Supprimer cette séance type ?')) return;
      store.deleteTemplate(b.dataset.supprModele);
      planifierPush();
      rendreAgenda();
    }));
    return;
  }

  document.getElementById('cal-prec').addEventListener('click', () => {
    moisAffiche = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() - 1, 1);
    rendreAgenda();
  });
  document.getElementById('cal-suiv').addEventListener('click', () => {
    moisAffiche = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + 1, 1);
    rendreAgenda();
  });
  ecran.querySelectorAll('.cal-jour').forEach((b) => b.addEventListener('click', () => {
    jourSelectionne = b.dataset.jour;
    choixModelePourJour = false;
    rendreAgenda();
  }));

  document.getElementById('btn-planifier')?.addEventListener('click', () => {
    choixModelePourJour = true;
    rendreAgenda();
  });
  document.getElementById('btn-annuler-choix')?.addEventListener('click', () => {
    choixModelePourJour = false;
    rendreAgenda();
  });
  ecran.querySelectorAll('[data-poser-modele]').forEach((b) => b.addEventListener('click', () => {
    store.addPlan({ date: jourSelectionne, templateId: b.dataset.poserModele });
    planifierPush();
    choixModelePourJour = false;
    rendreAgenda();
  }));

  ecran.querySelectorAll('[data-retirer-plan]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Retirer cette séance prévue de ce jour ?')) return;
    store.deletePlan(b.dataset.retirerPlan);
    planifierPush();
    rendreAgenda();
  }));
  ecran.querySelectorAll('[data-modif-plan]').forEach((b) => b.addEventListener('click', () => {
    editeur = { type: 'plan', id: b.dataset.modifPlan };
    rendreAgenda();
  }));
  ecran.querySelectorAll('[data-suppr-session]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Supprimer définitivement cette séance ?')) return;
    store.deleteSession(b.dataset.supprSession);
    planifierPush();
    rendreAgenda();
  }));
  document.getElementById('btn-creer-depuis-jour')?.addEventListener('click', () => {
    editeur = { type: 'template', id: null };
    rendreAgenda();
  });
}

/* ==================== Écrans Historique / Réglages (Tasks 6-7) ==================== */

let exoGraphe = null;      // exercice affiché dans la courbe de progression
let seanceOuverte = null;  // séance dépliée dans la liste

// Meilleure perf d'une séance sur un exercice : charge max, ou reps max si poids du corps
function meilleurePerf(session, exerciseId) {
  const entree = session.entries.find((e) => e.exerciseId === exerciseId);
  if (!entree || !entree.sets.length) return null;
  const maxPoids = Math.max(...entree.sets.map((s) => s.weight));
  if (maxPoids > 0) return { valeur: maxPoids, unite: 'kg' };
  return { valeur: Math.max(...entree.sets.map((s) => s.reps)), unite: 'reps' };
}

function serieProgression(exerciseId) {
  return store.getData().sessions
    .filter((s) => s.endedAt)
    .map((s) => ({ date: s.date, perf: meilleurePerf(s, exerciseId) }))
    .filter((p) => p.perf);
}

// Courbe SVG : 1 série, ligne 2px, points ≥8px, grille discrète, étiquette sur le dernier point
function rendreCourbe(points) {
  const W = 320, H = 150, m = { haut: 18, droite: 34, bas: 22, gauche: 30 };
  const xs = points.map((_, i) => m.gauche + (i * (W - m.gauche - m.droite)) / Math.max(1, points.length - 1));
  const vals = points.map((p) => p.perf.valeur);
  const vMax = Math.max(...vals), vMin = Math.min(...vals);
  const plage = vMax - vMin || 1;
  const y = (v) => m.haut + (H - m.haut - m.bas) * (1 - (v - vMin) / plage);
  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const grille = [vMax, (vMax + vMin) / 2, vMin].map((v) =>
    `<line x1="${m.gauche}" x2="${W - m.droite}" y1="${y(v)}" y2="${y(v)}" class="graphe-grille"/>
     <text x="${m.gauche - 5}" y="${y(v) + 3}" class="graphe-txt" text-anchor="end">${Math.round(v * 10) / 10}</text>`).join('');

  const ligne = points.length > 1
    ? `<polyline class="graphe-ligne" points="${points.map((p, i) => `${xs[i]},${y(p.perf.valeur)}`).join(' ')}"/>` : '';

  const marques = points.map((p, i) => `
    <circle class="graphe-point" cx="${xs[i]}" cy="${y(p.perf.valeur)}" r="4"/>
    <circle class="graphe-cible" cx="${xs[i]}" cy="${y(p.perf.valeur)}" r="14">
      <title>${fmtDate(p.date)} : ${p.perf.valeur} ${p.perf.unite}</title>
    </circle>`).join('');

  const dernier = points[points.length - 1];
  const etiquette = `<text x="${xs[xs.length - 1]}" y="${y(dernier.perf.valeur) - 9}" class="graphe-txt graphe-valeur" text-anchor="middle">${dernier.perf.valeur} ${dernier.perf.unite}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Progression : ${points.map((p) => `${fmtDate(p.date)} ${p.perf.valeur} ${p.perf.unite}`).join(', ')}">
    ${grille}
    <text x="${m.gauche}" y="${H - 6}" class="graphe-txt">${fmtDate(points[0].date)}</text>
    <text x="${W - m.droite}" y="${H - 6}" class="graphe-txt" text-anchor="end">${fmtDate(dernier.date)}</text>
    ${ligne}${marques}${etiquette}
  </svg>`;
}

function rendreHistorique() {
  const ecran = document.getElementById('ecran-historique');
  const d = store.getData();
  const terminees = [...d.sessions].filter((s) => s.endedAt).reverse();

  if (!terminees.length) {
    ecran.innerHTML = '<div class="carte"><p class="texte-attenue">Aucune séance pour l’instant.</p></div>';
    return;
  }

  // Exercices ayant au moins 2 séances : candidats à la courbe
  const candidats = d.exercises.filter((e) => serieProgression(e.id).length >= 2);
  if (!exoGraphe || !candidats.some((e) => e.id === exoGraphe)) exoGraphe = candidats[0]?.id || null;

  const volume = (s) => s.entries.reduce((t, e) => t + e.sets.reduce((v, x) => v + x.reps * x.weight, 0), 0);

  ecran.innerHTML = `
    ${candidats.length ? `
      <div class="carte">
        <div class="graphe-tete">
          <h3>Progression</h3>
          <select id="choix-exo-graphe" aria-label="Exercice à afficher">
            ${candidats.map((e) => `<option value="${e.id}" ${e.id === exoGraphe ? 'selected' : ''}>${echapper(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="graphe">${rendreCourbe(serieProgression(exoGraphe))}</div>
      </div>` : ''}

    <h3 class="groupe-titre">Séances (${terminees.length})</h3>
    ${terminees.map((s) => `
      <button type="button" class="carte carte-seance ${seanceOuverte === s.id ? 'ouverte' : ''}" data-session="${s.id}">
        <div class="seance-ligne">
          <span class="seance-date">${formaterDate(s.date)}</span>
          <span class="texte-attenue">${s.entries.length} exos · ${nbSeries(s)} séries${volume(s) ? ` · ${Math.round(volume(s))} kg` : ''}</span>
        </div>
        ${seanceOuverte === s.id ? `${s.entries.map((e) => `
          <div class="seance-detail">
            <strong>${echapper(exoParId(e.exerciseId)?.name || '?')}</strong>
            <div class="chips">${e.sets.map((x) => `<span class="chip">${formaterSet(x)}</span>`).join('')}</div>
          </div>`).join('')}
          <span class="btn btn-danger btn-suppr-seance" data-suppr="${s.id}" role="button">Supprimer cette séance</span>` : ''}
      </button>`).join('')}
  `;

  document.getElementById('choix-exo-graphe')?.addEventListener('change', (ev) => {
    exoGraphe = ev.target.value;
    rendreHistorique();
  });
  ecran.querySelectorAll('.btn-suppr-seance').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!confirm('Supprimer définitivement cette séance ?')) return;
    store.deleteSession(b.dataset.suppr);
    planifierPush();
    seanceOuverte = null;
    rendreHistorique();
  }));
  ecran.querySelectorAll('.carte-seance').forEach((c) => c.addEventListener('click', () => {
    seanceOuverte = seanceOuverte === c.dataset.session ? null : c.dataset.session;
    rendreHistorique();
  }));
}

const menusOuverts = new Set(); // menus déroulants restés ouverts entre deux rendus

function rendreReglages() {
  const ecran = document.getElementById('ecran-reglages');
  const { gistToken, gistId, lastSyncAt } = store.getData().settings;

  ecran.innerHTML = `
    <details class="carte menu-deroulant" id="menu-gist" ${menusOuverts.has('menu-gist') ? 'open' : ''}>
      <summary>
        <h3>Sauvegarde en ligne</h3>
        <span class="texte-attenue">${lastSyncAt ? new Date(lastSyncAt).toLocaleDateString('fr-FR') : gistToken ? '—' : 'off'}</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <p class="texte-attenue reglage-aide">Token GitHub avec la permission « gist ».</p>
      <div class="champ-token">
        <input id="champ-token" type="password" autocomplete="off" placeholder="ghp_… ou github_pat_…" value="${echapper(gistToken)}" aria-label="Token GitHub">
        <button type="button" id="btn-voir-token" aria-label="Afficher ou masquer le token">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <button type="button" id="btn-enregistrer-token" class="btn btn-primaire">Enregistrer et synchroniser</button>
      ${gistToken ? `
        <div class="reglage-actions">
          <button type="button" id="btn-sync-maintenant" class="btn btn-secondaire">Synchroniser maintenant</button>
          <button type="button" id="btn-restaurer" class="btn btn-secondaire">Restaurer depuis le Gist</button>
        </div>` : ''}
    </details>

    <details class="carte menu-deroulant" id="menu-fichier" ${menusOuverts.has('menu-fichier') ? 'open' : ''}>
      <summary>
        <h3>Sauvegarde par fichier</h3>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="reglage-actions">
        <button type="button" id="btn-exporter" class="btn btn-secondaire">Exporter (JSON)</button>
        <button type="button" id="btn-importer" class="btn btn-secondaire">Importer un fichier</button>
      </div>
      <input id="champ-import" type="file" accept="application/json,.json" hidden>
    </details>

    <p class="texte-attenue version">MuscuLog</p>
  `;

  ecran.querySelectorAll('details.menu-deroulant').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) menusOuverts.add(d.id);
    else menusOuverts.delete(d.id);
  }));

  document.getElementById('btn-voir-token').addEventListener('click', () => {
    const champ = document.getElementById('champ-token');
    champ.type = champ.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('btn-enregistrer-token').addEventListener('click', async () => {
    const token = document.getElementById('champ-token').value.trim();
    store.save((d) => { d.settings.gistToken = token; });
    if (token) {
      await sync.push();
      if (sync.status === 'erreur') alert('Synchronisation impossible : vérifie que le token est valide et a la permission « gist ».');
    }
    rendreReglages();
  });

  document.getElementById('btn-sync-maintenant')?.addEventListener('click', async () => {
    await sync.push();
    rendreReglages();
  });

  document.getElementById('btn-restaurer')?.addEventListener('click', async () => {
    if (!confirm('Restaurer depuis le Gist ? Les données les plus récentes (ici ou en ligne) seront conservées.')) return;
    await sync.pull();
    rendreReglages();
  });

  document.getElementById('btn-exporter').addEventListener('click', () => {
    // Le token n'est jamais écrit dans le fichier exporté
    const contenu = JSON.parse(store.export());
    contenu.settings = { ...contenu.settings, gistToken: '' };
    const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `musculog-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btn-importer').addEventListener('click', () => document.getElementById('champ-import').click());
  document.getElementById('champ-import').addEventListener('change', async (ev) => {
    const fichier = ev.target.files[0];
    if (!fichier) return;
    if (!confirm('Importer ce fichier ? Il remplacera les données actuelles.')) { ev.target.value = ''; return; }
    try {
      const texte = await fichier.text();
      const tokenActuel = store.getData().settings.gistToken;
      const gistActuel = store.getData().settings.gistId;
      store.import(texte);
      // Un import ne doit pas faire perdre la connexion au Gist
      store.save((d) => {
        if (!d.settings.gistToken) d.settings.gistToken = tokenActuel;
        if (!d.settings.gistId) d.settings.gistId = gistActuel;
      });
      planifierPush();
      alert('Import réussi.');
      rendreReglages();
    } catch (e) {
      alert(e.message);
    }
    ev.target.value = '';
  });
}

/* ==================== Navigation ==================== */

const RENDUS = { seance: rendreSeance, agenda: rendreAgenda, historique: rendreHistorique, reglages: rendreReglages };
const ecrans = ['seance', 'agenda', 'historique', 'reglages'];

function afficherEcran(nom) {
  for (const e of ecrans) {
    document.getElementById(`ecran-${e}`).hidden = e !== nom;
  }
  for (const btn of document.querySelectorAll('.nav-basse button')) {
    const actif = btn.dataset.ecran === nom;
    btn.classList.toggle('actif', actif);
    if (actif) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  RENDUS[nom]();
}

for (const btn of document.querySelectorAll('.nav-basse button')) {
  btn.addEventListener('click', () => afficherEcran(btn.dataset.ecran));
}

/* ==================== Démarrage ==================== */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
  // Quand une nouvelle version prend le contrôle, on recharge une fois :
  // l'app se met à jour toute seule au premier lancement.
  let dejaRecharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dejaRecharge) return;
    dejaRecharge = true;
    location.reload();
  });
}

afficherEcran('seance');
sync.pull().then(() => {
  // Les données distantes ont pu changer : on rafraîchit l'écran visible
  const actif = ecrans.find((e) => !document.getElementById(`ecran-${e}`).hidden);
  if (actif) RENDUS[actif]();
});
