import * as THREE from 'three';
import {createClearwaterSimulation,isClearwaterSupported} from './clearwater-simulation.js';

// Water optics and filtered wave sampling adapted from Aureliengmz/clearwater,
// revision 4bc826134321043a25df3c2b6fed16fb7b9241e8 (MIT, Copyright 2026 Lumaris).
// See vendor/clearwater-LICENSE.txt. The original fullscreen demo is adapted to
// Palm Coast's mesh, shelving beach, lighting and shared Three.js renderer.
export function createClearwaterOcean({shorelineGLSL,time}) {
  const uniforms={...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    coastTime:time,uSurface:{value:null},uCaustics:{value:null},uCausShift:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({name:'coast-clearwater-ocean',fog:true,uniforms,
    vertexShader:/* glsl */`
      varying vec3 vSeaPosition;
      #include <fog_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.0);vSeaPosition=world.xyz;
        vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */`
      uniform sampler2D uSurface,uCaustics;
      uniform vec2 uCausShift;
      uniform float coastTime;
      varying vec3 vSeaPosition;
      #include <fog_pars_fragment>
      ${shorelineGLSL}
      const float IOR=1.3335,PI=3.14159265359,PATCH=4.6,SCALE=2.8;
      const vec3 SUN_DIR=normalize(vec3(50.0,90.0,40.0));
      const vec3 SUN=vec3(1.0,.92,.77)*3.4;
      const vec3 ABSORPTION=vec3(.34,.075,.042),SCATTER=vec3(.018,.055,.066);
      const vec3 EXTINCTION=ABSORPTION+SCATTER;
      const mat2 ROT=mat2(.8,-.6,.6,.8);

      // The alpha channel stores the slope second moment. Mip filtering it
      // lets distant highlights broaden instead of sparkling between pixels.
      vec4 smoothSurface(vec2 uv){
        vec2 size=vec2(textureSize(uSurface,0)),p=uv*size-.5,f=fract(p);p=floor(p);
        vec2 f2=f*f,f3=f2*f;
        vec2 w0=(-f3+3.0*f2-3.0*f+1.0)/6.0,w1=(3.0*f3-6.0*f2+4.0)/6.0;
        vec2 w2=(-3.0*f3+3.0*f2+3.0*f+1.0)/6.0,w3=f3/6.0;
        vec2 g0=w0+w1,g1=w2+w3,h0=(w1/g0-.5+p)/size,h1=(w3/g1+1.5+p)/size;
        // Derivatives of the continuous UV avoid discontinuities at texel edges.
        vec2 dx=dFdx(uv),dy=dFdy(uv);
        return (textureGrad(uSurface,vec2(h0.x,h0.y),dx,dy)*g0.x+textureGrad(uSurface,vec2(h1.x,h0.y),dx,dy)*g1.x)*g0.y
             +(textureGrad(uSurface,vec2(h0.x,h1.y),dx,dy)*g0.x+textureGrad(uSurface,vec2(h1.x,h1.y),dx,dy)*g1.x)*g1.y;
      }
      float fresnel(float ci){
        ci=clamp(ci,0.0,1.0);float ct=sqrt(1.0-(1.0-ci*ci)/(IOR*IOR));
        float rs=(ci-IOR*ct)/(ci+IOR*ct),rp=(IOR*ci-ct)/(IOR*ci+ct);
        return .5*(rs*rs+rp*rp);
      }
      float floorDepth(vec2 p){
        float r=coastRadius(p);
        // Matches the visible sand mesh through the waterline, then continues
        // down a submerged shelf beyond the island's finite terrain geometry.
        float beach=-.65+1.65*smoothstep(1.04,1.22,r);
        float shelf=smoothstep(1.22,1.9,r);
        return max(.005,beach+shelf*(12.0+coastNoise(p*.065)*2.0));
      }
      vec3 reflectedSky(vec3 d){
        float h=max(d.y,0.0);
        vec3 color=mix(vec3(.24,.53,.64),vec3(.025,.18,.39),pow(h,.4));
        color+=vec3(.22,.16,.08)*pow(max(dot(d,SUN_DIR),0.0),64.0);
        vec2 uv=d.xz/(.35+h)*2.8;
        float n=coastNoise(uv)*.55+coastNoise(uv*2.03)*.28+coastNoise(uv*4.11)*.12+coastNoise(uv*8.3)*.05;
        float cloud=smoothstep(.58,.74,n)*smoothstep(.06,.16,h)*(1.0-smoothstep(.6,.85,h));
        return mix(color,vec3(.78,.84,.84)*(1.0+n*.18),cloud);
      }
      vec3 sandFloor(vec2 p){
        float broad=coastNoise(p*.055),grain=coastNoise(p*24.0);
        vec3 sand=mix(vec3(.64,.47,.25),vec3(.82,.68,.43),broad*.45+.48);
        sand*=vec3(.73,.79,.78)*(.965+grain*.07);
        // Fine sand ridges and sparse dark grains remain anchored to the bed
        // while the refracted view and the light pattern move independently.
        float ridges=.5+.5*sin(dot(p,vec2(.93,.37))*12.0+3.0*coastNoise(p*.6));
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        sand*=1.0+(.06*(ridges-.5)+.08*(grain-.5))*(1.0-smoothstep(.08,.6,footprint));
        return sand;
      }
      void main(){
        vec3 view=normalize(cameraPosition-vSeaPosition);
        vec2 p=vSeaPosition.xz;
        float distanceToEye=length(cameraPosition-vSeaPosition),depth=floorDepth(p);
        float shoreDamping=smoothstep(.015,.4,depth);
        // Two scales of the same evolving spectrum break up the repeated patch.
        vec4 a=smoothSurface(p/(PATCH*SCALE));
        vec4 b=smoothSurface(ROT*p/(PATCH*SCALE*.41)+.37);
        vec2 slope=(a.yz+.20*(transpose(ROT)*b.yz))*shoreDamping;
        float variance=max(a.w-dot(a.yz,a.yz),0.0)+.04*max(b.w-dot(b.yz,b.yz),0.0);
        vec3 normal=normalize(vec3(-slope.x,1.0,-slope.y));
        float nv=dot(normal,view);
        if(nv<.02){normal=normalize(normal+view*(.02-nv));nv=dot(normal,view);}
        float F=fresnel(nv);
        vec3 reflected=reflect(-view,normal);reflected.y=abs(reflected.y);
        vec3 reflection=reflectedSky(reflected);

        // Beckmann sun glints with mip-derived slope variance (Clearwater).
        float a2=.00035+1.2*variance;
        vec3 halfVector=normalize(view+SUN_DIR);
        float nh=max(dot(normal,halfVector),0.0),nl=max(dot(normal,SUN_DIR),0.0);
        float c2=max(nh*nh,1e-4),tan2=(1.0-c2)/c2;
        float D=exp(-tan2/a2)/(PI*a2*c2*c2);
        float visibility=.5/(nl*sqrt(nv*nv*(1.0-a2)+a2)+nv*sqrt(nl*nl*(1.0-a2)+a2)+1e-5);
        vec3 specular=SUN*min(D*visibility*fresnel(max(dot(halfVector,view),0.0))*nl,8.0);

        // Refract the eye ray into the actual sloping seabed. Iterating depth
        // keeps the sand's apparent position stable at the curved shoreline.
        vec3 ray=refract(-view,normal,1.0/IOR);
        float path=depth/max(-ray.y,.05);vec2 floorP=p+ray.xz*path;
        for(int i=0;i<2;i++){depth=floorDepth(floorP);path=depth/max(-ray.y,.05);floorP=p+ray.xz*path;}
        vec3 sunRay=refract(-SUN_DIR,vec3(0,1,0),1.0/IOR);
        vec2 causticUv=(floorP/SCALE-uCausShift)/PATCH;
        // Mipmaps and a depth envelope soften light concentrations offshore.
        vec3 caustic=texture2D(uCaustics,causticUv,.7).rgb;
        caustic=mix(vec3(1.0),min(caustic,vec3(5.0)),.75*exp(-depth*.14)*shoreDamping);
        float transmittedSun=1.0-fresnel(SUN_DIR.y);
        vec3 skyIrradiance=vec3(.62,.76,.85)*PI*.30;
        vec3 direct=SUN*transmittedSun*exp(-EXTINCTION*depth/(-sunRay.y))*caustic*(-sunRay.y);
        vec3 ambient=skyIrradiance*exp(-(ABSORPTION+.4*SCATTER)*depth*1.25);
        vec3 floorLight=sandFloor(floorP)/PI*(direct+ambient);
        vec3 transmission=exp(-EXTINCTION*path);
        float cosS=dot(sunRay,-ray),g=.8;
        float phase=(1.0-g*g)/(4.0*PI*pow(1.0+g*g-2.0*g*cosS,1.5));
        vec3 middle=SUN*transmittedSun*exp(-EXTINCTION*depth*.5/(-sunRay.y))*(phase+.02)
                  +skyIrradiance*exp(-ABSORPTION*depth*.6)/(4.0*PI);
        vec3 scatter=SCATTER/EXTINCTION*middle*(1.0-transmission)*3.2;
        // Open sea has a deep blue ambient contribution from the water column.
        scatter+=vec3(.008,.055,.08)*(1.0-transmission);
        vec3 color=F*reflection+(1.0-F)*(floorLight*transmission+scatter)+specular;

        float shore=(coastRadius(p)-1.117)*135.0;
        float surge=sin(coastTime*.9+coastNoise(p*.15)*2.0)*.35;
        float front=sin(shore*1.7-coastTime*1.2+coastNoise(p*.21)*1.9);
        float foam=pow(max(front,0.0),12.0)*exp(-max(shore,0.0)*.26);
        foam*=smoothstep(-.15,.8,shore)*(1.0-smoothstep(6.0,14.0,shore));
        foam*=.35+.65*coastNoise(p*2.5+coastTime*.18);
        float lip=(1.0-smoothstep(.08,.75,abs(shore-.35-surge)))*.28;
        color=mix(color,vec3(.79,.87,.80),clamp(foam*.62+lip,0.0,.75));
        gl_FragColor=vec4(max(color,0.0),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const diagnostics={mode:'pending',source:'Clearwater',simulation:null,refraction:'shelving-seabed',reflection:'analytic-sky',reflectionPasses:0};
  let simulation=null,enabled=true,disposed=false,supported;
  function release(){simulation?.dispose();simulation=null;uniforms.uSurface.value=null;uniforms.uCaustics.value=null;diagnostics.simulation=null;}
  return {material,diagnostics,
    beforeRender(renderer,camera,options={}){
      if(disposed||!enabled)return false;
      // Insets share the last main-view simulation and cannot allocate/update it.
      if(options.rearView||camera.userData.rearView)return !!simulation;
      supported??=isClearwaterSupported(renderer);
      if(!supported){diagnostics.mode='fallback';return false;}
      if(!simulation){
        simulation=createClearwaterSimulation(renderer);
        uniforms.uSurface.value=simulation.surface;uniforms.uCaustics.value=simulation.caustics;
        uniforms.uCausShift.value.copy(simulation.causticShift);diagnostics.simulation=simulation.diagnostics;
      }
      simulation.update(time.value);diagnostics.mode='fft';return true;
    },
    setQuality(quality){enabled=quality==='high';if(!enabled){release();diagnostics.mode='disabled';}else diagnostics.mode=simulation?'fft':'pending';},
    dispose(){if(disposed)return;disposed=true;release();material.dispose();diagnostics.mode='disabled';}
  };
}
