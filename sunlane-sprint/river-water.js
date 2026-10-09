import * as THREE from 'three';

/* Planar-camera / oblique-clip technique adapted for Y-up geometry from Three.js
 * r180 Water.js (https://github.com/mrdoob/three.js/blob/r180/examples/jsm/objects/Water.js).
 * Three.js is Copyright © 2010-2025 three.js authors, MIT licensed:
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const reflecting = new WeakSet();
const vertexShader = /* glsl */`
  uniform mat4 reflectionMatrix;
  varying vec4 vReflection;
  varying vec3 vWorld;
  varying vec2 vRiverUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vRiverUv = uv;
    vReflection = reflectionMatrix * world;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const fragmentShader = /* glsl */`
  uniform sampler2D reflection;
  uniform float time;
  uniform float reflectionReady;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec4 boats[3];
  varying vec4 vReflection;
  varying vec3 vWorld;
  varying vec2 vRiverUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vWorld.xz;
    float edgeDistance = min(vRiverUv.x, 1.0-vRiverUv.x) * 32.0;
    float deep = smoothstep(0.1, 3.0, edgeDistance);
    // Small crossing capillary waves: centimetre-scale slopes, not ocean swells.
    vec2 slope = vec2(0.0);
    slope += vec2(0.75, 0.35) * cos(dot(p, vec2(1.3, 0.48)) - time*0.78) * 0.029;
    slope += vec2(-0.25, 0.9) * sin(dot(p, vec2(-0.62, 1.85)) + time*1.05) * 0.019;
    slope += vec2(0.8, -0.6) * sin(dot(p, vec2(3.4, -2.1)) - time*1.28) * 0.008;
    float boatHighlight = 0.0;
    for (int i=0; i<3; i++) {
      vec2 delta = p - boats[i].xy;
      float a = boats[i].z, cs = cos(a), sn = sin(a);
      vec2 local = vec2(cs*delta.x-sn*delta.y, sn*delta.x+cs*delta.y) / boats[i].w;
      vec2 elliptical = local * vec2(1.0, 0.46);
      float radius = max(length(elliptical), 0.01);
      float envelope = smoothstep(1.6, 2.3, radius) * exp(-max(radius-2.3, 0.0)*0.32);
      float wave = cos(radius*5.0-time*1.75+float(i)*1.8);
      vec2 ring = elliptical/radius * vec2(1.0,0.46) * wave * envelope * 0.033;
      slope += vec2(cs*ring.x+sn*ring.y, -sn*ring.x+cs*ring.y);
      boatHighlight += pow(max(0.0, wave), 8.0) * envelope * 0.065;
    }
    slope *= mix(0.2, 1.0, deep);
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDirection = normalize(cameraPosition-vWorld);
    float distanceToEye = length(cameraPosition-vWorld);
    vec2 reflectionUv = vReflection.xy / max(vReflection.w, 0.0001);
    reflectionUv += slope * 0.060 * mix(1.0, 0.3, smoothstep(30.0, 240.0, distanceToEye));
    // Reflection render target is linear HDR. Main-pass output applies tone
    // mapping and display conversion exactly once after all water lighting.
    vec3 reflected = texture2D(reflection, clamp(reflectionUv, vec2(0.001), vec2(0.999))).rgb;
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.035 + 0.965*pow(1.0-facing, 5.0);
    float reflectionWeight = (0.38 + fresnel*0.59) * mix(0.42, 1.0, deep) * reflectionReady;
    vec3 body = mix(shallowColor, deepColor, deep);
    vec3 color = mix(body, reflected*vec3(0.94,0.985,0.98), reflectionWeight);
    vec3 halfDirection = normalize(viewDirection + sunDirection);
    float specular = pow(max(dot(normal,halfDirection),0.0), 280.0);
    color += sunColor * (specular*0.65 + boatHighlight);
    // A narrow translucent seam blends into the actual submerged riverbed.
    float alpha = smoothstep(0.0,0.5,edgeDistance) * 0.99;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// This variant has no reflection sampler or boat-ring loop. A soft sky tint,
