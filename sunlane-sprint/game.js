import * as THREE from 'three';
import {KARTS,AVATARS,TOTAL_LAPS} from './config.js';
import {getTrack,TRACKS} from './track.js';
import {Race,FIXED_DT,angleDiff} from './physics.js';
import {buildWorld} from './world.js';
import {buildValleyWorld} from './world-valley.js';
import {buildCityWorld} from './world-city.js';
import {loadGeneratedKarts,setKartAvatar,createGeneratedKart as createKart} from './generated-karts.js';
import {createUI} from './ui.js';
import {createGarageRotation} from './garage-rotation.js';
import {getDriverSkillState,getDriverSkill,skillActive} from './driver-skills.js';
import {createDriverSkillVisuals} from './driver-skill-visuals.js';
import {isMobileTouchDevice} from './touch-device.js';
import {createRacerLabels} from './racer-labels.js';
import {createGraphicsSettings,GRAPHICS_PRESETS,graphicsPixelRatio} from './graphics.js';
import {createGraphicsUI} from './graphics-ui.js';
import {createSinglePlayerSetup} from './single-player-setup.js';
import {loadRivalSlots,saveRivalSlots} from './single-player.js';
import {createContactShadows} from './contact-shadows.js';
import {createItemVisuals} from './item-visuals.js';
import {createRearViewMirror} from './rear-view-mirror.js';
import {createHitCamera} from './hit-camera.js';
import {createMissileAim} from './missile-aim.js';
import {createMissileExplosions} from './missile-explosions.js';
import {tickRaceItems} from './item-rules.js';
import {RaceAudio} from './audio.js';
import {telemetry} from './telemetry.js';
import {createOnlineSession} from './online.js';
import {createOnlineUI} from './online-ui.js';

document.body.dataset.touchControls=String(isMobileTouchDevice());
// Reclaim an existing seat before decoding the 3D assets on a page reload.
let onlineHandlers,pendingOnlineSnapshot,expiredWhileLoading=false;
const online=createOnlineSession({
  onState:state=>onlineHandlers?.onState(state),
  onSnapshot:(snapshot,memberId)=>{if(onlineHandlers)onlineHandlers.onSnapshot(snapshot,memberId);else pendingOnlineSnapshot=[snapshot,memberId];},
  onExpired:()=>{if(onlineHandlers)onlineHandlers.onExpired();else expiredWhileLoading=true;},
});
void online.boot();

const scene=new THREE.Scene();
scene.background=new THREE.Color('#91dce9');scene.fog=new THREE.Fog('#b3e3e9',160,410);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,700);
let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
catch(error){telemetry.event('WebGLUnavailable');telemetry.flush();document.getElementById('loading').textContent='Unable to start WebGL. Enable browser hardware acceleration and reload.';throw error;}
const graphics=createGraphicsSettings(renderer);let graphicsState=graphics.getState();
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(graphicsPixelRatio(graphicsState.quality,devicePixelRatio,innerWidth));
renderer.info.autoReset=false;
renderer.shadowMap.enabled=GRAPHICS_PRESETS[graphicsState.quality].shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
document.getElementById('game').appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Sunlane Sprint 3D race circuit');
const skyLight=new THREE.HemisphereLight('#fff4d9','#65a99d',2.3);scene.add(skyLight);
const sun=new THREE.DirectionalLight('#fff4d8',3.1);sun.position.set(50,90,40);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:210});
sun.shadow.bias=-.0006;sun.shadow.normalBias=.07;scene.add(sun,sun.target);
const assetLoadStarted=performance.now();
try {
  await loadGeneratedKarts((loaded,total)=>{const label=document.querySelector('#loading span:last-child');if(label)label.textContent=`Loading racers ${loaded} / ${total}`;});
} catch(error) {
  telemetry.event('AssetLoadFailed');telemetry.flush();
  const loading=document.getElementById('loading');loading.replaceChildren();
  const message=document.createElement('strong');message.textContent='The racers could not load. Please reload to try again.';loading.append(message);
  const retry=document.createElement('button');retry.textContent='Reload game';retry.addEventListener('click',()=>location.reload());loading.append(retry);
  throw error;
}
telemetry.event('AssetLoadMs',performance.now()-assetLoadStarted);
// Build each circuit only once; switching keeps a bounded three-world cache.
// Scene lighting belongs to the active world, while kart assets stay shared.
const worlds=new Map();let activeTrack,world,garageModels=[];
function activateTrack(id){
  const track=getTrack(id);if(activeTrack===track)return;
  let cached=worlds.get(track.id);
  if(!cached){const root=new THREE.Group();root.name=track.id;scene.add(root);
    cached={root,...(track.id==='sakura-valley'?buildValleyWorld(root,track,{quality:graphicsState.quality}):track.id==='changan-city'?buildCityWorld(root,track,{quality:graphicsState.quality}):buildWorld(root,{quality:graphicsState.quality}))};worlds.set(track.id,cached);}
  for(const entry of worlds.values())entry.root.visible=entry===cached;
  activeTrack=track;world=cached;
  garageModels.forEach(model=>model.position.copy(world.showroomPosition));
  applyTrackLighting();document.body.dataset.track=track.id;
}
function applyTrackLighting(){
  if(activeTrack.id==='changan-city'){
    scene.background.set('#d8c5a6');scene.fog.color.set('#decbb0');scene.fog.near=150;scene.fog.far=660;
    skyLight.color.set('#ffe8c7');skyLight.groundColor.set('#6e706c');skyLight.intensity=1.7;
    sun.color.set('#ffdfad');sun.intensity=2.6;renderer.toneMappingExposure=1.04;camera.far=1100;return;
  }
  const valley=activeTrack.id==='sakura-valley',highCoast=!valley&&graphicsState.quality==='high';
  scene.background.set(valley?'#bbcbd4':'#91dce9');scene.fog.color.set(valley?'#b9c9cc':'#b3e3e9');
  scene.fog.near=valley?135:160;scene.fog.far=valley?530:410;
  skyLight.color.set(valley?'#f6e5dd':'#fff4d9');skyLight.groundColor.set(valley?'#526e65':highCoast?'#527768':'#65a99d');skyLight.intensity=valley?2:highCoast?1.55:2.3;
  sun.color.set(valley?'#ffddbf':'#fff4d8');sun.intensity=valley?2.4:highCoast?2.65:3.1;
  renderer.toneMappingExposure=valley?1.08:highCoast?1.05:1.2;camera.far=valley?1000:700;
}
activateTrack('palm-coast');
garageModels=KARTS.map((_,i)=>{const m=createKart(i,0);m.position.copy(world.showroomPosition);scene.add(m);return m;});
const pools=Array.from({length:6},()=>KARTS.map((_,i)=>{const m=createKart(i);m.visible=false;scene.add(m);return m;}));
let rivalSlots=loadRivalSlots();
let race=new Race(0,{rivalSlots}),selected=0,selectedAvatar=0,selectedTrack='palm-coast',phase='garage',accumulator=0,elapsed=0,frame=0,pausedForCapture=false;
let message='',messageTTL=0,shake=0,uiTimer=0,raceModels=[];
let garageClock=0;
const garageFade=document.createElement('div');Object.assign(garageFade.style,{position:'absolute',inset:'0',background:'#123d46',pointerEvents:'none',opacity:'0'});document.getElementById('game').append(garageFade);
let ui,onlineUI,graphicsUI,singlePlayerSetup,missileAim,hitCamera,missileExplosions,garageRotation,onlineRaceId=null,onlineSnapshot=null,inputTimer=0;
const audio=new RaceAudio(),keys=new Set(),touch={},joystick={x:0,y:0,active:false};
const cameraLook=new THREE.Vector3(),desiredCamera=new THREE.Vector3(),desiredLook=new THREE.Vector3();

