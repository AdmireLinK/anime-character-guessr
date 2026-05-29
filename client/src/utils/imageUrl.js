const BGM_LAIN_MIRROR = import.meta.env.VITE_BGM_LAIN_URL || '';

/**
 * 将 lain.bgm.tv 域名替换为配置的镜像站地址
 * @param {string} url - 原始图片 URL
 * @returns {string} - 替换后的 URL
 */
export function fixImageUrl(url) {
  if (!url || !BGM_LAIN_MIRROR) return url;
  return String(url).replace(/^https?:\/\/lain\.bgm\.tv/, BGM_LAIN_MIRROR);
}
