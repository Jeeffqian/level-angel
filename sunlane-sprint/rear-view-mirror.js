import * as THREE from 'three';

/** Read the same hazards supplied by solo simulation or an online snapshot. */
export function findIncomingMissile(race) {
  const p=race?.player;if(!p||p.finished)return null;
  const fx=Math.sin(p.heading),fz=Math.cos(p.heading);let nearest=null;
  for(const h of race.hazards??[]){
    if(h.type!=='missile'||h.ownerId===p.id||h.life<=0||!Number.isFinite(h.x)||!Number.isFinite(h.z))continue;
    const dx=h.x-p.x,dz=h.z-p.z,distance=Math.hypot(dx,dz);
    if(distance>80||dx*fx+dz*fz>2)continue;
    const closing=(Math.sin(h.heading)*72-(p.vx||0))*(-dx)+(Math.cos(h.heading)*72-(p.vz||0))*(-dz)>0;
    const crossing=Math.abs(dx*fz-dz*fx)<5;
    if(closing&&(h.targetId===p.id||crossing)&&(!nearest||distance<nearest.distance))nearest={hazard:h,distance};
  }
  return nearest;
}

/** One small cached camera pass; composite it into the existing WebGL canvas. */
export function createRaceInset({renderer,scene,element,viewport,warning,marker,mirrored=true,hidePlayer=true,showThreats=true,incomingOnly=false,configureCamera,name='Rear-view mirror'}) {
  const camera=new THREE.PerspectiveCamera(39,3.5,.2,140);camera.userData.rearView=true;
  const screen=new THREE.Scene(),screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geometry=new THREE.PlaneGeometry(2,2),material=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,uniforms:{viewTexture:{value:null},viewSize:{value:new THREE.Vector2(300,85)},flipX:{value:mirrored?1:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`uniform sampler2D viewTexture;uniform vec2 viewSize;uniform float flipX;varying vec2 vUv;
      void main(){
        vec2 q=abs((vUv-.5)*viewSize)-viewSize*.5+vec2(9.0);
        if(length(max(q,0.0))+min(max(q.x,q.y),0.0)>9.0)discard;
        // The texture flip gives a physical mirror's left/right orientation.
        gl_FragColor=texture2D(viewTexture,vec2(mix(vUv.x,1.0-vUv.x,flipX),vUv.y));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  screen.add(new THREE.Mesh(geometry,material));
  const oldViewport=new THREE.Vector4(),oldScissor=new THREE.Vector4(),point=new THREE.Vector3();
  let target=null,lastRender=-Infinity,lastRace=null,lastQuality=null,disposed=false,wasVisible=false;
  const diagnostics={visible:false,targetAllocated:false,width:0,height:0,refreshHz:0,passes:0,lastCalls:0,lastTriangles:0,incoming:false,threatId:null,markerVisible:false,disposed:false};

  function hide(){element.hidden=true;if(warning)warning.hidden=true;if(marker)marker.hidden=true;element.dataset.threat='false';wasVisible=false;diagnostics.visible=diagnostics.incoming=diagnostics.markerVisible=false;diagnostics.threatId=null;}
  function render({race,models=[],visible=false,quality='high',now=performance.now(),prepareView,restoreView}={}){
    if(disposed)return;
    diagnostics.lastCalls=diagnostics.lastTriangles=0;
    if(!visible||!race?.player){hide();return;}
    const incoming=showThreats?findIncomingMissile(race):null;
    if(incomingOnly&&!incoming){hide();return;}
    element.hidden=false;diagnostics.visible=true;
    const rect=viewport.getBoundingClientRect(),canvas=renderer.domElement.getBoundingClientRect();
    if(rect.width<1||rect.height<1){hide();return;}
    const high=quality==='high',scale=high?1.5:1,width=Math.min(high?512:300,Math.max(128,Math.round(rect.width*scale))),height=Math.max(48,Math.round(width*rect.height/rect.width));
    const raceKey=race.raceId??race;
    let force=!wasVisible||raceKey!==lastRace||quality!==lastQuality;
    if(!target){target=new THREE.WebGLRenderTarget(width,height,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false,generateMipmaps:false});target.texture.colorSpace=THREE.LinearSRGBColorSpace;target.texture.name=name;material.uniforms.viewTexture.value=target.texture;force=true;}
    else if(target.width!==width||target.height!==height){target.setSize(width,height);force=true;}
    Object.assign(diagnostics,{targetAllocated:true,width,height,refreshHz:high?30:15});
    const p=race.player,fx=Math.sin(p.heading),fz=Math.cos(p.heading);
    // A new threat refreshes immediately, even between the scheduled rear frames.
    if((incoming?.hazard.id??null)!==diagnostics.threatId)force=true;
    diagnostics.incoming=!!incoming;diagnostics.threatId=incoming?.hazard.id??null;
    element.dataset.threat=String(!!incoming);if(warning)warning.hidden=!incoming;
    if(incoming&&warning&&warning.textContent!=='MISSILE INCOMING')warning.textContent='MISSILE INCOMING';
    const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),scissor:renderer.getScissorTest(),clear:renderer.autoClear,
      shadowAuto:renderer.shadowMap.autoUpdate,shadowNeeds:renderer.shadowMap.needsUpdate,xr:renderer.xr.enabled};
    renderer.getViewport(oldViewport);renderer.getScissor(oldScissor);
    try {
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      if(force||now-lastRender>=1000/diagnostics.refreshHz){
        camera.aspect=rect.width/rect.height;camera.far=high?140:100;camera.updateProjectionMatrix();
        if(configureCamera)configureCamera(camera,race);
        else {camera.position.set(p.x-fx*1.7,1.9,p.z-fz*1.7);camera.lookAt(p.x-fx*25,1.05,p.z-fz*25);}
        camera.updateMatrixWorld();
        const ownModel=hidePlayer?models[race.racers.indexOf(p)]:null,ownVisible=ownModel?.visible;
        const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
        try {
          if(ownModel)ownModel.visible=false;
          prepareView?.(camera);renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.autoClear=true;renderer.render(scene,camera);
          diagnostics.passes++;diagnostics.lastCalls=renderer.info.render.calls-calls;diagnostics.lastTriangles=renderer.info.render.triangles-triangles;lastRender=now;
        } finally {if(ownModel)ownModel.visible=ownVisible;restoreView?.();}
      }
      if(marker)marker.hidden=true;diagnostics.markerVisible=false;
      if(incoming&&marker){
        point.set(incoming.hazard.x,1.65,incoming.hazard.z).project(camera);
        // Keep the cue at the edge when a bend puts the missile outside the view.
        const x=THREE.MathUtils.clamp((1-point.x)*.5,.06,.94),y=THREE.MathUtils.clamp((1-point.y)*.5,.2,.76);
        marker.style.left=(x*100)+'%';marker.style.top=(y*100)+'%';marker.hidden=false;diagnostics.markerVisible=true;
      }
      renderer.setRenderTarget(previous.target,previous.face,previous.mip);renderer.autoClear=false;
      const x=rect.left-canvas.left,y=canvas.bottom-rect.bottom;
      renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);renderer.setScissorTest(true);
      material.uniforms.viewSize.value.set(rect.width,rect.height);renderer.render(screen,screenCamera);
    } finally {
      renderer.setRenderTarget(previous.target,previous.face,previous.mip);renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(previous.scissor);
      renderer.autoClear=previous.clear;renderer.shadowMap.autoUpdate=previous.shadowAuto;renderer.shadowMap.needsUpdate=previous.shadowNeeds;renderer.xr.enabled=previous.xr;
    }
    wasVisible=true;lastRace=raceKey;lastQuality=quality;
  }
  return {camera,diagnostics,render,
    dispose(){if(disposed)return;disposed=true;hide();target?.dispose();target=null;geometry.dispose();material.dispose();diagnostics.targetAllocated=false;diagnostics.disposed=true;}
  };
}

export function createRearViewMirror(options){return createRaceInset({...options,incomingOnly:true});}
