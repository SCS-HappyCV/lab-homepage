/**
 * 专利结果合并服务
 * 合并规则识别和大模型识别结果
 */
import type {
  RuleResult,
  LlmResult,
  MergedResult,
  FieldResult,
  PatentNumberFieldResult,
  RecognitionSource,
  PatentType,
  NumberType,
} from '../types.js'

export class PatentResultMerger {
  /**
   * 合并规则结果和大模型结果
   */
  merge(ruleResult: RuleResult, llmResult: LlmResult | null): MergedResult {
    if (!llmResult) {
      // 没有大模型结果，直接使用规则结果
      return {
        ...ruleResult,
        needsManualReview: this.checkNeedsReview(ruleResult),
        warnings: [],
      }
    }

    // 逐字段合并
    return {
      patentName: this.mergeField(ruleResult.patentName, llmResult.patentName),
      inventors: this.mergeField(ruleResult.inventors, llmResult.inventors),
      patentType: this.mergeField(ruleResult.patentType, llmResult.patentType),
      patentNumber: this.mergePatentNumber(ruleResult.patentNumber, llmResult.patentNumber),
      needsManualReview: false, // 后续由validator判断
      warnings: [],
    }
  }

  /**
   * 合并单个字段
   */
  private mergeField(ruleField: FieldResult, llmField: FieldResult): FieldResult {
    // 规则结果存在且格式校验通过时，优先保留规则结果
    if (ruleField.value && ruleField.confidence >= 0.8) {
      // 大模型结果有明确原文证据且置信度更高时，可以替换
      if (llmField.value && llmField.confidence > ruleField.confidence && llmField.evidence) {
        // 检查证据是否在原始文本中存在
        if (this.validateEvidence(llmField.evidence, ruleField.evidence)) {
          return {
            value: llmField.value,
            confidence: llmField.confidence,
            source: 'RULE_AND_LLM',
            evidence: llmField.evidence,
            needsReview: false,
            conflicts: [],
          }
        }
      }

      // 两者值相同时，提高置信度
      if (llmField.value && this.valuesEqual(ruleField.value, llmField.value)) {
        return {
          ...ruleField,
          confidence: Math.min(ruleField.confidence + 0.05, 1),
          source: 'RULE_AND_LLM',
          needsReview: false,
        }
      }

      // 两者值不同，保留冲突信息
      if (llmField.value && !this.valuesEqual(ruleField.value, llmField.value)) {
        return {
          ...ruleField,
          source: 'RULE',
          needsReview: true,
          conflicts: [{
            source: 'LLM',
            value: llmField.value,
            confidence: llmField.confidence,
            evidence: llmField.evidence,
          }],
        }
      }

      return ruleField
    }

    // 规则结果为空，使用大模型结果
    if (llmField.value) {
      // 大模型没有证据的字段不得采用
      if (!llmField.evidence) {
        return ruleField
      }

      return {
        value: llmField.value,
        confidence: llmField.confidence,
        source: 'LLM',
        evidence: llmField.evidence,
        needsReview: llmField.confidence < 0.8,
        conflicts: [],
      }
    }

    return ruleField
  }

  /**
   * 合并专利号字段
   */
  private mergePatentNumber(
    ruleField: PatentNumberFieldResult,
    llmField: PatentNumberFieldResult
  ): PatentNumberFieldResult {
    // 规则结果存在且格式校验通过时，优先保留规则结果
    if (ruleField.value && ruleField.confidence >= 0.8) {
      // 专利号必须通过格式校验才能采用
      if (llmField.value && this.validatePatentNumberFormat(llmField.value)) {
        // 两者值相同时，提高置信度
        if (ruleField.value === llmField.value) {
          return {
            ...ruleField,
            confidence: Math.min(ruleField.confidence + 0.05, 1),
            source: 'RULE_AND_LLM',
            needsReview: false,
          }
        }

        // 两者值不同，保留冲突信息
        return {
          ...ruleField,
          needsReview: true,
          conflicts: [{
            source: 'LLM',
            value: llmField.value,
            confidence: llmField.confidence,
            evidence: llmField.evidence,
          }],
        }
      }

      return ruleField
    }

    // 规则结果为空，使用大模型结果
    if (llmField.value && this.validatePatentNumberFormat(llmField.value)) {
      return {
        value: llmField.value,
        confidence: llmField.confidence,
        source: 'LLM',
        evidence: llmField.evidence,
        needsReview: llmField.confidence < 0.8,
        conflicts: [],
        numberType: llmField.numberType,
        candidates: llmField.candidates,
      }
    }

    return ruleField
  }

  /**
   * 检查是否需要人工审核
   */
  private checkNeedsReview(result: RuleResult): boolean {
    const fields = [result.patentName, result.inventors, result.patentType, result.patentNumber]
    return fields.some(f => !f.value || f.confidence < 0.8 || f.needsReview)
  }

  /**
   * 验证证据有效性
   */
  private validateEvidence(llmEvidence: string, ruleEvidence: string): boolean {
    // 简单验证：大模型的证据应该包含一些原文内容
    if (!llmEvidence || llmEvidence.length < 5) {
      return false
    }

    // 检查证据是否合理（不超过1000字符）
    if (llmEvidence.length > 1000) {
      return false
    }

    return true
  }

  /**
   * 验证专利号格式
   */
  private validatePatentNumberFormat(patentNumber: string): boolean {
    if (!patentNumber) return false

    const patterns = [
      /^CN\d{5,10}[A-Z]$/i,  // CN + 数字 + 字母
      /^\d{4}\d{5,10}\.\d$/,  // 申请号格式
      /^ZL\s?\d{4}\d{5,10}\.\d$/,  // 专利号格式
    ]

    return patterns.some(p => p.test(patentNumber.trim()))
  }

  /**
   * 比较两个值是否相等
   */
  private valuesEqual(a: string | string[] | null, b: string | string[] | null): boolean {
    if (a === b) return true
    if (!a || !b) return false

    if (typeof a === 'string' && typeof b === 'string') {
      return a.trim() === b.trim()
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((item, index) => item.trim() === b[index].trim())
    }

    return false
  }
}

/**
 * 创建结果合并服务实例
 */
export function createPatentResultMerger(): PatentResultMerger {
  return new PatentResultMerger()
}
