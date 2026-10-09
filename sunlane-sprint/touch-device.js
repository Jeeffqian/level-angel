/** Device identity, not screen size or an attached touch screen, enables driving controls. */
export function isMobileTouchDevice(device = globalThis.navigator) {
  if(!device) return false;
  if(device.userAgentData?.mobile === true) return true;
  if(/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk/i.test(device.userAgent || '')) return true;
  // iPadOS can request a Macintosh user agent while retaining multi-touch hardware.
  return device.platform === 'MacIntel' && Number(device.maxTouchPoints) > 1;
}
