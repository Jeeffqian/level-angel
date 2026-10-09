import {AI_DIFFICULTIES, KARTS, RIVAL_NAMES} from './config.js';
import {TRACKS, getTrack} from './track.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const validDifficulty = value => AI_DIFFICULTIES.some(item => item.id === value) ? value : 'normal';

export function createSinglePlayerSetup({onOpen, onClose, onConfirm} = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'single-player-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<section id="single-player-dialog" class="single-player-panel" role="dialog" aria-modal="true" aria-labelledby="single-player-title" aria-describedby="single-player-intro" tabindex="-1">
    <header class="single-player-header"><span class="eyebrow">SUNLANE / SINGLE PLAYER</span><button id="single-player-close" class="single-player-close" aria-label="Cancel race setup">×</button></header>
    <div class="single-player-heading"><h2 id="single-player-title">YOUR GRID.</h2><p id="single-player-intro">Choose a track. Pick your rivals. Make it your race.</p></div>
    <div class="single-player-race"><label class="single-player-track-label" for="single-player-track-select"><span>RACE TRACK</span><select id="single-player-track-select">${TRACKS.map(track=>`<option value="${escapeHTML(track.id)}">${escapeHTML(track.name)}</option>`).join('')}</select></label><span id="single-player-summary" role="status" aria-live="polite"></span></div>
    <ol class="single-player-rivals" aria-label="AI rivals">${Array.from({length:5}, (_, index) => {
      const name = RIVAL_NAMES[index], kart = KARTS[index % KARTS.length];
      return `<li class="single-player-rival" data-rival-slot="${index}" style="--rival-color:${escapeHTML(kart.color)}"><div class="single-player-rival-name"><span aria-hidden="true">0${index + 1}</span><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(kart.name)}</small></div></div><button class="single-player-toggle" data-rival-enabled="${index}" role="switch" aria-checked="true" aria-label="Include ${escapeHTML(name)} in the race"><i aria-hidden="true"></i><span>ON</span></button><select data-rival-difficulty="${index}" aria-label="${escapeHTML(name)} difficulty">${AI_DIFFICULTIES.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('')}</select></li>`;
    }).join('')}</ol>
    <p class="single-player-tip">Switch every rival off for a practice run.</p>
    <footer class="single-player-actions"><button id="single-player-cancel" class="secondary-button">CANCEL</button><button id="single-player-start" class="primary-button">START RACE <span aria-hidden="true">↗</span></button></footer>
  </section>`;
  document.body.append(overlay);
  const panel = overlay.querySelector('#single-player-dialog');
  const cancel = overlay.querySelector('#single-player-close');
  const track = overlay.querySelector('#single-player-track-select');
  const summary = overlay.querySelector('#single-player-summary');
  const rows = [...overlay.querySelectorAll('[data-rival-slot]')].map(element => ({element, toggle:element.querySelector('[data-rival-enabled]'), difficulty:element.querySelector('[data-rival-difficulty]')}));
  let draft = [], draftTrackId = null, previousFocus = null, background = null, previousInert = false;

  function render() {
    rows.forEach((row, index) => {
      const slot = draft[index];
      row.toggle.setAttribute('aria-checked', String(slot.enabled));
      row.toggle.querySelector('span').textContent = slot.enabled ? 'ON' : 'OFF';
      row.element.classList.toggle('is-disabled', !slot.enabled);
      row.difficulty.disabled = !slot.enabled;
      row.difficulty.value = slot.difficulty;
      row.difficulty.title = AI_DIFFICULTIES.find(item => item.id === slot.difficulty)?.description || '';
    });
    const count = 1 + draft.filter(slot => slot.enabled).length;
    summary.textContent = `${count} ${count === 1 ? 'RACER · PRACTICE' : 'RACERS'} / 3 LAPS`;
  }

  function containFocus(event) {
    if(!overlay.hidden && !overlay.contains(event.target)) cancel.focus({preventScroll:true});
  }

  function open({slots, trackId} = {}) {
    if(!overlay.hidden) return;
    draft = Array.from({length:5}, (_, index) => ({enabled:slots?.[index]?.enabled !== false, difficulty:validDifficulty(slots?.[index]?.difficulty)}));
    draftTrackId = getTrack(trackId).id;
    track.value = draftTrackId;
    render();
    previousFocus = document.activeElement;
    overlay.hidden = false;
    onOpen?.();
    background = document.getElementById('ui');
    if(background) { previousInert = background.inert; background.inert = true; }
    document.addEventListener('focusin', containFocus);
    panel.scrollTop = 0;
    cancel.focus({preventScroll:true});
  }

  function close() {
    if(overlay.hidden) return;
    overlay.hidden = true;
    draft = [];
    draftTrackId = null;
    document.removeEventListener('focusin', containFocus);
    if(background?.isConnected) background.inert = previousInert;
    background = null;
    onClose?.();
    if(previousFocus?.isConnected && !previousFocus.closest('[hidden],[inert]') && previousFocus.getClientRects().length) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }

  rows.forEach((row, index) => {
    row.toggle.addEventListener('click', () => { draft[index].enabled = !draft[index].enabled; render(); });
    row.difficulty.addEventListener('change', () => { draft[index].difficulty = validDifficulty(row.difficulty.value); });
  });
  track.addEventListener('change', () => { draftTrackId = getTrack(track.value).id; });
  cancel.addEventListener('click', close);
  overlay.querySelector('#single-player-cancel').addEventListener('click', close);
  overlay.querySelector('#single-player-start').addEventListener('click', () => {
    const slots = draft.map(slot => ({...slot}));
    const trackId = draftTrackId;
    close();
    onConfirm?.(slots, trackId);
  });
  overlay.addEventListener('click', event => { if(event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    event.stopPropagation();
    if(event.key === 'Escape') { event.preventDefault(); close(); return; }
    if(event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button,select')].filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if(event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  overlay.addEventListener('keyup', event => event.stopPropagation());
  return {open, close, get visible() { return !overlay.hidden; }};
}
