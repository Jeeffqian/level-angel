import { KARTS, AVATARS, getKartStats } from './config.js';
import { getTrack } from './track.js';
import { createTouchJoystick } from './touch-joystick.js';
import { isMobileTouchDevice } from './touch-device.js';
import { getDriverSkill } from './driver-skills.js';

const timeText = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}` : '—';
const ordinal = n => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const kartIcon = color => `<svg viewBox="0 0 120 62" aria-hidden="true"><ellipse cx="60" cy="52" rx="48" ry="7" fill="#173d4624"/><g fill="#173d46"><rect x="16" y="33" width="17" height="20" rx="6"/><rect x="87" y="33" width="17" height="20" rx="6"/><rect x="28" y="8" width="13" height="17" rx="5"/><rect x="79" y="8" width="13" height="17" rx="5"/></g><path d="M42 13H78L89 43Q60 53 31 43Z" fill="${color}"/><path d="M45 32L49 15H71L75 32" fill="#ffffff88"/><path d="M22 42H98L93 49H27Z" fill="${color}"/><ellipse cx="60" cy="24" rx="10" ry="9" fill="#173d46"/><path d="M52 24H68" stroke="#fff4d2" stroke-width="4"/></svg>`;

const avatarIcon = avatar => `<svg viewBox="0 0 100 80" aria-hidden="true"><circle cx="50" cy="37" r="33" fill="${escapeHTML(avatar.color)}" opacity=".14"/><path d="M24 78V68Q25 51 50 51T76 68V78" fill="${escapeHTML(avatar.color)}"/><path d="M44 55L50 64L57 55" fill="#fff9e9"/><circle cx="50" cy="31" r="21" fill="${escapeHTML(avatar.color)}"/><path d="M31 30Q50 16 69 30V38Q50 49 31 38Z" fill="#173d46"/><path d="M37 30L47 27" stroke="#fff9e9" stroke-width="4" stroke-linecap="round"/><path d="M46 7H54V17H46Z" fill="#fff9e9"/></svg>`;

const ITEM_ICONS = {
  banana: '<path d="M30 6c0 17-7 28-20 30 2 7 13 8 22 0 8 8 14 8 18 3-13-5-18-15-17-29Z" fill="#ffce4e" stroke="#fff6cb" stroke-width="2"/><path d="m30 6 4-3 3 6-5 3" fill="#8fb85a"/>',
  missile: '<path d="M18 36 10 44l12-2m2-17-10 3-4 9 13-1m13-12-1 13 9-4 2-10" fill="#ffca4b"/><path d="M18 31C24 17 34 9 47 8c-1 13-9 24-23 30Z" fill="#fff9e9" stroke="#ff6248" stroke-width="3"/><circle cx="35" cy="20" r="5" fill="#ff6248"/><path d="m15 37-7 11 12-6" fill="#ff6248"/>',
  shield: '<path d="m28 5 19 7v15c0 11-9 19-19 25C18 46 9 38 9 27V12Z" fill="#69dbe0" stroke="#e5ffff" stroke-width="3"/><path d="m18 28 7 7 13-16" fill="none" stroke="#fff9e9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  turbo: '<path d="m31 4-20 27h15l-3 21 23-30H31l4-18Z" fill="#ffca4b" stroke="#fff9e9" stroke-width="2"/><path d="M6 20h9M3 29h7M8 39h8" stroke="#ff6248" stroke-width="3" stroke-linecap="round"/>',
};
const itemIcon = item => item ? `<svg viewBox="0 0 56 56" aria-hidden="true">${ITEM_ICONS[item]}</svg>` : '<span aria-hidden="true">?</span>';
const SKILL_ICONS = {
  overdrive: '<path d="m31 6-17 23h12l-2 20 18-26H30l3-17Z"/><path d="M7 20h8M5 29h7M8 38h7"/>',
  catwalk: '<path d="m13 21-2-12 14 7 7-1L45 8l-2 14c5 17-6 27-16 27S8 37 13 21Z"/><path d="m18 28 5 2m9 0 5-2m-12 8 3 3 3-3"/>',
  emp: '<circle cx="28" cy="28" r="7"/><path d="M28 5v10m0 26v10M5 28h10m26 0h10M12 12l7 7m18 18 7 7m0-32-7 7M12 44l7-7"/><circle cx="28" cy="28" r="17"/>',
  guardian: '<path d="m28 6 18 6v14c0 12-9 20-18 25C18 46 10 38 10 26V12Z"/><path d="m19 28 6 6 13-15"/>',
  magnet: '<path d="M11 10v22a17 17 0 0 0 34 0V10H33v22a5 5 0 0 1-10 0V10Z"/><path d="M11 20h12m10 0h12M3 28h3m44 0h3"/>',
};
const skillIcon = id => `<svg viewBox="0 0 56 56" aria-hidden="true">${SKILL_ICONS[id]||SKILL_ICONS.overdrive}</svg>`;
const kartProfileMarkup = () => `<div class="kart-profile-heading"><span class="eyebrow">DRIVING PROFILE</span><h3 data-profile-name></h3><span data-profile-role></span></div><dl class="kart-profile-stats">${getKartStats(KARTS[0]).map(stat=>`<div data-profile-stat="${stat.id}"><dt>${escapeHTML(stat.label)}</dt><dd><strong data-stat-value></strong><span class="profile-stat-track" aria-hidden="true"><i></i></span></dd><small data-stat-description></small></div>`).join('')}</dl><div class="kart-profile-notes"><p><b>STRENGTH</b><span data-profile-strength></span></p><p><b>TRADEOFF</b><span data-profile-tradeoff></span></p><p class="kart-profile-tip"><b>DRIVING TIP</b><span data-profile-tip></span></p></div>`;

export function createUI(callbacks = {}) {
  const root = document.getElementById('ui');
  const touchDevice=isMobileTouchDevice();document.body.dataset.touchControls=String(touchDevice);
  root.innerHTML = `
    <section id="garage" class="garage" aria-label="Kart and driver selection">
      <header class="garage-top"><div class="wordmark"><span class="sun-icon">✳</span> SUNLANE RACING CLUB</div><div class="garage-top-actions"><span id="track-edition" class="edition">COASTAL CUP / 01</span><button id="graphics-garage" class="garage-graphics" aria-label="Graphics settings" title="Graphics settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></svg><span>GRAPHICS</span></button></div></header>
      <div class="garage-title"><div class="eyebrow"><span></span> GOOD DAYS. GREAT RACES.</div><h1>SUNLANE<br><em>SPRINT</em><span class="title-dot">✳</span></h1><p>Find your line.<br>Leave a little sunshine behind.</p><div class="track-badge"><span class="track-flag" aria-hidden="true">⚑</span><div class="garage-track"><strong id="garage-track-name"></strong><span id="track-meta"></span></div></div><section id="kart-profile-inline" class="kart-profile" aria-label="Selected kart driving profile">${kartProfileMarkup()}</section></div>
      <div class="preview-caption"><span id="preview-tag"></span><strong id="preview-name"></strong><small class="garage-rotate-hint">↔ DRAG TO ROTATE</small><span id="preview-description"></span></div>
      <div class="garage-bottom">
        <div class="garage-selector-head"><div class="garage-tabs" role="tablist" aria-label="Customize your racer"><button id="kart-tab" role="tab" aria-selected="true" aria-controls="kart-panel" tabindex="0">KART <span>${KARTS.length}</span></button><button id="driver-tab" role="tab" aria-selected="false" aria-controls="driver-panel" tabindex="-1">DRIVER <span>${AVATARS.length}</span></button></div><span id="kart-role-summary" class="lineup-label"></span><button id="kart-profile-open" class="kart-profile-open" aria-haspopup="dialog" aria-controls="kart-profile-dialog">PERFORMANCE <span aria-hidden="true">↗</span></button><span id="driver-performance-note" class="driver-performance-note" hidden>DRIVER SKILLS</span></div>
        <section id="driver-skill-profile" class="driver-skill-profile" aria-label="Selected driver skill" hidden><span id="driver-skill-icon" class="driver-skill-icon" aria-hidden="true"></span><div><div class="driver-skill-heading"><strong id="driver-skill-name"></strong><span id="driver-skill-cooldown"></span></div><p id="driver-skill-description"></p></div></section><div class="garage-actions"><div class="garage-choice-panels">
          <div id="kart-panel" class="kart-choices choice-strip" role="tabpanel" aria-labelledby="kart-tab">${KARTS.map((kart,index) => `<button class="kart-card" data-kart="${index}" aria-label="Choose ${escapeHTML(kart.name)} kart, ${escapeHTML(kart.role)}" aria-pressed="${index === 0}" style="--kart-color:${kart.color}"><div class="kart-card-heading"><span class="kart-number">0${index + 1}</span><strong>${escapeHTML(kart.name)}</strong><span class="selected-check">✓</span></div>${kartIcon(kart.color)}<span class="kart-card-role">${escapeHTML(kart.role)}</span><div class="kart-stats">${getKartStats(kart).filter(stat=>['speed','acceleration','handling'].includes(stat.id)).map(stat=>`<span data-card-stat="${stat.id}" title="${escapeHTML(stat.label+': '+stat.value)}">${escapeHTML(stat.shortLabel)}<i><b style="width:${stat.rating * 20}%"></b></i></span>`).join('')}</div></button>`).join('')}</div>
          <div id="driver-panel" class="avatar-choices choice-strip" role="tabpanel" aria-labelledby="driver-tab" hidden>${AVATARS.map((avatar,index) => `<button class="kart-card avatar-card" data-avatar="${index}" aria-label="Choose ${escapeHTML(avatar.name)} driver: ${escapeHTML(getDriverSkill(index).name)}" aria-pressed="${index === 0}" style="--kart-color:${avatar.color}"><div class="kart-card-heading"><span class="kart-number">0${index + 1}</span><strong>${escapeHTML(avatar.name)}</strong><span class="selected-check">✓</span></div><div class="avatar-art">${avatarIcon(avatar)}${avatar.portrait?`<img src="${escapeHTML(avatar.portrait)}" alt="" loading="lazy" draggable="false">`:''}</div><span class="avatar-card-tag">${escapeHTML(getDriverSkill(index).name)}</span></button>`).join('')}</div>
        </div><div class="race-action"><div class="selected-combination"><span>YOUR LINEUP</span><strong id="selected-combination"></strong></div><button id="start-race" class="primary-button">LET’S RACE <span>↗</span></button><p>DRIFT. BOOST. CHASE THE PODIUM.</p></div></div><div class="garage-controls"><span><kbd>W</kbd> / <kbd>↑</kbd> ACCELERATE</span><span><kbd>A</kbd><kbd>D</kbd> STEER</span><span><kbd>S</kbd> BRAKE</span><span><kbd>SHIFT</kbd> DRIFT</span><span><kbd>SPACE</kbd> NITRO</span><span><kbd>E</kbd> DRIVER SKILL</span><span><kbd>R</kbd> RECOVER</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> ITEMS</span></div>
      </div>
    </section>
    <dialog id="kart-profile-dialog" class="kart-profile-dialog" aria-label="Selected kart driving profile"><button id="kart-profile-close" class="kart-profile-close" aria-label="Close driving profile" autofocus>×</button><div class="kart-profile">${kartProfileMarkup()}</div><p class="kart-profile-conditions">Ratings compare these five karts. Higher bars mean stronger performance.</p></dialog>
    <section id="race-hud" class="race-hud" hidden aria-label="Race status">
      <div id="missile-aim-reticle" class="missile-aim-reticle" hidden><span class="missile-aim-brackets" aria-hidden="true"></span><span id="missile-aim-label"></span></div>
      <div id="missile-aim-status" class="missile-aim-status" role="status" aria-live="polite" hidden></div>
      <div id="hit-camera" class="hit-camera" role="group" aria-label="Item hit camera" hidden><div id="hit-camera-viewport" class="hit-camera-viewport"></div><div class="hit-camera-caption"><strong id="hit-camera-title">DIRECT HIT</strong><span id="hit-camera-name"></span></div></div>
      <div id="rear-view-mirror" class="rear-view-mirror" role="group" aria-label="Rear-view mirror" hidden><div class="rear-view-window"><div id="rear-view-viewport" class="rear-view-viewport"></div><span id="rear-view-threat" class="rear-view-threat" aria-hidden="true" hidden></span></div><div class="rear-view-labels"><span id="rear-view-caption">REAR VIEW</span><span id="rear-view-warning" role="status" aria-live="polite" hidden></span></div></div>
      <div class="position-cluster"><span class="hud-label">POSITION</span><div><strong id="position-value">1</strong><span id="position-suffix">st</span><small id="position-total">/ 6</small></div></div>
      <div class="race-top-right"><div class="timing-cluster"><div><span class="hud-label">LAP</span><strong><span id="lap-value">1</span><small> / 3</small></strong></div><div class="time-block"><span class="hud-label">RACE TIME</span><strong id="time-value">0:00.00</strong></div></div><div class="utility-buttons"><button id="mute-button" class="icon-button" aria-label="Mute sound" title="Toggle sound">♫</button><button id="pause-button" class="icon-button" aria-label="Pause race" title="Pause (Esc)">Ⅱ</button></div></div>
      <div id="race-message" class="race-message" role="status" hidden></div>
      <div id="countdown" class="countdown" aria-live="polite" hidden>3</div>
      <div class="map-cluster"><span id="hud-track-name" class="hud-label">PALM COAST</span><canvas id="minimap" width="360" height="260" aria-label="Race circuit and kart positions"></canvas><span class="map-legend"><i></i> YOU <small>●</small> RIVALS <span id="map-shortcut-legend" class="map-shortcut-legend" hidden><b aria-hidden="true"></b> SHORTCUT</span></span></div>
      <div class="nitro-cluster"><div class="nitro-heading"><strong id="nitro-label">NITRO</strong><span><kbd>SPACE</kbd><b id="nitro-value">0%</b></span></div><div class="nitro-track"><div id="nitro-fill"></div><i></i><i></i><i></i></div><span id="drift-label" class="drift-label">HOLD SHIFT + STEER TO DRIFT</span></div>
      <div class="speed-cluster"><div><strong id="speed-value">0</strong><span>KM/H</span></div><span class="speed-stripes">/////</span></div>
      <div class="item-cluster" role="group" aria-label="Item inventory"><span id="item-effects" class="item-effects" hidden></span>${Array.from({length:3},(_,index)=>`<button id="item-slot-${index}" data-item-slot="${index}" class="item-slot" type="button" aria-label="Item slot ${index+1}, empty. Drive through a question-mark box." disabled><span class="item-number" aria-hidden="true">${index+1}</span><span id="item-icon-${index}" class="item-icon" aria-hidden="true"></span><span class="item-copy"><strong id="item-name-${index}" aria-live="polite">EMPTY</strong><small id="item-use-hint-${index}">COLLECT ?</small></span></button>`).join('')}</div>
      <button id="driver-skill-button" class="driver-skill-button" type="button" disabled aria-label="Driver skill charging"><span class="driver-skill-ring"><span id="driver-skill-hud-icon" class="driver-skill-hud-icon"></span><b id="driver-skill-timer"></b><kbd>E</kbd></span><strong id="driver-skill-hud-name"></strong><small id="driver-skill-state" aria-live="polite">CHARGING</small></button><div class="race-key-hint"><kbd>E</kbd> SKILL <span>·</span> <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> ITEMS <span>·</span> <kbd>ESC</kbd> PAUSE <span>·</span> <kbd>R</kbd> RECOVER</div>
      <div class="touch-controls" aria-label="Touch driving controls"><div class="touch-stick-cluster"><div id="touch-joystick" class="touch-joystick" role="group" tabindex="0" aria-label="Driving joystick" aria-describedby="touch-joystick-help"><span class="joystick-up" aria-hidden="true">▲</span><span class="joystick-down" aria-hidden="true">▼</span><span class="joystick-left" aria-hidden="true">‹</span><span class="joystick-right" aria-hidden="true">›</span><span id="touch-joystick-knob" class="touch-joystick-knob" aria-hidden="true"></span></div><span id="touch-joystick-help" class="touch-stick-help">UP: DRIVE · DOWN: BRAKE / REVERSE<br>LEFT / RIGHT: STEER</span></div><div class="touch-actions"><button data-action="drift" class="touch-drift" aria-label="Hold to drift">DRIFT</button><button data-action="boost" class="touch-boost" aria-label="Hold for nitro boost">NITRO</button></div><button id="touch-recover" class="touch-recover" aria-label="Recover kart">↺</button></div>
    </section>
    <section id="pause-overlay" class="overlay" hidden><div class="pause-panel"><span id="pause-eyebrow" class="eyebrow">TAKE A BREATHER</span><h2 id="pause-title">PIT STOP.</h2><p id="pause-description">The coast isn’t going anywhere.</p><button id="resume-race" class="primary-button">BACK TO RACING <span>↗</span></button><div class="pause-secondary-actions"><button id="restart-paused" class="secondary-button">RESTART RACE</button><button id="graphics-paused" class="secondary-button">GRAPHICS</button></div><button id="garage-paused" class="text-button">BACK TO GARAGE</button><div class="pause-tips"><b>FIND YOUR FLOW</b><p id="pause-driving-tip">Hold Shift while steering to drift. Release for a mini boost. Drifting fills nitro — press Space to use it.</p><span id="pause-control-hint">W / ↑ DRIVE &nbsp; · &nbsp; A / D STEER &nbsp; · &nbsp; S BRAKE<br>R RECOVER &nbsp; · &nbsp; ESC RESUME</span></div></div></section>
    <section id="results-overlay" class="overlay" hidden><div class="results-panel"><div class="results-heading"><span id="results-track-name" class="eyebrow">PALM COAST / RACE COMPLETE</span><h2 id="finish-title">WHAT A RIDE.</h2><p id="finish-subtitle">Three laps. All sunshine.</p></div><div class="result-summary"><span><small>YOUR TIME</small><b id="finish-time">—</b></span><span><small>BEST LAP</small><b id="best-lap">—</b></span><span><small>FINISH</small><b id="finish-position">—</b></span></div><div class="results-table"><div class="result-row result-table-heading"><span>POS</span><span>DRIVER / KART</span><span>TIME</span></div><div id="results-list"></div></div><div class="results-buttons"><button id="restart-race" class="primary-button">RACE AGAIN <span>↗</span></button><button id="garage-results" class="secondary-button">CHANGE KART</button></div></div></section>`;

  const ids = Object.fromEntries([...root.querySelectorAll('[id]')].map(el => [el.id, el]));
  const on = (id, fn) => ids[id].addEventListener('click', () => callbacks[fn]?.());
  const profileDialog=ids['kart-profile-dialog'];
  ids['kart-profile-open'].addEventListener('click',()=>profileDialog.showModal());
  ids['kart-profile-close'].addEventListener('click',()=>profileDialog.close());
  profileDialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Tab'){event.preventDefault();ids['kart-profile-close'].focus();}});
  profileDialog.addEventListener('click',event=>{if(event.target===profileDialog){const r=profileDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)profileDialog.close();}});
  on('graphics-garage','onGraphics'); on('graphics-paused','onGraphics');
  on('start-race','onStart'); on('pause-button','onPause'); on('mute-button','onMute');
  on('resume-race','onResume'); on('restart-paused','onRestart'); on('restart-race','onRestart');
  on('garage-paused','onGarage'); on('garage-results','onGarage');
  const cards = [...root.querySelectorAll('[data-kart]')];
  cards.forEach((el,index) => el.addEventListener('click', () => callbacks.onSelect?.(index)));
  const avatarCards = [...root.querySelectorAll('[data-avatar]')];
  avatarCards.forEach((el,index) => el.addEventListener('click', () => callbacks.onAvatarSelect?.(index)));
  root.querySelectorAll('.avatar-art img').forEach(img => {
    const fallback=img.parentElement.querySelector('svg');
    const showPortrait=()=>{img.hidden=false;fallback.style.display='none';};
    const showFallback=()=>{img.hidden=true;fallback.style.display='';};
    img.addEventListener('load',showPortrait);img.addEventListener('error',showFallback);
    if(img.complete)(img.naturalWidth>0?showPortrait:showFallback)();
  });
  let selectionMode='kart',currentKart=0,currentAvatar=0;
  const updatePreview=()=>{
    const kart=KARTS[currentKart]||KARTS[0],avatar=AVATARS[currentAvatar]||AVATARS[0];
    const item=selectionMode==='driver'?avatar:kart;
    ids['preview-tag'].textContent=item.tag||'';ids['preview-name'].textContent=item.name;ids['preview-description'].textContent=item.description||'';
    ids['selected-combination'].textContent=`${avatar.name} / ${kart.name}`;
    ids['kart-role-summary'].textContent=`${kart.name} / ${kart.role}`;
    const skill=getDriverSkill(currentAvatar),skillProfile=ids['driver-skill-profile'];
    skillProfile.style.setProperty('--skill-color',skill.color);skillProfile.dataset.skill=skill.id;
    ids['driver-skill-icon'].innerHTML=skillIcon(skill.id);
    ids['driver-skill-name'].textContent=skill.name;
    ids['driver-skill-cooldown'].textContent=`${skill.cooldown}s COOLDOWN · ${touchDevice?'TAP SKILL':'PRESS E'}`;
    ids['driver-skill-description'].textContent=skill.description;
    for(const profile of root.querySelectorAll('.kart-profile')){
      profile.style.setProperty('--profile-color',kart.color);profile.dataset.kartId=kart.id;
      for(const [name,value] of Object.entries({name:kart.name,role:kart.role,strength:kart.strength,tradeoff:kart.tradeoff,tip:kart.drivingTip}))profile.querySelector(`[data-profile-${name}]`).textContent=value;
      for(const stat of getKartStats(kart)){
        const row=profile.querySelector(`[data-profile-stat="${stat.id}"]`);row.querySelector('[data-stat-value]').textContent=stat.value;row.title=stat.description;
        row.querySelector('[data-stat-description]').textContent=stat.description;row.querySelector('.profile-stat-track i').style.width=`${stat.rating*20}%`;
      }
    }
  };
  const setSelectionMode=(mode,focus=false)=>{
    selectionMode=mode;
    ids['driver-performance-note'].hidden=mode!=='driver';ids['kart-role-summary'].hidden=mode!=='kart';ids['kart-profile-open'].hidden=mode!=='kart';ids['garage'].dataset.selectionMode=mode;
    ids['driver-skill-profile'].hidden=mode!=='driver';
    for(const kind of ['kart','driver']){
      const active=kind===mode,tab=ids[kind+'-tab'];tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;ids[kind+'-panel'].hidden=!active;
    }
    updatePreview();if(focus)ids[mode+'-tab'].focus();
  };
  for(const kind of ['kart','driver']){
    ids[kind+'-tab'].addEventListener('click',()=>setSelectionMode(kind));
    ids[kind+'-tab'].addEventListener('keydown',event=>{
      if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation();setSelectionMode(event.key==='Home'?'kart':event.key==='End'?'driver':kind==='kart'?'driver':'kart',true);
      }
    });
  }
  const itemGestures=new Map();
  function finishItemGesture(source,fire=false){
    const gesture=itemGestures.get(source);if(!gesture)return;itemGestures.delete(source);
    if(gesture.pointerId!==undefined&&gesture.button.hasPointerCapture(gesture.pointerId))gesture.button.releasePointerCapture(gesture.pointerId);
    if(gesture.item==='missile'){
      if(fire)callbacks.onItemRelease?.(gesture.slot,source);else callbacks.onItemCancel?.(gesture.slot,source);
    }else if(fire){
      const slot=itemSlots[gesture.slot];
      if(slot.enabled&&slot.held===gesture.item&&!gesture.button.closest('[hidden],[inert]'))callbacks.onUseItem?.(gesture.slot);
    }
  }
  const cancelItemGestures=()=>{for(const source of [...itemGestures.keys()])finishItemGesture(source);};
  const skillButton=ids['driver-skill-button'];
  let skillEnabled=false,skillGesture=null,skillId='';
  const skillAvailable=()=>skillEnabled&&!skillButton.disabled&&!skillButton.closest('[hidden],[inert]');
  const finishSkillGesture=(fire=false)=>{
    const gesture=skillGesture;if(!gesture)return;skillGesture=null;skillButton.classList.remove('is-pressed');
    if(gesture.pointerId!==undefined&&skillButton.hasPointerCapture(gesture.pointerId))skillButton.releasePointerCapture(gesture.pointerId);
    if(fire&&skillAvailable()&&gesture.skill===skillId)callbacks.onSkill?.();
  };
  skillButton.addEventListener('pointerdown',event=>{
    if(event.button!==0||!skillAvailable()||skillGesture)return;
    event.preventDefault();skillGesture={pointerId:event.pointerId,skill:skillId};skillButton.setPointerCapture(event.pointerId);skillButton.classList.add('is-pressed');
  });
  skillButton.addEventListener('pointerup',event=>{
    if(skillGesture?.pointerId!==event.pointerId)return;
    const b=skillButton.getBoundingClientRect();event.preventDefault();
    finishSkillGesture(event.clientX>=b.left&&event.clientX<=b.right&&event.clientY>=b.top&&event.clientY<=b.bottom);
  });
  for(const type of ['pointercancel','lostpointercapture'])skillButton.addEventListener(type,event=>{if(skillGesture?.pointerId===event.pointerId)finishSkillGesture();});
  skillButton.addEventListener('keydown',event=>{
    if(!['Space','Enter'].includes(event.code))return;event.preventDefault();event.stopPropagation();
    if(!event.repeat&&skillAvailable()&&!skillGesture){skillGesture={key:event.code,skill:skillId};skillButton.classList.add('is-pressed');}
  });
  skillButton.addEventListener('keyup',event=>{
    if(!['Space','Enter'].includes(event.code))return;event.preventDefault();event.stopPropagation();
    if(skillGesture?.key===event.code)finishSkillGesture(true);
  });
  skillButton.addEventListener('blur',()=>{if(skillGesture?.key)finishSkillGesture();});
  skillButton.addEventListener('click',event=>{if(event.detail===0&&!event.pointerType&&skillAvailable())callbacks.onSkill?.();});
  skillButton.addEventListener('contextmenu',event=>event.preventDefault());
  const held = new Map(), touchControls=root.querySelector('.touch-controls');
  const actionButtons=[...touchControls.querySelectorAll('[data-action]')],actionCluster=touchControls.querySelector('.touch-actions');
  let touchEnabled=false,activeActions=new Set();
  const actionHomes=new Map();
  const center=bounds=>({x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2});
  const syncActions=()=>{
    const next=new Set([...held.values()].flatMap(item=>[...item.actions]));
    const merged=[...held.values()].find(item=>item.mergeTarget);
    for(const el of actionButtons){
      const action=el.dataset.action,pressed=next.has(action);
      el.classList.toggle('pressed',pressed);el.setAttribute('aria-pressed',String(pressed));
      if(pressed!==activeActions.has(action))callbacks.onTouch?.(action,pressed);
      const owner=[...held.values()].find(item=>item.el===el);
      const isMerged=merged?.el===el,home=actionHomes.get(el);
      const x=isMerged?merged.mergeTarget.x-home.x:merged?0:owner?.offsetX||0;
      const y=isMerged?merged.mergeTarget.y-home.y:merged?0:owner?.offsetY||0;
      el.style.setProperty('--touch-drag-x',`${x}px`);el.style.setProperty('--touch-drag-y',`${y}px`);
      el.classList.toggle('is-dragging',!!owner&&!merged);
      el.classList.toggle('is-merged',isMerged);el.classList.toggle('is-merged-away',!!merged&&!isMerged);
      el.setAttribute('aria-label',isMerged?'Drift and nitro active; release to separate':action==='drift'?'Hold and drag Drift onto Nitro to use both until release':'Hold and drag Nitro onto Drift to use both until release');
    }
    actionCluster.classList.toggle('is-combined',next.has('drift')&&next.has('boost'));
    actionCluster.classList.toggle('is-merged',!!merged);
    actionCluster.classList.toggle('is-dragging',held.size>0);
    activeActions=next;
  };
  const releaseAll = () => {
    const entries=[...held.entries()];held.clear();syncActions();
    for(const [pointerId,item] of entries)if(item.el.hasPointerCapture(pointerId))item.el.releasePointerCapture(pointerId);
  };
  const joystick=createTouchJoystick(ids['touch-joystick'],{onChange:value=>{if(touchEnabled||!value.active)callbacks.onJoystick?.(value);}});
  const resetTouch=()=>{cancelItemGestures();finishSkillGesture();releaseAll();joystick.reset();};
  actionButtons.forEach(el => {
    el.setAttribute('aria-pressed','false');
    el.innerHTML=`<span class="touch-action-label">${el.textContent}</span><span class="touch-combo-label" aria-hidden="true">DRIFT<b>+</b>NITRO</span>`;
    el.setAttribute('aria-label',el.dataset.action==='drift'?'Hold to drift; slide to Nitro to use both until release':'Hold for nitro boost; slide to Drift to use both until release');
    el.addEventListener('pointerdown', event => {
      if(!touchEnabled||event.button!==0||held.has(event.pointerId)||el.closest('[hidden],[inert]'))return;
      if(!held.size)for(const button of actionButtons)actionHomes.set(button,center(button.getBoundingClientRect()));
      const previous=[...held.values()].find(item=>item.el===el),bounds=el.getBoundingClientRect(),position=center(bounds),home=actionHomes.get(el);
      event.preventDefault();el.setPointerCapture(event.pointerId);
      held.set(event.pointerId,{el,actions:new Set(previous?.mergeTarget?previous.actions:[el.dataset.action]),mergeTarget:previous?.mergeTarget||null,
        grabX:event.clientX-position.x,grabY:event.clientY-position.y,offsetX:position.x-home.x,offsetY:position.y-home.y});syncActions();
    });
    el.addEventListener('pointermove',event=>{
      const item=held.get(event.pointerId);if(!touchEnabled||!item||item.el!==el)return;
      event.preventDefault();
      // Capture keeps the same thumb in charge as the button follows it. Test
      // the other visible button before moving, then snap both faces together.
      if(item.mergeTarget)return;
      const samples=event.getCoalescedEvents?.()||[];
      for(const candidate of actionButtons){
        if(item.actions.has(candidate.dataset.action)||candidate.closest('[hidden],[inert]'))continue;
        const bounds=candidate.getBoundingClientRect(),target=center(bounds),radius=Math.min(bounds.width,bounds.height)/2;
        if([...samples,event].some(p=>Math.hypot(p.clientX-target.x,p.clientY-target.y)<=radius)){
          item.actions.add(candidate.dataset.action);item.mergeTarget=target;break;
        }
      }
      const home=actionHomes.get(el);
      item.offsetX=event.clientX-item.grabX-home.x;item.offsetY=event.clientY-item.grabY-home.y;
      syncActions();
    });
    const release=event=>{
      const item=held.get(event.pointerId);if(!item||item.el!==el)return;held.delete(event.pointerId);
      if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);
      syncActions();
    };
    for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,release);
    el.addEventListener('contextmenu',event=>event.preventDefault());
  });
  ids['touch-recover'].addEventListener('click',()=>{if(touchEnabled&&!ids['touch-recover'].closest('[hidden],[inert]'))callbacks.onRecover?.();});
  for(const type of ['blur','resize','orientationchange'])window.addEventListener(type,resetTouch);
  const visibility=()=>{if(document.hidden)resetTouch();};document.addEventListener('visibilitychange',visibility);
  ids['pause-driving-tip'].textContent=touchDevice?'Push the left stick up to drive, down to brake and reverse. Steer while holding DRIFT. Hold NITRO for speed. Drag either button onto the other: the glowing merged button holds both. Lift your thumb to separate them. Collect ? boxes. Hold a missile slot to aim, then release to fire. Tap other items to use them.':'Hold Shift while steering to drift; release for a mini boost. Space uses nitro. Hold Shift + Space to use both. Collect ? boxes. Hold 1, 2 or 3 for a missile, then release to fire. Other items activate on a tap.';
  ids['pause-control-hint'].textContent=touchDevice?'LEFT STICK: DRIVE / STEER / REVERSE · RIGHT THUMB: SLIDE DRIFT ↔ NITRO TO COMBINE · TAP ITEMS · ↺ RECOVER':'W / ↑ DRIVE · A / D STEER · S BRAKE · R RECOVER · 1 / 2 / 3 ITEMS · ESC RESUME';
  ids['pause-driving-tip'].textContent+=touchDevice?' Skills unlock 8s after GO. Tap the driver skill when READY; it recharges after each use.':' Skills unlock 8s after GO. Press E when READY; your driver skill recharges after each use.';
  ids['pause-control-hint'].textContent+=touchDevice?' · TAP DRIVER SKILL':' · E DRIVER SKILL';
  const itemSlots=Array.from({length:3},(_,index)=>({button:ids[`item-slot-${index}`],held:null,old:undefined,enabled:false}));
  itemSlots.forEach((slot,index)=>{
    const button=slot.button,available=()=>slot.enabled&&slot.held&&!button.closest('[hidden],[inert]');
    function press(source,pointerId){
      if(!available()||itemGestures.has(source)||[...itemGestures.values()].some(g=>g.slot===index))return;
      itemGestures.set(source,{slot:index,item:slot.held,button,pointerId,confirmed:false});
      if(slot.held==='missile')callbacks.onItemPress?.(index,source);
    }
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||!available())return;
      // Secondary touches do not produce click while another finger drives.
      // Track each pointer so every item works alongside the joystick.
      event.preventDefault();
      const source=`pointer:${event.pointerId}`;press(source,event.pointerId);
      if(itemGestures.has(source))button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointerup',event=>{
      const source=`pointer:${event.pointerId}`,gesture=itemGestures.get(source);if(!gesture||gesture.button!==button)return;
      const bounds=button.getBoundingClientRect(),inside=event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
      event.preventDefault();finishItemGesture(source,gesture.item==='missile'||inside);
    });
    for(const type of ['pointercancel','lostpointercapture'])button.addEventListener(type,event=>{
      const source=`pointer:${event.pointerId}`,gesture=itemGestures.get(source);
      if(!gesture||gesture.button!==button)return;
      finishItemGesture(source);
    });
    button.addEventListener('keydown',event=>{
      if(!['Space','Enter'].includes(event.code)||!available())return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)press(`button:${event.code}`);
    });
    button.addEventListener('keyup',event=>{
      if(!['Space','Enter'].includes(event.code)||!itemGestures.has(`button:${event.code}`))return;
      event.preventDefault();event.stopPropagation();finishItemGesture(`button:${event.code}`,true);
    });
    button.addEventListener('blur',()=>{for(const [source,gesture] of [...itemGestures])if(gesture.button===button&&gesture.pointerId===undefined)finishItemGesture(source);});
    button.addEventListener('click',event=>{
      // Pointer/key gestures already activate on release. Accept semantic clicks
      // from assistive technology without duplicating a touch compatibility click.
      if(event.detail!==0||event.pointerType||!available())return;
      if(slot.held!=='missile'){callbacks.onUseItem?.(index);return;}
      // Assistive technologies can invoke click without pointer/key events.
      const source='button:Activate',gesture=itemGestures.get(source);
      if(gesture?.slot===index)finishItemGesture(source,true);else press(source);
    });
    button.addEventListener('contextmenu',event=>event.preventDefault());
  });
  const itemObserver=new MutationObserver(()=>{
    for(const [source,gesture] of [...itemGestures])if(!gesture.button.isConnected||gesture.button.disabled||gesture.button.closest('[hidden],[inert]'))finishItemGesture(source);
    if(skillGesture&&!skillAvailable())finishSkillGesture();
  });
  itemObserver.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','inert']});
  const canvas = ids.minimap, ctx = canvas.getContext('2d');
  let currentTrack=null,mapPoint,mapPath,mapShortcuts=[];
  let oldPhase='',oldSelected=-1,oldSelectedAvatar=-1,resultsKey='',lastMap=0;
  function changeTrack(track) {
    currentTrack=track;
    const shortcuts=(track.shortcuts||[]).filter(branch=>branch.points?.length>1);
    const points=[...track.trackPoints,...shortcuts.flatMap(branch=>branch.points)];
    const xs=points.map(p=>p.x),zs=points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    const scale=Math.min(300/(maxX-minX),204/(maxZ-minZ));
    mapPoint=p=>({x:180+(p.x-(minX+maxX)/2)*scale,y:130+(p.z-(minZ+maxZ)/2)*scale});
    mapPath=new Path2D();track.trackPoints.forEach((p,i)=>{const point=mapPoint(p);if(i===0)mapPath.moveTo(point.x,point.y);else mapPath.lineTo(point.x,point.y);});mapPath.closePath();lastMap=-Infinity;
    mapShortcuts=shortcuts.map(branch=>{const path=new Path2D();branch.points.forEach((p,i)=>{const point=mapPoint(p);if(i===0)path.moveTo(point.x,point.y);else path.lineTo(point.x,point.y);});return path;});
    ids['map-shortcut-legend'].hidden=mapShortcuts.length===0;
    canvas.setAttribute('aria-label',`Race circuit and kart positions${shortcuts.length?`. Gold dashed shortcuts: ${shortcuts.map(branch=>branch.name).join(', ')}`:''}`);
    setText('garage-track-name',track.name);
    ids['track-edition'].textContent=({'palm-coast':'COASTAL CUP / 01','sakura-valley':'VALLEY CUP / 02','changan-city':'CITADEL CUP / 03'})[track.id]||'SUNLANE CUP';
    setText('track-meta',`${(track.trackLength/1000).toFixed(2)} KM / SCENIC PREVIEW`);
    setText('hud-track-name',track.name.toUpperCase());
    setText('results-track-name',`${track.name.toUpperCase()} / RACE COMPLETE`);
  }
  const setText=(id,value)=>{ const el=ids[id],str=String(value); if(el.textContent!==str)el.textContent=str; };
  const show=(id,visible)=>{ids[id].hidden=!visible;};
  function update(state) {
    const { phase='garage', selected=0, selectedAvatar=0 }=state;
    if(phase!==oldPhase) {
      if(phase!=='garage'&&profileDialog.open)profileDialog.close();
      show('garage',phase==='garage'); show('race-hud',['countdown','racing','paused'].includes(phase)); show('pause-overlay',phase==='paused'); show('results-overlay',phase==='finished');
      document.body.dataset.phase=phase;const nextTouchEnabled=touchDevice&&(phase==='racing'||phase==='countdown');if(!nextTouchEnabled||!touchEnabled)resetTouch();touchEnabled=nextTouchEnabled;touchControls.inert=!touchEnabled;ids['touch-joystick'].setAttribute('aria-disabled',String(!touchEnabled));oldPhase=phase;
      if(phase==='paused') ids['resume-race'].focus({preventScroll:true});
      if(phase==='finished') ids['restart-race'].focus({preventScroll:true});
    }
    if(selected!==oldSelected||selectedAvatar!==oldSelectedAvatar) {
      currentKart=selected;currentAvatar=selectedAvatar;
      cards.forEach((el,index)=>el.setAttribute('aria-pressed',String(index===selected)));
      avatarCards.forEach((el,index)=>el.setAttribute('aria-pressed',String(index===selectedAvatar)));
      updatePreview();oldSelected=selected;oldSelectedAvatar=selectedAvatar;
    }
    const skill=state.skill||getDriverSkill(selectedAvatar),cooldown=Math.max(0,skill.cooldownRemaining||0),active=Math.max(0,skill.activeRemaining||0);
    const ready=!!skill.ready&&state.skillAvailable&&phase==='racing',status=active>0?'ACTIVE':ready?'READY':!state.skillAvailable?'UNAVAILABLE':cooldown>0?'CHARGING':skill.reason==='SPUN OUT'?'SPUN OUT':'WAIT';
    skillEnabled=!!ready;
    if(skillId!==skill.id){skillId=skill.id;ids['driver-skill-hud-icon'].innerHTML=skillIcon(skill.id);skillButton.style.setProperty('--skill-color',skill.color);setText('driver-skill-hud-name',skill.name);}
    skillButton.disabled=!skillEnabled;skillButton.dataset.state=status.toLowerCase().replaceAll(' ','-');
    skillButton.style.setProperty('--skill-fill',String(active>0?Math.min(1,active/(skill.duration||1)):1-Math.min(1,cooldown/(skill.cooldown||1))));
    setText('driver-skill-timer',active>0?`${active.toFixed(1)}s`:cooldown>0?`${Math.ceil(cooldown)}s`:'');
    setText('driver-skill-state',status);
    const skillStatus=active>0?`Active, ${active.toFixed(1)} seconds remaining`:ready?'Ready':skill.reason||(cooldown>0?`Recharging, ${Math.ceil(cooldown)} seconds`:'Unavailable');
    skillButton.setAttribute('aria-label',`${skill.name}. ${skillStatus}.${touchDevice?' Tap to use.':' Press E to use.'}`);
    skillButton.title=`${skill.name}: ${skill.description} ${skillStatus}.`;
    if(skillGesture&&(!skillEnabled||skillGesture.skill!==skillId))finishSkillGesture();
    itemSlots.forEach((slot,index)=>{
      slot.held=Object.hasOwn(ITEM_ICONS,state.items?.[index])?state.items[index]:null;
      slot.enabled=phase==='racing'&&!!slot.held;
      slot.button.disabled=!slot.enabled;slot.button.dataset.item=slot.held||'empty';
      if(slot.held!==slot.old){ids[`item-icon-${index}`].innerHTML=itemIcon(slot.held);setText(`item-name-${index}`,slot.held?slot.held.toUpperCase():'EMPTY');slot.old=slot.held;}
      const aiming=phase==='racing'&&state.aim?.slot===index;slot.button.classList.toggle('is-aiming',aiming);
      setText(`item-use-hint-${index}`,slot.held==='missile'?(aiming?(state.aim.targetId==null?'SEARCHING':'RELEASE TO FIRE'):'HOLD TO AIM'):slot.held?(touchDevice?'TAP TO USE':`USE · ${index+1}`):'COLLECT ?');
      slot.button.setAttribute('aria-label',slot.held?`Item slot ${index+1}: ${slot.held==='missile'?'hold to aim missile, release to fire':`use ${slot.held}`}${touchDevice?'':`. Keyboard: ${index+1}`}`:`Item slot ${index+1}, empty. Drive through a question-mark box to collect an item.`);
    });
    for(const [source,gesture] of [...itemGestures]){
      const slot=itemSlots[gesture.slot],aimMatches=state.aim?.slot===gesture.slot;
      if(!slot.enabled||slot.held!==gesture.item||!gesture.button.isConnected||(gesture.item==='missile'&&gesture.confirmed&&!aimMatches))finishItemGesture(source);
      else if(gesture.item==='missile'&&aimMatches)gesture.confirmed=true;
    }
    const aim=phase==='racing'?state.aim:null;
    show('missile-aim-status',!!aim);
    setText('missile-aim-status',aim?(aim.targetId!=null?`RELEASE TO FIRE · ${aim.targetName||'TARGET LOCKED'}`:'SEARCHING AHEAD · NO LOCK'):'');
    const effects=[state.shieldTime>0?`SHIELD ${Math.ceil(state.shieldTime)}s`:'',state.itemBoostTime>0?`TURBO ${Math.ceil(state.itemBoostTime)}s`:''].filter(Boolean).join(' · ');setText('item-effects',effects);show('item-effects',!!effects);
    const online=!!state.online,track=getTrack(state.trackId),totalRacers=Math.max(1,Math.min(6,state.totalRacers??state.racers?.length??6));
    if(currentTrack!==track)changeTrack(track);
    setText('position-total',`/ ${totalRacers}`);
    document.body.dataset.online=String(online);
    const startText=online?'OPEN ROOM ':'SINGLE PLAYER ';
    if(ids['start-race'].firstChild.textContent!==startText)ids['start-race'].firstChild.textContent=startText;
    const restartText=online?'BACK TO ROOM ':'RACE AGAIN ';
    if(ids['restart-race'].firstChild.textContent!==restartText)ids['restart-race'].firstChild.textContent=restartText;
    setText('restart-paused',online?'BACK TO ROOM':'RESTART RACE');
    ids['restart-race'].disabled=online&&!state.onlineCanRematch;
    ids['restart-paused'].disabled=online&&!state.onlineCanRematch;
    ids['restart-race'].title=online&&!state.onlineCanRematch?(state.onlineWaiting?'Waiting for the other racers to finish.':'The host will return everyone to the room.') : '';
    ids['restart-paused'].title=ids['restart-race'].title;
    setText('garage-paused',online?'LEAVE ROOM':'BACK TO GARAGE');
    setText('garage-results',online?'LEAVE ROOM':'CHANGE KART');
    setText('pause-eyebrow',online?'ONLINE RACE · STILL LIVE':'TAKE A BREATHER');
    setText('pause-title',online?'STILL RACING.':'PIT STOP.');
    setText('pause-description',online?'The live race continues while this menu is open.':'The track isn’t going anywhere.');
    setText('position-value',state.position||1);setText('position-suffix',ordinal(state.position||1).replace(/\d/g,''));
    setText('lap-value',Math.min(state.lap||1,3));setText('time-value',timeText(state.time||0));setText('speed-value',Math.round(Math.max(0,state.speed||0)));
    const nitro=Math.max(0,Math.min(100,state.nitro||0)); setText('nitro-value',`${Math.round(nitro)}%`);ids['nitro-fill'].style.width=`${nitro}%`;
    ids['nitro-fill'].classList.toggle('boosting',!!state.boosting);setText('nitro-label',state.boosting?'FULL SEND!':'NITRO');
    setText('drift-label',state.drifting?`DRIFT ${Math.round((state.driftCharge||0)*100)}% · RELEASE TO BOOST`:(state.boosting?'CHASING THE HORIZON':touchDevice?'HOLD DRIFT + STEER':'HOLD SHIFT + STEER TO DRIFT'));
    ids['drift-label'].classList.toggle('active',!!state.drifting||!!state.boosting);
    show('countdown',phase==='countdown');if(phase==='countdown')setText('countdown',state.countdown>0?Math.ceil(state.countdown):'GO!');
    const message=state.wrongWay?'↶ WRONG WAY':state.message||'';show('race-message',!!message&&phase==='racing');setText('race-message',message);
    ids['mute-button'].setAttribute('aria-label',state.muted?'Enable sound':'Mute sound');ids['mute-button'].setAttribute('aria-pressed',String(!!state.muted));setText('mute-button',state.muted?'♪̸':'♫');
    const now=performance.now();
    if(phase!=='garage'&&now-lastMap>60) {
      lastMap=now;ctx.clearRect(0,0,360,260);ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#123d4650';ctx.lineWidth=18;ctx.stroke(mapPath);ctx.strokeStyle='#fff9e6';ctx.lineWidth=9;ctx.stroke(mapPath);
      if(mapShortcuts.length){ctx.save();ctx.strokeStyle='#523b1ac0';ctx.lineWidth=10;for(const path of mapShortcuts)ctx.stroke(path);ctx.setLineDash([9,6]);ctx.strokeStyle='#ffca4b';ctx.lineWidth=5;for(const path of mapShortcuts)ctx.stroke(path);ctx.restore();}
      const start=mapPoint(currentTrack.trackPoints[0]);ctx.fillStyle='#ffca4b';ctx.fillRect(start.x-5,start.y-9,10,18);
      for(const racer of [...(state.racers||[])].sort((a,b)=>Number(a.player)-Number(b.player))) { const p=mapPoint(racer);ctx.beginPath();ctx.arc(p.x,p.y,racer.player?7:4.5,0,Math.PI*2);ctx.fillStyle=racer.player?'#ff6248':racer.color||'#123d46';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=racer.player?3:1.5;ctx.stroke(); }
    }
    if(phase==='finished') {
      const results=state.results||[], key=JSON.stringify(results);
      if(key!==resultsKey) {
        resultsKey=key;ids['results-list'].innerHTML=results.map((r,index)=>`<div class="result-row ${r.player?'your-result':''}"><strong>${String(index+1).padStart(2,'0')}</strong><span><b>${escapeHTML(r.name)}${r.player?' <i>YOU</i>':''}</b><small>${escapeHTML(typeof r.kart==='number'?KARTS[r.kart]?.name:r.kart||'COASTAL CLUB')}</small></span><span>${r.dnf?'DNF':Number.isFinite(r.time)?timeText(r.time):'RACING'}</span></div>`).join('');
      }
      const player=results.find(r=>r.player);const place=player?results.indexOf(player)+1:state.position||1;
      setText('finish-title',player?.dnf?'NEXT TIME, RACER.':place===1?'HELLO, CHAMPION.':place<=3?'PODIUM ENERGY.':'WHAT A RIDE.');
      setText('finish-subtitle',state.onlineWaiting?'Waiting for the other racers to finish…':player?.dnf?'You didn’t finish this race. Your next start is waiting.':place===1?`You took ${track.name} by storm.`:place<=3?'Sunshine looks good on the podium.':'A little faster. A little braver. One more race?');
      setText('finish-time',player?.dnf?'—':timeText(player?.time??state.time));setText('best-lap',timeText(state.bestLap));setText('finish-position',player?.dnf?'DNF':ordinal(place));
    }
  }
  update({phase:'garage',selected:0});
  return {update,resetTouch,dispose(){itemObserver.disconnect();resetTouch();joystick.dispose();for(const type of ['blur','resize','orientationchange'])window.removeEventListener(type,resetTouch);document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
}

