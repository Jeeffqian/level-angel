/** A one-finger/mouse turntable. UI controls never send events to this canvas. */
export function createGarageRotation(element,{available,hitTest,onRotate}){
  let angle=.3,pointerId=null,lastX=0,manual=false;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const listeners=[];
  const on=(target,type,listener)=>{target.addEventListener(type,listener);listeners.push(()=>target.removeEventListener(type,listener));};
  function cancel(){
    const previous=pointerId;pointerId=null;element.classList.remove('is-rotating');
    if(previous!==null&&element.hasPointerCapture(previous))element.releasePointerCapture(previous);
  }
  on(element,'pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false||pointerId!==null||!available()||!hitTest(event.clientX,event.clientY))return;
    event.preventDefault();pointerId=event.pointerId;lastX=event.clientX;manual=true;
    element.setPointerCapture(pointerId);element.classList.add('is-rotating');
  });
  on(element,'pointermove',event=>{
    if(event.pointerId!==pointerId)return;
    if(!available()||(event.pointerType==='mouse'&&!(event.buttons&1))){cancel();return;}
    event.preventDefault();
    const bounds=element.getBoundingClientRect();
    angle+=(event.clientX-lastX)*Math.PI*2/Math.max(300,Math.min(bounds.width,bounds.height));
    lastX=event.clientX;onRotate(angle);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(element,type,event=>{if(event.pointerId===pointerId)cancel();});
  for(const type of ['blur','resize','orientationchange'])on(window,type,cancel);
  on(document,'visibilitychange',()=>{if(document.hidden)cancel();});
  on(element,'contextmenu',event=>{if(pointerId!==null)event.preventDefault();});
  onRotate(angle);
  return {
    cancel,
    update(dt){
      const enabled=available();element.classList.toggle('can-rotate-kart',enabled);
      if(!enabled){cancel();return;}
      if(!manual&&!reducedMotion.matches){angle+=dt*.16;onRotate(angle);}
    },
    getState:()=>({angle,dragging:pointerId!==null,manual}),
    dispose(){cancel();listeners.forEach(remove=>remove());element.classList.remove('can-rotate-kart');},
  };
}
