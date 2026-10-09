const MODES = new Set(['auto', 'low', 'high']);

export function createGraphicsUI({onOpen, onClose, onChange} = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'graphics-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<section id="graphics-dialog" class="graphics-panel" role="dialog" aria-modal="true" aria-labelledby="graphics-title" aria-describedby="graphics-intro" tabindex="-1">
    <header class="graphics-header"><span class="eyebrow">SUNLANE / GRAPHICS</span><button id="graphics-close" class="graphics-close" aria-label="Close graphics settings">×</button></header>
    <h2 id="graphics-title">GRAPHICS.</h2>
    <p id="graphics-intro">Choose the detail that feels right for your ride.</p>
    <label class="graphics-field" for="graphics-quality">GRAPHICS QUALITY<select id="graphics-quality" aria-describedby="graphics-mode-hint"><option value="auto">Auto (recommended)</option><option value="low">Performance</option><option value="high">High</option></select></label>
    <p id="graphics-mode-hint" class="graphics-mode-hint"></p>
    <div class="graphics-current" role="status" aria-live="polite" aria-atomic="true"><span class="graphics-current-label">CURRENT QUALITY</span><strong id="graphics-current-quality"></strong><p id="graphics-current-detail"></p></div>
    <button id="graphics-done" class="primary-button">BACK TO IT <span aria-hidden="true">↗</span></button>
  </section>`;
  document.body.append(overlay);
  const panel = overlay.querySelector('#graphics-dialog');
  const select = overlay.querySelector('#graphics-quality');
  const hint = overlay.querySelector('#graphics-mode-hint');
  const quality = overlay.querySelector('#graphics-current-quality');
  const detail = overlay.querySelector('#graphics-current-detail');
  let state = {mode:'auto', quality:'low', detectedTier:'low'};
  let previousFocus = null, background = null, previousInert = false;
  const text = (element, value) => { if(element.textContent !== value) element.textContent = value; };

  function update(next = {}) {
    state = {...state, ...next};
    const mode = MODES.has(state.mode) ? state.mode : 'auto';
    const high = state.quality === 'high';
    if(select.value !== mode) select.value = mode;
    text(hint, mode === 'auto'
      ? `Auto recommends ${state.detectedTier === 'high' ? 'High' : 'Performance'} for this device.`
      : mode === 'low' ? 'Prioritize smooth racing with lighter visual effects.' : 'Show the scenery at its fullest detail.');
    text(quality, high ? 'HIGH' : 'PERFORMANCE');
    text(detail, high
      ? 'Detailed cherry blossoms, live water reflections, dynamic shadows and ambient effects.'
      : 'Simple water, reduced resolution, no dynamic shadows and fewer ambient effects.');
  }

  function containFocus(event) {
    if(!overlay.hidden && !overlay.contains(event.target)) select.focus({preventScroll:true});
  }

  function open(next) {
    if(next) update(next);
    if(!overlay.hidden) return;
    previousFocus = document.activeElement;
    overlay.hidden = false;
    onOpen?.();
    background = document.getElementById('ui');
    if(background) { previousInert = background.inert; background.inert = true; }
    document.addEventListener('focusin', containFocus);
    panel.scrollTop = 0;
    select.focus({preventScroll:true});
  }

  function close() {
    if(overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener('focusin', containFocus);
    if(background?.isConnected) background.inert = previousInert;
    background = null;
    onClose?.();
    if(previousFocus?.isConnected && !previousFocus.closest('[hidden],[inert]') && previousFocus.getClientRects().length) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }

  select.addEventListener('change', () => onChange?.(select.value));
  overlay.querySelector('#graphics-close').addEventListener('click', close);
  overlay.querySelector('#graphics-done').addEventListener('click', close);
  overlay.addEventListener('click', event => { if(event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    event.stopPropagation();
    if(event.key === 'Escape') { event.preventDefault(); close(); return; }
    if(event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button,select,[tabindex]')].filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if(!first) { event.preventDefault(); panel.focus(); return; }
    if(event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  overlay.addEventListener('keyup', event => event.stopPropagation());
  update();
  return {open, close, update, get visible() { return !overlay.hidden; }};
}