function clearInput(){garageRotation?.cancel();missileAim?.cancel();hitCamera?.clear();missileExplosions?.clear();keys.clear();for(const k of Object.keys(touch))touch[k]=false;Object.assign(joystick,{x:0,y:0,active:false});ui?.resetTouch();online?.input(input());}
function drivingControlsAvailable(){return (phase==='racing'||phase==='countdown')&&!onlineUI?.visible&&!graphicsUI?.visible&&!singlePlayerSetup?.visible;}
function openSinglePlayer(){
  if(online?.active){start();return;}
  if(phase!=='garage'||onlineUI?.visible||graphicsUI?.visible)return;
  singlePlayerSetup.open({slots:rivalSlots,trackId:selectedTrack});
}
function updateGarageBackdrop(dt){
  if(phase!=='garage'){garageFade.style.opacity='0';return;}
  if(singlePlayerSetup?.visible||onlineUI?.visible||graphicsUI?.visible){garageFade.style.opacity='0';return;}
  const previous=Math.floor(garageClock/12);garageClock+=dt;const cycle=Math.floor(garageClock/12),time=garageClock%12;
  if(cycle!==previous){const next=(TRACKS.indexOf(activeTrack)+1)%TRACKS.length;activateTrack(TRACKS[next].id);updateUI();}
  garageFade.style.opacity=String(time>11.55?(time-11.55)/.45:cycle>0&&time<.45?1-time/.45:0);
}
function start(){
  if(online?.active){const state=online.state;if(state.room.phase==='finished'&&state.room.hostId===state.memberId)void online.lobby();else onlineUI.open();return;}
  if(onlineUI?.visible||graphicsUI?.visible||singlePlayerSetup?.visible)return;
  if(phase!=='garage'){telemetry.event('RaceRestarted');telemetry.abandon(race.player);}
  audio.unlock();clearInput();activateTrack(selectedTrack);race=new Race(selected,{rivalSlots,avatar:selectedAvatar,trackId:selectedTrack,seed:testing?42:crypto.getRandomValues(new Uint32Array(1))[0]});phase='countdown';garageFade.style.opacity='0';message='';messageTTL=0;accumulator=0;itemVisuals.clear();
  garageModels.forEach(m=>m.visible=false);pools.flat().forEach(m=>m.visible=false);
  raceModels=race.racers.map((r,i)=>{const m=pools[i][r.kart];r.avatar=i===0?selectedAvatar:r.rivalSlot%AVATARS.length;setKartAvatar(m,r.avatar);m.userData.wheels.forEach(w=>w.rotation.x=0);m.userData.frontPivots.forEach(w=>w.rotation.y=0);m.visible=true;return m;});
  particles.clear();syncModels(0);updateCamera(1,true);updateUI();
}
function garage(){singlePlayerSetup?.close();graphicsUI?.close();telemetry.abandon(race.player);onlineRaceId=null;onlineSnapshot=null;phase='garage';garageClock=0;garageFade.style.opacity='0';clearInput();pools.flat().forEach(m=>m.visible=false);garageModels.forEach((m,i)=>m.visible=i===selected);particles.clear();audio.update(0,false,false);updateCamera(1,true);updateUI();}
async function leaveRoom(){if(online?.active)await online.leave();onlineUI?.close();garage();}
function recover(){if(phase!=='racing')return;if(online?.active)void online.recover();else race.recover();showMessage('BACK ON TRACK',1.5);}
function useItem(slot,targetId){
  if(phase!=='racing'||!drivingControlsAvailable()||!Number.isInteger(slot)||slot<0||slot>2||!race.player.items?.[slot])return;
  audio.unlock();
  if(online.active){void online.useItem(slot,targetId);return;}
  const before=race.events.length;
  if(race.useItem(race.player,slot,targetId)){for(const event of race.events.slice(before)){audio.event(event);itemFeedback(event);}updateUI();}
}
function itemFeedback(event){
  missileExplosions?.event(event,race);
  if(hitCamera?.event(event,race)){audio.tone(880,.09);}
  if(event.id!==race.player.id)return;
  if(event.type==='skill-use')showMessage(`${getDriverSkill(race.player.avatar).name.toUpperCase()}!`,1.2);
  if(event.type==='skill-hit')showMessage('EMP · SLOWED',1.1);
  if(event.type==='skill-block')showMessage('EMP BLOCKED',.9);
  if(event.type==='item-pickup')showMessage(`${event.item.toUpperCase()} · SLOT ${event.slot+1}`,1.1);
  if(event.type==='item-use')showMessage(({banana:'BANANA DROPPED',missile:'MISSILE FIRED',shield:'SHIELD UP',turbo:'TURBO BOOST'})[event.item],.9);
  if(event.type==='item-hit'){shake=1;showMessage('SPUN OUT!',1);}
  if(event.type==='item-block')showMessage('SHIELD BLOCKED THE HIT',1);
}
function useSkill(){
  if(phase!=='racing'||!drivingControlsAvailable()||!getDriverSkillState(race.player,phase).ready)return;
  audio.unlock();
  if(online.active){void online.useSkill();return;}
  const before=race.events.length;
  if(race.useSkill(race.player)){for(const event of race.events.slice(before)){audio.event(event);itemFeedback(event);}updateUI();}
}
function pause(){if(phase==='racing'||phase==='countdown'){phase='paused';telemetry.pause();clearInput();updateUI();}}
function resume(){if(phase==='paused'){phase=race.phase;clearInput();accumulator=0;audio.unlock();updateUI();}}
ui=createUI({onSelect:i=>{if(phase!=='garage')return;if(online?.active){void online.select(i,selectedAvatar);return;}if(i!==selected)telemetry.event('KartSelected',1,{kart:KARTS[i].id});selected=i;garageModels.forEach((m,j)=>m.visible=j===i);audio.tone(600+i*120,.08);updateUI();},
  onAvatarSelect:i=>{if(phase!=='garage')return;if(online?.active){void online.select(selected,i);return;}if(i!==selectedAvatar)telemetry.event('AvatarSelected',1,{avatar:AVATARS[i].id});selectedAvatar=i;garageModels.forEach(m=>setKartAvatar(m,i));audio.tone(700+i*100,.08);updateUI();},
  onStart:openSinglePlayer,onRestart:start,onGarage:leaveRoom,onPause:pause,onResume:resume,onGraphics:()=>graphicsUI.open(graphicsState),
  onMute:()=>{audio.toggle();updateUI();},onRecover:recover,onUseItem:useItem,onSkill:useSkill,
  onItemPress:(slot,source)=>{audio.unlock();missileAim.press(slot,source);updateUI();},
  onItemRelease:(slot,source)=>{missileAim.release(slot,source);updateUI();},onItemCancel:(slot,source)=>missileAim.cancel(slot,source),
  onTouch:(action,pressed)=>{touch[action]=pressed&&drivingControlsAvailable();if(touch[action])audio.unlock();},
  onJoystick:state=>{const wasActive=joystick.active;Object.assign(joystick,drivingControlsAvailable()?state:{x:0,y:0,active:false});if(joystick.active&&!wasActive)audio.unlock();}});
