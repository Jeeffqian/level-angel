import * as THREE from 'three';

// Original, reusable architectural kit inspired by Xi'an's fortified old city.
// Everything is owned by this factory; geometry never participates in physics.
const randomSource=(initial=87123)=>{let s=initial>>>0;return()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);};

class CityBatch {
  constructor(root){this.root=root;this.batches=new Map();this.object=new THREE.Object3D();}
  add(geometry,material,position,scale=[1,1,1],rotation=[0,0,0],color=null){
    const chunk=`${Math.floor(position[0]/180)},${Math.floor(position[2]/180)}`;
    const key=geometry.uuid+material.uuid+chunk;
    if(!this.batches.has(key))this.batches.set(key,{geometry,material,items:[]});
    this.object.position.fromArray(position);this.object.scale.fromArray(scale);this.object.rotation.fromArray(rotation);this.object.updateMatrix();
    this.batches.get(key).items.push({matrix:this.object.matrix.clone(),color});
  }
  finish(){for(const {geometry,material,items} of this.batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.name=`city-${material.name}`;
    items.forEach(({matrix,color},i)=>{mesh.setMatrixAt(i,matrix);if(color)mesh.setColorAt(i,color);});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.computeBoundingBox();mesh.receiveShadow=true;
    mesh.castShadow=['masonry','limestone','gray-tile','vermilion-timber','dark-timber'].includes(material.name);
    this.root.add(mesh);
  }this.batches.clear();}
}

function roofGeometry(){
  const positions=[],uv=[],indices=[],nx=12,nz=8;
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
    const u=x/nx*2-1,v=z/nz*2-1,edge=Math.max(Math.abs(v),Math.max(0,(Math.abs(u)-.43)/.57));
    const height=Math.pow(Math.max(0,1-edge),1.3)+.17*Math.pow(edge,10)+.18*Math.pow(Math.abs(u*v),4);
    positions.push(u*.5,height,v*.5);uv.push(x/nx,z/nz);
    if(x<nx&&z<nz){const a=z*(nx+1)+x,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function archGeometry(width,height,depth,opening=24,openingHeight=10){
  const half=width/2,r=opening/2,spring=openingHeight*.45,rise=openingHeight*.55,shape=new THREE.Shape();
  shape.moveTo(-half,0);shape.lineTo(-half,height);shape.lineTo(half,height);shape.lineTo(half,0);shape.lineTo(r,0);shape.lineTo(r,spring);
  for(let i=1;i<=28;i++){const a=i/28*Math.PI;shape.lineTo(Math.cos(a)*r,spring+Math.sin(a)*rise);}
  shape.lineTo(-r,0);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:false,curveSegments:24});g.translate(0,0,-depth/2);return g;
}

