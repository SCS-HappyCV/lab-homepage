/**
 * 专利结果合并服务测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PatentResultMerger } from '../../src/patent/services/patent-result-merger.js'
import type { RuleResult, LlmResult } from '../../src/patent/types.js'

describe('PatentResultMerger', () => {
  const merger = new PatentResultMerger()

  describe('merge', () => {
    it('should use rule result when LLM result is null', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const result = merger.merge(ruleResult, null)
      assert.strictEqual(result.patentName.value, '一种方法')
      assert.strictEqual(result.patentName.source, 'RULE')
    })

    it('should prefer rule result when confidence is high', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.95, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const llmResult: LlmResult = {
        patentName: { value: '另一种方法', confidence: 0.8, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['李四'], confidence: 0.8, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'UTILITY_MODEL', confidence: 0.8, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456B', confidence: 0.8, source: 'LLM', evidence: '...', needsReview: false, conflicts: [], numberType: 'AUTHORIZATION_NUMBER', candidates: [] },
      }

      const result = merger.merge(ruleResult, llmResult)
      assert.strictEqual(result.patentName.value, '一种方法')
      assert.strictEqual(result.patentName.source, 'RULE')
    })

    it('should increase confidence when values are same', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.85, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const llmResult: LlmResult = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const result = merger.merge(ruleResult, llmResult)
      assert.strictEqual(result.patentName.value, '一种方法')
      assert.strictEqual(result.patentName.source, 'RULE_AND_LLM')
      assert.ok(result.patentName.confidence > 0.85)
    })

    it('should add conflict when values are different', () => {
      const ruleResult: RuleResult = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'RULE', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const llmResult: LlmResult = {
        patentName: { value: '另一种方法', confidence: 0.85, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const result = merger.merge(ruleResult, llmResult)
      assert.strictEqual(result.patentName.value, '一种方法')
      assert.ok(result.patentName.conflicts.length > 0)
      assert.strictEqual(result.patentName.conflicts[0].value, '另一种方法')
    })

    it('should use LLM result when rule result is empty', () => {
      const ruleResult: RuleResult = {
        patentName: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        inventors: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        patentType: { value: 'UNKNOWN', confidence: 0.3, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
        patentNumber: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [], numberType: null, candidates: [] },
      }

      const llmResult: LlmResult = {
        patentName: { value: '一种方法', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        inventors: { value: ['张三'], confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentType: { value: 'INVENTION', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [] },
        patentNumber: { value: 'CN114123456A', confidence: 0.9, source: 'LLM', evidence: '...', needsReview: false, conflicts: [], numberType: 'PUBLICATION_NUMBER', candidates: [] },
      }

      const result = merger.merge(ruleResult, llmResult)
      assert.strictEqual(result.patentName.value, '一种方法')
      assert.strictEqual(result.patentName.source, 'LLM')
    })
  })
})
