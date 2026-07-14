/**
 * 专利OCR服务测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PatentOcrService } from '../../src/patent/services/patent-ocr-service.js'

describe('PatentOcrService', () => {
  const service = new PatentOcrService()

  describe('cleanOcrText', () => {
    it('should merge separated Chinese characters', () => {
      const text = '发 明 名 称'
      const cleaned = service.cleanOcrText(text)
      assert.strictEqual(cleaned, '发明名称')
    })

    it('should remove extra whitespace', () => {
      const text = '  发明名称   一种方法  '
      const cleaned = service.cleanOcrText(text)
      assert.strictEqual(cleaned, '发明名称 一种方法')
    })

    it('should preserve normal text', () => {
      const text = '发明名称一种点云数据处理方法'
      const cleaned = service.cleanOcrText(text)
      assert.strictEqual(cleaned, text)
    })
  })

  describe('mergeResults', () => {
    it('should merge multiple OCR results', () => {
      const results = [
        {
          pageNumber: 1,
          text: '第一页内容',
          confidence: 0.9,
          lines: [],
        },
        {
          pageNumber: 2,
          text: '第二页内容',
          confidence: 0.8,
          lines: [],
        },
      ]

      const merged = service.mergeResults(results)
      assert.strictEqual(merged.text, '第一页内容\n第二页内容')
      assert.ok(Math.abs(merged.confidence - 0.85) < 0.01)
    })

    it('should handle empty results', () => {
      const merged = service.mergeResults([])
      assert.strictEqual(merged.text, '')
      assert.strictEqual(merged.confidence, 0)
    })
  })

  describe('assessQuality', () => {
    it('should assess high quality result', () => {
      const result = {
        pageNumber: 1,
        text: '发明名称一种点云数据处理方法发明人张三李四申请号202210123456.7',
        confidence: 0.95,
        lines: [],
      }

      const assessment = service.assessQuality(result)
      assert.strictEqual(assessment.quality, 'HIGH')
      assert.strictEqual(assessment.issues.length, 0)
    })

    it('should assess low quality for low confidence', () => {
      const result = {
        pageNumber: 1,
        text: '发明名称一种点云数据处理方法',
        confidence: 0.3,
        lines: [],
      }

      const assessment = service.assessQuality(result)
      assert.ok(assessment.issues.includes('OCR置信度过低'))
    })

    it('should assess low quality for short text', () => {
      const result = {
        pageNumber: 1,
        text: '短文本',
        confidence: 0.9,
        lines: [],
      }

      const assessment = service.assessQuality(result)
      assert.ok(assessment.issues.includes('识别文本过短'))
    })

    it('should assess low quality for garbled text', () => {
      const result = {
        pageNumber: 1,
        text: '□□□□□□□□□□发明名称一种方法',
        confidence: 0.9,
        lines: [],
      }

      const assessment = service.assessQuality(result)
      assert.ok(assessment.issues.includes('可能存在乱码'))
    })
  })
})
