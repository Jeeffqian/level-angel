import * as THREE from 'three';

// Adapted from Clearwater by Aurélien / Lumaris (MIT), index.html ocean FFT
// and refracted-grid caustics sections, revision below. Original algorithm:
// https://github.com/Aureliengmz/clearwater/tree/4bc826134321043a25df3c2b6fed16fb7b9241e8
// License: ./vendor/clearwater-LICENSE.txt. This adapter reduces resolutions
// and computes monochrome caustics with one IOR instead of three spectral draws.
const REVISION='4bc826134321043a25df3c2b6fed16fb7b9241e8';
const N=128,LOG_N=7,GRID=64,CAUSTIC_SIZE=512,PATCH_SIZE=4.6,DEPTH=1.6,TARGET_SLOPE=.078,IOR=1.3335;
const FULLSCREEN_VERTEX=`precision highp float;
  in vec3 position;
  void main(){gl_Position=vec4(position.xy,0.0,1.0);}`;
const FRAGMENT_HEAD=`precision highp float;precision highp sampler2D;precision highp int;
  out vec4 result;
  vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
`;

export function isClearwaterSupported(renderer) {
  return !!(renderer?.extensions?.has('EXT_color_buffer_float')&&renderer.extensions.has('OES_texture_float_linear'));
}

function sourceSpectrum() {
  let seed=7;
  function random(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}
  function gaussian(){let u=0;while(!u)u=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*random());}
  const real=new Float32Array(N*N),imaginary=new Float32Array(N*N),kp=2*Math.PI/.62,kcut=2*Math.PI/.045;
  let slopeVariance=0;
  for(let row=0;row<N;row++)for(let col=0;col<N;col++) {
    const nx=col<N/2?col:col-N,nz=row<N/2?row:row-N,kx=2*Math.PI*nx/PATCH_SIZE,kz=2*Math.PI*nz/PATCH_SIZE,k=Math.hypot(kx,kz);
    let power=0;
    if(k>1e-6){
      const log=Math.log(k/kp),bump=Math.exp(-.5*(log/.36)**2),tail=.035*Math.exp(-((kp/k)**2))*Math.exp(-((k/kcut)**2));
      const swell=.35*Math.exp(-.5*(Math.log(k/(2*Math.PI/1.6))/.3)**2),alignment=(kx*.8+kz*.6)/k;
      const spread=(.3+.7*alignment*alignment)*(alignment<0?.35:1);power=(bump+tail+swell)*spread/(k*k*k*k);
    }
    const amplitude=Math.sqrt(power/2),i=row*N+col;real[i]=gaussian()*amplitude;imaginary[i]=gaussian()*amplitude;
    slopeVariance+=2*k*k*(real[i]*real[i]+imaginary[i]*imaginary[i]);
  }
  const scale=TARGET_SLOPE/Math.sqrt(slopeVariance),pixels=new Float32Array(N*N*4);
  for(let row=0;row<N;row++)for(let col=0;col<N;col++) {
    const i=row*N+col,opposite=((N-row)%N)*N+(N-col)%N;
    pixels[i*4]=real[i]*scale;pixels[i*4+1]=imaginary[i]*scale;pixels[i*4+2]=real[opposite]*scale;pixels[i*4+3]=-imaginary[opposite]*scale;
  }
  const texture=new THREE.DataTexture(pixels,N,N,THREE.RGBAFormat,THREE.FloatType);
  texture.name='Clearwater H0 spectrum';texture.minFilter=texture.magFilter=THREE.NearestFilter;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=false;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
  return texture;
}

