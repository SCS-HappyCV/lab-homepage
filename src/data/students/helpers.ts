import { publicAsset } from '../../utils/publicAsset'

export function studentPhoto(year: string, fileName: string) {
  return publicAsset(`students/${year}/${fileName}`)
}
