/** 本地视频文件只存在于当前标签页内存里，刷新后需要重新选择（不上传、不落盘）。 */
interface LocalMedia {
  url: string
  name: string
  size: number
  blob: Blob
}

const store = new Map<string, LocalMedia>()

export function setLocalMedia(materialId: string, file: File) {
  const old = store.get(materialId)
  if (old) URL.revokeObjectURL(old.url)
  store.set(materialId, {
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    blob: file,
  })
}

export function getLocalMedia(materialId: string): LocalMedia | undefined {
  return store.get(materialId)
}

export function removeLocalMedia(materialId: string) {
  const old = store.get(materialId)
  if (old) URL.revokeObjectURL(old.url)
  store.delete(materialId)
}