// bank gradient and two small wave slopes keep low quality calm and readable.
const lowFragmentShader = /* glsl */`
  uniform float time;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 skyColor;
  varying vec3 vWorld;
  varying vec2 vRiverUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float edgeDistance = min(vRiverUv.x,1.0-vRiverUv.x)*32.0;
    float deep = smoothstep(0.1,3.0,edgeDistance);
    vec2 p = vWorld.xz;
    vec2 slope = vec2(cos(dot(p,vec2(1.3,.48))-time*.78),
      sin(dot(p,vec2(-.62,1.85))+time*1.05)) * .018;
    vec3 normal = normalize(vec3(-slope.x,1.0,-slope.y));
    vec3 viewDirection = normalize(cameraPosition-vWorld);
    float grazing = 1.0-clamp(dot(normal,viewDirection),0.0,1.0);
    float fresnel = grazing*grazing*grazing*grazing*grazing;
    vec3 color = mix(mix(shallowColor,deepColor,deep),skyColor,(.18+fresnel*.54)*deep);
    vec3 halfDirection = normalize(viewDirection+sunDirection);
    color += sunColor*pow(max(dot(normal,halfDirection),0.0),120.0)*.32;
    gl_FragColor = vec4(color,smoothstep(0.0,.5,edgeDistance)*.99);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Geometry must be a flat, top-facing Y-up strip, UV.x across the river. */
export function createRiverWater(geometry, {height = -.57, quality = 'high'} = {}) {
  let target = null;
  let currentQuality = quality === 'low' ? 'low' : 'high';
  const reflectionMatrix = new THREE.Matrix4();
  const uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    reflection: {value: null}, reflectionMatrix: {value: reflectionMatrix},
    time: {value: 0}, reflectionReady: {value: 0},
    deepColor: {value: new THREE.Color('#3d6561')}, shallowColor: {value: new THREE.Color('#85988a')},
    sunColor: {value: new THREE.Color('#ffe2b9')}, sunDirection: {value: new THREE.Vector3(50,90,40).normalize()},
    skyColor: {value: new THREE.Color('#a7babd')},
    boats: {value: Array.from({length: 3}, () => new THREE.Vector4(10000,10000,0,1))},
  });
  const material = new THREE.ShaderMaterial({name: 'Sakura reflective river', uniforms, vertexShader, fragmentShader,
    fog: true, transparent: true, depthWrite: false, side: THREE.FrontSide});
  const lowMaterial = new THREE.ShaderMaterial({name: 'Sakura simple river', uniforms, vertexShader, fragmentShader: lowFragmentShader,
    fog: true, transparent: true, depthWrite: false, side: THREE.FrontSide});
  const mesh = new THREE.Mesh(geometry, currentQuality === 'low' ? lowMaterial : material); mesh.name = 'valley-river'; mesh.renderOrder = 1;
  // Five cross-river vertices make the submerged bed slope gently away from
  // each bank; the surface itself needs only two vertices across its width.
  const surface = geometry.attributes.position, bedVertices = [], bedIndices = [];
  for (let row = 0; row < surface.count / 2; row++) {
    for (let across = 0; across <= 4; across++) {
      const u = across / 4, a = row*2, b = a+1;
      bedVertices.push(THREE.MathUtils.lerp(surface.getX(a),surface.getX(b),u),
        height-.11-Math.sin(u*Math.PI)*1.5, THREE.MathUtils.lerp(surface.getZ(a),surface.getZ(b),u));
      if (row > 0 && across < 4) {
        const p = row*5+across; bedIndices.push(p-5,p,p-4,p,p+1,p-4);
      }
    }
  }
  const bedGeometry = new THREE.BufferGeometry();
  bedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bedVertices,3)); bedGeometry.setIndex(bedIndices);
  bedGeometry.computeVertexNormals();
  const bedMaterial = new THREE.MeshStandardMaterial({color: '#6a8070', roughness: 1});
  const bed = new THREE.Mesh(bedGeometry, bedMaterial); bed.name = 'valley-riverbed'; bed.receiveShadow = true;

  const mirrorCamera = new THREE.PerspectiveCamera(), plane = new THREE.Plane();
  const planePoint = new THREE.Vector3(), normal = new THREE.Vector3(), cameraPoint = new THREE.Vector3();
  const look = new THREE.Vector3(), view = new THREE.Vector3(), cameraUp = new THREE.Vector3();
  const clip = new THREE.Vector4(), q = new THREE.Vector4(), normalMatrix = new THREE.Matrix3();
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), viewport = new THREE.Vector4();
  const transformedBox = new THREE.Box3(), size = new THREE.Vector2(), lastView = new THREE.Matrix4(), lastProjection = new THREE.Matrix4();
  const segments = [];
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count-2; i += 24) {
    const box = new THREE.Box3();
    for (let j = i; j < Math.min(positions.count,i+26); j++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,j));
    box.expandByScalar(.05); segments.push(box);
  }
  const diagnostics = {quality: currentQuality, mode: currentQuality === 'low' ? 'simple' : 'planar', targetAllocated: false,
    animated:true,rippleMode:currentQuality==='high'?'capillary-and-boat-rings':'simple-wave',boatRippleSources:0,time:0,
    reflectionPasses: 0, reflectionSize: 0, lastPassCpuMs: 0, lastReflectionCalls: 0,
    lastReflectionTriangles: 0, skipped: currentQuality === 'low' ? 'low quality' : 'awaiting visible render', disposed: false};
  let frame = null, lastFrame = null, lastCamera = null, disposed = false;

  function renderReflection(renderer, scene, camera) {
    if(camera.userData.rearView)return;
    if (currentQuality === 'low') { diagnostics.skipped = 'low quality'; return; }
    if (disposed || reflecting.has(renderer) || camera === mirrorCamera) return;
    for (let parent = mesh; parent; parent = parent.parent) if (!parent.visible) { diagnostics.skipped = 'inactive'; return; }
    if (frame !== null && frame === lastFrame && camera === lastCamera && lastView.equals(camera.matrixWorld) && lastProjection.equals(camera.projectionMatrix)) {
      diagnostics.skipped = 'same frame'; return;
    }
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(viewProjection);
    if (!segments.some(segment => frustum.intersectsBox(transformedBox.copy(segment).applyMatrix4(mesh.matrixWorld)))) { diagnostics.skipped = 'offscreen'; return; }
    normalMatrix.getNormalMatrix(mesh.matrixWorld); normal.set(0,1,0).applyMatrix3(normalMatrix).normalize();
    planePoint.set(0,height,0).applyMatrix4(mesh.matrixWorld); plane.setFromNormalAndCoplanarPoint(normal,planePoint);
    cameraPoint.setFromMatrixPosition(camera.matrixWorld);
    if (plane.distanceToPoint(cameraPoint) <= .01) { diagnostics.skipped = 'below surface'; return; }
    renderer.getSize(size);
    const resolution = Math.min(size.x,size.y) <= 600 ? 512 : 768;
    if (!target) {
      target = new THREE.WebGLRenderTarget(resolution,resolution, {
        type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
      });
      target.texture.name = 'Sakura river linear reflection'; target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      uniforms.reflection.value = target.texture; diagnostics.targetAllocated = true;
    } else if (target.width !== resolution) target.setSize(resolution,resolution);
    diagnostics.reflectionSize = resolution;
    mirrorCamera.copy(camera,false); mirrorCamera.layers.mask = camera.layers.mask;
    mirrorCamera.position.copy(cameraPoint).addScaledVector(normal,-2*plane.distanceToPoint(cameraPoint));
    camera.getWorldDirection(look).add(cameraPoint); look.addScaledVector(normal,-2*plane.distanceToPoint(look));
    cameraUp.set(0,1,0).transformDirection(camera.matrixWorld).reflect(normal);
    mirrorCamera.up.copy(cameraUp); mirrorCamera.lookAt(look); mirrorCamera.updateMatrixWorld();
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflectionMatrix.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1)
      .multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
    plane.applyMatrix4(mirrorCamera.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    const projection = mirrorCamera.projectionMatrix.elements;
    q.set((Math.sign(clip.x)+projection[8])/projection[0],(Math.sign(clip.y)+projection[9])/projection[5],-1,(1+projection[10])/projection[14]);
    clip.multiplyScalar(2/clip.dot(q));
    projection[2] = clip.x; projection[6] = clip.y; projection[10] = clip.z+1-.0002; projection[14] = clip.w;
    mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();

    const previous = {target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      xr: renderer.xr.enabled, shadowAuto: renderer.shadowMap.autoUpdate, shadowNeeds: renderer.shadowMap.needsUpdate,
      autoClear: renderer.autoClear, infoReset: renderer.info.autoReset, visible: mesh.visible};
    renderer.getCurrentViewport(viewport);
    const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles, started = performance.now();
    reflecting.add(renderer); mesh.visible = false;
    try {
      renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.autoClear = false; renderer.info.autoReset = false;
      renderer.setRenderTarget(target); renderer.state.buffers.depth.setMask(true); renderer.clear(true,true,true);
      renderer.render(scene,mirrorCamera);
      uniforms.reflectionReady.value = 1; diagnostics.reflectionPasses++; diagnostics.skipped = '';
      diagnostics.lastReflectionCalls = renderer.info.render.calls-calls;
      diagnostics.lastReflectionTriangles = renderer.info.render.triangles-triangles;
      lastFrame = frame; lastCamera = camera; lastView.copy(camera.matrixWorld); lastProjection.copy(camera.projectionMatrix);
    } finally {
      mesh.visible = previous.visible; renderer.xr.enabled = previous.xr;
      renderer.shadowMap.autoUpdate = previous.shadowAuto; renderer.shadowMap.needsUpdate = previous.shadowNeeds;
      renderer.autoClear = previous.autoClear; renderer.info.autoReset = previous.infoReset;
      renderer.setRenderTarget(previous.target,previous.face,previous.mip); renderer.state.viewport(viewport);
      reflecting.delete(renderer); diagnostics.lastPassCpuMs = performance.now()-started;
    }
  }
  function releaseTarget() {
    target?.dispose(); target = null; uniforms.reflection.value = null; uniforms.reflectionReady.value = 0;
    diagnostics.targetAllocated = false; diagnostics.reflectionSize = 0;
    diagnostics.lastPassCpuMs = 0; diagnostics.lastReflectionCalls = 0; diagnostics.lastReflectionTriangles = 0;
    lastFrame = null; lastCamera = null;
  }
  function setQuality(value) {
    if (disposed) return;
    const next = value === 'low' ? 'low' : 'high';
    if (next === currentQuality) return;
    currentQuality = next; diagnostics.quality = next; diagnostics.mode = next === 'low' ? 'simple' : 'planar';
    diagnostics.rippleMode = next === 'high' ? 'capillary-and-boat-rings' : 'simple-wave';
    if (next === 'low') diagnostics.boatRippleSources = 0;
    mesh.material = next === 'low' ? lowMaterial : material;
    if (next === 'low') releaseTarget();
    diagnostics.skipped = next === 'low' ? 'low quality' : 'awaiting visible render';
  }
  mesh.onBeforeRender = renderReflection;
  return {mesh, bed, diagnostics, setQuality,
    update(time, boats) {
      uniforms.time.value = time;
      diagnostics.time = time;
      if (currentQuality === 'low') return;
      diagnostics.boatRippleSources = Math.min(3,boats?.length ?? 0);
      for (let i = 0; i < Math.min(3,boats?.length ?? 0); i++) {
        const root = boats[i].root ?? boats[i]; root.getWorldPosition(view);
        uniforms.boats.value[i].set(view.x,view.z,root.rotation.y,root.scale.x);
      }
    },
    beforeRender(_renderer,_scene,_camera,options = {}) {
      // A rear-view inset needs one cheap water draw, not another scene reflection.
      mesh.material=currentQuality==='high'&&!options.rearView?material:lowMaterial;
      frame = Number.isFinite(options.frame) ? options.frame : null;
      if (Number.isFinite(options.time)) { uniforms.time.value = options.time; diagnostics.time = options.time; }
    },
    dispose() {
      if (disposed) return; disposed = true; diagnostics.disposed = true;
      mesh.onBeforeRender = () => {}; releaseTarget(); material.dispose(); lowMaterial.dispose(); bedGeometry.dispose(); bedMaterial.dispose();
    },
  };
}
