import { publicAsset } from '../../utils/publicAsset'

export function labPhoto(yearOrFileName: string, fileName?: string) {
  return publicAsset(fileName ? `gallery/lab/${yearOrFileName}/${fileName}` : `gallery/lab/${yearOrFileName}`)
}
