// MuscuLog — timer de repos basé sur l'horloge réelle (fiable même si l'onglet
// est suspendu par iOS : on recalcule le restant depuis l'échéance, on ne
// cumule jamais des ticks).

// iOS n'autorise le son que si l'AudioContext est créé/réveillé pendant un
// geste utilisateur : appeler debloquerAudio() depuis un handler de clic.
let ctxAudio = null;

function obtenirContexteAudio() {
  return ctxAudio;
}

export function debloquerAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctxAudio) ctxAudio = new Ctx();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
  } catch { /* pas d'audio sur cet appareil */ }
}

export function createTimer({ onTick, onEnd } = {}) {
  let echeance = 0;   // timestamp ms de fin
  let total = 0;      // durée initiale en secondes
  let intervalle = null;

  function restant() {
    return Math.max(0, Math.ceil((echeance - Date.now()) / 1000));
  }

  function tick() {
    const r = restant();
    if (onTick) onTick(r, total);
    if (r <= 0) {
      arreter();
      signalerFin();
      if (onEnd) onEnd();
    }
  }

  function arreter() {
    if (intervalle) { clearInterval(intervalle); intervalle = null; }
  }

  function signalerFin() {
    // Vibration : Android seulement (Safari iOS ne supporte pas l'API)
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([300, 100, 300]);
    try {
      const ctx = obtenirContexteAudio();
      if (!ctx || ctx.state !== 'running') return;
      for (let i = 0; i < 3; i++) {
        const t = ctx.currentTime + i * 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t); osc.stop(t + 0.22);
      }
    } catch { /* audio indisponible */ }
  }

  let pauseRestant = null; // secondes restantes figées pendant la pause

  return {
    start(secondes) {
      arreter();
      pauseRestant = null;
      total = secondes;
      echeance = Date.now() + secondes * 1000;
      intervalle = setInterval(tick, 250);
      tick();
    },
    pause() {
      if (intervalle === null || pauseRestant !== null) return;
      pauseRestant = restant();
      arreter();
    },
    resume() {
      if (pauseRestant === null) return;
      echeance = Date.now() + pauseRestant * 1000;
      pauseRestant = null;
      intervalle = setInterval(tick, 250);
      tick();
    },
    get paused() { return pauseRestant !== null; },
    addSeconds(n) {
      total += n;
      if (pauseRestant !== null) {
        pauseRestant += n;
        if (onTick) onTick(pauseRestant, total);
      } else {
        echeance += n * 1000;
        tick();
      }
    },
    skip() {
      arreter();
      pauseRestant = null;
      if (onEnd) onEnd();
    },
    get remaining() { return pauseRestant !== null ? pauseRestant : restant(); },
    get running() { return intervalle !== null; },
  };
}
