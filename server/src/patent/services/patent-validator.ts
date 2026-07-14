/**
 * 专利校验服务
 * 用于判断识别结果质量和是否需要调用OCR/大模型
 */
import type {
  RuleResult,
  FieldResult,
  PatentNumberFieldResult,
  RecognitionWarning,
  PatentType,
} from '../types.js'

export interface ValidationConfig {
  lowConfidenceThreshold: number
  ocrMinTextLength: number
  patentNameMinLength: number
  patentNameMaxLength: number
}

const DEFAULT_CONFIG: ValidationConfig = {
  lowConfidenceThreshold: 0.80,
  ocrMinTextLength: 80,
  patentNameMinLength: 2,
  patentNameMaxLength: 300,
}

export class PatentValidator {
  private config: ValidationConfig

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 判断是否需要执行OCR
   */
  needsOcr(text: string, characterCount: number): boolean {
    // 文本长度过短
    if (characterCount < this.config.ocrMinTextLength) {
      return true
    }

    // 中文字符比例过低（排除数字和标点）
    const chineseChars = text.match(/[一-鿿]/g) || []
    const chineseRatio = chineseChars.length / characterCount
    if (chineseRatio < 0.2) {
      return true
    }

    // 没有识别到专利关键字
    const keywords = [
      '发明名称', '实用新型名称', '外观设计名称',
      '发明人', '设计人', '申请号', '申请公布号', '授权公告号',
      '发明专利申请', '实用新型专利', '外观设计专利',
      '专利号',
    ]
    const hasKeyword = keywords.some(keyword => text.includes(keyword))
    if (!hasKeyword) {
      return true
    }

    return false
  }

  /**
   * 判断是否需要调用大模型
   */
  needsLlm(ruleResult: RuleResult): boolean {
    // 任一必填字段为空
    if (!ruleResult.patentName.value || !ruleResult.inventors.value ||
        !ruleResult.patentType.value || !ruleResult.patentNumber.value) {
      return true
    }

    // 专利号格式校验失败
    if (ruleResult.patentNumber.confidence < 0.5) {
      return true
    }

    // 发明人字段异常
    if (Array.isArray(ruleResult.inventors.value) && ruleResult.inventors.value.length === 0) {
      return true
    }

    // 专利名称过短或过长
    if (typeof ruleResult.patentName.value === 'string') {
      const nameLen = ruleResult.patentName.value.length
      if (nameLen < this.config.patentNameMinLength || nameLen > this.config.patentNameMaxLength) {
        return true
      }
    }

    // 置信度过低
    const fields = [ruleResult.patentName, ruleResult.inventors, ruleResult.patentType, ruleResult.patentNumber]
    const hasLowConfidence = fields.some(f => f.confidence < this.config.lowConfidenceThreshold)
    if (hasLowConfidence) {
      return true
    }

    // 专利类型无法判断
    if (ruleResult.patentType.value === 'UNKNOWN') {
      return true
    }

    // 存在冲突
    const hasConflict = fields.some(f => f.conflicts && f.conflicts.length > 0)
    if (hasConflict) {
      return true
    }

    return false
  }

  /**
   * 判断是否需要人工审核
   */
  needsManualReview(
    mergedResult: { patentName: FieldResult; inventors: FieldResult; patentType: FieldResult; patentNumber: PatentNumberFieldResult },
    duplicateCheck?: { isDuplicate: boolean }
  ): boolean {
    // 任一必填字段为空
    if (!mergedResult.patentName.value || !mergedResult.inventors.value ||
        !mergedResult.patentType.value || !mergedResult.patentNumber.value) {
      return true
    }

    // 任一字段置信度低于阈值
    const fields = [mergedResult.patentName, mergedResult.inventors, mergedResult.patentType, mergedResult.patentNumber]
    const hasLowConfidence = fields.some(f => f.confidence < this.config.lowConfidenceThreshold)
    if (hasLowConfidence) {
      return true
    }

    // 存在冲突
    const hasConflict = fields.some(f => f.conflicts && f.conflicts.length > 0)
    if (hasConflict) {
      return true
    }

    // 专利号格式校验失败
    if (mergedResult.patentNumber.confidence < 0.5) {
      return true
    }

    // 发明人为空
    if (Array.isArray(mergedResult.inventors.value) && mergedResult.inventors.value.length === 0) {
      return true
    }

    // 专利类型为UNKNOWN
    if (mergedResult.patentType.value === 'UNKNOWN') {
      return true
    }

    // 存在重复专利号
    if (duplicateCheck?.isDuplicate) {
      return true
    }

    return false
  }

