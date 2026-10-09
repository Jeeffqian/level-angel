// Reconstructed GPU tier classifier for Sunlane Sprint.
// The original shared module was unavailable on the public site, so this
// provides an equivalent conservative classification.
export function classifyGpuPerformanceTier(gpu = '', { isMobile = false } = {}) {
  if (isMobile) return 'low';
  const s = String(gpu || '').toLowerCase();
  if (!s) return 'low';
  const high = /(rtx|gtx 1[0-9]|gtx 2[0-9]|radeon rx|rx 5|rx 6|rx 7|m1|m2|m3|apple m|nvidia|geforce|quadro|arc a|radeon)/i;
  return high.test(s) ? 'high' : 'low';
}
