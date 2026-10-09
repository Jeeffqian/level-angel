import * as THREE from 'three';

const DETAILS=[8,4,1],VARIANTS=6,CELL=72;
const randomFor=initial=>{let seed=initial>>>0;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const vector=()=>new THREE.Vector3();

// Broad fracture planes give each boulder a silhouette; smaller erosion rounds
// their intersections. All three resolutions evaluate the same radial surface.
function boulder(variant,detail){
  const random=randomFor(29173+variant*8311),planes=[];
  for(let i=0;i<11;i++){
    const angle=i*2.39996+random()*.6,y=-.75+random()*1.6;
    planes.push({normal:new THREE.Vector3(Math.cos(angle),y,Math.sin(angle)).normalize(),offset:.72+random()*.22});
  }
  planes.push({normal:new THREE.Vector3(.12,1,.08).normalize(),offset:.66+random()*.15});
  const source=new THREE.IcosahedronGeometry(1,detail),p=source.attributes.position;
  const positions=[],indices=[],lookup=new Map(),direction=vector();
  for(let i=0;i<p.count;i++){
    direction.fromBufferAttribute(p,i).normalize();
    const {x,y,z}=direction,phase=variant*1.73;
    let radius=.94+.035*Math.sin(x*4.3+y*2.1+phase)*Math.cos(z*3.7-phase)+.022*Math.cos(y*7.1-x*2.4+z*4.1+phase);
    for(const plane of planes){
      const dot=direction.dot(plane.normal);
      if(dot>0){const cut=plane.offset/dot,h=Math.max(.055-Math.abs(radius-cut),0)/.055;radius=Math.min(radius,cut)-h*h*.055*.25;}
    }
    // Pits do not change the coarse silhouette, avoiding visible LOD jumps.
    const erosion=.012*Math.sin(x*23+y*14+phase)*Math.sin(z*19-y*13+phase);
    radius=Math.min(.995,radius+erosion);
    const key=[x,y,z].map(n=>Math.round(n*1e6)).join(',');
    if(!lookup.has(key)){lookup.set(key,positions.length/3);positions.push(x*radius,y*radius,z*radius);}
    indices.push(lookup.get(key));
  }
  source.dispose();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

const stoneGLSL=/* glsl */`
  varying vec3 vRockPosition;
  varying float vRockUp;
  float rockHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
  float rockNoise(vec3 p){
    vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  vec3 rockBump(vec3 viewPosition,vec3 surfaceNormal,float height){
    vec3 dx=dFdx(viewPosition),dy=dFdy(viewPosition);
    vec3 r1=cross(dy,surfaceNormal),r2=cross(surfaceNormal,dx);
    float determinant=dot(dx,r1);
    vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
    return normalize(max(abs(determinant),1e-12)*surfaceNormal-gradient);
  }
`;

function stoneMaterial(style){
  const valley=style==='valley',material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.91});
  material.name=valley?'weathered-river-granite':'weathered-coastal-limestone';
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vRockPosition;varying float vRockUp;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vRockPosition=(modelMatrix*vec4(transformed,1.0)).xyz;
      vRockUp=inverseTransformDirection(transformedNormal,viewMatrix).y;
    `);
    shader.fragmentShader=stoneGLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 rockP=vRockPosition;
      float rockMacro=rockNoise(rockP*.87),rockMedium=rockNoise(rockP*5.4+13.4);
      float rockFootprint=max(length(dFdx(rockP)),length(dFdy(rockP)));
      float rockDetailFade=1.0-smoothstep(.025,.14,rockFootprint);
      float rockGrain=mix(.5,rockNoise(rockP*28.0),rockDetailFade);
      float rockVein=abs(sin(dot(rockP,vec3(.71,1.31,.38))*3.1+rockMacro*4.0+rockMedium*.45));
      float rockCrack=(1.0-smoothstep(.015,.065+rockFootprint,rockVein))*smoothstep(.37,.64,rockMedium);
      float rockWet=${valley?'(1.0-smoothstep(-.42,-.08+rockMacro*.1,rockP.y))':'0.0'};
      float rockMoss=${valley?'smoothstep(.45,.68,rockMacro+rockMedium*.17)*smoothstep(.1,.85,vRockUp)*(1.0-rockWet*.6)':'smoothstep(.65,.86,rockMacro+rockMedium*.1)*smoothstep(.35,.85,vRockUp)*.16'};
      diffuseColor.rgb*=.78+rockMacro*.30+rockMedium*.16+(rockGrain-.5)*.10;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.79,.74,.64),smoothstep(.60,.78,rockMedium)*.32);
      diffuseColor.rgb*=1.0-rockCrack*.25;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.105,.145,.062)*(.75+rockMedium*.5),rockMoss*.72);
      diffuseColor.rgb*=mix(vec3(1.0),vec3(.53,.60,.61),rockWet);
      float rockRelief=(rockMedium*.020+(rockGrain-.5)*.0025-rockCrack*.012)*rockDetailFade;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(rockMedium-.5)*.1-rockWet*.40+rockMoss*.06,.4,1.0);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      normal=rockBump(-vViewPosition,normal,rockRelief);
    `);
  };
  material.customProgramCacheKey=()=> 'weathered-rock-v1-'+style;return material;
}

