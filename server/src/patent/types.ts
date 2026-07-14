/**
 * 专利识别模块类型定义
 */

// 专利类型枚举
export type PatentType = 'INVENTION' | 'UTILITY_MODEL' | 'DESIGN' | 'UNKNOWN'

// 专利类型中文映射
export const PATENT_TYPE_MAP: Record<PatentType, string> = {
  INVENTION: '发明专利',
  UTILITY_MODEL: '实用新型专利',
  DESIGN: '外观设计专利',
  UNKNOWN: '未知',
}

// 编号类型枚举
export type NumberType = 'PATENT_NUMBER' | 'AUTHORIZATION_NUMBER' | 'PUBLICATION_NUMBER' | 'APPLICATION_NUMBER'

// 识别状态枚举
export type RecognitionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CONFIRMED' | 'CANCELLED'

// 文本提取状态
export type TextExtractionStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

// OCR状态
export type OcrStatus = 'PENDING' | 'SKIPPED' | 'COMPLETED' | 'FAILED'

// LLM状态
export type LlmStatus = 'PENDING' | 'SKIPPED' | 'COMPLETED' | 'FAILED'

// 识别来源
export type RecognitionSource = 'RULE' | 'OCR_RULE' | 'LLM' | 'RULE_AND_LLM' | 'USER'

// 专利文件记录
export interface PatentFileRecord {
  id: string
  originalName: string
  storedName: string
  storagePath: string
  mimeType: string
  fileSize: number
  sha256: string
  uploadedBy: string
  createdAt: string
  deletedAt: string | null
}

// 识别字段结果
export interface FieldResult {
  value: string | string[] | null
  confidence: number
  source: RecognitionSource
  evidence: string
  needsReview: boolean
  conflicts: FieldConflict[]
}

// 字段冲突
export interface FieldConflict {
  source: RecognitionSource
  value: string | string[]
  confidence: number
  evidence: string
}

// 专利号候选
export interface PatentNumberCandidate {
  value: string
  numberType: NumberType
  label: string
}

// 专利号字段结果（扩展）
export interface PatentNumberFieldResult extends FieldResult {
  value: string | null
  numberType: NumberType | null
  candidates: PatentNumberCandidate[]
}

// 识别任务记录
export interface PatentRecognitionRecord {
  id: string
  fileId: string
  status: RecognitionStatus
  textExtractionStatus: TextExtractionStatus
  ocrStatus: OcrStatus
  llmStatus: LlmStatus
  rawText: string | null
  normalizedText: string | null
  ruleResult: RuleResult | null
  llmResult: LlmResult | null
  mergedResult: MergedResult | null
  needsManualReview: boolean
  errorCode: string | null
  errorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  confirmedAt: string | null
}

// 规则识别结果
export interface RuleResult {
  patentName: FieldResult
  inventors: FieldResult
  patentType: FieldResult
  patentNumber: PatentNumberFieldResult
}

// 大模型识别结果
export interface LlmResult {
  patentName: FieldResult
  inventors: FieldResult
  patentType: FieldResult
  patentNumber: PatentNumberFieldResult
}

// 合并后的最终结果
export interface MergedResult {
  patentName: FieldResult
  inventors: FieldResult
  patentType: FieldResult
  patentNumber: PatentNumberFieldResult
  needsManualReview: boolean
  warnings: RecognitionWarning[]
}

// 识别警告
export interface RecognitionWarning {
  field: string
  code: string
  message: string
}

// 正式专利记录
export interface PatentRecord {
  id: string
  fileId: string | null
  recognitionId: string | null
  patentName: string
  patentType: PatentType
  patentNumber: string
  numberType: NumberType
  inventors: string[]
  recognitionSnapshot: MergedResult | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// 发明人记录
export interface PatentInventorRecord {
  id: string
  patentId: string
  inventorName: string
  sortOrder: number
  createdAt: string
}

// 用户修改记录
export interface PatentRecognitionEditRecord {
  id: string
  recognitionId: string
  fieldName: string
  recognizedValue: unknown
  confirmedValue: unknown
  modifiedBy: string
  createdAt: string
}

// 识别请求参数
export interface RecognizeRequest {
  file: Express.Multer.File
  userId: string
}

// 确认保存请求参数
export interface ConfirmPatentRequest {
  recognitionId: string
  fileId: string
  patentName: string
  inventors: string[]
  patentType: PatentType
  patentNumber: string
  numberType: NumberType
  confirmDuplicate?: boolean
}

// 识别响应
export interface RecognizeResponse {
  recognitionId: string
  fileId: string
  fileName: string
  fileSize: number
  recognitionStatus: RecognitionStatus
  recognitionMethod: string[]
  patentName: FieldResult
  inventors: FieldResult
  patentType: FieldResult & { displayValue: string }
  patentNumber: PatentNumberFieldResult
  needsManualReview: boolean
  warnings: RecognitionWarning[]
}

// PDF页面文本
export interface PdfPageText {
  pageNumber: number
  text: string
  characterCount: number
}

// PDF文本提取结果
export interface PdfTextExtractionResult {
  pages: PdfPageText[]
  totalCharacterCount: number
  needsOcr: boolean
}

// OCR识别结果
export interface OcrResult {
  pageNumber: number
  text: string
  confidence: number
  lines: OcrLine[]
}

// OCR行结果
export interface OcrLine {
  text: string
  confidence: number
  bbox: [number, number, number, number] // [x1, y1, x2, y2]
}

// 大模型请求参数
export interface LlmRequest {
  normalizedText: string
  ruleResult: RuleResult
}

// 大模型响应
export interface LlmResponse {
  patentName: {
    value: string | null
    confidence: number
    evidence: string
  }
  inventors: {
    value: string[] | null
    confidence: number
    evidence: string
  }
  patentType: {
    value: PatentType | null
    confidence: number
    evidence: string
  }
  patentNumber: {
    value: string | null
    confidence: number
    evidence: string
    numberType: NumberType | null
    candidates: PatentNumberCandidate[]
  }
}

// 错误码
export type ErrorCode =
  | 'PATENT_FILE_EMPTY'
  | 'PATENT_FILE_TOO_LARGE'
  | 'PATENT_FILE_TYPE_INVALID'
  | 'PATENT_FILE_HEADER_INVALID'
  | 'PATENT_PDF_DAMAGED'
  | 'PATENT_PDF_ENCRYPTED'
  | 'PATENT_PDF_PAGE_LIMIT_EXCEEDED'
  | 'PATENT_TEXT_EXTRACTION_FAILED'
  | 'PATENT_OCR_FAILED'
  | 'PATENT_LLM_TIMEOUT'
  | 'PATENT_LLM_INVALID_RESPONSE'
  | 'PATENT_RECOGNITION_FAILED'
  | 'PATENT_NUMBER_INVALID'
  | 'PATENT_NUMBER_DUPLICATED'
  | 'PATENT_FILE_STORAGE_FAILED'
  | 'PATENT_DATABASE_SAVE_FAILED'
