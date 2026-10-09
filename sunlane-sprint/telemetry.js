// Best-effort, bounded analytics. Failures never block loading, controls or rendering.
export function createTelemetry(env = globalThis) {
  const { document, navigator, location, performance } = env;
  const enabled = ['casamio3d.com', 'www.casamio3d.com'].includes(location.hostname) && !new URLSearchParams(location.search).has('test');
  const queue = []; let frames = 0, frameSeconds = 0, slowFrames = 0, errors = 0;
  let visibleSince = performance.now(), activeSeconds = 0;
  let activeRace = null, ended = false;
  const context = () => activeRace || {};
  function event(name, value = 1, details = {}) {
    if (!enabled || !Number.isFinite(value) || queue.length >= 100) return;
    queue.push({ name, value, ...details });
    if (queue.length >= 20) flush();
  }
  function flush() {
    if (!enabled) return;
    while (queue.length) {
      const body = JSON.stringify({ mobile: env.matchMedia('(pointer: coarse)').matches, events: queue.splice(0, 20) });
      try {
        if (navigator.sendBeacon?.('/api/metrics/sunlane-sprint', new Blob([body], { type: 'application/json' }))) continue;
        Promise.resolve(env.fetch('/api/metrics/sunlane-sprint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' })).catch(() => {});
      } catch { /* Analytics must never interrupt the game. */ }
    }
  }
  function performanceSample() {
    if (frameSeconds >= 1 && frames) {
      event('AverageFps', Math.min(1000, frames / frameSeconds));
      event('SlowFramePercent', slowFrames / frames * 100);
    }
    frames = 0; frameSeconds = 0; slowFrames = 0;
  }
  function raceSummary(player) {
    if (!player) return;
    for (const [metric, field] of [['DriftSeconds', 'driftSeconds'], ['NitroSeconds', 'boostSeconds'], ['WallHits', 'wallHits'], ['KartHits', 'kartHits']]) event(metric, player[field] || 0);
  }
  function abandon(player) {
    if (!activeRace) return;
    event('RaceAbandoned', 1, context()); raceSummary(player); activeRace = null; performanceSample(); flush();
  }
  const api = {
    event, flush,
    frame(seconds) {
      if (!enabled || document.hidden || !activeRace || !Number.isFinite(seconds) || seconds <= 0) return;
      frames++; frameSeconds += seconds; if (seconds > 1 / 30) slowFrames++;
      if (frameSeconds >= 30) { performanceSample(); flush(); }
    },
    pause() { performanceSample(); flush(); },
    start(kart, avatar) { activeRace = { kart, avatar }; event('RaceStarted', 1, context()); flush(); },
    lap(seconds) { if (!activeRace) return; event('LapCompleted'); event('LapTimeSeconds', seconds); },
    finish(player) {
      if (!activeRace) return;
      event('RaceCompleted', 1, context()); event('RaceTimeSeconds', player.finishTime, context()); event('FinishPosition', player.finishPlace);
      raceSummary(player); activeRace = null; performanceSample(); flush();
    },
    abandon,
  };
  if (enabled) {
    event('PageOpened'); flush();
    env.setInterval(flush, 10_000);
    const clientError = () => { if (errors++ < 3) { event('ClientError'); flush(); } };
    env.addEventListener('error', clientError, true); env.addEventListener('unhandledrejection', clientError);
    document.addEventListener('visibilitychange', () => {
      const now = performance.now();
      if (document.hidden) { activeSeconds += (now - visibleSince) / 1000; performanceSample(); flush(); }
      else visibleSince = now;
    });
    env.addEventListener('pagehide', () => {
      if (ended) return; ended = true;
      abandon();
      const duration = activeSeconds + (document.hidden ? 0 : (performance.now() - visibleSince) / 1000);
      event('SessionDurationSeconds', Math.min(86_400, duration)); flush();
    });
    env.addEventListener('pageshow', e => { if (e.persisted) { ended = false; activeSeconds = 0; visibleSince = performance.now(); event('PageOpened'); flush(); } });
  }
  return api;
}
export const telemetry = typeof window === 'undefined' ? null : createTelemetry();
