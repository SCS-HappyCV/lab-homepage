/**
 * 专利大模型提取服务
 * 用于补全和纠错专利字段
 */
import type {
  LlmResult,
  LlmRequest,
  LlmResponse,
  FieldResult,
  PatentNumberFieldResult,
  PatentType,
  NumberType,
} from '../types.js'

export interface LlmClientConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutSeconds: number
  maxRetries: number
}

const DEFAULT_CONFIG: LlmClientConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeoutSeconds: 30,
  maxRetries: 1,
}

// 大模型系统提示词
const SYSTEM_PROMPT = `你是一个专业的专利著录信息提取程序。你的任务是从专利文本中准确提取以下4个关键字段。

## 需要提取的字段

1. **patentName** - 专利名称/发明名称
2. **inventors** - 发明人列表（数组）
3. **patentType** - 专利类型
4. **patentNumber** - 专利号

## 专利类型说明

- INVENTION: 发明专利（包括发明专利申请、发明专利公布）
- UTILITY_MODEL: 实用新型专利
- DESIGN: 外观设计专利
- UNKNOWN: 无法确定

## 专利号类型说明

- APPLICATION_NUMBER: 申请号（格式如：202210123456.7）
- PUBLICATION_NUMBER: 申请公布号（格式如：CN114123456A）
- AUTHORIZATION_NUMBER: 授权公告号（格式如：CN114123456B）
- PATENT_NUMBER: 专利号（格式如：ZL202210123456.7）

## 严格要求

1. 只能使用输入文本中**明确出现**的信息，禁止推测或补全
2. 找不到的字段必须返回 null
3. 发明人必须返回字符串数组，如 ["张三", "李四"]
4. 每个非空字段必须提供原文证据 evidence（直接引用原文）
5. confidence 表示你对提取结果的把握程度（0-1之间）
6. 如果存在多个专利编号，全部放入 candidates 数组
7. 必须严格按照JSON格式返回，不要输出任何额外解释

## 示例

输入文本：
\`\`\`
(54)发明名称 一种点云数据处理方法
(72)发明人 张三 李四
发明专利申请公布说明书
申请公布号 CN114123456A
\`\`\`

输出：
\`\`\`json
{
  "patentName": {
    "value": "一种点云数据处理方法",
    "confidence": 0.95,
    "evidence": "(54)发明名称 一种点云数据处理方法"
  },
  "inventors": {
    "value": ["张三", "李四"],
    "confidence": 0.9,
    "evidence": "(72)发明人 张三 李四"
  },
  "patentType": {
    "value": "INVENTION",
    "confidence": 0.95,
    "evidence": "发明专利申请公布说明书"
  },
  "patentNumber": {
    "value": "CN114123456A",
    "confidence": 0.98,
    "evidence": "申请公布号 CN114123456A",
    "numberType": "PUBLICATION_NUMBER",
    "candidates": [
      {"value": "CN114123456A", "numberType": "PUBLICATION_NUMBER"}
    ]
  }
}
\`\`\``

// JSON Schema 定义
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    patentName: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    inventors: {
      type: 'object',
      properties: {
        value: {
          type: ['array', 'null'],
          items: { type: 'string' },
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    patentType: {
      type: 'object',
      properties: {
        value: {
          type: ['string', 'null'],
          enum: ['INVENTION', 'UTILITY_MODEL', 'DESIGN', 'UNKNOWN', null],
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'string' },
      },
      required: ['value', 'confidence', 'evidence'],
    },
    patentNumber: {
      type: 'object',
      properties: {
        value: { type: ['string', 'null'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence: { type: 'string' },
        numberType: {
          type: ['string', 'null'],
          enum: ['PATENT_NUMBER', 'AUTHORIZATION_NUMBER', 'PUBLICATION_NUMBER', 'APPLICATION_NUMBER', null],
        },
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              numberType: { type: 'string' },
            },
            required: ['value', 'numberType'],
          },
        },
      },
      required: ['value', 'confidence', 'evidence', 'candidates'],
    },
  },
  required: ['patentName', 'inventors', 'patentType', 'patentNumber'],
}

export class PatentLlmExtractor {
  private config: LlmClientConfig

  constructor(config: Partial<LlmClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 调用大模型提取专利字段
   */
  async extract(request: LlmRequest): Promise<LlmResult> {
    if (!this.config.apiKey) {
      throw new Error('LLM API key not configured')
    }

    // 构建用户提示词
    const userPrompt = this.buildUserPrompt(request)

    // 调用大模型（带重试）
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.callLlm(userPrompt)
        return this.parseResponse(response)
      } catch (error) {
        lastError = error as Error
        if (attempt < this.config.maxRetries) {
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
    }

    throw lastError || new Error('LLM call failed')
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(request: LlmRequest): string {
    const parts: string[] = []

    // 添加标准化文本（增加长度限制到4000字符）
    if (request.normalizedText) {
      // 提取包含关键字的段落，而不是简单截断
      const relevantText = this.extractRelevantText(request.normalizedText, 4000)
      parts.push(`## 专利文本\n\n${relevantText}`)
    }

    // 添加规则识别结果（如果有的话）
    if (request.ruleResult) {
      const ruleSummary = this.summarizeRuleResult(request.ruleResult)
      if (ruleSummary) {
        parts.push(`## 已有识别结果（供参考）\n\n${ruleSummary}`)
      }
    }

    return parts.join('\n\n')
  }

  /**
   * 提取相关文本（包含关键字的段落）
   */
  private extractRelevantText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text
    }

    // 优先保留包含关键字的行
    const keywords = [
      '发明名称', '实用新型名称', '外观设计名称',
      '发明人', '设计人',
      '申请号', '申请公布号', '授权公告号', '专利号',
      '发明专利', '实用新型', '外观设计',
    ]

    const lines = text.split('\n')
    const relevantLines: string[] = []
    let currentLength = 0

    // 首先添加包含关键字的行
    for (const line of lines) {
      const hasKeyword = keywords.some(kw => line.includes(kw))
      if (hasKeyword && currentLength + line.length < maxLength) {
        relevantLines.push(line)
        currentLength += line.length + 1
      }
    }

    // 然后添加其他行，直到达到长度限制
    for (const line of lines) {
      if (!relevantLines.includes(line) && currentLength + line.length < maxLength) {
        relevantLines.push(line)
        currentLength += line.length + 1
      }
    }

    return relevantLines.join('\n')
  }