  /**
   * 生成识别警告
   */
  generateWarnings(
    mergedResult: { patentName: FieldResult; inventors: FieldResult; patentType: FieldResult; patentNumber: PatentNumberFieldResult },
    llmStatus: string,
    ocrStatus: string,
    duplicateCheck?: { isDuplicate: boolean }
  ): RecognitionWarning[] {
    const warnings: RecognitionWarning[] = []

    // 检查各字段置信度
    if (mergedResult.patentName.confidence < this.config.lowConfidenceThreshold) {
      warnings.push({
        field: 'patentName',
        code: 'LOW_CONFIDENCE',
        message: '专利名称识别置信度较低，请人工确认',
      })
    }

    if (mergedResult.inventors.confidence < this.config.lowConfidenceThreshold) {
      warnings.push({
        field: 'inventors',
        code: 'LOW_CONFIDENCE',
        message: '发明人识别置信度较低，请人工确认',
      })
    }

    if (mergedResult.patentType.confidence < this.config.lowConfidenceThreshold) {
      warnings.push({
        field: 'patentType',
        code: 'LOW_CONFIDENCE',
        message: '专利类型识别置信度较低，请人工确认',
      })
    }

    if (mergedResult.patentNumber.confidence < this.config.lowConfidenceThreshold) {
      warnings.push({
        field: 'patentNumber',
        code: 'LOW_CONFIDENCE',
        message: '专利号识别置信度较低，请人工确认',
      })
    }

    // 检查字段冲突
    const fields = ['patentName', 'inventors', 'patentType', 'patentNumber'] as const
    for (const field of fields) {
      if (mergedResult[field].conflicts && mergedResult[field].conflicts.length > 0) {
        warnings.push({
          field,
          code: 'CONFLICT',
          message: `${field === 'patentName' ? '专利名称' : field === 'inventors' ? '发明人' : field === 'patentType' ? '专利类型' : '专利号'}识别结果存在冲突，请人工确认`,
        })
      }
    }

    // 检查LLM状态
    if (llmStatus === 'FAILED') {
      warnings.push({
        field: 'llm',
        code: 'LLM_FAILED',
        message: '大模型识别失败，已使用规则识别结果',
      })
    }

    // 检查OCR状态
    if (ocrStatus === 'FAILED') {
      warnings.push({
        field: 'ocr',
        code: 'OCR_FAILED',
        message: 'OCR识别失败，已使用文本提取结果',
      })
    }

    // 检查重复专利号
    if (duplicateCheck?.isDuplicate) {
      warnings.push({
        field: 'patentNumber',
        code: 'DUPLICATE',
        message: '系统中已存在相同专利号',
      })
    }

    return warnings
  }

  /**
   * 计算综合置信度
   */
  calculateOverallConfidence(result: {
    patentName: FieldResult
    inventors: FieldResult
    patentType: FieldResult
    patentNumber: PatentNumberFieldResult
  }): number {
    const weights = {
      patentName: 0.25,
      inventors: 0.25,
      patentType: 0.25,
      patentNumber: 0.25,
    }

    const confidence =
      result.patentName.confidence * weights.patentName +
      result.inventors.confidence * weights.inventors +
      result.patentType.confidence * weights.patentType +
      result.patentNumber.confidence * weights.patentNumber

    return Math.round(confidence * 100) / 100
  }
}

/**
 * 创建专利校验服务实例
 */
export function createPatentValidator(config?: Partial<ValidationConfig>): PatentValidator {
  return new PatentValidator(config)
}
