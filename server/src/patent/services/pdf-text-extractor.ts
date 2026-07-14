/**
 * PDF文本提取服务
 */
import fs from 'node:fs/promises'
import type { PdfPageText, PdfTextExtractionResult } from '../types.js'

export interface PdfTextExtractorConfig {
  parsePageCount: number
  minTextLength: number
}

const DEFAULT_CONFIG: PdfTextExtractorConfig = {
  parsePageCount: 2,
  minTextLength: 80,
}

export class PdfTextExtractor {
  private config: PdfTextExtractorConfig

  constructor(config: Partial<PdfTextExtractorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 提取PDF文本
   */
  async extractText(filePath: string): Promise<PdfTextExtractionResult> {
    try {
      // 动态导入pdfjs-dist（ESM兼容）
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

      // 读取PDF文件
      const buffer = await fs.readFile(filePath)
      const data = new Uint8Array(buffer)

      // 解析PDF
      const pdf = await pdfjsLib.getDocument({ data }).promise

      // 提取文本
      const pages: PdfPageText[] = []
      const maxPages = Math.min(pdf.numPages, this.config.parsePageCount)

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(' ')

        pages.push({
          pageNumber: i,
          text: pageText,
          characterCount: pageText.length,
        })
      }

      // 计算总字符数
      const totalCharacterCount = pages.reduce((sum, page) => sum + page.characterCount, 0)

      // 判断是否需要OCR
      const needsOcr = totalCharacterCount < this.config.minTextLength

      return {
        pages,
        totalCharacterCount,
        needsOcr,
      }
    } catch (error) {
      console.error('PDF text extraction failed:', error)
      throw new Error('PATENT_TEXT_EXTRACTION_FAILED')
    }
  }

  /**
   * 按页分割文本
   * 注意：pdf-parse不直接提供分页文本，这里使用简单分割
   */
  private splitTextByPages(fullText: string, totalPages: number): PdfPageText[] {
    // 如果只有一页或文本为空
    if (totalPages <= 1 || !fullText) {
      return [{
        pageNumber: 1,
        text: fullText,
        characterCount: fullText.length,
      }]
    }

    // 简单按换行分割，平均分配到各页
    const lines = fullText.split('\n')
    const linesPerPage = Math.ceil(lines.length / Math.min(totalPages, this.config.parsePageCount))
    const pages: PdfPageText[] = []

    for (let i = 0; i < Math.min(totalPages, this.config.parsePageCount); i++) {
      const start = i * linesPerPage
      const end = Math.min(start + linesPerPage, lines.length)
      const pageText = lines.slice(start, end).join('\n')

      pages.push({
        pageNumber: i + 1,
        text: pageText,
        characterCount: pageText.length,
      })
    }

    return pages
  }

  /**
   * 清洗文本
   */
  normalizeText(text: string): string {
    let normalized = text

    // 全角冒号转半角冒号
    normalized = normalized.replace(/：/g, ':')

    // 连续空格压缩
    normalized = normalized.replace(/[ \t]+/g, ' ')

    // 去除异常控制字符
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

    // 统一换行符
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    // 合并被错误拆开的专利号（如 CN\n114123456A）
    normalized = normalized.replace(/CN\s*\n\s*(\d{5,10}[A-Z])/gi, 'CN$1')

    return normalized
  }

  /**
   * 提取并清洗文本
   */
  async extractAndNormalize(filePath: string): Promise<{
    rawText: string
    normalizedText: string
    pages: PdfPageText[]
    totalCharacterCount: number
    needsOcr: boolean
  }> {
    const result = await this.extractText(filePath)

    // 合并所有页面文本
    const rawText = result.pages.map(p => p.text).join('\n')
    const normalizedText = this.normalizeText(rawText)

    return {
      rawText,
      normalizedText,
      pages: result.pages,
      totalCharacterCount: result.totalCharacterCount,
      needsOcr: result.needsOcr,
    }
  }
}

/**
 * 创建PDF文本提取器实例
 */
export function createPdfTextExtractor(config?: Partial<PdfTextExtractorConfig>): PdfTextExtractor {
  return new PdfTextExtractor(config)
}
