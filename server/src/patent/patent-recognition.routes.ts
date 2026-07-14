/**
 * 专利识别路由
 */
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'node:path'
import { requireAdmin, type AuthService } from '../auth.js'
import { createPatentFileStorage } from './services/patent-file-storage.js'
import { createPatentFileRepository } from './repositories/patent-file.repository.js'
import { createPatentRecognitionRepository } from './repositories/patent-recognition.repository.js'
import { createSimplePatentRepository } from './simple-patent.repo.js'
import { validateUploadedFile } from './utils/file-validator.js'
import { createPdfTextExtractor } from './services/pdf-text-extractor.js'
import { createPatentRuleExtractor } from './services/patent-rule-extractor.js'
import { createPatentOcrService } from './services/patent-ocr-service.js'
import { createPatentLlmExtractor } from './services/patent-llm-extractor.js'
import { createPatentResultMerger } from './services/patent-result-merger.js'
import { createPatentValidator } from './services/patent-validator.js'
import { loadPatentConfig } from '../config.js'
import { v4 as uuidv4 } from 'uuid'
import type { AppDatabase } from '../db.js'
import type {
  ConfirmPatentRequest,
  RecognizeResponse,
  PatentType,
  NumberType,
  RecognitionStatus,
} from './types.js'

export interface PatentRecognitionRouterDeps {
  db: AppDatabase
  authService: AuthService
  uploadDir: string
  tempDir: string
}