const garageRay=new THREE.Raycaster(),garagePointer=new THREE.Vector2();
garageRotation=createGarageRotation(renderer.domElement,{
  available:()=>phase==='garage'&&!onlineUI?.visible&&!graphicsUI?.visible&&!singlePlayerSetup?.visible&&!document.querySelector('#kart-profile-dialog[open]'),
  hitTest:(x,y)=>{
    const bounds=renderer.domElement.getBoundingClientRect();garagePointer.set((x-bounds.left)/bounds.width*2-1,1-(y-bounds.top)/bounds.height*2);
    scene.updateMatrixWorld(true);garageRay.setFromCamera(garagePointer,camera);
    return garageRay.intersectObject(garageModels[selected],true).length>0;
  },
  onRotate:angle=>garageModels.forEach(model=>model.rotation.y=angle),
});
function applyGraphics(mode){
  const previousQuality=graphicsState.quality;graphicsState=graphics.setMode(mode);
  if(previousQuality!==graphicsState.quality){
    const preset=GRAPHICS_PRESETS[graphicsState.quality];
    renderer.setPixelRatio(graphicsPixelRatio(graphicsState.quality,devicePixelRatio,innerWidth));
    renderer.shadowMap.enabled=preset.shadows;sun.shadow.needsUpdate=preset.shadows;
    if(!preset.shadows){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;}
    // The light list is unchanged; invalidate material programs for shadow toggles.
    const materials=new Set();scene.traverse(object=>{if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);});
    materials.forEach(material=>material.needsUpdate=true);
    for(const cached of worlds.values())cached.setQuality?.(graphicsState.quality);
    applyTrackLighting();particles.clear();
  }
  graphicsUI?.update(graphicsState);document.body.dataset.graphics=graphicsState.quality;
}
graphicsUI=createGraphicsUI({onOpen:()=>{clearInput();pause();},onClose:clearInput,onChange:applyGraphics});
singlePlayerSetup=createSinglePlayerSetup({onOpen:clearInput,onClose:clearInput,onConfirm:(slots,trackId)=>{rivalSlots=saveRivalSlots(slots);selectedTrack=getTrack(trackId).id;start();}});
document.body.dataset.graphics=graphicsState.quality;
const mapped=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyR','KeyE','Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3','Escape','KeyM']);
addEventListener('keydown',e=>{
  if(e.target.closest?.('input,select,textarea,[contenteditable="true"]')||onlineUI?.visible||graphicsUI?.visible||singlePlayerSetup?.visible)return;
  if(['garage','finished','paused'].includes(phase)&&e.target.closest?.('button,input,select,textarea,a,[role="tab"]')&&['Enter','Space'].includes(e.code))return;
  if(mapped.has(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
  if(e.code==='Escape'){if(phase==='paused')resume();else pause();}
  if(e.code==='KeyR'&&phase==='racing')recover();
  if(e.code==='KeyE')useSkill();
  if(/^(Digit|Numpad)[123]$/.test(e.code)){audio.unlock();missileAim.press(Number(e.code.at(-1))-1,'key:'+e.code);updateUI();}
  if(e.code==='KeyM'){audio.toggle();updateUI();}
  if(e.code==='Enter'){if(phase==='garage')openSinglePlayer();else if(phase==='finished')start();}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(/^(Digit|Numpad)[123]$/.test(e.code)){missileAim.release(Number(e.code.at(-1))-1,'key:'+e.code);updateUI();}});addEventListener('blur',()=>{clearInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
function input(){return {throttle:keys.has('KeyW')||keys.has('ArrowUp')||(joystick.active&&joystick.y<-.18),brake:keys.has('KeyS')||keys.has('ArrowDown')||(joystick.active&&joystick.y>.18),
  steer:THREE.MathUtils.clamp(Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+(joystick.active?joystick.x:0),-1,1),
  drift:keys.has('ShiftLeft')||keys.has('ShiftRight')||!!touch.drift,boost:keys.has('Space')||!!touch.boost};}
function showMessage(text,seconds=2){message=text;messageTTL=seconds;}

class Particles {
  constructor(){this.capacity=280;this.cursor=0;this.items=Array.from({length:this.capacity},()=>({life:0,vx:0,vy:0,vz:0}));
    this.positions=new Float32Array(this.capacity*3);this.colors=new Float32Array(this.capacity*3);this.positions.fill(-1000);this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3));
    const sprite=document.createElement('canvas');sprite.width=sprite.height=32;const ctx=sprite.getContext('2d'),glow=ctx.createRadialGradient(16,16,1,16,16,16);
    glow.addColorStop(0,'rgba(255,255,255,1)');glow.addColorStop(.3,'rgba(255,255,255,.9)');glow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,32,32);
    this.material=new THREE.PointsMaterial({size:.48,map:new THREE.CanvasTexture(sprite),vertexColors:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending});
    this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.frustumCulled=false;scene.add(this.mesh);}
  emit(v,boost){const n=this.cursor++%GRAPHICS_PRESETS[graphicsState.quality].particleLimit,p=this.items[n],t=this.cursor*2.399,side=this.cursor%2?1:-1,fx=Math.sin(v.heading),fz=Math.cos(v.heading),nx=fz,nz=-fx;
    this.positions[n*3]=v.x-fx*1.65+nx*side*(boost?.55:1.05);this.positions[n*3+1]=boost?.55:.17;this.positions[n*3+2]=v.z-fz*1.65+nz*side*(boost?.55:1.05);
    p.life=boost?.24:.45;p.vx=-fx*(boost?14:2)+Math.cos(t)*2;p.vy=boost?.4:2;p.vz=-fz*(boost?14:2)+Math.sin(t)*2;
    this.colors.set(boost?[.2,.8,1]:v.driftCharge>.65?[1,.65,.12]:[.25,.85,1],n*3);}
  update(dt){const limit=GRAPHICS_PRESETS[graphicsState.quality].particleLimit;this.geometry.setDrawRange(0,limit);for(let i=0;i<limit;i++){const p=this.items[i];if(p.life>0){p.life-=dt;this.positions[i*3]+=p.vx*dt;this.positions[i*3+1]+=p.vy*dt;this.positions[i*3+2]+=p.vz*dt;p.vy-=dt*5;if(p.life<=0)this.positions[i*3+1]=-1000;}}
    this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;}
  clear(){this.items.forEach(p=>p.life=0);this.positions.fill(-1000);this.geometry.attributes.position.needsUpdate=true;}
}
const particles=new Particles();
const racerLabels=createRacerLabels(document.getElementById('game'));
const contactShadows=createContactShadows(scene);
const itemVisuals=createItemVisuals(scene);
const driverSkillVisuals=createDriverSkillVisuals(scene);
missileExplosions=createMissileExplosions(scene);
const rearView=createRearViewMirror({renderer,scene,element:document.getElementById('rear-view-mirror'),viewport:document.getElementById('rear-view-viewport'),warning:document.getElementById('rear-view-warning'),marker:document.getElementById('rear-view-threat')});
hitCamera=createHitCamera({renderer,scene,element:document.getElementById('hit-camera'),viewport:document.getElementById('hit-camera-viewport'),title:document.getElementById('hit-camera-title'),label:document.getElementById('hit-camera-name')});
missileAim=createMissileAim({getRace:()=>race,available:()=>phase==='racing'&&drivingControlsAvailable()&&(!online.active||online.state.connected),fire:useItem,onNoTarget:()=>showMessage('NO TARGET AHEAD — MISSILE KEPT',1.4),element:document.getElementById('missile-aim-reticle'),label:document.getElementById('missile-aim-label')});
onlineUI=createOnlineUI({
  onOpen:()=>{singlePlayerSetup?.close();clearInput();if(!online.active)void online.watchRooms(true);},onClose:()=>{clearInput();if(!online.active)void online.watchRooms(false);},
  onRefresh:()=>void online.watchRooms(true),
  onCreate:(name,options)=>{audio.unlock();void online.create(name,selected,selectedAvatar,options);},
  onJoin:(name,code)=>{audio.unlock();void online.join(name,code,selected,selectedAvatar);},
  onReady:ready=>void online.ready(ready),onStart:()=>{audio.unlock();void online.start();},
  onLeave:leaveRoom,onLobby:()=>void online.lobby(),
  onSelectKart:kart=>void online.select(kart,selectedAvatar),
  onSelectAvatar:avatar=>void online.select(selected,avatar),
  onSettings:settings=>void online.settings(settings),
});
onlineHandlers={
  onState:state=>{
    if(!state.connected)missileAim.cancel();
    if(state.room?.phase==='lobby'&&phase!=='garage')graphicsUI?.close();
    onlineUI.update(state);
    if(state.room?.phase==='lobby'){
      if(phase!=='garage')garage();
      const member=state.room.players.find(p=>p.id===state.memberId);
      if(member){selected=member.kart;selectedAvatar=member.avatar;garageModels.forEach((m,i)=>{m.visible=i===selected;setKartAvatar(m,selectedAvatar);});}
    }
    updateUI();
  },
  onSnapshot:receiveOnlineSnapshot,
  onExpired:()=>{garage();if(onlineUI.visible)void online.watchRooms(true);else onlineUI.open();},
};
function receiveOnlineSnapshot(snapshot,memberId){
  // Asset decoding can outlive the resumed race. A buffered snapshot must still
  // belong to the current room and race before it can replace garage state.
  const room=online.state.room;
  if(!room||room.phase==='lobby'||room.code!==snapshot.roomCode||room.raceId!==snapshot.raceId)return;
  const local=snapshot.racers.find(r=>r.memberId===memberId);if(!local)return;
  const fresh=onlineRaceId!==snapshot.raceId,oldPlayer=fresh?null:race.player;
  const oldLapCount=oldPlayer?.lapTimes.length||0,wasFinished=oldPlayer?.finished;
  const oldPhase=fresh?'countdown':race.phase;
  activateTrack(snapshot.trackId);
  onlineSnapshot=snapshot;
  const previousRacers=fresh?[]:race.racers;
  const racers=snapshot.racers.map((r,i)=>{
    const old=previousRacers[i];
    return {...r,player:r.memberId===memberId,...(old?{x:old.x,z:old.z,heading:old.heading}:{} )};
  });
  race={...snapshot,track:activeTrack,trackId:activeTrack.id,racers,player:racers.find(r=>r.player),results:snapshot.results.map(r=>({...r,player:r.memberId===memberId}))};
  selected=local.kart;selectedAvatar=local.avatar;
  if(fresh){
    singlePlayerSetup?.close();
    graphicsUI?.close();
    onlineRaceId=snapshot.raceId;clearInput();particles.clear();message='';messageTTL=0;
    garageModels.forEach(m=>m.visible=false);pools.flat().forEach(m=>m.visible=false);
    raceModels=racers.map((r,i)=>{const m=pools[i][r.kart];setKartAvatar(m,r.avatar);m.userData.wheels.forEach(w=>w.rotation.x=0);m.visible=true;return m;});
    onlineUI.close();
  }
  if((fresh&&snapshot.phase==='racing')||(oldPhase==='countdown'&&snapshot.phase==='racing'))telemetry.start(KARTS[selected].id,AVATARS[selectedAvatar].id);
  if(!fresh&&local.lapTimes.length>oldLapCount)for(const lap of local.lapTimes.slice(oldLapCount))telemetry.lap(lap);
  if(!wasFinished&&local.finished)telemetry.finish(local);
  phase=local.finished||snapshot.phase==='finished'?'finished':phase==='paused'&&!fresh?'paused':snapshot.phase;
  for(const event of snapshot.events||[]){
    itemFeedback(event);
    // Audio's player effects use id 0; translate only our own racer.
    if(event.id!=null&&event.id!==local.id)continue;
    audio.event({...event,id:0});
    if(event.type==='hit')shake=.8;
    if(event.type==='lap')showMessage(event.lap===3?'FINAL LAP!':'LAP 2 — KEEP IT UP');
    if(event.type==='go')showMessage('GO!',1.1);
    if(event.type==='drift-release')showMessage('DRIFT BOOST!',.75);
  }
  if(fresh){syncModels(0);updateCamera(1,true);}updateUI();
}
function animateOnline(dt){
  inputTimer+=dt;
  if(inputTimer>=1/30){inputTimer=0;online.input(phase==='racing'&&!onlineUI.visible?input():{throttle:false,brake:false,steer:0,drift:false,boost:false});}
  if(!onlineSnapshot)return;
  const blend=1-Math.exp(-25*dt);
  race.racers.forEach((r,i)=>{const target=onlineSnapshot.racers[i];
    if(Math.hypot(target.x-r.x,target.z-r.z)>12){r.x=target.x;r.z=target.z;r.heading=target.heading;}
    else {r.x+=(target.x-r.x)*blend;r.z+=(target.z-r.z)*blend;r.heading+=angleDiff(target.heading,r.heading)*blend;}
  });
}
function syncModels(dt){race.racers.forEach((r,i)=>{const m=raceModels[i];if(!m)return;
  m.visible=!(r.finished&&!r.player);
  m.position.set(r.x,.04+Math.sin(elapsed*17+i)*Math.min(Math.abs(r.speed)*.001,.025),r.z);
  m.rotation.set(0,r.heading+(r.hitTime>0?r.hitTime/.85*Math.PI*2:0),-r.steer*Math.min(Math.abs(r.speed)*.0018,.06));
  (m.userData.wheels||[]).forEach(w=>w.rotation.x+=r.speed*dt/(w.userData.radius||m.userData.wheelRadius||.42));(m.userData.frontPivots||[]).forEach(w=>w.rotation.y=-r.steer*.35);
  if(phase==='racing'&&(r.drifting||r.boosting||r.miniBoost>0||r.itemBoostTime>0||skillActive(r,'overdrive')))for(let n=0;n<(r.player&&graphicsState.quality==='high'?3:1);n++)particles.emit(r,r.boosting||r.miniBoost>0||r.itemBoostTime>0||skillActive(r,'overdrive'));
});}
function updateCamera(dt,instant=false){
  if(phase==='garage'){const mobile=innerWidth<700;desiredCamera.set(mobile?11.9:9,mobile?8.12:5.3,mobile?15.4:10);desiredLook.set(mobile?-.2:-3.1,mobile?1:1.1,mobile?0:1.2);
    desiredCamera.x+=world.showroomPosition.x;desiredCamera.z+=world.showroomPosition.z;desiredLook.x+=world.showroomPosition.x;desiredLook.z+=world.showroomPosition.z;
    camera.fov=mobile?47:43;
  }else{const r=race.player,velocityAngle=Math.hypot(r.vx,r.vz)>5?Math.atan2(r.vx,r.vz):r.heading;
    const heading=r.heading+angleDiff(velocityAngle,r.heading)*.48,fx=Math.sin(heading),fz=Math.cos(heading),distance=8.8+Math.min(Math.abs(r.speed)*.035,1.8);
    desiredCamera.set(r.x-fx*distance,5.3,r.z-fz*distance);desiredLook.set(r.x+fx*9,1.3,r.z+fz*9);
    const portrait=innerWidth/innerHeight<.8;
    if(portrait){desiredCamera.set(r.x-fx*(distance+3),7.2,r.z-fz*(distance+3));desiredLook.y=1.5;}
    camera.fov+=((portrait?72:57)+(r.boosting||skillActive(r,'overdrive')?9:0)+Math.abs(r.speed)*.13-camera.fov)*(instant?1:1-Math.exp(-5*dt));}
  const blend=instant?1:1-Math.exp(-7*dt);camera.position.lerp(desiredCamera,blend);cameraLook.lerp(desiredLook,blend);camera.lookAt(cameraLook);
  if(shake>0&&!pausedForCapture){camera.position.x+=Math.sin(elapsed*91)*shake*.12;camera.position.y+=Math.cos(elapsed*73)*shake*.06;shake=Math.max(0,shake-dt*2);}
  camera.updateProjectionMatrix();const target=phase==='garage'?world.showroomPosition:race.player;sun.position.set(target.x+45,80,target.z+30);sun.target.position.set(target.x,0,target.z);sun.target.updateMatrixWorld();
}
function updateUI(){const p=race.player,room=online?.state.room;ui.update({phase,selected,selectedAvatar,trackId:activeTrack.id,difficulty:room?.difficulty||'normal',online:!!room,onlineCanRematch:room?.phase==='finished'&&room.hostId===online?.state.memberId,onlineWaiting:!!room&&room.phase!=='finished',speed:Math.max(0,Math.round(p.speed*3.6)),lap:p.lap,totalLaps:TOTAL_LAPS,position:p.rank,totalRacers:phase==='garage'?(room?6:1+rivalSlots.filter(slot=>slot.enabled).length):race.racers.length,time:race.time,
  bestLap:p.lapTimes.length?Math.min(...p.lapTimes):null,lapTimes:p.lapTimes,nitro:p.nitro,drifting:p.drifting,driftCharge:p.driftCharge,boosting:p.boosting||p.miniBoost>0||p.itemBoostTime>0||skillActive(p,'overdrive'),items:p.items||[null,null,null],aim:missileAim?.state,shieldTime:p.shieldTime||0,itemBoostTime:p.itemBoostTime||0,
  skill:getDriverSkillState(p,phase),skillAvailable:drivingControlsAvailable()&&(!online.active||online.state.connected)&&!p.finished,
  countdown:Math.min(3,Math.max(0,Math.ceil(race.countdown))),wrongWay:p.wrongWay,muted:audio.muted,message,racers:race.racers.map(r=>({...r,time:r.finishTime})),results:race.results,trackLength:activeTrack.trackLength});}
const testing=new URLSearchParams(location.search).has('test');
if(testing)window.__THREE_GAME_TEST_HOOKS__={seed(value=42){elapsed=0;return {seed:value,deterministic:true};},
  setTrack(id){if(phase!=='garage'||online.active)throw new Error('Track fixtures require the solo garage');selectedTrack=getTrack(id).id;activateTrack(selectedTrack);race=new Race(selected,{rivalSlots,trackId:selectedTrack});garageClock=0;garageFade.style.opacity='0';updateCamera(1,true);updateUI();return {trackId:selectedTrack};},
  stepGarage(seconds){if(phase!=='garage')throw new Error('Not in garage');updateGarageBackdrop(Math.max(0,Math.min(seconds,12)));updateCamera(1,true);updateUI();return this.getState();},
  setState(name){singlePlayerSetup.close();if(name==='garage')garage();
    else if(name==='active-play'){start();race.phase='racing';race.countdown=0;phase='racing';for(let n=0;n<120*6;n++)race.tick(FIXED_DT,race.aiInput(race.player));syncModels(0);updateCamera(1,true);}
    else if(name==='finished'){start();race.phase='racing';phase='racing';for(let n=0;n<120*180&&race.phase!=='finished';n++)race.tick(FIXED_DT,race.aiInput(race.player));phase=race.phase;syncModels(0);updateCamera(1,true);}
    else throw new Error('Unknown capture state: '+name);updateUI();return {state:name};},
  setPausedForScreenshot(value){pausedForCapture=!!value;},
  setRacePosition({s=0,routeId='main',lateral=0,speed=0}={}){
    if(online.active||phase!=='racing')throw new Error('Position fixtures require an active solo race');
    const p=(activeTrack.sampleRoad||activeTrack.sampleTrack)(s,lateral,routeId),v=race.player;
    Object.assign(v,p,{routeId,progress:s,s:activeTrack.wrapDistance(s),gate:Math.floor(s/(activeTrack.trackLength/4))+1,progressRoute:routeId,progressX:p.x,progressZ:p.z,speed,vx:Math.sin(p.heading)*speed,vz:Math.cos(p.heading)*speed,steer:0,hitTime:0,finished:false});
    syncModels(0);updateCamera(1,true);updateUI();return this.getState();
  },
  getState(){const clone=r=>({...r,items:[...(r.items||[])],itemAcquiredAt:[...(r.itemAcquiredAt||[])]});return {phase,selected,selectedAvatar,selectedTrackId:selectedTrack,trackId:activeTrack.id,trackLength:activeTrack.trackLength,difficulty:race.difficulty||online?.state.room?.difficulty||'normal',rivalSlots:rivalSlots.map(slot=>({...slot})),time:race.time,player:clone(race.player),racers:race.racers.map(clone),itemBoxes:(race.itemBoxes||[]).map(b=>({...b})),hazards:(race.hazards||[]).map(h=>({...h})),aim:missileAim.state,input:input(),online:online?.state};},
  step(seconds,controls){for(let n=0;n<Math.round(seconds/FIXED_DT)&&race.phase!=='finished';n++)race.tick(FIXED_DT,controls||race.aiInput(race.player));phase=race.phase;syncModels(0);updateCamera(1,true);updateUI();return this.getState();},
  getKartAssets(){return garageModels.map(m=>({name:m.name,source:m.userData.assetSource,generationId:m.userData.generationId,avatarId:m.userData.avatarId,avatarGenerationId:m.userData.avatarGenerationId,avatarCount:m.children.filter(c=>c.name.startsWith('driver-')).length,wheels:m.userData.wheels.length,frontPivots:m.userData.frontPivots.length,bounds:new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).toArray()}));},
  getWheelState(){return raceModels.map(m=>({rolling:m.userData.wheels.map(w=>w.rotation.x),steering:m.userData.frontPivots.map(w=>w.rotation.y)}));},
  getGarageView(){const point=garageModels[selected].localToWorld(new THREE.Vector3(0,.7,0)).project(camera);return {...garageRotation.getState(),rotation:garageModels[selected].rotation.y,center:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2}};},
  setSkillFixture({avatar=0,cooldown=0,hitTime=0,nitro=35}={}){
    if(online.active||phase!=='racing'||!Number.isInteger(avatar)||avatar<0||avatar>=AVATARS.length)throw new Error('Skill fixtures require an active solo race and valid driver');
    Object.assign(race.player,{avatar,skillCooldown:cooldown,skillTime:0,skillSlowTime:0,skillUses:0,hitTime,nitro});selectedAvatar=avatar;
    setKartAvatar(raceModels[race.racers.indexOf(race.player)],avatar);updateUI();return this.getState();
  },
  setItemFixture({items,opponents=[],hazards}={}){
    if(online.active||phase!=='racing')throw new Error('Item fixtures require an active solo race');
    const p=race.player,fx=Math.sin(p.heading),fz=Math.cos(p.heading);
    if(items){missileAim.cancel();hitCamera.clear();missileExplosions.clear();p.items=[...items];race.hazards=[];}
    Object.assign(p,{hitTime:0,itemImmunity:0,shieldTime:0,speed:0,vx:0,vz:0});
    for(const r of race.racers){if(r===p)continue;const setup=opponents.find(o=>o.id===r.id);r.finished=!setup;if(!setup)continue;
      const x=p.x+fx*(setup.forward??25)+fz*(setup.lateral??0),z=p.z+fz*(setup.forward??25)-fx*(setup.lateral??0),trackPoint=race.track.nearestTrack(x,z,p.s);
      Object.assign(r,{x,z,s:trackPoint.s,lateral:trackPoint.lateral,heading:p.heading,speed:0,vx:0,vz:0,hitTime:0,itemImmunity:0,shieldTime:setup.shieldTime??0,items:[null,null,null]});
      if(setup.name!==undefined)r.name=String(setup.name);
    }
    if(hazards)race.hazards=hazards;
    race.itemBoxes.forEach(b=>b.readyAt=race.time+100);syncModels(0);updateUI();return this.getState();
  },
  stepItems(seconds){if(online.active)throw new Error('Solo fixture only');for(let n=0;n<Math.round(seconds/FIXED_DT);n++){race.time+=FIXED_DT;race.events=[];tickRaceItems(race,FIXED_DT);for(const event of race.events)itemFeedback(event);}syncModels(0);updateUI();return this.getState();},
  setMirrorThreat({distance=22,lateral=0,ownerId=-1,targeted=true,life=4}={}){if(online.active)throw new Error('Solo fixture only');const p=race.player,fx=Math.sin(p.heading),fz=Math.cos(p.heading);race.hazards=distance===null?[]:[{id:99999,type:'missile',ownerId,targetId:targeted?p.id:null,x:p.x-fx*distance+fz*lateral,z:p.z-fz*distance-fx*lateral,heading:p.heading,s:race.track.wrapDistance(p.s-distance),lateral,age:0,life}];return this.getState();},
  aim(){return race.aiInput(race.player);}};
