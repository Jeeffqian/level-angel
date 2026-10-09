import * as THREE from 'three';
import {createClearwaterOcean} from './clearwater-ocean.js';

// Original coastal surfaces. The collision/playable area remains flat; only the
// beach outside it slopes into the sea. No reflection render target is needed.
const shorelineGLSL=`
  float coastRadius(vec2 p) {
    vec2 q=p/vec2(160.0,127.0);
    float a=atan(q.y,q.x);
    return length(q)/(1.0+0.012*sin(a*3.0)+0.007*sin(a*7.0+1.1)+0.004*sin(a*13.0));
  }
  float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float coastNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
  }
`;

export function createCoastSurface(parent) {
  const root=new THREE.Group();root.name='coast-high-surfaces';parent.add(root);
  const time={value:0},positions=[],uvs=[],indices=[],rings=38,segments=192;
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++) {
    const a=i/segments*Math.PI*2,r=ring/rings*1.27;
    const edge=1+.012*Math.sin(a*3)+.007*Math.sin(a*7+1.1)+.004*Math.sin(a*13);
    const slope=THREE.MathUtils.smoothstep(r,1.04,1.22);
    positions.push(Math.cos(a)*160*r*edge,-.01-slope*1.65,Math.sin(a)*127*r*edge);
    uvs.push(i/segments,ring/rings);
    if(ring<rings&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
  }
  const groundGeometry=new THREE.BufferGeometry();groundGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));groundGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));groundGeometry.setIndex(indices);groundGeometry.computeVertexNormals();
  const groundMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.96});groundMaterial.name='coast-grass-and-sand';
  groundMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vCoastPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCoastPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader='varying vec3 vCoastPosition;\n'+shorelineGLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=vCoastPosition.xz;
      float broad=coastNoise(p*.055),tufts=coastNoise(p*1.8),grain=coastNoise(p*24.0);
      float r=coastRadius(p);
      float beach=smoothstep(.94,1.015,r+(coastNoise(p*.18)-.5)*.018);
      vec3 turf=mix(vec3(.075,.19,.033),vec3(.145,.29,.07),broad);
      turf*=.92+tufts*.14+grain*.055;
      vec3 sand=mix(vec3(.64,.47,.25),vec3(.82,.68,.43),broad*.45+.48);
      sand*=.965+grain*.07;
      sand=mix(sand,sand*vec3(.73,.79,.78),smoothstep(1.06,1.12,r));
      diffuseColor.rgb*=mix(turf,sand,beach);
    `);
  };
  groundMaterial.customProgramCacheKey=()=> 'coast-ground-v1';
  const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.name='coast-continuous-terrain';ground.receiveShadow=true;root.add(ground);

  const waterMaterial=new THREE.ShaderMaterial({
    name:'coast-shallow-water',fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),coastTime:time},
    vertexShader:`varying vec3 vSeaPosition;
      #include <fog_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.0);vSeaPosition=world.xyz;
        vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform float coastTime;varying vec3 vSeaPosition;
      #include <fog_pars_fragment>
      ${shorelineGLSL}
      void main(){
        vec2 p=vSeaPosition.xz;float t=coastTime;
        float r=coastRadius(p),depth=smoothstep(1.10,1.55,r);
        float w1=dot(p,vec2(.58,.81))*.72-t*1.25;
        float w2=dot(p,vec2(-.87,.49))*1.28-t*1.8;
        float w3=dot(p,vec2(.94,-.34))*2.7+t*1.1;
        vec2 slope=vec2(.58,.81)*cos(w1)*.085+vec2(-.87,.49)*cos(w2)*.05+vec2(.94,-.34)*cos(w3)*.025;
        slope+=(vec2(coastNoise(p*3.1+t*.16),coastNoise(p*3.1-t*.12+31.0))-.5)*.045;
        vec3 normal=normalize(vec3(-slope.x,1.0,-slope.y));
        vec3 eye=normalize(cameraPosition-vSeaPosition);
        float fresnel=.035+.58*pow(1.0-max(dot(normal,eye),0.0),4.0);
        vec3 shallow=vec3(.095,.51,.43),deep=vec3(.018,.25,.36);
        vec3 color=mix(shallow,deep,depth);
        // Soft moving sand caustics only in the transparent-looking shallows.
        float caustic=pow(max(0.0,sin(p.x*.77+sin(p.y*.51+t*.5))+sin(p.y*.89+sin(p.x*.43-t*.4)))*.5,5.0);
        color+=vec3(.12,.15,.065)*caustic*(1.0-depth)*.8;
        vec3 reflectedSky=mix(vec3(.48,.71,.76),vec3(.22,.49,.66),max(reflect(-eye,normal).y,0.0));
        color=mix(color,reflectedSky,fresnel);
        vec3 sun=normalize(vec3(50.0,90.0,40.0));
        float glitter=pow(max(dot(normal,normalize(sun+eye)),0.0),260.0);
        color+=vec3(1.0,.83,.51)*glitter*1.2;
        // Two uneven wash fronts follow the same contour as the beach mesh.
        float shore=(r-1.111)*135.0;
        float wave=sin(shore*1.7-t*1.2+coastNoise(p*.21)*1.9);
        float foam=pow(max(wave,0.0),12.0)*exp(-max(shore,0.0)*.22);
        foam*=smoothstep(-.15,.8,shore)*(1.0-smoothstep(8.0,19.0,shore));
        foam*=.35+.65*coastNoise(p*2.5+t*.18);
        float lip=(1.0-smoothstep(.0,.8,abs(shore-.4-sin(t*.8)*.25)))*.36;
        color=mix(color,vec3(.79,.87,.78),clamp(foam*.68+lip,0.0,.75));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  // Keep the inexpensive shader as a capability fallback on High devices that
  // cannot render/filter floating-point textures. Performance uses world.js's
  // original simple ocean and never creates a wave simulation.
  const clearwater=createClearwaterOcean({shorelineGLSL,time});
  const waterGeometry=new THREE.PlaneGeometry(2800,2800),water=new THREE.Mesh(waterGeometry,waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=-.66;water.name='coast-animated-ocean';root.add(water);
  const skyGeometry=new THREE.SphereGeometry(550,32,16),skyMaterial=new THREE.ShaderMaterial({
    name:'coast-sky',side:THREE.BackSide,depthWrite:false,
    vertexShader:'varying vec3 vSkyDirection;void main(){vSkyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 vSkyDirection;
      ${shorelineGLSL}
      void main(){vec3 d=normalize(vSkyDirection);float h=max(d.y,0.0);
        vec3 color=mix(vec3(.24,.53,.64),vec3(.025,.18,.39),pow(h,.4));
        float glow=pow(max(dot(d,normalize(vec3(50.0,90.0,40.0))),0.0),64.0);
        color+=vec3(.22,.16,.08)*glow;
        vec2 cloudUV=d.xz/(.35+max(d.y,0.0))*2.8;
        float cloudNoise=coastNoise(cloudUV)*.55+coastNoise(cloudUV*2.03)*.28+coastNoise(cloudUV*4.11)*.12+coastNoise(cloudUV*8.3)*.05;
        float cloud=smoothstep(.58,.74,cloudNoise)*smoothstep(.06,.16,h)*(1.0-smoothstep(.6,.85,h));
        color=mix(color,vec3(.78,.84,.84)*(1.0+cloudNoise*.18),cloud);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky=new THREE.Mesh(skyGeometry,skyMaterial);sky.name='coast-gradient-sky';sky.renderOrder=-1000;sky.frustumCulled=false;root.add(sky);
  const diagnostics={continuousBeach:true,animatedWaves:true,shoreFoam:true,caustics:true,reflection:'analytic-sky',reflectionPasses:0,clearwater:clearwater.diagnostics,drawCalls:3,triangles:indices.length/3+2+960,time:0};
  let disposed=false;
  return {root,diagnostics,update(value){time.value=value;diagnostics.time=value;},
    setQuality(quality){clearwater.setQuality(quality);if(quality!=='high')water.material=waterMaterial;},
    beforeRender(renderer,camera,options={}){
      camera.getWorldPosition(sky.position);root.worldToLocal(sky.position);
      water.material=clearwater.beforeRender(renderer,camera,options)?clearwater.material:waterMaterial;
    },
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();clearwater.dispose();for(const g of [groundGeometry,waterGeometry,skyGeometry])g.dispose();for(const m of [groundMaterial,waterMaterial,skyMaterial])m.dispose();root.clear();}
  };
}
