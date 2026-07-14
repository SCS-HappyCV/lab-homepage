/**
 * 专利校验服务测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PatentValidator } from '../../src/patent/services/patent-validator.js'
import type { RuleResult } from '../../src/patent/types.js'

describe('PatentValidator', () => {
  const validator = new PatentValidator()

  describe('needsOcr', () => {
    it('should return true for short text', () => {
      const text = '少量文本'
      const result = validator.needsOcr(text, 4)
      assert.strictEqual(result, true)
    })

    it('should return true for text without keywords', () => {
      const text = '这是一段没有专利关键字的文本，长度超过80个字符。'.repeat(3)
      const result = validator.needsOcr(text, text.length)
      assert.strictEqual(result, true)
    })

    it('should return false for text with keywords and enough length', () => {
      const text = '发明名称一种点云数据处理方法发明人张三李四申请号这是一段补充文本用于增加长度超过个字符的限制要求包含足够多的中文字符以通过比例检查还需要更多文本继续添加以确保长度足够'
      const result = validator.needsOcr(text, text.length)
      assert.strictEqual(result, false)
    })

    it('should return true for text with low chinese ratio', () => {
      const text = 'This is English text without Chinese characters'.repeat(5)
      const result = validator.needsOcr(text, text.length)
      assert.strictEqual(result, true)
    })
  })

  describe('needsLlm', () => {
    it('should return true when patent name is empty', () => {
      const ruleResult: RuleResult = {
        patentName: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }
      assert.strictEqual(validator.needsLlm(ruleResult), true)
    })

    it('should return true when any field has low confidence', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.5, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }
      assert.strictEqual(validator.needsLlm(ruleResult), true)
    })

    it('should return false when all fields are valid with high confidence', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种点云数据处理方法', confidence: 0.95, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三', '李四'], confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.95, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.99, source: 'RULE', evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }
      assert.strictEqual(validator.needsLlm(ruleResult), false)
    })

    it('should return true when patent type is UNKNOWN', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'UNKNOWN', confidence: 0.3, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }
      assert.strictEqual(validator.needsLlm(ruleResult), true)
    })
  })

  describe('needsManualReview', () => {
    it('should return true when any field is empty', () => {
      const result = {
        patentName: { value: null, confidence: 0, source: 'RULE' as const, evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      assert.strictEqual(validator.needsManualReview(result), true)
    })

    it('should return true when confidence is low', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.5, source: 'RULE' as const, evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      assert.strictEqual(validator.needsManualReview(result), true)
    })

    it('should return true when duplicate patent number', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      assert.strictEqual(validator.needsManualReview(result, { isDuplicate: true }), true)
    })

    it('should return false when all fields are valid', () => {
      const result = {
        patentName: { value: '一种点云数据处理方法', confidence: 0.95, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三', '李四'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.95, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.99, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      assert.strictEqual(validator.needsManualReview(result), false)
    })
  })

  describe('generateWarnings', () => {
    it('should generate warning for low confidence field', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.5, source: 'RULE' as const, evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      const warnings = validator.generateWarnings(result, 'SKIPPED', 'SKIPPED')
      assert.ok(warnings.some(w => w.field === 'patentName' && w.code === 'LOW_CONFIDENCE'))
    })

    it('should generate warning for LLM failure', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      const warnings = validator.generateWarnings(result, 'FAILED', 'SKIPPED')
      assert.ok(warnings.some(w => w.code === 'LLM_FAILED'))
    })

    it('should generate warning for duplicate patent', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      const warnings = validator.generateWarnings(result, 'SKIPPED', 'SKIPPED', { isDuplicate: true })
      assert.ok(warnings.some(w => w.code === 'DUPLICATE'))
    })
  })

  describe('calculateOverallConfidence', () => {
    it('should calculate weighted average confidence', () => {
      const result = {
        patentName: { value: '一种方法', confidence: 0.8, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION' as const, confidence: 1.0, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE' as const, evidence: '', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER' as const, candidates: [] },
      }
      const confidence = validator.calculateOverallConfidence(result)
      assert.strictEqual(confidence, 0.9)
    })
  })
})
