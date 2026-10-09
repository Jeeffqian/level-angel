const DEADZONE = 0.12;

/** A fixed-base, single-pointer stick. Up is negative y; values include a radial deadzone. */
export function createTouchJoystick(element, {onChange} = {}) {
  const knob = element.querySelector('#touch-joystick-knob');
  let pointerId = null, centerX = 0, centerY = 0, travel = 1;
  let value = {x:0, y:0, active:false};
  const listeners = [];
  const on = (target, type, listener) => {
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  };
  function emit(next) {
    if(next.x === value.x && next.y === value.y && next.active === value.active) return;
    value = next;
    onChange?.({...next});
  }
  function reset() {
    const previousPointer = pointerId;
    pointerId = null;
    element.classList.remove('is-active');
    if(knob) knob.style.transform = 'translate(-50%, -50%)';
    if(previousPointer !== null && element.hasPointerCapture(previousPointer)) element.releasePointerCapture(previousPointer);
    emit({x:0, y:0, active:false});
  }
  function move(event) {
    const dx = event.clientX - centerX, dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy), magnitude = Math.min(1, distance / travel);
    const nx = distance > 0 ? dx / distance : 0, ny = distance > 0 ? dy / distance : 0;
    if(knob) knob.style.transform = `translate(-50%, -50%) translate(${nx * magnitude * travel}px, ${ny * magnitude * travel}px)`;
    const strength = magnitude > DEADZONE ? (magnitude - DEADZONE) / (1 - DEADZONE) : 0;
    emit({x:nx * strength, y:ny * strength, active:true});
  }
  on(element, 'pointerdown', event => {
    if(event.button !== 0 || pointerId !== null || element.getAttribute('aria-disabled') === 'true' || element.closest('[hidden],[inert]')) return;
    const rect = element.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    event.preventDefault();
    centerX = rect.left + rect.width / 2; centerY = rect.top + rect.height / 2;
    travel = Math.max(1, (Math.min(rect.width, rect.height) - (knob?.getBoundingClientRect().width || 0)) / 2 - 5);
    pointerId = event.pointerId;
    element.setPointerCapture(pointerId);
    element.classList.add('is-active');
    move(event);
  });
  on(element, 'pointermove', event => {
    if(event.pointerId !== pointerId) return;
    event.preventDefault();
    if(event.pointerType === 'mouse' && !(event.buttons & 1)) { reset(); return; }
    move(event);
  });
  for(const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(element, type, event => {
    if(event.pointerId === pointerId) reset();
  });
  on(element, 'contextmenu', event => event.preventDefault());
  for(const type of ['blur', 'resize', 'orientationchange']) on(window, type, reset);
  on(document, 'visibilitychange', () => { if(document.hidden) reset(); });
  return {reset, dispose() { reset(); listeners.forEach(remove => remove()); }};
}