function makeStrip(sample,left,right,y,material,steps,length,start=0){
  const positions=[],uv=[],indices=[];
  for(let i=0;i<=steps;i++){
    const distance=start+length*i/steps;
    for(const lateral of [left,right]){const p=sample(distance,lateral);positions.push(p.x,y,p.z);uv.push(lateral/4,distance/4);}
    if(i<steps){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;return mesh;
}

function masonry(material,qualityUniform,paving=false){
  material.onBeforeCompile=shader=>{
    shader.uniforms.cityQuality=qualityUniform;
    shader.vertexShader='varying vec3 vCityPosition; varying vec3 vCityNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 cityP=vec4(position,1.0);vec3 cityN=normal;
      #ifdef USE_INSTANCING
        cityP=instanceMatrix*cityP;cityN=mat3(instanceMatrix)*cityN;
      #endif
      vCityPosition=(modelMatrix*cityP).xyz;vCityNormal=normalize(mat3(modelMatrix)*cityN);
    `);
    shader.fragmentShader='uniform float cityQuality; varying vec3 vCityPosition; varying vec3 vCityNormal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 axis=abs(vCityNormal);vec2 p=axis.y>.6?vCityPosition.xz:(axis.x>axis.z?vCityPosition.zy:vCityPosition.xy);
      vec2 size=vec2(${paving?'2.1,1.3':'1.55,.62'});float row=floor(p.y/size.y);p.x+=mod(row,2.0)*size.x*.5;
      vec2 cell=floor(p/size),f=fract(p/size);vec2 aa=max(fwidth(p/size),vec2(.002));
      vec2 edge=smoothstep(vec2(.018)-aa,vec2(.018)+aa,min(f,1.0-f));
      float block=sin(dot(cell,vec2(127.1,311.7)))*43758.5453;
      float wear=fract(sin(dot(floor(vCityPosition*11.0),vec3(12.71,31.17,74.7)))*4375.85);
      diffuseColor.rgb*=mix(.67,.91+fract(block)*.16,edge.x*edge.y);
      diffuseColor.rgb*=1.0+cityQuality*(wear-.5)*.10;
    `);
  };material.customProgramCacheKey=()=>paving?'city-paving-v1':'city-brick-v1';
}

export function buildCityWorld(parent,track,{quality='high'}={}){
  if(!track.cityLayout)throw new TypeError('Chang’an world requires track.cityLayout');
  const root=new THREE.Group();root.name='changan-city-world';parent.add(root);
  const layout=track.cityLayout,bounds=layout.wallBounds,branch=track.shortcuts[0];
  const geometries=new Set(),materials=new Set(),textures=new Set(),meshes=[];
  const own=g=>{geometries.add(g);return g;};
  const mat=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.86,...extra});m.name=name;materials.add(m);return m;};
  const detailUniform={value:quality==='low'?0:1};
  const palette={brick:mat('masonry','#88827a'),stone:mat('limestone','#b9ad92'),paving:mat('paving','#d1c5aa'),ground:mat('earth','#a49d80'),
    red:mat('vermilion-timber','#8e362c'),darkRed:mat('dark-timber','#59372d'),roof:mat('gray-tile','#465054',{side:THREE.DoubleSide}),
    gold:mat('brass','#b49b60',{roughness:.58,metalness:.16}),dark:mat('window','#34413e'),cloth:mat('market-awning','#b96242'),cream:mat('ivory','#ead6ac'),
    lantern:mat('amber-lantern','#f5aa54',{emissive:'#ed762a',emissiveIntensity:.38}),green:mat('garden','#5c7350'),white:mat('white','#efe4cd')};
  masonry(palette.brick,detailUniform);masonry(palette.stone,detailUniform);masonry(palette.paving,detailUniform,true);
  palette.roof.onBeforeCompile=shader=>{
    shader.uniforms.cityQuality=detailUniform;shader.vertexShader='varying vec2 vRoofUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vRoofUv=uv;');
    shader.fragmentShader='uniform float cityQuality; varying vec2 vRoofUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float channels=pow(.5+.5*cos(vRoofUv.x*150.8),3.0);
      float courses=smoothstep(.04,.10,fract(vRoofUv.y*18.0));
      diffuseColor.rgb*=mix(1.0,(.79+channels*.42)*(.77+courses*.23),cityQuality);
    `);
  };palette.roof.customProgramCacheKey=()=> 'city-roof-tile-v1';
  const box=own(new THREE.BoxGeometry(1,1,1)),column=own(new THREE.CylinderGeometry(1,1,1,8)),sphere=own(new THREE.SphereGeometry(1,10,7)),roof=own(roofGeometry());
  const tapered=own(new THREE.BoxGeometry(1,1,1));for(let i=0;i<tapered.attributes.position.count;i++)tapered.attributes.position.setZ(i,tapered.attributes.position.getZ(i)*(tapered.attributes.position.getY(i)>0?.9:1.12));tapered.computeVertexNormals();
  const base=new CityBatch(root),gateDetails=[],buildings=[],wallSegments=[],lanterns=[];
  const addMesh=(g,m,name)=>{const mesh=new THREE.Mesh(own(g),m);mesh.name=name;mesh.receiveShadow=true;root.add(mesh);return mesh;};
  const random=randomSource();
  const ground=addMesh(new THREE.PlaneGeometry(1800,1800),palette.ground,'city-ground');ground.rotation.x=-Math.PI/2;ground.position.y=-.075;
  const plaza=addMesh(new THREE.PlaneGeometry(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ),palette.paving,'city-inner-paving');plaza.rotation.x=-Math.PI/2;plaza.position.set((bounds.minX+bounds.maxX)/2,-.03,(bounds.minZ+bounds.maxZ)/2);
  function strip(sample,width,length,steps=900){
    const road=makeStrip(sample,-width/2,width/2,.035,palette.paving,steps,length);road.name='city-drivable-paving';root.add(road);own(road.geometry);
    for(const side of [-1,1]){const edge=makeStrip(sample,side*(width/2-.23)-.07,side*(width/2-.23)+.07,.045,palette.cream,steps,length);root.add(edge);own(edge.geometry);}
  }
  strip(track.sampleTrack,track.ROAD_WIDTH,track.trackLength,1200);strip(branch.sample,branch.width,branch.length,280);

  function local(cx,cz,angle,x,z){return [cx+Math.cos(angle)*x+Math.sin(angle)*z,cz-Math.sin(angle)*x+Math.cos(angle)*z];}
  function part(batch,g,m,cx,cz,angle,x,y,z,sx,sy,sz,rz=0){const [px,pz]=local(cx,cz,angle,x,z);batch.add(g,m,[px,y,pz],[sx,sy,sz],[0,angle,rz]);}
  function wall(ax,az,bx,bz,height=layout.wallHeight){
    const length=Math.hypot(bx-ax,bz-az),angle=-Math.atan2(bz-az,bx-ax),cx=(ax+bx)/2,cz=(az+bz)/2,depth=layout.wallThickness;
    base.add(tapered,palette.brick,[cx,height/2,cz],[length,height,depth],[0,angle,0]);
    base.add(box,palette.stone,[cx,.35,cz],[length+.2,.7,depth*1.14],[0,angle,0]);
    base.add(box,palette.stone,[cx,height+.15,cz],[length+.35,.4,depth+.35],[0,angle,0]);
    for(const side of [-1,1]){
      part(base,box,palette.brick,cx,cz,angle,0,height+.8,side*(depth/2-.35),length,1.15,.8);
      for(let x=-length/2+.9;x<length/2;x+=2.7)part(base,box,palette.brick,cx,cz,angle,x,height+1.8,side*(depth/2-.35),1.45,1.2,.9);
    }
    wallSegments.push({cx,cz,angle,length,height,depth});
  }
  function lantern(cx,cz,angle,x,y,z,size=1,batch=base){
    part(batch,column,palette.gold,cx,cz,angle,x,y+.92*size,z,.07,1.1*size,.07);
    part(batch,sphere,palette.lantern,cx,cz,angle,x,y,z,.48*size,.65*size,.48*size);
    for(const dy of [-.58,.58])part(batch,column,palette.gold,cx,cz,angle,x,y+dy*size,z,.31*size,.1,.31*size);
    part(batch,column,palette.red,cx,cz,angle,x,y-.92*size,z,.035,.58*size,.035);
    lanterns.push({x:cx,y,z:cz});
  }
  function tower(cx,cz,angle,width=30,depth=17,y=14,levels=2){
    for(let level=0;level<levels;level++){
      const w=width*(1-level*.2),d=depth*(1-level*.2),bottom=y+level*5.8;
      part(base,box,palette.darkRed,cx,cz,angle,0,bottom+.18,0,w,.45,d);
      part(base,box,palette.red,cx,cz,angle,0,bottom+1.9,0,w*.82,3.4,d*.76);
      for(const side of [-1,1])for(let x=-w*.42;x<=w*.43;x+=w/6){
        part(base,column,palette.red,cx,cz,angle,x,bottom+2.25,side*d*.43,.28,4.5,.28);
        part(base,box,palette.dark,cx,cz,angle,x,bottom+2.05,side*d*.386,w/9,2.1,.12);
        part(base,box,palette.gold,cx,cz,angle,x,bottom+2.05,side*d*.398,.09,2.3,.13);
      }
      part(base,box,palette.darkRed,cx,cz,angle,0,bottom+4.1,0,w*.96,.45,d*.92);
      part(base,roof,palette.roof,cx,cz,angle,0,bottom+3.9,0,w*1.16,2.75,d*1.28);
      part(base,box,palette.roof,cx,cz,angle,0,bottom+6.64,0,w*.48,.32,.45);
      for(const side of [-1,1])lantern(cx,cz,angle,side*w*.31,bottom+2,-d*.55,.9);
      gateDetails.push({cx,cz,angle,w,d,bottom});
    }
  }
  function gate(cx,cz,angle,width,opening,openingHeight,label){
    const g=own(archGeometry(width,layout.wallHeight,layout.wallThickness,opening,openingHeight));
    base.add(g,palette.brick,[cx,0,cz],[1,1,1],[0,angle,0]);
    part(base,box,palette.stone,cx,cz,angle,0,layout.wallHeight+.1,0,width+.6,.5,layout.wallThickness+.8);
    tower(cx,cz,angle,width*.96,17,layout.wallHeight+.4,2);
    for(const side of [-1,1])for(const face of [-1,1]){
      part(base,box,palette.darkRed,cx,cz,angle,side*(opening/2+.6),2.5,face*(layout.wallThickness/2+.15),.8,5,.2);
      lantern(cx,cz,angle,side*(opening/2+3),6.5,face*(layout.wallThickness/2+.7),1.4);
    }
    gateDetails.push({arch:true,cx,cz,angle,opening,openingHeight,label});
  }
  // A genuine south gate frames the garage courtyard; the east spur gate is
  // the narrow physical shortcut. Neither uses a painted doorway/black plane.
  const southWidth=40;
  // The race spline rounds inside the nominal rectangle at the corners. Cut
  // these rampart corners inward, rather than letting the bastions hit karts.
  const corner=24;
  wall(bounds.minX+corner,bounds.minZ,-southWidth/2,bounds.minZ);wall(southWidth/2,bounds.minZ,bounds.maxX-corner,bounds.minZ);
  gate(0,bounds.minZ,0,southWidth,24,10,'CHANG’AN');
  wall(bounds.minX,bounds.minZ+corner,bounds.minX,bounds.maxZ-corner);wall(bounds.maxX,bounds.minZ+corner,bounds.maxX,bounds.maxZ-corner);wall(bounds.minX+corner,bounds.maxZ,bounds.maxX-corner,bounds.maxZ);
  for(const sideX of [-1,1])for(const sideZ of [-1,1]){const x=sideX<0?bounds.minX:bounds.maxX,z=sideZ<0?bounds.minZ:bounds.maxZ;wall(x-sideX*corner,z,x,z-sideZ*corner);}
  const arch=layout.arch,gateWidth=29;
  wall(layout.spur.fromX,layout.spur.z,arch.x-gateWidth/2,layout.spur.z);
  gate(arch.x,arch.z,arch.heading,gateWidth,arch.width,arch.height,'EAST GATE');
  wall(arch.x+gateWidth/2,layout.spur.z,layout.spur.toX,layout.spur.z);
  for(const x of [bounds.minX+corner/2,bounds.maxX-corner/2])for(const z of [bounds.minZ+corner/2,bounds.maxZ-corner/2]){
    base.add(box,palette.brick,[x,7,z],[17,14,17]);tower(x,z,0,22,20,14,1);
  }

  function routeClear(x,z,radius=0){return track.nearestTrack(x,z).distance>track.ROAD_WIDTH/2+radius+2&&branch.nearest(x,z).distance>branch.width/2+radius+2;}
  function wallClear(x,z,radius){
    for(const segment of wallSegments){const dx=x-segment.cx,dz=z-segment.cz,along=Math.abs(Math.cos(segment.angle)*dx-Math.sin(segment.angle)*dz),across=Math.abs(Math.sin(segment.angle)*dx+Math.cos(segment.angle)*dz);if(along<segment.length/2+radius&&across<segment.depth*.6+radius)return false;}
    return Math.hypot(x-arch.x,z-arch.z)>28+radius;
  }
  function house(cx,cz,angle,w,d,h,market=false){
    part(base,box,palette.stone,cx,cz,angle,0,.18,0,w+.6,.36,d+.6);
    part(base,box,palette.cream,cx,cz,angle,0,h/2,0,w,h,d);
    for(const side of [-1,1]){
      for(let x=-w*.42;x<=w*.43;x+=w*.28){part(base,box,palette.red,cx,cz,angle,x,h*.52,side*d*.51,.22,h,.2);part(base,box,palette.dark,cx,cz,angle,x,h*.59,side*d*.51,w*.18,h*.4,.08);}
      part(base,box,palette.darkRed,cx,cz,angle,0,h*.23,side*d*.51,w,.22,.16);
    }
    part(base,roof,palette.roof,cx,cz,angle,0,h,0,w*1.2,Math.min(2.5,w*.15),d*1.25);
    if(market){
      part(base,roof,palette.cloth,cx,cz,angle,0,2.8,d*.73,w*.9,.55,d*.48);
      part(base,box,palette.darkRed,cx,cz,angle,0,.8,d*.82,w*.8,1.3,1.5);
      for(const side of [-1,1]){part(base,column,palette.red,cx,cz,angle,side*w*.39,1.5,d*.91,.09,3,.09);lantern(cx,cz,angle,side*w*.34,2.25,d*.96,.65);}
    }
    buildings.push({cx,cz,angle,w,d,h,market});
  }
  // Courtyard lanes between roof clusters keep the old city from becoming a
  // featureless wall. The foreground showroom remains open on all sides.
  const showroom=new THREE.Vector3(layout.showroom.x,layout.showroom.y,layout.showroom.z);
  for(let z=bounds.minZ+28;z<bounds.maxZ-20;z+=28)for(let x=bounds.minX+26;x<bounds.maxX-20;x+=30){
    const px=x+(random()-.5)*8,pz=z+(random()-.5)*7,w=13+random()*7,d=10+random()*7;
    if(Math.hypot(px-showroom.x,pz-showroom.z)<30||Math.abs(px)<18||!routeClear(px,pz,14))continue;
    house(px,pz,random()>.5?0:Math.PI/2,w,d,4+random()*3.5);
  }
  // Street-facing shopfronts outside the circuit provide nearby speed cues.
  for(let s=15;s<track.trackLength;s+=38){
    const p=track.sampleTrack(s,29+random()*5),radius=11;
    if(routeClear(p.x,p.z,radius)&&wallClear(p.x,p.z,radius))house(p.x,p.z,p.heading-Math.PI/2,12+random()*5,9+random()*3,4+random()*2,true);
  }
  function edgeProps(sample,length,width,isBranch=false){
    for(let s=3;s<length;s+=5.5)for(const side of [-1,1]){
      const p=sample(s,side*(width/2+.47));
      const other=isBranch?track.nearestTrack(p.x,p.z):branch.nearest(p.x,p.z);
      if(other.distance<(isBranch?track.ROAD_WIDTH:branch.width)/2+2.1)continue;
      // Low stone curb indicates the collider; no tall barrier blocks the fork.
      base.add(box,palette.stone,[p.x,.22,p.z],[.58,.42,5.2],[0,p.heading,0]);
    }
    for(let s=12;s<length;s+=31){const p=sample(s,width/2+3.1);
      if(!routeClear(p.x,p.z,.4)||!wallClear(p.x,p.z,.5))continue;
      base.add(column,palette.darkRed,[p.x,2.8,p.z],[.13,5.6,.13]);
      part(base,box,palette.darkRed,p.x,p.z,p.heading,-.6,5.5,0,1.6,.15,.15);
      lantern(p.x,p.z,p.heading,-1.05,4.5,0,.95);
    }
  }
  edgeProps(track.sampleTrack,track.trackLength,track.ROAD_WIDTH);edgeProps(branch.sample,branch.length,branch.width,true);
  // Small checkerboard starting line and a broad view down the opening straight.
  for(let x=-8;x<9;x+=1)for(let z=0;z<3;z++){
    const p=track.sampleTrack(z-1,x);base.add(box,(Math.round(x)+z)%2?palette.dark:palette.white,[p.x,.055,p.z],[.97,.015,.97],[0,p.heading,0]);
  }
  const stage=addMesh(new THREE.CylinderGeometry(7.2,7.35,.13,64),palette.stone,'city-showroom');stage.position.set(showroom.x,.015,showroom.z);
  const stageRing=addMesh(new THREE.TorusGeometry(6.9,.035,6,64),palette.gold,'city-showroom-inlay');stageRing.rotation.x=-Math.PI/2;stageRing.position.set(showroom.x,.09,showroom.z);
  for(const side of [-1,1]){
    const x=showroom.x+side*13,z=showroom.z-9;
    base.add(box,palette.stone,[x,.4,z],[3,.8,3]);base.add(column,palette.red,[x,3.5,z],[.16,6,.16]);
    lantern(x,z,0,0,5.5,0,1.55);
    base.add(box,palette.stone,[showroom.x+side*18,.3,showroom.z+9],[9,.6,3]);
    for(let i=0;i<4;i++)base.add(sphere,palette.green,[showroom.x+side*18-3+i*2,1.2,showroom.z+9],[1.6,1.1,1.4]);
  }

  function sign(text,width=8,height=1.9,bg='#493b32'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');
    c.fillStyle=bg;c.fillRect(0,0,1024,256);c.strokeStyle='#d6b574';c.lineWidth=10;c.strokeRect(12,12,1000,232);c.fillStyle='#f5deb0';c.font=`bold ${text.length<8?175:78}px Georgia`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,134,940);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:.8,side:THREE.DoubleSide});material.name='sign';materials.add(material);
    const geometry=own(new THREE.PlaneGeometry(width,height));return {geometry,material};
  }
  const gateSign=sign('长 安   ·   CHANG’AN',14,2.5),shortcutSign=sign('↗  EAST GATE  ·  SHORTCUT',9,1.6,'#34504d'),raceSign=sign('CHANG’AN CITADEL',15,2.2);
  base.add(gateSign.geometry,gateSign.material,[0,layout.wallHeight+2.4,bounds.minZ-8.1],[1,1,1],[0,Math.PI,0]);
  base.add(gateSign.geometry,gateSign.material,[0,layout.wallHeight+2.4,bounds.minZ+8.1]);
  base.add(raceSign.geometry,raceSign.material,[arch.x,layout.wallHeight+2.1,arch.z-8.1],[1,1,1],[0,Math.PI,0]);
  for(const d of [0]){
    const p=branch.sample(d,-branch.width/2-4.5),angle=p.heading;
    base.add(shortcutSign.geometry,shortcutSign.material,[p.x,3.2,p.z],[1,1,1],[0,angle+Math.PI,0]);
    for(const side of [-1,1])part(base,column,palette.darkRed,p.x,p.z,angle,side*3.2,1.6,0,.1,3.2,.1);
  }
  // Golden chevrons show main-road turns without competing with the shortcut's
  // teal gate signs. Placements are outside both physical driving corridors.
  const arrow=sign('› › ›',4.2,1.5),leftArrow=sign('‹ ‹ ‹',4.2,1.5);
  for(let s=35;s<track.trackLength;s+=47){const p=track.sampleTrack(s),a=track.sampleTrack(s+20),bend=Math.atan2(Math.sin(a.heading-p.heading),Math.cos(a.heading-p.heading));if(Math.abs(bend)<.19)continue;
    const q=track.sampleTrack(s,Math.sign(bend)*12.3);if(!routeClear(q.x,q.z,.5)||!wallClear(q.x,q.z,1))continue;
    const face=bend<0?arrow:leftArrow;base.add(face.geometry,face.material,[q.x,1.8,q.z],[1,1,1],[0,p.heading+Math.PI,0]);base.add(column,palette.darkRed,[q.x,.9,q.z],[.1,1.8,.1]);
  }
  base.finish();
  let high=null,disposed=false,currentQuality=quality==='low'?'low':'high';
  function buildDetail(){
    high=new THREE.Group();high.name='city-high-detail';root.add(high);const batch=new CityBatch(high);
    for(const part of gateDetails){
      if(part.arch){
        const {cx,cz,angle,opening,openingHeight}=part,r=opening/2,spring=openingHeight*.45,rise=openingHeight*.55;
        for(const side of [-1,1])for(let i=0;i<=24;i++){
          const theta=i/24*Math.PI,x=Math.cos(theta)*(r+.48),y=spring+Math.sin(theta)*(rise+.48),rotation=Math.atan2(rise*Math.cos(theta),-r*Math.sin(theta));
          // Individual voussoirs sit on the facade outside the clear opening.
          const [px,pz]=local(cx,cz,angle,x,side*(layout.wallThickness/2+.16));batch.add(box,palette.stone,[px,y,pz],[.65,.7,.28],[0,angle,rotation]);
        }
        continue;
      }
      const {cx,cz,angle,w,d,bottom}=part;
      for(const side of [-1,1])for(let x=-w*.42;x<w*.43;x+=1.35){
        // Interlocking timber brackets and thin tile end caps articulate eaves.
        for(let level=0;level<3;level++)partFn(batch,box,palette.gold,cx,cz,angle,x,bottom+3.25+level*.2,side*(d*.46+level*.13),.22+level*.24,.16,.65);
        partFn(batch,column,palette.roof,cx,cz,angle,x,bottom+4.43,side*d*.63,.1,.2,.1);
      }
      for(const side of [-1,1])for(let x=-w*.4;x<w*.41;x+=w/6)for(let dx=-.5;dx<=.5;dx+=.5)partFn(batch,box,palette.gold,cx,cz,angle,x+dx,bottom+2.1,side*d*.402,.045,1.95,.055);
    }
    for(const b of buildings){
      for(const side of [-1,1])for(let x=-b.w*.4;x<=b.w*.4;x+=1.4)partFn(batch,box,palette.darkRed,b.cx,b.cz,b.angle,x,b.h+.06,side*b.d*.52,.1,.23,.8);
      for(const side of [-1,1])for(let x=-b.w*.42;x<=b.w*.43;x+=b.w*.28){
        for(const dx of [-.04,.04])partFn(batch,box,palette.darkRed,b.cx,b.cz,b.angle,x+dx*b.w,b.h*.59,side*b.d*.523,.07,b.h*.4,.07);
        for(const dy of [-.07,.07])partFn(batch,box,palette.darkRed,b.cx,b.cz,b.angle,x,b.h*(.59+dy),side*b.d*.523,b.w*.18,.07,.07);
      }
      if(b.market)for(let i=0;i<6;i++)partFn(batch,sphere,i%2?palette.green:palette.lantern,b.cx,b.cz,b.angle,(i-2.5)*b.w*.095,1.57,b.d*.82,.26,.25,.26);
      // Stacked crates and pottery, kept within the shop's existing footprint.
      if(b.market){partFn(batch,box,palette.darkRed,b.cx,b.cz,b.angle,b.w*.38,.5,b.d*.9,1,.95,1);partFn(batch,sphere,palette.cloth,b.cx,b.cz,b.angle,-b.w*.38,.5,b.d*.9,.4,.6,.4);}
    }
    for(const wall of wallSegments)for(let x=-wall.length/2+2;x<wall.length/2;x+=8)for(const side of [-1,1])partFn(batch,box,palette.stone,wall.cx,wall.cz,wall.angle,x,wall.height-.3,side*(wall.depth/2+.13),1,.3,.45);
    batch.finish();
  }
  const partFn=part;
  const cityDiagnostics={quality:currentQuality,wallHeight:layout.wallHeight,gateCount:2,shortcutArches:1,archClearWidth:arch.width,archClearHeight:arch.height,
    buildings:buildings.length,lanterns:lanterns.length,highAllocated:false,drawCalls:0,triangles:0,visibleDrawCalls:0,visibleTriangles:0,disposed:false};
  const frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),sphereBounds=new THREE.Sphere();
  function inventory(){meshes.length=0;root.traverse(o=>{if(o.isMesh)meshes.push(o);});cityDiagnostics.drawCalls=meshes.filter(m=>m.parent!==high||high?.visible).length;
    cityDiagnostics.triangles=meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.count??1),0);
    Object.assign(cityDiagnostics,{geometries:geometries.size,materials:materials.size,textures:textures.size,highAllocated:!!high,highVisible:!!high?.visible});
  }
  function setQuality(value){if(disposed)return;currentQuality=value==='low'?'low':'high';detailUniform.value=currentQuality==='high'?1:0;if(currentQuality==='high'&&!high)buildDetail();if(high)high.visible=currentQuality==='high';cityDiagnostics.quality=currentQuality;inventory();
    // Roofs and structural masses cast; thousands of small bracket/window
    // details receive those shadows without repeating them in the shadow pass.
    for(const mesh of meshes)mesh.castShadow=currentQuality==='high'&&mesh.parent!==high&&['masonry','limestone','gray-tile','vermilion-timber','dark-timber'].includes(mesh.material.name);
    cityDiagnostics.shadowCasters=meshes.filter(m=>m.castShadow).length;
  }
  function beforeRender(_renderer,_scene,camera){if(disposed)return;camera.updateMatrixWorld();root.updateWorldMatrix(true,true);viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);cityDiagnostics.visibleDrawCalls=cityDiagnostics.visibleTriangles=0;
    for(const mesh of meshes){if(!mesh.visible||mesh.parent===high&&!high.visible)continue;const bounds=mesh.boundingSphere??mesh.geometry.boundingSphere;if(!bounds){mesh.geometry.computeBoundingSphere();}sphereBounds.copy(mesh.boundingSphere??mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);if(frustum.intersectsSphere(sphereBounds)){cityDiagnostics.visibleDrawCalls++;cityDiagnostics.visibleTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.count??1);}}
  }
  setQuality(currentQuality);
  return {showroomPosition:showroom,cityDiagnostics,update(){},setQuality,beforeRender,
    dispose(){if(disposed)return;disposed=true;root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();cityDiagnostics.disposed=true;}
  };
}