export function createPatentRecognitionRouter({ db, authService, uploadDir, tempDir }: PatentRecognitionRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)

  // 创建服务实例
  const fileStorage = createPatentFileStorage({ uploadDir, tempDir })
  const fileRepo = createPatentFileRepository(db)
  const recognitionRepo = createPatentRecognitionRepository(db)
  const simplePatentRepo = createSimplePatentRepository(db)

  // 配置 multer
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fileStorage.initialize()
        cb(null, tempDir)
      } catch (error) {
        cb(error as Error, '')
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf'
      const timestamp = Date.now()
      const random = Math.random().toString(16).slice(2, 8)
      cb(null, `temp-${timestamp}-${random}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: {
      fileSize: 30 * 1024 * 1024, // 30MB
    },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true)
      } else {
        cb(new Error('不支持的文件类型，请上传 PDF 格式的文件'))
      }
    },
  })

  /**
   * POST /patents/recognize
   * 上传PDF并识别专利信息
   */
  router.post('/patents/recognize', adminOnly, upload.single('file'), async (req: Request, res: Response) => {
    const userId = (req as any).userId || 'admin'

    try {
      // 1. 校验文件
      if (!req.file) {
        res.status(400).json({
          code: 400,
          message: '请选择要上传的文件',
          error: 'PATENT_FILE_EMPTY',
        })
        return
      }

      const validation = await validateUploadedFile(req.file)
      if (!validation.valid) {
        // 清理临时文件
        await fileStorage.deleteTempFile(req.file.path)
        res.status(400).json({
          code: 400,
          message: validation.error,
          error: validation.errorCode,
        })
        return
      }

      // 2. 保存文件
      const storedFile = await fileStorage.saveFile(req.file, userId)
      const fileRecord = fileRepo.create({
        id: storedFile.id,
        originalName: storedFile.originalName,
        storedName: storedFile.storedName,
        storagePath: storedFile.storagePath,
        mimeType: storedFile.mimeType,
        fileSize: storedFile.fileSize,
        sha256: storedFile.sha256,
        uploadedBy: userId,
      })

      // 3. 创建识别任务
      const recognitionId = `rec_${uuidv4()}`
      const recognition = recognitionRepo.create({
        id: recognitionId,
        fileId: fileRecord.id,
        createdBy: userId,
      })

      // 4. 更新状态为处理中
      recognitionRepo.update(recognitionId, { status: 'PROCESSING' })

      // 5. 执行识别流程（同步处理）
      const recognizeResult = await performRecognition(
        recognitionId,
        fileRecord.storagePath,
        fileRecord.id,
        db
      )

      // 6. 返回识别结果
      const response: RecognizeResponse = {
        recognitionId: recognition.id,
        fileId: fileRecord.id,
        fileName: fileRecord.originalName,
        fileSize: fileRecord.fileSize,
        recognitionStatus: recognizeResult.status as any,
        recognitionMethod: recognizeResult.methods,
        patentName: recognizeResult.patentName,
        inventors: recognizeResult.inventors,
        patentType: {
          ...recognizeResult.patentType,
          displayValue: getPatentTypeDisplayValue(recognizeResult.patentType.value as PatentType),
        },
        patentNumber: recognizeResult.patentNumber,
        needsManualReview: recognizeResult.needsManualReview,
        warnings: recognizeResult.warnings,
      }

      res.status(200).json({
        code: 200,
        message: '识别完成',
        data: response,
      })
    } catch (error) {
      console.error('Patent recognition error:', error)

      // 尝试更新识别任务状态为失败
      if ((error as any).recognitionId) {
        recognitionRepo.update((error as any).recognitionId, {
          status: 'FAILED',
          errorCode: 'PATENT_RECOGNITION_FAILED',
          errorMessage: (error as Error).message,
        })
      }

      res.status(500).json({
        code: 500,
        message: '识别过程发生错误',
        error: 'PATENT_RECOGNITION_FAILED',
      })
    }
  })

  /**
   * POST /patents
   * 确认并保存专利
   */
  router.post('/patents/confirm', adminOnly, async (req: Request, res: Response) => {
    const userId = (req as any).userId || 'admin'

    try {
      const {
        recognitionId,
        fileId,
        patentName,
        inventors,
        patentType,
        patentNumber,
        numberType,
        confirmDuplicate,
      } = req.body as ConfirmPatentRequest

      // 1. 参数校验
      if (!recognitionId || !fileId || !patentName || !inventors || !patentType || !patentNumber) {
        res.status(400).json({
          code: 400,
          message: '参数不完整',
          error: 'PATENT_VALIDATION_FAILED',
        })
        return
      }

      // 2. 获取识别任务
      const recognition = recognitionRepo.get(recognitionId)
      if (!recognition) {
        res.status(404).json({
          code: 404,
          message: '识别任务不存在',
          error: 'PATENT_RECOGNITION_NOT_FOUND',
        })
        return
      }

      // 3. 检查专利号是否重复
      const existingPatent = simplePatentRepo.findByPatentNumber(patentNumber)
      if (existingPatent) {
        res.status(409).json({
          code: 409,
          message: '系统中已存在相同专利号，无法重复保存',
          error: 'PATENT_NUMBER_DUPLICATED',
          data: {
            existingPatentId: existingPatent.id,
            existingPatentName: existingPatent.patent_name,
          },
        })
        return
      }

      // 4. 保存正式专利记录（使用简化仓库）
      const patentId = `pat_${uuidv4()}`
      const now = new Date().toISOString()

      // 将专利类型转换为中文
      const patentTypeMap: Record<string, string> = {
        'INVENTION': '发明',
        'UTILITY_MODEL': '实用新型',
        'DESIGN': '外观设计',
        'UNKNOWN': '发明',
      }
      const patentTypeChinese = patentTypeMap[patentType] || '发明'

      // 使用简化仓库保存
      const savedPatent = simplePatentRepo.create({
        patent_name: patentName,
        patent_number: patentNumber,
        inventors: inventors,
        patent_type: patentTypeChinese,
        file_id: fileId,
      })

      // 5. 更新识别任务状态为已确认
      recognitionRepo.update(recognitionId, { status: 'CONFIRMED' })

      // 6. 返回正式专利记录
      res.status(201).json({
        code: 201,
        message: '专利保存成功',
        data: {
          id: savedPatent.id,
          patentName: savedPatent.patent_name,
          inventors: savedPatent.inventors,
          patentType: savedPatent.patent_type,
          patentNumber: savedPatent.patent_number,
        },
      })
    } catch (error) {
      console.error('Patent confirm error:', error)
      res.status(500).json({
        code: 500,
        message: '保存专利失败',
        error: 'PATENT_DATABASE_SAVE_FAILED',
      })
    }
  })

  /**
   * GET /patents/recognitions/:id
   * 查询识别任务
   */
  router.get('/patents/recognitions/:id', adminOnly, (req: Request, res: Response) => {
    try {
      const id = String(req.params.id)
      const recognition = recognitionRepo.getWithFile(id)

      if (!recognition) {
        res.status(404).json({
          code: 404,
          message: '识别任务不存在',
          error: 'PATENT_RECOGNITION_NOT_FOUND',
        })
        return
      }

      res.status(200).json({
        code: 200,
        data: recognition,
      })
    } catch (error) {
      console.error('Get recognition error:', error)
      res.status(500).json({
        code: 500,
        message: '获取识别任务失败',
      })
    }
  })

  /**
   * DELETE /patents/recognitions/:id
   * 取消识别任务
   */
  router.delete('/patents/recognitions/:id', adminOnly, async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id)
      const recognition = recognitionRepo.get(id)

      if (!recognition) {
        res.status(404).json({
          code: 404,
          message: '识别任务不存在',
          error: 'PATENT_RECOGNITION_NOT_FOUND',
        })
        return
      }

      // 更新状态为已取消
      recognitionRepo.update(id, { status: 'CANCELLED' })

      res.status(200).json({
        code: 200,
        message: '识别任务已取消',
      })
    } catch (error) {
      console.error('Cancel recognition error:', error)
      res.status(500).json({
        code: 500,
        message: '取消识别任务失败',
      })
    }
  })

  return router
}

/**
 * 执行识别流程（优化版）
 */
async function performRecognition(
  recognitionId: string,
  filePath: string,
  fileId: string,
  db: AppDatabase
): Promise<{
  status: RecognitionStatus
  methods: string[]
  patentName: any
  inventors: any
  patentType: any
  patentNumber: any
  needsManualReview: boolean
  warnings: any[]
}> {
  const config = loadPatentConfig()
  const recognitionRepo = createPatentRecognitionRepository(db)

  // 创建服务实例（只创建需要的）
  const pdfExtractor = createPdfTextExtractor({
    parsePageCount: 1, // 只解析第一页，提高速度
    minTextLength: config.ocrMinTextLength,
  })
  const ruleExtractor = createPatentRuleExtractor()
  const resultMerger = createPatentResultMerger()
  const validator = createPatentValidator({
    lowConfidenceThreshold: config.lowConfidenceThreshold,
    ocrMinTextLength: config.ocrMinTextLength,
  })

  const methods: string[] = []
  let llmResult = null
  let ocrStatus: 'SKIPPED' | 'COMPLETED' | 'FAILED' = 'SKIPPED'
  let llmStatus: 'SKIPPED' | 'COMPLETED' | 'FAILED' = 'SKIPPED'

  try {
    // 1. 提取PDF文本
    methods.push('PDF_TEXT')
    const textResult = await pdfExtractor.extractAndNormalize(filePath)
    let { rawText, normalizedText } = textResult

    // 2. 规则识别
    methods.push('RULE')
    let ruleResult = ruleExtractor.extract(normalizedText)

    // 3. 快速检查：如果规则识别结果已经很好，直接返回
    const allFieldsHaveValue = ruleResult.patentName.value &&
      ruleResult.inventors.value &&
      ruleResult.patentType.value &&
      ruleResult.patentNumber.value

    const allConfidenceHigh = ruleResult.patentName.confidence >= 0.8 &&
      ruleResult.inventors.confidence >= 0.8 &&
      ruleResult.patentType.confidence >= 0.8 &&
      ruleResult.patentNumber.confidence >= 0.8

    // 如果所有字段都有值且置信度高，直接返回，跳过OCR和大模型
    if (allFieldsHaveValue && allConfidenceHigh && !textResult.needsOcr) {
      const mergedResult = resultMerger.merge(ruleResult, null)
      const needsManualReview = false
      const warnings: any[] = []

      // 一次性更新所有状态
      recognitionRepo.update(recognitionId, {
        status: 'COMPLETED',
        textExtractionStatus: 'COMPLETED',
        rawText,
        normalizedText,
        ruleResult,
        mergedResult,
        needsManualReview,
      })

      return {
        status: 'COMPLETED',
        methods,
        patentName: mergedResult.patentName,
        inventors: mergedResult.inventors,
        patentType: mergedResult.patentType,
        patentNumber: mergedResult.patentNumber,
        needsManualReview,
        warnings,
      }
    }

    // 4. 如果需要OCR，执行OCR（异步，不阻塞返回）
    if (textResult.needsOcr && config.ocrEnabled) {
      try {
        methods.push('OCR')
        const ocrService = createPatentOcrService({
          language: config.ocrLanguage,
          dpi: config.ocrDpi,
        })
        const ocrResult = await ocrService.recognizePdf(filePath, 1)
        const cleanedText = ocrService.cleanOcrText(ocrResult.text)

        if (cleanedText.length > normalizedText.length) {
          normalizedText = cleanedText
          ruleResult = ruleExtractor.extract(normalizedText)
          ocrStatus = 'COMPLETED'
        }
      } catch (error) {
        console.error('OCR failed:', error)
        ocrStatus = 'FAILED'
      }
    }

    // 5. 判断是否需要大模型
    const needsLlm = validator.needsLlm(ruleResult)
    if (needsLlm && config.llmEnabled && config.llmApiKey) {
      try {
        methods.push('LLM')
        const llmExtractor = createPatentLlmExtractor({
          apiKey: config.llmApiKey,
          baseUrl: config.llmBaseUrl,
          model: config.llmModel,
          timeoutSeconds: config.llmTimeoutSeconds,
          maxRetries: config.llmMaxRetries,
        })
        llmResult = await llmExtractor.extract({
          normalizedText,
          ruleResult,
        })
        llmStatus = 'COMPLETED'
      } catch (error) {
        console.error('LLM extraction failed:', error)
        llmStatus = 'FAILED'
      }
    }

    // 6. 合并结果
    const mergedResult = resultMerger.merge(ruleResult, llmResult)

    // 7. 判断是否需要人工审核
    const needsManualReview = validator.needsManualReview(mergedResult)

    // 8. 生成警告
    const warnings = validator.generateWarnings(mergedResult, llmStatus, ocrStatus)

    // 9. 更新最终结果（一次性更新）
    const status: RecognitionStatus = needsManualReview ? 'PARTIAL' : 'COMPLETED'
    recognitionRepo.update(recognitionId, {
      status,
      textExtractionStatus: 'COMPLETED',
      ocrStatus,
      llmStatus,
      rawText,
      normalizedText,
      ruleResult,
      llmResult,
      mergedResult,
      needsManualReview,
    })

    return {
      status,
      methods,
      patentName: mergedResult.patentName,
      inventors: mergedResult.inventors,
      patentType: mergedResult.patentType,
      patentNumber: mergedResult.patentNumber,
      needsManualReview,
      warnings,
    }
  } catch (error) {
    console.error('Recognition failed:', error)

    // 更新识别任务状态为失败
    recognitionRepo.update(recognitionId, {
      status: 'FAILED',
      errorCode: 'PATENT_RECOGNITION_FAILED',
      errorMessage: (error as Error).message,
    })

    // 返回空结果，允许用户手动填写
    return {
      status: 'FAILED',
      methods,
      patentName: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
      inventors: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
      patentType: { value: 'UNKNOWN', confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [] },
      patentNumber: { value: null, confidence: 0, source: 'RULE', evidence: '', needsReview: true, conflicts: [], numberType: null, candidates: [] },
      needsManualReview: true,
      warnings: [{
        field: 'all',
        code: 'RECOGNITION_FAILED',
        message: '自动识别失败，请手动填写',
      }],
    }
  }
}

/**
 * 获取专利类型显示值
 */
function getPatentTypeDisplayValue(type: PatentType | null): string {
  const map: Record<PatentType, string> = {
    INVENTION: '发明专利',
    UTILITY_MODEL: '实用新型专利',
    DESIGN: '外观设计专利',
    UNKNOWN: '未知',
  }
  return type ? map[type] : '未知'
}
