# MuscuLog — Notes de design (via ui-ux-pro-max)

## Direction
- **Style** : Dark mode OLED uniquement (usage en salle, faible luminosité, économie batterie).
- **Ambiance** : sportive, énergique, chiffres en avant (charges, reps, chrono).

## Couleurs (tokens CSS dans styles.css)
| Rôle | Hex |
|---|---|
| Fond | `#0C0F14` |
| Surface (cartes) | `#161B22` |
| Surface 2 (inputs) | `#1F2733` |
| Bordure | `#2A3442` |
| Texte | `#F8FAFC` |
| Texte atténué | `#98A6B8` |
| Primaire (actions) | `#F97316` orange énergie |
| Succès (série validée) | `#22C55E` |
| Danger (suppression) | `#EF4444` |

Contrastes vérifiés ≥ 4.5:1 pour le texte sur fond/surface.

## Typographie (auto-hébergée, `fonts/`)
- **Titres + gros chiffres** : Barlow Condensed 600/700 (sportif, condensé).
- **Corps** : Barlow 400/500/600, base 16 px, line-height 1.5.
- Chiffres tabulaires (`font-variant-numeric: tabular-nums`) pour timer, charges, reps.

## Composants
- **Nav basse** : 3 onglets (Séance / Historique / Réglages), icônes SVG inline (pas d'emoji), état actif orange + label, hauteur ≥ 56 px + safe-area.
- **Cartes exercice** : surface arrondie 16 px, nom en Barlow Condensed, dernière perf en texte atténué.
- **Steppers reps/charge** : boutons ± de 48 px min, valeur centrale énorme.
- **Timer plein écran** : overlay fond `#0C0F14` 95 %, chiffre géant (clamp 72–120 px), anneau SVG orange, boutons « +30 s » / « Passer ».
- **Feedback tactile** : scale 0.97 à l'appui, transitions 150–250 ms, `prefers-reduced-motion` respecté.

## Règles
- Cibles tactiles ≥ 44×44 px, espacement ≥ 8 px.
- `viewport-fit=cover` + `env(safe-area-inset-*)` pour iPhone.
- Pas d'emoji comme icônes ; jeu d'icônes SVG inline cohérent (stroke 2px, style Lucide).
- Une seule action primaire (orange) par écran.
