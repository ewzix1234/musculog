# MuscuLog v1 — Spec de design

Date : 2026-07-03 · Validée par Elliot (« ok, et de toute façon là c'est la v1 ? »)

## Objectif

PWA mobile **personnelle** de suivi de musculation (poids du corps + haltères).
Priorité n°1 de l'utilisateur : **ne jamais perdre ses données** (sauvegarde).

## Utilisateur

Elliot, utilisateur unique, sur son téléphone (iOS Safari principalement), à la salle ou chez lui, parfois hors ligne. Interface en français.

## Fonctionnalités v1

### 1. Séance en cours (écran principal)
- Démarrer une séance (datée automatiquement).
- Ajouter un exercice depuis une bibliothèque préchargée (pompes, tractions, dips, squats, fentes, gainage, curl haltères, développé haltères, élévations latérales, rowing haltère…) ; possibilité d'ajouter un exercice personnalisé (nom + type poids du corps / haltères).
- Pour chaque série : saisir **répétitions** + **charge en kg** (0 ou vide = poids du corps).
- Valider une série → **le timer de repos démarre automatiquement**.
- Affichage de la **dernière performance** sur l'exercice en cours (ex. « Dernière fois : 3×10 @ 12 kg »).
- Terminer la séance → enregistrée dans l'historique.

### 2. Timer de repos
- Durées rapides : 30 s / 1 min / 1 min 30 / 2 min + durée personnalisée ; la dernière durée choisie devient la durée par défaut.
- Gros affichage (lisible téléphone posé au sol), anneau de progression.
- Fin du timer : vibration (si supportée) + son.
- Boutons « +30 s » et « Passer ».

### 3. Historique & progression
- Liste des séances passées (date, durée, exercices, volume total).
- Détail d'une séance.
- Par exercice : courbe de progression (meilleure charge ou reps max par séance).

### 4. Sauvegarde ⭐ (exigence principale)
- Données en `localStorage`, sauvegardées à chaque action (jamais seulement à la fin de séance).
- **Synchro automatique GitHub Gist** (même modèle que la PWA restaurant) : l'utilisateur colle un token GitHub dans les réglages, l'app crée/met à jour un gist privé contenant le JSON des données ; restauration possible sur un nouvel appareil.
- **Export / import manuel** d'un fichier JSON en secours.
- Indicateur visuel de l'état de synchro (synchronisé / en attente / erreur).

## Hors périmètre v1
Programmes planifiés, comptes utilisateurs, nutrition/calories, multi-utilisateurs, statistiques avancées.

## Architecture

- **Stack** : HTML/CSS/JS vanilla, une page (`index.html` + `app.js` + `styles.css`), sans build ni dépendance.
- **PWA** : `manifest.json` + `sw.js` (cache-first, version de cache incrémentée à chaque déploiement) → installable et hors ligne.
- **Données** (`localStorage`, clé `musculog-data`, JSON versionné `schemaVersion: 1`) :
  - `exercises[]` : `{ id, name, type: "corps"|"halteres", custom: bool }`
  - `sessions[]` : `{ id, date, startedAt, endedAt, entries: [{ exerciseId, sets: [{ reps, weight }] }] }`
  - `settings` : `{ restDuration, gistToken, gistId, lastSyncAt }`
- **Modules JS** (fichier unique mais séparés par responsabilité) : `store` (lecture/écriture + migration), `sync` (Gist push/pull + merge par horodatage), `timer`, `ui` (rendu des 3 écrans : Séance / Historique / Réglages).
- **Gestion d'erreurs** : échec réseau Gist → statut « en attente », retry au retour en ligne (`online` event) ; import JSON validé avant écrasement ; confirmation avant toute suppression.
- **Déploiement** : GitHub Pages (repo dédié).

## Critères de succès
- Utilisable à une main pendant une séance, hors ligne.
- Une série validée survit à la fermeture immédiate de l'app.
- Données restaurables sur un autre appareil via Gist ou fichier.