/** Isolated offscreen computation. No world scene or main camera is rendered. */
export function createClearwaterSimulation(renderer) {
  if(!isClearwaterSupported(renderer))throw new Error('Clearwater requires EXT_color_buffer_float and OES_texture_float_linear.');
  function target(size,type,mipmaps,name) {
    const rt=new THREE.WebGLRenderTarget(size,size,{type,format:THREE.RGBAFormat,depthBuffer:false,stencilBuffer:false,
      minFilter:mipmaps?THREE.LinearMipmapLinearFilter:THREE.NearestFilter,magFilter:mipmaps?THREE.LinearFilter:THREE.NearestFilter,
      wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,generateMipmaps:mipmaps});
    rt.texture.name=name;rt.texture.colorSpace=THREE.NoColorSpace;
    if(mipmaps)rt.texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return rt;
  }
  const h0=sourceSpectrum(),fftA=target(N,THREE.FloatType,false,'Clearwater FFT A'),fftB=target(N,THREE.FloatType,false,'Clearwater FFT B');
  const surfaceTarget=target(N,THREE.HalfFloatType,true,'Clearwater resolved height and slopes');
  const causticTarget=target(CAUSTIC_SIZE,THREE.HalfFloatType,true,'Clearwater refracted caustics');
  const targets=[fftA,fftB,surfaceTarget,causticTarget];
  function shader(name,fragmentShader,uniforms,vertexShader=FULLSCREEN_VERTEX) {
    return new THREE.RawShaderMaterial({name,glslVersion:THREE.GLSL3,vertexShader,fragmentShader,uniforms,
      depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
  }
  const spectrum=shader('Clearwater time spectrum',FRAGMENT_HEAD+`
    uniform sampler2D source;uniform float time;
    void main(){
      ivec2 id=ivec2(gl_FragCoord.xy);vec4 s=texelFetch(source,id,0);
      vec2 n=vec2(id);n-=step(64.0,n)*128.0;
      vec2 k=6.28318530718*n/4.6;float magnitude=length(k);
      float omega=sqrt(9.81*magnitude+7.4e-5*magnitude*magnitude*magnitude);
      float fundamental=6.28318530718/60.0;omega=floor(omega/fundamental)*fundamental;
      float c=cos(omega*time),sn=sin(omega*time);
      vec2 H=cmul(s.xy,vec2(c,sn))+cmul(s.zw,vec2(c,-sn));
      // Pack h + i*dhdx and dhdz into the two complex FFT channels.
      result=vec4(H-k.x*H,vec2(-k.y*H.y,k.y*H.x));
    }`,{source:{value:h0},time:{value:0}});
  const transform=shader('Clearwater Stockham FFT',FRAGMENT_HEAD+`
    uniform sampler2D source;uniform int butterflySize;uniform int horizontal;
    void main(){
      ivec2 id=ivec2(gl_FragCoord.xy);int j=horizontal==1?id.x:id.y;
      int k=j&(butterflySize-1),i=((j-(j&(2*butterflySize-1)))>>1)+k;
      bool subtract=(j&butterflySize)!=0;
      ivec2 a=horizontal==1?ivec2(i,id.y):ivec2(id.x,i);
      ivec2 b=horizontal==1?ivec2(i+64,id.y):ivec2(id.x,i+64);
      vec4 x0=texelFetch(source,a,0),x1=texelFetch(source,b,0);
      float angle=3.14159265359*float(k)/float(butterflySize);vec2 w=vec2(cos(angle),sin(angle));
      vec4 product=vec4(cmul(w,x1.xy),cmul(w,x1.zw));result=subtract?x0-product:x0+product;
    }`,{source:{value:null},butterflySize:{value:1},horizontal:{value:1}});
  const resolve=shader('Clearwater height slope resolve',FRAGMENT_HEAD+`
    uniform sampler2D source;
    void main(){vec4 s=texelFetch(source,ivec2(gl_FragCoord.xy),0);vec2 slope=vec2(s.y,s.z);result=vec4(s.x,slope,dot(slope,slope));}
  `,{source:{value:null}});
  // Match Palm Coast's directional light and water material rather than the
  // original standalone demo's low sun angle.
  const sun=new THREE.Vector3(50,90,40).normalize();
  const sineIncident=Math.sqrt(1-sun.y*sun.y),sineTransmitted=sineIncident/IOR,cosineTransmitted=Math.sqrt(1-sineTransmitted*sineTransmitted);
  const horizontal=Math.hypot(sun.x,sun.z)||1,shiftScale=DEPTH*sineTransmitted/cosineTransmitted/horizontal;
  const causticShift=new THREE.Vector2(-sun.x*shiftScale,-sun.z*shiftScale);
  const caustic=shader('Clearwater refracted-grid caustics',`precision highp float;
    in vec2 original;out vec4 result;uniform float normalization;
    void main(){vec2 a=dFdx(original),b=dFdy(original);float area=abs(a.x*b.y-a.y*b.x);float intensity=min(area*normalization,40.0);result=vec4(intensity);}
  `,{surface:{value:surfaceTarget.texture},sun:{value:sun},shift:{value:causticShift},normalization:{value:(CAUSTIC_SIZE/PATCH_SIZE)**2}},
  `precision highp float;precision highp sampler2D;precision highp int;
    in vec3 position;uniform sampler2D surface;uniform vec3 sun;uniform vec2 shift;out vec2 original;
    void main(){
      vec2 uv=position.xy;ivec2 offset=ivec2(gl_InstanceID%3-1,gl_InstanceID/3-1);vec4 s=textureLod(surface,uv,0.0);
      vec3 normal=normalize(vec3(-s.y,1.0,-s.z)),ray=refract(-sun,normal,1.0/1.3335);
      vec3 P=vec3(uv.x*4.6,s.x,uv.y*4.6),floorPoint=P+ray*((-1.6-s.x)/ray.y);
      original=uv*4.6;vec2 projected=(floorPoint.xz-shift)/4.6+vec2(offset);
      gl_Position=vec4(projected*2.0-1.0,0.0,1.0);
    }`);
  // Photon energy sums directly, including folded triangles. Alpha-weighted
  // additive blending would square the intensity and break flux conservation.
  caustic.transparent=true;caustic.side=THREE.DoubleSide;caustic.forceSinglePass=true;caustic.blending=THREE.CustomBlending;
  caustic.blendEquation=caustic.blendEquationAlpha=THREE.AddEquation;
  caustic.blendSrc=caustic.blendDst=caustic.blendSrcAlpha=caustic.blendDstAlpha=THREE.OneFactor;
  const materials=[spectrum,transform,resolve,caustic];
  const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const grid=new THREE.InstancedBufferGeometry(),vertices=new Float32Array((GRID+1)*(GRID+1)*3),indices=new Uint16Array(GRID*GRID*6);
  let vertex=0,index=0;
  for(let row=0;row<=GRID;row++)for(let col=0;col<=GRID;col++){vertices[vertex++]=col/GRID;vertices[vertex++]=row/GRID;vertices[vertex++]=0;}
  for(let row=0;row<GRID;row++)for(let col=0;col<GRID;col++){const a=row*(GRID+1)+col,b=a+1,c=a+GRID+1,d=c+1;indices[index++]=a;indices[index++]=b;indices[index++]=c;indices[index++]=b;indices[index++]=d;indices[index++]=c;}
  grid.setAttribute('position',new THREE.BufferAttribute(vertices,3));grid.setIndex(new THREE.BufferAttribute(indices,1));grid.instanceCount=9;
  const quadScene=new THREE.Scene(),causticScene=new THREE.Scene(),camera=new THREE.Camera();
  const quad=new THREE.Mesh(triangle,spectrum),gridMesh=new THREE.Mesh(grid,caustic);quad.frustumCulled=gridMesh.frustumCulled=false;
  quadScene.add(quad);causticScene.add(gridMesh);
  const oldCurrentViewport=new THREE.Vector4(),oldLogicalViewport=new THREE.Vector4(),oldLogicalScissor=new THREE.Vector4();
  const oldTargetViewport=new THREE.Vector4(),oldTargetScissor=new THREE.Vector4(),scratchFloor=new THREE.Vector4(),scratchRound=new THREE.Vector4(),oldClearColor=new THREE.Color();
  const context=renderer.getContext();
  const diagnostics={sourceRevision:REVISION,initialized:false,disposed:false,updates:0,passes:0,lastPasses:0,skippedUpdates:0,
    fftResolution:N,causticResolution:CAUSTIC_SIZE,causticGrid:GRID,causticInstances:9,refreshHz:30,targetSlope:TARGET_SLOPE,
    time:null,lastTriangles:0,allocatedResources:{renderTargets:4,textures:5,geometries:2,materials:4}};
  let lastTime=-Infinity,disposed=false;
  function draw(target,material){quad.material=material;renderer.setRenderTarget(target);renderer.render(quadScene,camera);diagnostics.passes++;diagnostics.lastPasses++;}
  function update(timeSeconds) {
    if(disposed||!Number.isFinite(timeSeconds))return false;
    if(diagnostics.initialized&&(timeSeconds===lastTime||(timeSeconds>lastTime&&timeSeconds-lastTime<1/30-1e-9))){diagnostics.skippedUpdates++;return false;}
    const previousTarget=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    renderer.getCurrentViewport(oldCurrentViewport);renderer.getViewport(oldLogicalViewport);renderer.getScissor(oldLogicalScissor);renderer.getClearColor(oldClearColor);
    // RT binding and setViewport/setScissor use different pixel conventions
    // in r180. Keep the caller's logical values untouched, and snapshot the
    // physical target state as well (including explicit overrides after bind).
    const ratio=renderer.getPixelRatio();scratchFloor.copy(oldLogicalScissor).multiplyScalar(ratio).floor();scratchRound.copy(oldLogicalScissor).multiplyScalar(ratio).round();
    const actualScissor=previousTarget||!scratchFloor.equals(scratchRound)?context.getParameter(context.SCISSOR_BOX):null;
    const actualScissorTest=previousTarget?context.isEnabled(context.SCISSOR_TEST):false;
    const clearAlpha=renderer.getClearAlpha(),scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate,xr=renderer.xr.enabled,infoReset=renderer.info.autoReset;
    diagnostics.lastPasses=0;
    try {
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;renderer.info.autoReset=false;
      renderer.autoClear=false;renderer.setScissorTest(false);
      spectrum.uniforms.time.value=((timeSeconds%60)+60)%60;draw(fftA,spectrum);
      let source=fftA,destination=fftB;
      for(let axis=1;axis>=0;axis--)for(let stage=0;stage<LOG_N;stage++) {
        transform.uniforms.source.value=source.texture;transform.uniforms.butterflySize.value=1<<stage;transform.uniforms.horizontal.value=axis;
        draw(destination,transform);const swap=source;source=destination;destination=swap;
      }
      resolve.uniforms.source.value=source.texture;draw(surfaceTarget,resolve);
      // Three r180 generates render-target mipmaps at the end of render().
      renderer.setRenderTarget(causticTarget);renderer.setClearColor(0x000000,0);renderer.clear(true,false,false);renderer.render(causticScene,camera);
      diagnostics.passes++;diagnostics.lastPasses++;diagnostics.updates++;diagnostics.initialized=true;diagnostics.time=timeSeconds;
      diagnostics.lastTriangles=16+GRID*GRID*2*9;lastTime=timeSeconds;return true;
    } finally {
      renderer.setScissorTest(scissorTest);
      if(previousTarget){
        oldTargetViewport.copy(previousTarget.viewport);oldTargetScissor.copy(previousTarget.scissor);const targetScissorTest=previousTarget.scissorTest;
        previousTarget.viewport.copy(oldCurrentViewport);previousTarget.scissor.fromArray(actualScissor);previousTarget.scissorTest=actualScissorTest;
        try{renderer.setRenderTarget(previousTarget,face,mip);}
        finally{previousTarget.viewport.copy(oldTargetViewport);previousTarget.scissor.copy(oldTargetScissor);previousTarget.scissorTest=targetScissorTest;}
      }else {
        renderer.setRenderTarget(null,face,mip);
        // Main-target binding floors physical pixels, but setViewport rounds.
        // Reapply a previous explicit viewport only when those differ (DPR1.6,
        // fractional UI coordinates, etc.), preserving both logical/API state.
        renderer.getCurrentViewport(scratchFloor);
        if(!scratchFloor.equals(oldCurrentViewport))renderer.setViewport(oldLogicalViewport);
        if(actualScissor)renderer.state.scissor(oldTargetScissor.fromArray(actualScissor));
      }
      renderer.setClearColor(oldClearColor,clearAlpha);renderer.autoClear=autoClear;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;renderer.xr.enabled=xr;renderer.info.autoReset=infoReset;
    }
  }
  return {surface:surfaceTarget.texture,caustics:causticTarget.texture,causticShift,patchSize:PATCH_SIZE,depth:DEPTH,diagnostics,update,
    dispose(){if(disposed)return;disposed=true;quadScene.clear();causticScene.clear();h0.dispose();targets.forEach(rt=>rt.dispose());triangle.dispose();grid.dispose();materials.forEach(material=>material.dispose());
      diagnostics.disposed=true;diagnostics.initialized=false;Object.assign(diagnostics.allocatedResources,{renderTargets:0,textures:0,geometries:0,materials:0});}
  };
}
