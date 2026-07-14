/**
 * 专利大模型提取服务测试
 * 使用Mock测试，不调用真实API
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PatentLlmExtractor } from '../../src/patent/services/patent-llm-extractor.js'
import type { LlmRequest, LlmResponse } from '../../src/patent/types.js'

describe('PatentLlmExtractor', () => {
  describe('validateResponse', () => {
    it('should validate correct response', () => {
      const extractor = new PatentLlmExtractor()
      const response: LlmResponse = {
        patentName: {
          value: '一种点云数据处理方法',
          confidence: 0.95,
          evidence: '(54)发明名称 一种点云数据处理方法',
        },
        inventors: {
          value: ['张三', '李四'],
          confidence: 0.9,
          evidence: '(72)发明人 张三 李四',
        },
        patentType: {
          value: 'INVENTION',
          confidence: 0.98,
          evidence: '发明专利申请公布说明书',
        },
        patentNumber: {
          value: 'CN114123456A',
          confidence: 0.99,
          evidence: '申请公布号 CN114123456A',
          numberType: 'PUBLICATION_NUMBER',
          candidates: [],
        },
      }

      assert.strictEqual(extractor.validateResponse(response), true)
    })

    it('should reject response with missing fields', () => {
      const extractor = new PatentLlmExtractor()
      const response = {
        patentName: {
          value: '一种方法',
          confidence: 0.9,
          evidence: '...',
        },
        // 缺少其他字段
      } as any

      assert.strictEqual(extractor.validateResponse(response), false)
    })

    it('should reject response with invalid confidence', () => {
      const extractor = new PatentLlmExtractor()
      const response: LlmResponse = {
        patentName: {
          value: '一种方法',
          confidence: 1.5, // 超出范围
          evidence: '...',
        },
        inventors: {
          value: ['张三'],
          confidence: 0.9,
          evidence: '...',
        },
        patentType: {
          value: 'INVENTION',
          confidence: 0.9,
          evidence: '...',
        },
        patentNumber: {
          value: 'CN114123456A',
          confidence: 0.9,
          evidence: '...',
          numberType: 'PUBLICATION_NUMBER',
          candidates: [],
        },
      }

      assert.strictEqual(extractor.validateResponse(response), false)
    })

    it('should reject response with invalid patent type', () => {
      const extractor = new PatentLlmExtractor()
      const response: LlmResponse = {
        patentName: {
          value: '一种方法',
          confidence: 0.9,
          evidence: '...',
        },
        inventors: {
          value: ['张三'],
          confidence: 0.9,
          evidence: '...',
        },
        patentType: {
          value: 'INVALID_TYPE' as any,
          confidence: 0.9,
          evidence: '...',
        },
        patentNumber: {
          value: 'CN114123456A',
          confidence: 0.9,
          evidence: '...',
          numberType: 'PUBLICATION_NUMBER',
          candidates: [],
        },
      }

      assert.strictEqual(extractor.validateResponse(response), false)
    })
  })

  describe('extract (with mock)', () => {
    it('should throw error when API key not configured', async () => {
      const extractor = new PatentLlmExtractor({ apiKey: '' })
      const request: LlmRequest = {
        normalizedText: '发明名称 一种方法',
        ruleResult: {
          patentName: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          inventors: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          patentType: { value: 'UNKNOWN', confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          patentNumber: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [], numberType: null, candidates: [] },
        },
      }

      await assert.rejects(
        async () => await extractor.extract(request),
        { message: 'LLM API key not configured' }
      )
    })

    it('should handle timeout', async () => {
      // 创建一个会超时的提取器
      const extractor = new PatentLlmExtractor({
        apiKey: 'test-key',
        baseUrl: 'http://localhost:99999', // 不存在的地址
        timeoutSeconds: 1,
        maxRetries: 0,
      })

      const request: LlmRequest = {
        normalizedText: '发明名称 一种方法',
        ruleResult: {
          patentName: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          inventors: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          patentType: { value: 'UNKNOWN', confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
          patentNumber: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [], numberType: null, candidates: [] },
        },
      }

      await assert.rejects(
        async () => await extractor.extract(request)
      )
    })
  })
})
