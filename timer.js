// MuscuLog — timer de repos basé sur l'horloge réelle (fiable même si l'onglet
// est suspendu par iOS : on recalcule le restant depuis l'échéance, on ne
// cumule jamais des ticks).

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
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([300, 100, 300]);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(); osc.stop(ctx.currentTime + 0.6);
    } catch { /* audio indisponible : la vibration suffit */ }
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
