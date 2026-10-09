import {classifyGpuPerformanceTier} from '../shared/gpu-performance-tier.js';

export const GRAPHICS_STORAGE_KEY='sunlane-sprint-graphics-v1';
export const GRAPHICS_PRESETS=Object.freeze({
  low:Object.freeze({pixelRatio:1,renderScale:.85,shadows:false,particleLimit:96}),
  high:Object.freeze({pixelRatio:1.6,renderScale:1,shadows:true,particleLimit:280}),
});
const validMode=mode=>['auto','low','high'].includes(mode);

export function detectGraphicsTier(renderer,device=globalThis.navigator){
  // Match the home tour's conservative mobile default, including iPadOS when
  // it advertises a desktop Mac user agent. Resizing a window isn't a GPU tier.
  const isMobile=device?.userAgentData?.mobile===true||
    /android|iphone|ipad|ipod|windows phone|webos|blackberry|opera mini|iemobile|mobile/i.test(device?.userAgent||'')||
    (device?.platform==='MacIntel'&&device?.maxTouchPoints>1)||
    (device?.maxTouchPoints>0&&(globalThis.matchMedia?.('(pointer: coarse)').matches||globalThis.matchMedia?.('(hover: none)').matches));
  let gpu='';
  try{
    const gl=renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    gpu=String(gl.getParameter(extension?extension.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||'');
  }catch{/* Private/restricted contexts get the conservative default. */}
  return classifyGpuPerformanceTier(gpu,{isMobile});
}

export function createGraphicsSettings(renderer){
  const detectedTier=detectGraphicsTier(renderer);let mode='auto';
  try{const saved=localStorage.getItem(GRAPHICS_STORAGE_KEY);if(validMode(saved))mode=saved;}catch{/* Storage is optional. */}
  const getState=()=>({mode,quality:mode==='auto'?detectedTier:mode,detectedTier});
  return {getState,setMode(next){
    if(!validMode(next))return getState();
    mode=next;try{localStorage.setItem(GRAPHICS_STORAGE_KEY,mode);}catch{/* Keep in-memory preference. */}
    return getState();
  }};
}

export function graphicsPixelRatio(quality,devicePixelRatio,width){
  const preset=GRAPHICS_PRESETS[quality];
  const cap=quality==='high'&&width<700?1.4:preset.pixelRatio;
  return Math.min(devicePixelRatio||1,cap)*preset.renderScale;
}
