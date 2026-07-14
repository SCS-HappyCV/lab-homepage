/**
 * 专利OCR服务
 * 使用tesseract.js进行OCR识别
 */
import type { OcrResult, OcrLine } from '../types.js'

export interface OcrServiceConfig {
  language: string
  dpi: number
  maxPages: number
}

const DEFAULT_CONFIG: OcrServiceConfig = {
  language: 'chi_sim+eng',
  dpi: 250,
  maxPages: 2,
}

export class PatentOcrService {
  private config: OcrServiceConfig

  constructor(config: Partial<OcrServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 对PDF文件进行OCR识别
   * 注意：这里返回模拟结果，实际实现需要集成PDF渲染和OCR
   */
  async recognizePdf(filePath: string, pageNumber: number = 1): Promise<OcrResult> {
    try {
      // TODO: 实际实现需要：
      // 1. 将PDF页面渲染为图片（使用pdf2pic或类似库）
      // 2. 使用tesseract.js进行OCR识别
      // 3. 按坐标排序文本行

      // 临时返回模拟结果
      return {
        pageNumber,
        text: '',
        confidence: 0,
        lines: [],
      }
    } catch (error) {
      console.error('OCR recognition failed:', error)
      throw new Error('PATENT_OCR_FAILED')
    }
  }

  /**
   * 对图片进行OCR识别
   */
  async recognizeImage(imagePath: string): Promise<OcrResult> {
    try {
      const Tesseract = await import('tesseract.js')

      const { data } = await Tesseract.recognize(imagePath, this.config.language, {
        logger: (info: any) => {
          if (info.status === 'recognizing text') {
            // 可以记录进度
          }
        },
      })

      // 转换为标准格式
      const lines: OcrLine[] = (data.lines || []).map((line: any) => ({
        text: line.text.trim(),
        confidence: line.confidence / 100,
        bbox: [
          line.bbox.x0,
          line.bbox.y0,
          line.bbox.x1,
          line.bbox.y1,
        ] as [number, number, number, number],
      }))

      // 按坐标排序（从上到下，从左到右）
      lines.sort((a, b) => {
        const yDiff = a.bbox[1] - b.bbox[1]
        if (Math.abs(yDiff) > 10) return yDiff
        return a.bbox[0] - b.bbox[0]
      })

      return {
        pageNumber: 1,
        text: data.text.trim(),
        confidence: data.confidence / 100,
        lines,
      }
    } catch (error) {
      console.error('OCR recognition failed:', error)
      throw new Error('PATENT_OCR_FAILED')
    }
  }

  /**
   * 清洗OCR文本
   */
  cleanOcrText(text: string): string {
    let cleaned = text

    // 去除常见OCR错误
    cleaned = cleaned.replace(/[|l1I]{2,}/g, match => {
      // 连续的相似字符可能是分隔线
      return '-'.repeat(match.length)
    })

    // 合并被错误拆开的中文字符（单个空格分隔）
    // 需要多次替换以处理连续的中文字符
    let prev = ''
    while (prev !== cleaned) {
      prev = cleaned
      cleaned = cleaned.replace(/([一-鿿])\s([一-鿿])/g, '$1$2')
    }

    // 去除多余的空白
    cleaned = cleaned.replace(/\s+/g, ' ').trim()

    return cleaned
  }

  /**
   * 合并多页OCR结果
   */
  mergeResults(results: OcrResult[]): {
    text: string
    confidence: number
    lines: OcrLine[]
  } {
    if (results.length === 0) {
      return { text: '', confidence: 0, lines: [] }
    }

    // 合并文本
    const texts = results.map(r => r.text)
    const text = texts.join('\n')

    // 计算平均置信度
    const confidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length

    // 合并行
    const lines = results.flatMap(r => r.lines)

    return { text, confidence, lines }
  }

  /**
   * 判断OCR结果质量
   */
  assessQuality(result: OcrResult): {
    quality: 'HIGH' | 'MEDIUM' | 'LOW'
    issues: string[]
  } {
    const issues: string[] = []

    // 检查置信度
    if (result.confidence < 0.5) {
      issues.push('OCR置信度过低')
    }

    // 检查文本长度
    if (result.text.length < 20) {
      issues.push('识别文本过短')
    }

    // 检查中文字符比例
    const chineseChars = result.text.match(/[一-鿿]/g) || []
    const chineseRatio = chineseChars.length / result.text.length
    if (chineseRatio < 0.3) {
      issues.push('中文字符比例过低')
    }

    // 检查是否有乱码特征
    const garbledPatterns = /[□■◆◇○●]/g
    const garbledMatches = result.text.match(garbledPatterns) || []
    if (garbledMatches.length > 5) {
      issues.push('可能存在乱码')
    }

    // 判断质量等级
    let quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'
    if (issues.length > 0) {
      quality = issues.length >= 3 ? 'LOW' : 'MEDIUM'
    }

    return { quality, issues }
  }
}

/**
 * 创建OCR服务实例
 */
export function createPatentOcrService(config?: Partial<OcrServiceConfig>): PatentOcrService {
  return new PatentOcrService(config)
}
