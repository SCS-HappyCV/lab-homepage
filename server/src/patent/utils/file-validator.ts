/**
 * 专利文件校验工具
 */
import fs from 'node:fs/promises'

export interface FileValidationConfig {
  maxFileSizeMB: number
  allowedMimeTypes: string[]
  allowedExtensions: string[]
  checkPdfHeader: boolean
}

export interface FileValidationResult {
  valid: boolean
  error?: string
  errorCode?: string
}

const DEFAULT_CONFIG: FileValidationConfig = {
  maxFileSizeMB: 30,
  allowedMimeTypes: ['application/pdf'],
  allowedExtensions: ['.pdf'],
  checkPdfHeader: true,
}

/**
 * 校验上传的文件
 */
export async function validateUploadedFile(
  file: Express.Multer.File,
  config: Partial<FileValidationConfig> = {}
): Promise<FileValidationResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }

  // 1. 检查文件是否存在
  if (!file) {
    return {
      valid: false,
      error: '请选择要上传的文件',
      errorCode: 'PATENT_FILE_EMPTY',
    }
  }

  // 2. 检查文件大小
  const maxSizeBytes = fullConfig.maxFileSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `文件大小超过限制（最大 ${fullConfig.maxFileSizeMB}MB）`,
      errorCode: 'PATENT_FILE_TOO_LARGE',
    }
  }

  // 3. 检查文件是否为空
  if (file.size === 0) {
    return {
      valid: false,
      error: '文件为空',
      errorCode: 'PATENT_FILE_EMPTY',
    }
  }

  // 4. 检查MIME类型
  if (!fullConfig.allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: '不支持的文件类型，请上传 PDF 格式的文件',
      errorCode: 'PATENT_FILE_TYPE_INVALID',
    }
  }

  // 5. 检查文件扩展名
  const ext = getFileExtension(file.originalname)
  if (!fullConfig.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: '不支持的文件扩展名，请上传 .pdf 文件',
      errorCode: 'PATENT_FILE_TYPE_INVALID',
    }
  }

  // 6. 检查PDF文件头
  if (fullConfig.checkPdfHeader) {
    const hasValidHeader = await checkPdfHeader(file.path)
    if (!hasValidHeader) {
      return {
        valid: false,
        error: '文件不是有效的 PDF 格式',
        errorCode: 'PATENT_FILE_HEADER_INVALID',
      }
    }
  }

  return { valid: true }
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot).toLowerCase()
}

/**
 * 检查PDF文件头
 * PDF文件必须以 %PDF- 开头
 */
async function checkPdfHeader(filePath: string): Promise<boolean> {
  try {
    const buffer = Buffer.alloc(8)
    const fileHandle = await fs.open(filePath, 'r')
    try {
      await fileHandle.read(buffer, 0, 8, 0)
    } finally {
      await fileHandle.close()
    }

    const header = buffer.toString('ascii', 0, 5)
    return header === '%PDF-'
  } catch {
    return false
  }
}

/**
 * 校验专利号格式
 */
export function validatePatentNumber(patentNumber: string): {
  valid: boolean
  numberType?: string
  error?: string
} {
  if (!patentNumber || patentNumber.trim().length === 0) {
    return { valid: false, error: '专利号不能为空' }
  }

  const cleaned = patentNumber.trim()

  // 中国专利号格式
  const patterns = [
    {
      // 授权公告号：CN + 数字 + B/U/S
      regex: /^CN\d{5,10}[BUS]$/i,
      type: 'AUTHORIZATION_NUMBER',
      label: '授权公告号',
    },
    {
      // 申请公布号：CN + 数字 + A
      regex: /^CN\d{5,10}A$/i,
      type: 'PUBLICATION_NUMBER',
      label: '申请公布号',
    },
    {
      // 申请号：年份 + 数字 + .数字
      regex: /^\d{4}\d{5,10}\.\d$/,
      type: 'APPLICATION_NUMBER',
      label: '申请号',
    },
    {
      // 专利号：ZL + 年份 + 数字 + .数字
      regex: /^ZL\s?\d{4}\d{5,10}\.\d$/,
      type: 'PATENT_NUMBER',
      label: '专利号',
    },
  ]

  for (const pattern of patterns) {
    if (pattern.regex.test(cleaned)) {
      return {
        valid: true,
        numberType: pattern.type,
      }
    }
  }

  // 宽松匹配：至少包含数字
  if (/\d{5,}/.test(cleaned)) {
    return {
      valid: true,
      numberType: 'UNKNOWN',
    }
  }

  return {
    valid: false,
    error: '专利号格式不正确',
  }
}

/**
 * 校验专利类型
 */
export function validatePatentType(patentType: string): boolean {
  const validTypes = ['INVENTION', 'UTILITY_MODEL', 'DESIGN', 'UNKNOWN']
  return validTypes.includes(patentType)
}

/**
 * 校验发明人列表
 */
export function validateInventors(inventors: string[]): {
  valid: boolean
  error?: string
} {
  if (!Array.isArray(inventors)) {
    return { valid: false, error: '发明人必须是数组' }
  }

  if (inventors.length === 0) {
    return { valid: false, error: '发明人不能为空' }
  }

  for (const inventor of inventors) {
    if (typeof inventor !== 'string' || inventor.trim().length === 0) {
      return { valid: false, error: '发明人姓名不能为空' }
    }
    if (inventor.length > 200) {
      return { valid: false, error: '发明人姓名过长' }
    }
  }

  return { valid: true }
}

/**
 * 校验专利名称
 */
export function validatePatentName(name: string): {
  valid: boolean
  error?: string
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '专利名称不能为空' }
  }

  const cleaned = name.trim()

  if (cleaned.length < 2) {
    return { valid: false, error: '专利名称过短' }
  }

  if (cleaned.length > 300) {
    return { valid: false, error: '专利名称过长（最大300字符）' }
  }

  return { valid: true }
}