function diagnostics(dt){if(!testing)return;const info=renderer.info,p=race.player;
  window.__THREE_GAME_DIAGNOSTICS__={frame,phase,trackId:activeTrack.id,worlds:worlds.size,score:p.gate,complete:p.finished,player:{x:p.x,y:0,z:p.z},lap:p.lap,speed:p.speed,time:race.time,
    water:world.waterDiagnostics?{...world.waterDiagnostics}:null,trees:world.treeDiagnostics?{...world.treeDiagnostics}:null,greenTrees:world.greenTreeDiagnostics?{...world.greenTreeDiagnostics}:null,ridgeForest:world.ridgeForestDiagnostics?{...world.ridgeForestDiagnostics}:null,ambient:world.ambientDiagnostics?{...world.ambientDiagnostics}:null,graphics:{...graphicsState,shadows:renderer.shadowMap.enabled,renderWidth:renderer.domElement.width,renderHeight:renderer.domElement.height},
    coast:world.coastDiagnostics?{...world.coastDiagnostics}:null,grass:world.grassDiagnostics?{...world.grassDiagnostics}:null,rocks:world.rockDiagnostics?{...world.rockDiagnostics}:null,items:{...itemVisuals.diagnostics},explosions:{...missileExplosions.diagnostics},rearView:{...rearView.diagnostics},hitCamera:{...hitCamera.diagnostics},renderer:{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures},
    city:world.cityDiagnostics?{...world.cityDiagnostics}:null,driverSkills:{...driverSkillVisuals.diagnostics},drawCalls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,frameMs:dt*1000,dpr:renderer.getPixelRatio(),physics:{engine:'custom arcade',hz:120,karts:race.racers.length,trackSegments:activeTrack.trackPoints.length-1}};}
