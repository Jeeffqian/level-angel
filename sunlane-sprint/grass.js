import * as THREE from 'three';

// Original opaque blade geometry. No cards, alpha overdraw, or patch base.
// Prefixes interleave eight tufts in every patch so distance LOD keeps coverage.
const HIGH_BLADES = 144, LOW_BLADES = 24, CELL = 64;
const randomFor = initial => { let seed = initial >>> 0; return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; };

function bladeGeometry(detailed) {
  const positions=[],colors=[],indices=[],segments=detailed?4:1;
  for(let i=0;i<=segments;i++) {
    const t=i/segments,width=.038*Math.pow(1-t,.72),bend=detailed?.3*t*t:0;
    for(const side of [-1,1]) {positions.push(side*width,t,bend);colors.push(.72+t*.28,.77+t*.23,.65+t*.35);}
    if(i<segments) {const a=i*2;indices.push(a,a+2,a+1);if(i<segments-1)indices.push(a+1,a+2,a+3);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** placements [{x,z,seed,radius?}], groundHeight(x,z) must sample rendered terrain. */
export function createGrass(parent,placements,{quality='high',groundHeight=()=>0,style='valley'}={}) {
  const root=new THREE.Group();root.name='grounded-grass';parent.add(root);
  const lowRoot=new THREE.Group(),highRoot=new THREE.Group();root.add(lowRoot,highRoot);
  const time={value:0},wind={value:1},geometries=new Set(),meshes=[],chunks=[];
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,side:THREE.DoubleSide});
  material.name='grounded-grass-blades';
  material.onBeforeCompile=shader=> {
    shader.uniforms.grassTime=time;shader.uniforms.grassWind=wind;
    shader.vertexShader='uniform float grassTime; uniform float grassWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float grassPhase = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 1.91;
      float grassFlex = position.y * position.y;
      transformed.x += sin(grassPhase) * grassFlex * 0.14;
      transformed.z += (sin(grassTime * 1.25 + grassPhase * 0.16) * 0.095
        + sin(grassTime * 2.3 + grassPhase) * 0.035) * grassFlex * grassWind;
    `);
    // Thin living blades transmit skylight. An upward-biased lighting normal
    // avoids alternating black/bright paper strips on their two visible sides.
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      vec3 grassUp = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
      normal = normalize(normal + grassUp * 0.85);
    `);
  };
  material.customProgramCacheKey=()=> 'grounded-grass-wind-v1';
  const diagnostics={quality:'low',patches:placements.length,highAllocated:false,batches:0,allocatedBlades:0,
    visibleBlades:0,visibleDrawCalls:0,visibleTriangles:0,nearChunks:0,midChunks:0,farChunks:0,
    estimates:true,basePolygons:0,textures:0,time:0,windAnimated:true,disposed:false};
  const cellMap=new Map();
  placements.forEach((p,i)=> {const key=`${Math.floor(p.x/CELL)},${Math.floor(p.z/CELL)}`;
    if(!cellMap.has(key))cellMap.set(key,[]);cellMap.get(key).push({...p,seed:p.seed??i*719+571});});
  for(const entries of cellMap.values())chunks.push({entries,low:null,high:null,lod:HIGH_BLADES,box:new THREE.Box3()});
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  const colors=(style==='coast'?['#698c43','#809d4b','#91aa53','#b2b865']:['#687f57','#7e925f','#93a170','#a3ad79']).map(c=>new THREE.Color(c));
  function build(detailed) {
    const geometry=bladeGeometry(detailed);geometries.add(geometry);const bladeCount=detailed?HIGH_BLADES:LOW_BLADES;
    for(const chunk of chunks) {
      const mesh=new THREE.InstancedMesh(geometry,material,chunk.entries.length*bladeCount);
      mesh.name=detailed?'grass-high-chunk':'grass-low-chunk';mesh.receiveShadow=true;
      const data=chunk.entries.map(p=> {const rand=randomFor(p.seed),tufts=[];
        for(let j=0;j<8;j++){const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*(p.radius??2.2);tufts.push({x:p.x+Math.cos(angle)*r,z:p.z+Math.sin(angle)*r,height:.34+rand()*.31});}
        return {rand,tufts};});
      for(let layer=0;layer<bladeCount;layer++) for(let p=0;p<chunk.entries.length;p++) {
        const {rand,tufts}=data[p],tuft=tufts[layer%8],angle=rand()*Math.PI*2,r=Math.sqrt(rand())*.3;
        const x=tuft.x+Math.cos(angle)*r,z=tuft.z+Math.sin(angle)*r,height=tuft.height*(.55+rand()*.85);
        dummy.position.set(x,groundHeight(x,z)-.012,z);dummy.rotation.set(0,rand()*Math.PI*2,0);
        dummy.scale.set(.7+rand()*.7,height,.7+rand()*.8);dummy.updateMatrix();
        const index=layer*chunk.entries.length+p;mesh.setMatrixAt(index,dummy.matrix);
        color.copy(colors[Math.floor(rand()*colors.length)]).multiplyScalar(.92+rand()*.15);mesh.setColorAt(index,color);
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
      // Bounds include shader tip displacement; the rooted vertices never move.
      mesh.boundingBox.expandByScalar(.2);mesh.boundingSphere.radius+=.2;
      chunk.box.copy(mesh.boundingBox);chunk[detailed?'high':'low']=mesh;
      (detailed?highRoot:lowRoot).add(mesh);meshes.push(mesh);diagnostics.allocatedBlades+=mesh.count;
    }
    diagnostics.batches=meshes.length;
  }
  build(false);
  let currentQuality='low',disposed=false;
  function setQuality(value) {
    currentQuality=value==='low'?'low':'high';
    if(currentQuality==='high'&&!diagnostics.highAllocated){build(true);diagnostics.highAllocated=true;}
    highRoot.visible=currentQuality==='high';lowRoot.visible=currentQuality==='low';wind.value=currentQuality==='high'?1:.35;
    diagnostics.quality=currentQuality;
    diagnostics.visibleBlades=diagnostics.visibleDrawCalls=diagnostics.visibleTriangles=0;
  }
  const eye=new THREE.Vector3(),center=new THREE.Vector3(),matrix=new THREE.Matrix4(),frustum=new THREE.Frustum(),worldBox=new THREE.Box3();
  function beforeRender(camera) {
    camera.updateMatrixWorld();root.updateWorldMatrix(true,false);camera.getWorldPosition(eye);
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
    diagnostics.visibleBlades=diagnostics.visibleDrawCalls=diagnostics.visibleTriangles=0;
    diagnostics.nearChunks=diagnostics.midChunks=diagnostics.farChunks=0;
    for(const chunk of chunks) {
      const mesh=currentQuality==='high'?chunk.high:chunk.low;
      worldBox.copy(chunk.box).applyMatrix4(root.matrixWorld);worldBox.getCenter(center);
      // Box distance avoids switching a nearby patch because its cell center is far away.
      const distance=worldBox.distanceToPoint(eye);
      if(currentQuality==='high') {
        let count=chunk.lod;
        if(distance>230)count=0;else if(count===0&&distance<210)count=12;
        if(count===12&&distance<110)count=48;
        if(count===48&&distance<55)count=144;
        if(count===144&&distance>65)count=48;
        if(count===48&&distance>125)count=12;
        chunk.lod=count;mesh.count=count*chunk.entries.length;
      }
      // Keep the mesh's native culling for reflected cameras; only distance LOD
      // depends on the main camera. Diagnostics describe main-camera estimates.
      if(!root.visible||mesh.count===0||!frustum.intersectsBox(worldBox))continue;
      diagnostics.visibleDrawCalls++;diagnostics.visibleBlades+=mesh.count;
      diagnostics.visibleTriangles+=mesh.count*(currentQuality==='high'?7:1);
      diagnostics[chunk.lod===144?'nearChunks':chunk.lod===48?'midChunks':'farChunks']++;
    }
  }
  setQuality(quality);
  return {root,diagnostics,setQuality,beforeRender,
    update(value){time.value=value;diagnostics.time=value;},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();meshes.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());material.dispose();diagnostics.disposed=true;}
  };
}
