// MuscuLog — point d'entrée UI

const ecrans = ['seance', 'historique', 'reglages'];

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
}

for (const btn of document.querySelectorAll('.nav-basse button')) {
  btn.addEventListener('click', () => afficherEcran(btn.dataset.ecran));
}

afficherEcran('seance');