let previous=performance.now();
function animate(now){requestAnimationFrame(animate);if(phase==='racing'&&!pausedForCapture)telemetry.frame((now-previous)/1000);const dt=Math.max(0,Math.min((now-previous)/1000,.08));previous=now;frame++;
  if(!pausedForCapture){elapsed+=dt;
    updateGarageBackdrop(dt);
    if(online?.active)animateOnline(dt);
    else if(phase==='racing'||phase==='countdown'){accumulator+=dt;const controls=input();while(accumulator>=FIXED_DT){const oldPhase=race.phase,oldLaps=race.player.lapTimes.length;race.tick(FIXED_DT,controls);
      if(oldPhase==='countdown'&&race.phase==='racing')telemetry.start(KARTS[selected].id,AVATARS[selectedAvatar].id);
      if(race.player.lapTimes.length>oldLaps)telemetry.lap(race.player.lapTimes.at(-1));
      if(oldPhase!=='finished'&&race.phase==='finished')telemetry.finish(race.player);accumulator-=FIXED_DT;phase=race.phase;
      for(const e of race.events){audio.event(e);itemFeedback(e);if(e.type==='hit'&&e.id===0)shake=.8;if(e.type==='lap'&&e.id===0)showMessage(e.lap===3?'FINAL LAP!':'LAP 2 — KEEP IT UP');if(e.type==='go')showMessage('GO!',1.1);if(e.type==='drift-release'&&e.id===0)showMessage('DRIFT BOOST!',.75);}}}
    if(messageTTL>0){messageTTL-=dt;if(messageTTL<=0)message='';}
    if(phase!=='garage'&&(phase!=='paused'||online.active))syncModels(dt);particles.update(phase==='paused'&&!online.active?0:dt);world.update?.(elapsed);updateCamera(dt);}
  garageRotation.update(pausedForCapture?0:dt);
  missileAim.update(camera);
  audio.update(race.player.speed,phase==='racing',race.player.drifting);uiTimer+=dt;if(uiTimer>.05){updateUI();uiTimer=0;}
  contactShadows.update(phase==='garage'?garageModels:raceModels,phase==='garage'?world.showroomPosition.y+.035:.115,graphicsState.quality==='low');
  itemVisuals.update({race,time:race.time,visible:['countdown','racing','paused'].includes(phase),quality:graphicsState.quality});
  driverSkillVisuals.update({race,visible:['countdown','racing','paused'].includes(phase),quality:graphicsState.quality});
  missileExplosions.update({time:race.time,visible:phase==='racing'&&!onlineUI?.visible&&!graphicsUI?.visible,quality:graphicsState.quality});
  renderer.info.reset();
  world.beforeRender?.(renderer,scene,camera,{time:elapsed,frame,paused:pausedForCapture||phase==='paused'});
  renderer.render(scene,camera);
  rearView.render({race,models:raceModels,quality:graphicsState.quality,now,visible:['countdown','racing'].includes(phase)&&!onlineUI?.visible&&!graphicsUI?.visible&&!document.hidden,
    prepareView:rearCamera=>world.beforeRender?.(renderer,scene,rearCamera,{time:elapsed,frame,rearView:true}),restoreView:()=>world.beforeRender?.(renderer,scene,camera,{time:elapsed,frame,paused:pausedForCapture||phase==='paused'})});
  hitCamera.render({race,models:raceModels,quality:graphicsState.quality,now,visible:phase==='racing'&&!onlineUI?.visible&&!graphicsUI?.visible&&!document.hidden,
    prepareView:hitView=>world.beforeRender?.(renderer,scene,hitView,{time:elapsed,frame,rearView:true}),restoreView:()=>world.beforeRender?.(renderer,scene,camera,{time:elapsed,frame,paused:pausedForCapture||phase==='paused'})});
  const insetRects=[document.getElementById('rear-view-mirror'),document.getElementById('hit-camera')].filter(el=>!el.hidden).map(el=>el.getBoundingClientRect());
  racerLabels.update({camera,racers:race.racers,models:raceModels,visible:['countdown','racing'].includes(phase)&&!onlineUI?.visible&&!graphicsUI?.visible,occluders:insetRects});
  diagnostics(dt);
}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(graphicsPixelRatio(graphicsState.quality,devicePixelRatio,innerWidth));updateCamera(1,true);updateUI();});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();telemetry.event('WebGLContextLost');telemetry.flush();pause();const el=document.getElementById('loading');el.hidden=false;el.textContent='Graphics context lost. Reload to restart the race.';});
document.getElementById('loading').hidden=true;telemetry.event('GameReady');telemetry.flush();garage();requestAnimationFrame(animate);
onlineHandlers.onState(online.state);
if(pendingOnlineSnapshot)receiveOnlineSnapshot(...pendingOnlineSnapshot);
if(expiredWhileLoading||(new URLSearchParams(location.search).has('room')&&!online.active))onlineUI.open();
