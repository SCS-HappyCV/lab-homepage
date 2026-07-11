export function publicAsset(path: string) {
  const baseUrl = import.meta.env?.BASE_URL ?? './'
  return `${baseUrl}${path.replace(/^\/+/, '')}`
}

/**
 * 解析成员照片 URL
 * - 以 http 开头的直接返回
 * - 以 /uploads 开头的拼接 API 基础地址
 * - 其他情况（public/ 下的静态资源）使用 publicAsset 处理
 */
export function resolvePhotoUrl(photo: string | undefined): string {
  if (!photo) return ''

  // 已经是完整 URL
  if (photo.startsWith('http')) return photo

  // 上传的照片（由后端返回，以 /uploads 开头）
  if (photo.startsWith('/uploads')) {
    const apiBase = import.meta.env?.VITE_API_BASE_URL ?? ''
    return `${apiBase}${photo}`
  }

  // public/ 下的静态资源
  return publicAsset(photo)
}