  /**
   * 总结规则识别结果
   */
  private summarizeRuleResult(ruleResult: any): string {
    const summary: string[] = []

    if (ruleResult.patentName?.value) {
      summary.push(`专利名称: ${ruleResult.patentName.value}`)
    }
    if (ruleResult.inventors?.value && Array.isArray(ruleResult.inventors.value)) {
      summary.push(`发明人: ${ruleResult.inventors.value.join(', ')}`)
    }
    if (ruleResult.patentType?.value && ruleResult.patentType.value !== 'UNKNOWN') {
      summary.push(`专利类型: ${ruleResult.patentType.value}`)
    }
    if (ruleResult.patentNumber?.value) {
      summary.push(`专利号: ${ruleResult.patentNumber.value}`)
    }

    return summary.length > 0 ? summary.join('\n') : ''
  }

  /**
   * 调用大模型API
   */
  private async callLlm(userPrompt: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutSeconds * 1000)

    try {
      // 构建请求体（不使用response_format，因为小米MiMo可能不支持）
      const requestBody: any = {
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }

      // 尝试添加response_format（如果模型支持的话）
      // 注意：小米MiMo可能不支持这个参数
      // requestBody.response_format = { type: 'json_object' }

      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('LLM API error response:', errorText)
        throw new Error(`LLM API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as any
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('LLM returned empty response')
      }

      return content
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * 解析大模型响应
   */
  private parseResponse(responseText: string): LlmResult {
    let parsed: any

    try {
      // 尝试直接解析JSON
      parsed = JSON.parse(responseText)
    } catch {
      // 如果直接解析失败，尝试从文本中提取JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch {
          throw new Error('LLM returned invalid JSON')
        }
      } else {
        throw new Error('LLM returned invalid JSON')
      }
    }

    // 验证必需字段
    if (!parsed.patentName || !parsed.inventors || !parsed.patentType || !parsed.patentNumber) {
      console.error('LLM response missing fields:', parsed)
      throw new Error('LLM response missing required fields')
    }

    // 转换为标准格式
    return {
      patentName: this.parseFieldResult(parsed.patentName),
      inventors: this.parseFieldResult(parsed.inventors),
      patentType: this.parseFieldResult(parsed.patentType),
      patentNumber: this.parsePatentNumberResult(parsed.patentNumber),
    }
  }

  /**
   * 解析字段结果
   */
  private parseFieldResult(data: any): FieldResult {
    // 处理value字段
    let value = data.value
    if (value === 'null' || value === 'undefined') {
      value = null
    }

    // 处理confidence字段
    let confidence = data.confidence || 0
    if (typeof confidence === 'string') {
      confidence = parseFloat(confidence) || 0
    }
    // 确保在0-1范围内
    confidence = Math.max(0, Math.min(1, confidence))

    // 处理evidence字段
    const evidence = data.evidence || ''

    return {
      value,
      confidence,
      source: 'LLM',
      evidence,
      needsReview: !value || confidence < 0.8,
      conflicts: [],
    }
  }

  /**
   * 解析专利号结果
   */
  private parsePatentNumberResult(data: any): PatentNumberFieldResult {
    // 处理value字段
    let value = data.value
    if (value === 'null' || value === 'undefined') {
      value = null
    }

    // 处理confidence字段
    let confidence = data.confidence || 0
    if (typeof confidence === 'string') {
      confidence = parseFloat(confidence) || 0
    }
    confidence = Math.max(0, Math.min(1, confidence))

    // 处理evidence字段
    const evidence = data.evidence || ''

    // 处理numberType字段
    let numberType = data.numberType || null
    if (numberType === 'null' || numberType === 'undefined') {
      numberType = null
    }

    // 处理candidates字段
    let candidates = data.candidates || []
    if (!Array.isArray(candidates)) {
      candidates = []
    }

    return {
      value,
      confidence,
      source: 'LLM',
      evidence,
      needsReview: !value || confidence < 0.8,
      conflicts: [],
      numberType,
      candidates,
    }
  }

  /**
   * 验证响应格式
   */
  validateResponse(response: LlmResponse): boolean {
    // 检查必需字段
    if (!response.patentName || !response.inventors || !response.patentType || !response.patentNumber) {
      return false
    }

    // 检查置信度范围
    const fields = [response.patentName, response.inventors, response.patentType, response.patentNumber]
    for (const field of fields) {
      if (field.confidence < 0 || field.confidence > 1) {
        return false
      }
    }

    // 检查专利类型
    const validTypes: (PatentType | null)[] = ['INVENTION', 'UTILITY_MODEL', 'DESIGN', 'UNKNOWN', null]
    if (!validTypes.includes(response.patentType.value)) {
      return false
    }

    return true
  }
}

/**
 * 创建大模型提取器实例
 */
export function createPatentLlmExtractor(config?: Partial<LlmClientConfig>): PatentLlmExtractor {
  return new PatentLlmExtractor(config)
}