function mergeRocks(items,templates,style){
  const positions=[],normals=[],colors=[],indices=[],dummy=new THREE.Object3D(),normalMatrix=new THREE.Matrix3(),position=vector(),normal=vector();
  for(const {placement,index} of items){
    const random=randomFor(placement.seed??(19237+index*3727)),variant=Math.floor(random()*VARIANTS),geometry=templates[variant];
    dummy.position.fromArray(placement.position);dummy.scale.fromArray(placement.scale??[1,1,1]);dummy.rotation.fromArray([...(placement.rotation??[0,0,0]),'XYZ']);dummy.updateMatrix();
    normalMatrix.getNormalMatrix(dummy.matrix);
    const palette=style==='valley'?['#939891','#868d89','#9b9c92','#8d918c','#a0a097','#818c87']:['#ada99a','#b7b09d','#9c9d94','#b1aa99','#a4a191','#aaa99f'];
    const color=new THREE.Color(palette[variant]).multiplyScalar(.88+random()*.20),base=positions.length/3;
    for(let i=0;i<geometry.attributes.position.count;i++){
      position.fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(dummy.matrix);normal.fromBufferAttribute(geometry.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
      positions.push(position.x,position.y,position.z);normals.push(normal.x,normal.y,normal.z);colors.push(color.r,color.g,color.b);
    }
    for(const index of geometry.index.array)indices.push(base+index);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** High-only rock kit. Static chunks share one material and three detail levels. */
export function createRocks(parent,placements,{style='coast'}={}){
  const root=new THREE.Group();root.name='detailed-rocks-'+style;parent.add(root);
  const material=stoneMaterial(style),templates=DETAILS.map(detail=>Array.from({length:VARIANTS},(_,variant)=>boulder(variant,detail)));
  const chunks=[],geometries=[],cells=new Map();
  placements.forEach((placement,index)=>{const [x,,z]=placement.position,key=Math.floor(x/CELL)+','+Math.floor(z/CELL);if(!cells.has(key))cells.set(key,[]);cells.get(key).push({placement,index});});
  const diagnostics={count:placements.length,variants:VARIANTS,chunks:cells.size,materials:1,textures:0,allocatedTriangles:0,
    visibleRocks:0,nearRocks:0,midRocks:0,farRocks:0,visibleTriangles:0,visibleDrawCalls:0,estimates:true,disposed:false};
  for(const items of cells.values()){
    const meshes=templates.map((variants,level)=>{
      const geometry=mergeRocks(items,variants,style),mesh=new THREE.Mesh(geometry,material);geometries.push(geometry);
      mesh.name='rock-'+['near','mid','far'][level]+'-batch';mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=level===0;root.add(mesh);
      diagnostics.allocatedTriangles+=geometry.index.count/3;return mesh;
    });
    const box=new THREE.Box3();meshes.forEach(mesh=>box.union(mesh.geometry.boundingBox));
    chunks.push({meshes,box,level:0,count:items.length});
  }
  templates.flat().forEach(geometry=>geometry.dispose());
  const eye=vector(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),worldBox=new THREE.Box3();let disposed=false;
  return {root,diagnostics,update(){},
    beforeRender(camera){
      if(disposed)return;camera.updateWorldMatrix(true,false);root.updateWorldMatrix(true,false);camera.getWorldPosition(eye);
      matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
      diagnostics.visibleRocks=diagnostics.nearRocks=diagnostics.midRocks=diagnostics.farRocks=diagnostics.visibleTriangles=diagnostics.visibleDrawCalls=0;
      for(const chunk of chunks){
        worldBox.copy(chunk.box).applyMatrix4(root.matrixWorld);const distance=worldBox.distanceToPoint(eye);
        if(chunk.level===0&&distance>63)chunk.level=distance>153?2:1;
        else if(chunk.level===1){if(distance<47)chunk.level=0;else if(distance>153)chunk.level=2;}
        else if(chunk.level===2&&distance<137)chunk.level=distance<47?0:1;
        chunk.meshes.forEach((mesh,level)=>mesh.visible=level===chunk.level);
        // Leave shadow/reflection culling to Three.js; camera frustum here is
        // only an estimate, so offscreen rocks can still cast a visible shadow.
        if(!root.visible||!frustum.intersectsBox(worldBox))continue;
        diagnostics.visibleRocks+=chunk.count;diagnostics[['nearRocks','midRocks','farRocks'][chunk.level]]+=chunk.count;
        diagnostics.visibleDrawCalls++;diagnostics.visibleTriangles+=chunk.meshes[chunk.level].geometry.index.count/3;
      }
    },
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometries.forEach(geometry=>geometry.dispose());material.dispose();root.clear();diagnostics.disposed=true;}
  };
}
