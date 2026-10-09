const TOKEN_KEY='sunlane-room-token',NAME_KEY='sunlane-player-name';
const read=(storage,key)=>{try{return globalThis[storage].getItem(key)||'';}catch{return '';}};
const write=(storage,key,value)=>{try{if(value)globalThis[storage].setItem(key,value);else globalThis[storage].removeItem(key);}catch{/* Storage access itself can throw in restricted browsing. */}};
export function gameServerOrigin(config,location){
  if(config.serverUrl)return new URL(config.serverUrl,location.origin).origin;
  const host=location.hostname;
  const local=host==='localhost'||host==='[::1]'||host==='::1'||/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||host.endsWith('.local');
  return local?`${location.protocol}//${host}:${config.port||3000}`:location.origin;
}

export function createOnlineSession({onState,onSnapshot,onExpired}){
  let socket,connecting,token=read('sessionStorage',TOKEN_KEY),seq=0,raceId=null,snapshotSequence=-1,watching=false,itemRequests=new Map(),skillRequest=null;
  const state={room:null,memberId:null,status:'Race with friends',error:'',name:read('localStorage',NAME_KEY),
    code:new URLSearchParams(location.search).get('room')?.toUpperCase()||'',busy:false,connected:false,rooms:[],directoryLoading:false,directoryError:''};
  const publish=()=>onState({...state});
  const clearGameplayRequests=()=>{itemRequests.clear();skillRequest=null;};
  function saveToken(value){token=value||'';write('sessionStorage',TOKEN_KEY,token);}
  function receiveSnapshot(snapshot){
    if(!state.memberId||snapshot.roomCode!==state.room?.code)return;
    if(snapshot.raceId!==raceId){clearGameplayRequests();raceId=snapshot.raceId;snapshotSequence=-1;seq=0;}
    if(snapshot.sequence<=snapshotSequence)return;
    snapshotSequence=snapshot.sequence;onSnapshot(snapshot,state.memberId);
  }
  function receiveRoom(room){if(room.raceId!==raceId||room.phase!=='racing')clearGameplayRequests();if(watching){watching=false;socket?.emit('sunlane:directory',{watch:false});state.directoryLoading=false;}if(room.phase==='lobby'){raceId=null;snapshotSequence=-1;seq=0;}state.room=room;state.code=room.code;state.status=room.phase==='lobby'?'Choose your ride and ready up':'Live online race';publish();}
  function accept(result){
    if(result.memberId)state.memberId=result.memberId;
    if(result.token)saveToken(result.token);
    if(result.room)receiveRoom(result.room);
    if(result.snapshot)receiveSnapshot(result.snapshot);
  }
  function request(event,payload){
    return new Promise((resolve,reject)=>{
      if(!socket?.connected){reject(new Error('Connection lost. Reconnecting to your room…'));return;}
      socket.timeout(8000).emit(`sunlane:${event}`,payload,(error,result)=>{
        if(error)reject(Object.assign(new Error('The server did not respond. Please try again.'),{retryable:true}));
        else if(!result?.ok)reject(new Error(result?.error||'Unable to complete that action.'));
        else resolve(result);
      });
    });
  }
  async function restore(){
    if(!token)return;
    state.busy=true;state.status='Rejoining your room…';publish();
    try{const result=await request('resume',{token});seq=0;accept(result);state.error='';}
    catch(error){state.error=error.message;if(error.retryable||!socket?.connected){setTimeout(()=>{if(token&&socket?.connected)void restore();},1500);}else {clearGameplayRequests();saveToken('');state.room=null;state.memberId=null;raceId=null;onExpired();}}
    finally{state.busy=false;publish();}
  }
  async function connect(){
    if(socket?.connected)return;
    if(connecting)return connecting;
    state.status='Connecting to the game server…';state.error='';publish();
    connecting=(async()=>{
      if(!socket){
        const [module,response]=await Promise.all([import('./vendor/socket.io.esm.min.js'),fetch('/api/sunlane-sprint/config')]);
        if(!response.ok)throw new Error('Could not load the game server settings.');
        const config=await response.json();
        socket=module.io(`${gameServerOrigin(config,location)}/sunlane-sprint`,{path:'/socket.io',autoConnect:false,transports:['websocket','polling'],reconnection:true});
        socket.on('sunlane:room',receiveRoom);socket.on('sunlane:snapshot',receiveSnapshot);
        socket.on('sunlane:rooms',({rooms})=>{if(watching&&!state.room){state.rooms=rooms;state.directoryError='';state.directoryLoading=false;publish();}});
        socket.on('sunlane:closed',({reason})=>{clearGameplayRequests();saveToken('');state.room=null;state.memberId=null;raceId=null;state.error=reason||'This room has closed.';onExpired();publish();});
        socket.on('connect',()=>{state.connected=true;state.error='';state.status='Connected';publish();void restore().then(()=>{if(watching&&!state.room)void watchRooms(true);});});
        socket.on('disconnect',()=>{clearGameplayRequests();state.connected=false;state.rooms=[];state.status=state.room?'Reconnecting… Your kart is on autopilot.':'Reconnecting to the room browser…';publish();});
        socket.on('connect_error',()=>{state.connected=false;state.status='Game server unavailable. Retrying…';publish();});
      }
      await new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);socket.off('connect',ready);socket.off('connect_error',failed);};
        const ready=()=>{cleanup();resolve();};
        const failed=()=>{cleanup();reject(new Error('Cannot reach the game server. Check your connection and try again.'));};
        const timer=setTimeout(failed,10000);socket.once('connect',ready);socket.once('connect_error',failed);socket.connect();
      });
    })();
    try{await connecting;}finally{connecting=null;}
  }
  async function action(event,payload,{membership=false}={}){
    if(state.busy)return;
    state.busy=true;state.error='';publish();
    try{
      await connect();
      const result=await request(event,payload);accept(result);
      if(membership){state.name=result.room?.players.find(p=>p.id===result.memberId)?.name||payload.name;write('localStorage',NAME_KEY,state.name);}
      return result;
    }catch(error){state.error=error.message;}
    finally{state.busy=false;publish();}
  }
  async function watchRooms(watch){
    watching=!!watch;
    if(!watching){if(socket?.connected)socket.emit('sunlane:directory',{watch:false});state.directoryLoading=false;publish();return;}
    state.directoryLoading=true;state.directoryError='';publish();
    try{await connect();if(!watching||state.room)return;const result=await request('directory',{watch:true});if(watching&&!state.room){state.rooms=result.rooms;state.directoryError='';}}
    catch(error){if(watching)state.directoryError=error.message;}
    finally{state.directoryLoading=false;publish();}
  }
  async function useItem(slot,targetId=undefined){
    if(targetId!==undefined&&!Number.isInteger(targetId))return;
    if(!Number.isInteger(slot)||slot<0||slot>2||itemRequests.has(slot)||state.busy||!socket?.connected||!raceId||state.room?.phase!=='racing')return;
    // Reliable gameplay requests must never pause the independent driving stream.
    const pending={raceId,memberId:state.memberId,socketId:socket.id};itemRequests.set(slot,pending);
    const current=()=>itemRequests.get(slot)===pending&&socket?.connected&&socket.id===pending.socketId&&
      raceId===pending.raceId&&state.memberId===pending.memberId&&state.room?.phase==='racing';
    state.error='';publish();
    try{const result=await request('use-item',{raceId:pending.raceId,slot,...(targetId===undefined?{}:{targetId})});if(current())return result;}
    catch(error){if(current()){state.error=error.message;publish();}}
    finally{if(itemRequests.get(slot)===pending)itemRequests.delete(slot);}
  }
  async function useSkill(){
    if(skillRequest||state.busy||!socket?.connected||!raceId||state.room?.raceId!==raceId||state.room?.phase!=='racing')return;
    const pending={raceId,memberId:state.memberId,socketId:socket.id};skillRequest=pending;
    const current=()=>skillRequest===pending&&socket?.connected&&socket.id===pending.socketId&&
      raceId===pending.raceId&&state.memberId===pending.memberId&&state.room?.phase==='racing';
    state.error='';publish();
    try{const result=await request('use-skill',{raceId:pending.raceId});if(current())return result;}
    catch(error){if(current()){state.error=error.message;publish();}}
    finally{if(skillRequest===pending)skillRequest=null;}
  }
  return {
    get state(){return {...state};},get active(){return !!state.room;},
    async boot(){publish();if(token){try{await connect();}catch(error){state.error=error.message;publish();}}},
    watchRooms,
    create(name,kart,avatar,options={}){return action('create',{name,kart,avatar,...options},{membership:true});},
    join(name,code,kart,avatar){return action('join',{name,code,kart,avatar},{membership:true});},
    select(kart,avatar){return action('select',{kart,avatar});},ready(ready){return action('ready',{ready});},
    settings(settings){return action('settings',settings);},
    start(){return action('start',{});},lobby(){return action('lobby',{});},
    recover(){if(raceId)return action('recover',{raceId});},
    useItem,useSkill,
    input(controls){if(socket?.connected&&raceId&&!state.busy&&['countdown','racing'].includes(state.room?.phase))socket.volatile.emit('sunlane:input',{...controls,raceId,seq:seq++});},
    async leave(){
      watching=false;clearGameplayRequests();
      if(socket?.connected){try{await request('leave',{});}catch{/* Disconnect releases membership through the grace timeout. */}}
      saveToken('');state.room=null;state.memberId=null;state.busy=false;state.error='';raceId=null;snapshotSequence=-1;
      socket?.disconnect();state.connected=false;state.status='Race with friends';publish();
    },
  };
}
