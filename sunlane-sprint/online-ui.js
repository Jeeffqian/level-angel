import {KARTS,AVATARS,AI_DIFFICULTIES} from './config.js';
import {TRACKS,getTrack} from './track.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const options=items=>items.map((item,index)=>`<option value="${index}">${escapeHTML(item.name)}</option>`).join('');
const difficultyOptions=()=>AI_DIFFICULTIES.map(item=>`<option value="${item.id}" ${item.id==='normal'?'selected':''}>${escapeHTML(item.name)}</option>`).join('');

const trackOptions=()=>TRACKS.map(track=>`<option value="${track.id}">${escapeHTML(track.name)}</option>`).join('');

export function createOnlineUI(callbacks={}){
  if(!document.querySelector('link[data-sunlane-online]')){
    const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./online.css',import.meta.url).href;stylesheet.dataset.sunlaneOnline='';document.head.append(stylesheet);
  }
  const start=document.getElementById('start-race');
  if(!start)throw new Error('Create the main game UI before createOnlineUI');
  const actions=document.createElement('div');actions.className='online-garage-actions';start.before(actions);actions.append(start);
  const onlineButton=document.createElement('button');onlineButton.id='online-open';onlineButton.className='online-garage-button';onlineButton.innerHTML='<span aria-hidden="true">◎</span> ONLINE';actions.append(onlineButton);
  const badge=document.createElement('button');badge.id='online-room-badge';badge.className='online-room-badge';badge.hidden=true;badge.setAttribute('aria-label','Open online race room');document.body.append(badge);
  const dialog=document.createElement('dialog');dialog.id='online-dialog';dialog.className='online-dialog';dialog.setAttribute('aria-labelledby','online-title');
  dialog.innerHTML=`<div class="online-dialog-inner">
    <header class="online-header"><span class="eyebrow">SUNLANE RACING CLUB / ONLINE</span><button id="online-close" class="online-icon" aria-label="Close online room">×</button></header>
    <h2 id="online-title">BETTER TOGETHER.</h2><p id="online-intro" class="online-intro">Bring your friends. Make some rivals.</p>
    <div id="online-status" class="online-status" role="status" aria-live="polite"></div><div id="online-error" class="online-error" role="alert" hidden></div>
    <section id="online-entry" aria-label="Create or join a room">
      <label class="online-field" for="online-name">YOUR RACING NAME<input id="online-name" type="text" maxlength="24" autocomplete="nickname" placeholder="Enter your name" required></label>
      <nav class="online-entry-tabs" aria-label="Find a race"><button id="online-browse-tab" data-online-view="browse" aria-pressed="true">BROWSE ROOMS</button><button id="online-create-tab" data-online-view="create" aria-pressed="false">CREATE ROOM</button><button id="online-join-tab" data-online-view="join" aria-pressed="false">JOIN CODE</button></nav>
      <section id="online-browse-view" aria-label="Public race rooms">
        <div class="online-directory-heading"><b>PUBLIC ROOMS</b><button id="online-refresh" class="online-secondary">REFRESH</button></div>
        <p id="online-directory-message" class="online-ready-hint" role="status"></p><div id="online-room-list" class="online-room-list"></div>
        <p class="online-footnote">Join an open grid, or create a room and welcome other racers.</p>
      </section>
      <section id="online-create-view" hidden aria-label="Create a race room"><div class="online-loadout">
        <label class="online-field" for="online-visibility">ROOM ACCESS<select id="online-visibility"><option value="public">Public · listed for everyone</option><option value="private">Private · invite or code</option></select></label>
        <label class="online-field" for="online-difficulty">AI RIVALS<select id="online-difficulty">${difficultyOptions()}</select></label>
      <label class="online-field online-track-field" for="online-track">RACE TRACK<select id="online-track">${trackOptions()}</select></label></div><p class="online-ready-hint">Public rooms appear in the browser. Private rooms require your invite link or code.</p><button id="online-create" class="primary-button">CREATE A ROOM <span>↗</span></button></section>
      <section id="online-join-view" hidden aria-label="Join a room by code"><form id="online-join-form" class="online-join-form"><label class="online-field" for="online-code">ROOM CODE<input id="online-code" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" required></label><button id="online-join" class="online-secondary" type="submit">JOIN ROOM</button></form></section>
      <p class="online-footnote">2–6 friends · AI fills the other seats · 3 laps</p>
    </section>
    <section id="online-lobby" aria-label="Race room" hidden>
      <div class="online-room-line"><div><span class="online-label">ROOM CODE</span><strong id="online-room-code"></strong></div><button id="online-copy" class="online-secondary">COPY INVITE LINK <span aria-hidden="true">↗</span></button></div>
      <label id="online-share-fallback" class="online-field" hidden>INVITE LINK<input id="online-share-url" type="text" readonly aria-label="Invite link to copy"></label>
      <p id="online-share-feedback" class="online-share-feedback" role="status" aria-live="polite"></p>
      <div class="online-grid-heading"><b>THE STARTING GRID</b><span id="online-player-count"></span></div>
      <ol id="online-seats" class="online-seats">${Array.from({length:6},(_,i)=>`<li class="online-seat" data-online-seat="${i}"><span class="online-seat-number">0${i+1}</span><div class="online-seat-driver"><b class="online-seat-name"></b><small class="online-seat-detail"></small></div><span class="online-seat-state"></span></li>`).join('')}</ol>
      <div class="online-loadout"><label class="online-field" for="online-kart">YOUR KART<select id="online-kart">${options(KARTS)}</select></label><label class="online-field" for="online-avatar">YOUR DRIVER<select id="online-avatar">${options(AVATARS)}</select></label></div>
      <div class="online-loadout online-room-settings"><label class="online-field" for="online-room-visibility">ROOM ACCESS<select id="online-room-visibility"><option value="public">Public</option><option value="private">Private</option></select></label><label class="online-field" for="online-room-difficulty">AI RIVALS<select id="online-room-difficulty">${difficultyOptions()}</select></label><label class="online-field online-track-field" for="online-room-track">RACE TRACK<select id="online-room-track">${trackOptions()}</select></label></div><p id="online-settings-hint" class="online-footnote">The host sets room access, track and AI difficulty. Changes reset everyone's ready status.</p>
      <p id="online-ready-hint" class="online-ready-hint"></p>
      <div class="online-room-actions"><button id="online-ready" class="online-secondary" aria-pressed="false">I’M READY</button><button id="online-start" class="primary-button">START RACE <span>↗</span></button><button id="online-back-lobby" class="primary-button" hidden>BACK TO LOBBY <span>↗</span></button></div>
      <button id="online-leave" class="online-leave">LEAVE ROOM</button>
    </section>
  </div>`;
  document.body.append(dialog);
  const ids=Object.fromEntries([...dialog.querySelectorAll('[id]')].map(el=>[el.id,el]));
  const seats=[...dialog.querySelectorAll('[data-online-seat]')].map(el=>({el,name:el.querySelector('.online-seat-name'),detail:el.querySelector('.online-seat-detail'),state:el.querySelector('.online-seat-state')}));
  let state={room:null,memberId:null,status:'',error:'',name:'',code:'',busy:false,connected:false,rooms:[],directoryLoading:false,directoryError:''};
  let nameDirty=false,codeDirty=false,lastRoomCode=null,lastRoomPhase=null,previousFocus=null,localError='',localFeedback='';
  let entryView=new URLSearchParams(location.search).has('room')?'join':'browse',directoryKey='';
  function setView(view){entryView=view;for(const kind of ['browse','create','join']){ids[`online-${kind}-view`].hidden=kind!==view;ids[`online-${kind}-tab`].setAttribute('aria-pressed',String(kind===view));}localError='';renderMessages();}
  for(const tab of dialog.querySelectorAll('[data-online-view]'))tab.addEventListener('click',()=>setView(tab.dataset.onlineView));
  const text=(element,value)=>{const next=String(value??'');if(element.textContent!==next)element.textContent=next;};
  const showError=message=>{localError=message;renderMessages();};
  function renderMessages(){text(ids['online-status'],state.status||(state.room?(state.connected?'Connected to the race room':'Connection interrupted. Reconnecting…'):'Create a room or enter an invite code.'));const error=localError||state.error;ids['online-error'].hidden=!error;text(ids['online-error'],error||'');}
  function open(){
    if(dialog.open)return;previousFocus=document.activeElement;dialog.showModal();callbacks.onOpen?.();
    const focus=state.room?ids['online-close']:ids['online-name'];focus.focus({preventScroll:true});
  }
  function close(){if(!dialog.open)return;dialog.close();callbacks.onClose?.();if(previousFocus?.isConnected&&!previousFocus.closest('[hidden]'))previousFocus.focus({preventScroll:true});}
  onlineButton.addEventListener('click',open);badge.addEventListener('click',open);ids['online-close'].addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const focusables=[...dialog.querySelectorAll('button,input,select,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
      const first=focusables[0],last=focusables.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
  });
  dialog.addEventListener('keyup',event=>event.stopPropagation());
  ids['online-name'].addEventListener('input',()=>{nameDirty=true;localError='';renderMessages();});
  ids['online-code'].addEventListener('input',()=>{codeDirty=true;ids['online-code'].value=ids['online-code'].value.toUpperCase().replace(/[^A-Z0-9]/g,'');localError='';renderMessages();});
  const playerName=()=>{const name=ids['online-name'].value.trim();if(!name){showError('Enter a racing name to get started.');ids['online-name'].focus();return null;}return name;};
  ids['online-create'].addEventListener('click',()=>{const name=playerName();if(name&&!state.busy){localError='';callbacks.onCreate?.(name,{visibility:ids['online-visibility'].value,difficulty:ids['online-difficulty'].value,trackId:ids['online-track'].value});}});
  ids['online-refresh'].addEventListener('click',()=>callbacks.onRefresh?.());
  ids['online-room-list'].addEventListener('click',event=>{const button=event.target.closest('[data-join-room]');if(!button||button.disabled||state.busy)return;const name=playerName();if(name)callbacks.onJoin?.(name,button.dataset.joinRoom);});
  ids['online-join-form'].addEventListener('submit',event=>{event.preventDefault();const name=playerName(),code=ids['online-code'].value.trim().toUpperCase();if(!name)return;if(!code){showError('Enter the room code from your friend.');ids['online-code'].focus();return;}if(!state.busy){localError='';callbacks.onJoin?.(name,code);}});
  ids['online-ready'].addEventListener('click',()=>{const me=state.room?.players.find(p=>p.id===state.memberId);if(me)callbacks.onReady?.(!me.ready);});
  ids['online-start'].addEventListener('click',()=>callbacks.onStart?.());ids['online-back-lobby'].addEventListener('click',()=>callbacks.onLobby?.());ids['online-leave'].addEventListener('click',()=>callbacks.onLeave?.());
  ids['online-kart'].addEventListener('change',event=>callbacks.onSelectKart?.(Number(event.target.value)));
  ids['online-avatar'].addEventListener('change',event=>callbacks.onSelectAvatar?.(Number(event.target.value)));
  for(const id of ['online-room-visibility','online-room-difficulty','online-room-track'])ids[id].addEventListener('change',()=>callbacks.onSettings?.({visibility:ids['online-room-visibility'].value,difficulty:ids['online-room-difficulty'].value,trackId:ids['online-room-track'].value}));
  ids['online-copy'].addEventListener('click',async()=>{
    if(!state.room)return;const code=state.room.code,url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',code);
    try{await navigator.clipboard.writeText(url.href);localFeedback='Invite link copied. Send it to your friends.';ids['online-share-fallback'].hidden=true;}
    catch{localFeedback='Copy the invite link below.';ids['online-share-fallback'].hidden=false;ids['online-share-url'].value=url.href;ids['online-share-url'].focus();ids['online-share-url'].select();}
    text(ids['online-share-feedback'],localFeedback);
  });
  function update(next={}){
    state={...state,...next};const room=state.room,me=room?.players.find(p=>p.id===state.memberId),host=!!room&&room.hostId===state.memberId;
    if(!nameDirty&&typeof state.name==='string'&&document.activeElement!==ids['online-name'])ids['online-name'].value=state.name;
    if(!codeDirty&&typeof state.code==='string'&&document.activeElement!==ids['online-code'])ids['online-code'].value=state.code;
    ids['online-entry'].hidden=!!room;ids['online-lobby'].hidden=!room;
    badge.hidden=!room;text(badge,room?`${state.connected?'●':'○'} ${room.code} · ${state.connected?'ROOM':'RECONNECTING'}`:'');badge.classList.toggle('disconnected',!!room&&!state.connected);
    text(onlineButton,room?'OPEN ROOM':'◎ ONLINE');onlineButton.setAttribute('aria-label',room?'Open online room':'Play online with friends');
    ids['online-create'].disabled=!!state.busy;ids['online-join'].disabled=!!state.busy;ids['online-name'].disabled=!!state.busy;ids['online-code'].disabled=!!state.busy;
    ids['online-visibility'].disabled=!!state.busy;ids['online-difficulty'].disabled=!!state.busy;ids['online-track'].disabled=!!state.busy;
    ids['online-refresh'].disabled=!!state.directoryLoading||!!state.busy;
    const rooms=state.rooms||[],listKey=JSON.stringify([rooms,state.busy,state.connected]);
    if(directoryKey!==listKey){
      directoryKey=listKey;const focusedCode=document.activeElement?.dataset?.joinRoom;
      ids['online-room-list'].replaceChildren(...rooms.map(item=>{
        const row=document.createElement('article');row.className='online-public-room';
        const info=document.createElement('div'),name=document.createElement('b'),detail=document.createElement('small'),button=document.createElement('button');
        name.textContent=`${item.hostName}’s room`;
        const status=item.phase==='lobby'?(item.players>=item.capacity?'Full':item.connected===0?'Reconnecting':'Waiting'):item.phase==='finished'?'Finishing':'Racing';
        detail.textContent=`${item.players} / ${item.capacity} seats · ${status} · ${AI_DIFFICULTIES.find(d=>d.id===item.difficulty)?.name||'Normal'} AI · ${getTrack(item.trackId).name}`;
        info.append(name,detail);button.className='online-secondary';button.dataset.joinRoom=item.code;button.textContent=item.joinable?'JOIN':status.toUpperCase();button.disabled=!item.joinable||!state.connected||!!state.busy;button.setAttribute('aria-label',`Join ${item.hostName}'s room`);row.append(info,button);return row;
      }));
      if(focusedCode){const target=[...ids['online-room-list'].querySelectorAll('button')].find(el=>el.dataset.joinRoom===focusedCode);if(target&&!target.disabled)target.focus({preventScroll:true});else ids['online-refresh'].focus({preventScroll:true});}
    }
    text(ids['online-directory-message'],state.directoryError||(state.directoryLoading?'Finding races…':!state.connected?'Connect to discover races.':rooms.length?'Room availability updates live.':'No public rooms yet. Create one and start the grid.'));
    text(ids['online-title'],room?'YOUR RACING CREW.':'BETTER TOGETHER.');text(ids['online-intro'],room?'Choose your ride. Ready up. Own the coast.':'Bring your friends. Make some rivals.');renderMessages();
    if(room){
      text(ids['online-room-code'],room.code);const players=room.players||[],connected=players.filter(player=>player.connected),isLobby=room.phase==='lobby',isFinished=room.phase==='finished';
      text(ids['online-player-count'],`${connected.length} / ${room.capacity||6} FRIENDS`);
      for(let i=0;i<seats.length;i++){
        const seat=seats[i],player=players[i];seat.el.classList.toggle('is-you',player?.id===state.memberId);seat.el.classList.toggle('is-ai',!player);seat.el.classList.toggle('is-offline',!!player&&!player.connected);
        if(player){const kart=KARTS[player.kart],avatar=AVATARS[player.avatar];text(seat.name,`${player.name}${player.id===state.memberId?' · YOU':''}${player.id===room.hostId?' · HOST':''}`);text(seat.detail,`${avatar?.name||'Driver'} / ${kart?.name||'Kart'}`);text(seat.state,!player.connected?'OFFLINE':isLobby?(player.ready?'READY':'CHOOSING'):'IN RACE');seat.state.dataset.ready=String(!!player.ready);}
        else{text(seat.name,'AI RIVAL');text(seat.detail,isLobby?'A racer will fill this seat':'Computer-controlled racer');text(seat.state,'AI');seat.state.dataset.ready='false';}
      }
      if(me){if(ids['online-kart'].value!==String(me.kart))ids['online-kart'].value=String(me.kart);if(ids['online-avatar'].value!==String(me.avatar))ids['online-avatar'].value=String(me.avatar);}
      const canEdit=isLobby&&!!me&&!!state.connected&&!state.busy;
      ids['online-kart'].disabled=!canEdit;ids['online-avatar'].disabled=!canEdit;
      ids['online-room-visibility'].value=room.visibility||'private';ids['online-room-difficulty'].value=room.difficulty||'normal';ids['online-room-track'].value=getTrack(room.trackId).id;
      ids['online-room-visibility'].disabled=!canEdit||!host;ids['online-room-difficulty'].disabled=!canEdit||!host;ids['online-room-track'].disabled=!canEdit||!host;
      text(ids['online-settings-hint'],isLobby?(host?'Changing room settings resets everyone’s ready status.':'The host chooses room access, track and AI difficulty.'):'Room settings are locked until the next lobby.');
      ids['online-ready'].hidden=!isLobby;ids['online-ready'].disabled=!canEdit;ids['online-ready'].setAttribute('aria-pressed',String(!!me?.ready));text(ids['online-ready'],me?.ready?'READY ✓ · UNREADY':'I’M READY');
      ids['online-start'].hidden=!isLobby||!host;ids['online-start'].disabled=!canEdit||connected.length<2||!players.every(player=>player.connected&&player.ready);
      ids['online-back-lobby'].hidden=!isFinished||!host;ids['online-back-lobby'].disabled=!state.connected||!!state.busy;
      ids['online-leave'].disabled=!!state.busy;
      text(ids['online-ready-hint'],!state.connected?'Reconnecting. Your seat is reserved.':!isLobby?(isFinished?(host?'Return to the lobby for another race.':'Waiting for the host to return to the lobby.'):'The live race keeps going while this room is open.'):players.some(player=>!player.connected)?'Waiting for a reserved racer to reconnect.':connected.length<2?'Invite at least one friend. AI fills the remaining seats.':connected.some(player=>!player.ready)?'Everyone needs to be ready before the host can start.':host?'Everyone is ready. Start when you are.':'Everyone is ready. Waiting for the host.');
      if(isLobby&&(room.code!==lastRoomCode||lastRoomPhase!=='lobby')){open();ids['online-close'].focus({preventScroll:true});}
      if((room.phase==='racing'||room.phase==='countdown')&&(room.phase!==lastRoomPhase||room.code!==lastRoomCode))close();
    }else if(lastRoomCode){localError='';localFeedback='';ids['online-share-fallback'].hidden=true;text(ids['online-share-feedback'],'');}
    lastRoomCode=room?.code||null;lastRoomPhase=room?.phase||null;
  }
  setView(entryView);update();
  return {update,open,close,get visible(){return dialog.open;}};
}
