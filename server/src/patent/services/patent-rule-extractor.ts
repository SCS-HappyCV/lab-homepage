/**
 * 专利规则提取服务
 * 通过关键词、正则表达式和页面位置规则识别专利字段
 */
import type {
  RuleResult,
  FieldResult,
  PatentNumberFieldResult,
  PatentNumberCandidate,
  PatentType,
  NumberType,
} from '../types.js'

export class PatentRuleExtractor {
  /**
   * 提取专利字段
   */
  extract(text: string): RuleResult {
    return {
      patentName: this.extractPatentName(text),
      inventors: this.extractInventors(text),
      patentType: this.extractPatentType(text),
      patentNumber: this.extractPatentNumber(text),
    }
  }

  /**
   * 提取专利名称
   */
  extractPatentName(text: string): FieldResult {
    // 专利名称标签（支持空格分隔的格式）
    const labels = [
      /\(54\)\s*发明名称[:：\s]*/,
      /\(54\)\s*实用新型名称[:：\s]*/,
      /\(54\)\s*外观设计名称[:：\s]*/,
      /发\s*明\s*名\s*称[:：\s]*/,
      /实\s*用\s*新\s*型\s*名\s*称[:：\s]*/,
      /外\s*观\s*设\s*计\s*名\s*称[:：\s]*/,
      /专\s*利\s*名\s*称[:：\s]*/,
      /发明名称[:：\s]*/,
      /实用新型名称[:：\s]*/,
      /外观设计名称[:：\s]*/,
      /专利名称[:：\s]*/,
    ]

    for (const label of labels) {
      const match = text.match(label)
      if (match) {
        const startIndex = match.index! + match[0].length
        // 提取到下一个字段标签或换行
        const endPatterns = [
          /\n\s*\(\d{2}\)/,  // 下一个编号字段
          /\n\s*摘要/,
          /\n\s*权利要求/,
          /\n\s*说明/,
          /\n{2,}/,  // 多个换行
          /专\s*利\s*权\s*人/,  // 专利权人
          /地\s*址/,  // 地址
          /发\s*明\s*人/,  // 发明人
        ]

        let endIndex = text.length
        for (const endPattern of endPatterns) {
          const endMatch = text.substring(startIndex).match(endPattern)
          if (endMatch && endMatch.index !== undefined) {
            endIndex = Math.min(endIndex, startIndex + endMatch.index)
          }
        }

        let name = text.substring(startIndex, endIndex).trim()

        // 清理名称
        name = name.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

        // 去除可能混入的摘要内容
        const abstractIndex = name.indexOf('摘要')
        if (abstractIndex > 0) {
          name = name.substring(0, abstractIndex).trim()
        }

        if (name.length >= 2 && name.length <= 300) {
          return {
            value: name,
            confidence: 0.9,
            source: 'RULE',
            evidence: match[0] + name,
            needsReview: false,
            conflicts: [],
          }
        }
      }
    }

    // 尝试从标题行提取（通常是第一行或前几行）
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length > 0) {
      // 查找包含"专利"或"发明"的行
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].trim()
        if ((line.includes('发明') || line.includes('实用新型') || line.includes('外观设计')) &&
            line.length >= 4 && line.length <= 300) {
          // 去除可能的标签前缀
          const cleaned = line.replace(/^.*(?:名称|专利)[:\s]*/u, '').trim()
          if (cleaned.length >= 2) {
            return {
              value: cleaned,
              confidence: 0.6,
              source: 'RULE',
              evidence: line,
              needsReview: true,
              conflicts: [],
            }
          }
        }
      }
    }

    return {
      value: null,
      confidence: 0,
      source: 'RULE',
      evidence: '',
      needsReview: true,
      conflicts: [],
    }
  }

  /**
   * 提取发明人
   */
  extractInventors(text: string): FieldResult {
    // 发明人标签（支持空格分隔的格式）
    const labels = [
      /\(72\)\s*发明人[:：\s]*/,
      /\(72\)\s*设计人[:：\s]*/,
      /发\s*明\s*人[:：\s]*/,
      /设\s*计\s*人[:：\s]*/,
      /发明人[:：\s]*/,
      /设计人[:：\s]*/,
    ]

    for (const label of labels) {
      const match = text.match(label)
      if (match) {
        const startIndex = match.index! + match[0].length
        // 提取到下一个编号字段或换行
        const endPatterns = [
          /\n\s*\(\d{2}\)/,
          /\n\s*申请人/,
          /\n\s*代理/,
          /\n\s*联系/,
          /\n\s*发\s*明\s*名\s*称/,
          /\n\s*实\s*用\s*新\s*型/,
          /\n\s*外\s*观\s*设\s*计/,
          /\n\s*专\s*利/,
          /\n{2,}/,
          /\n(?=[A-Z]{2}\d{5,})/,  // 专利号前的换行
          /专\s*利\s*号/,  // 专利号
          /授\s*权\s*公\s*告/,  // 授权公告
          /专\s*利\s*申\s*请\s*日/,  // 专利申请日
          /国\s*家\s*知\s*识\s*产\s*权\s*局/,  // 国家知识产权局
        ]

        let endIndex = text.length
        for (const endPattern of endPatterns) {
          const endMatch = text.substring(startIndex).match(endPattern)
          if (endMatch && endMatch.index !== undefined) {
            endIndex = Math.min(endIndex, startIndex + endMatch.index)
          }
        }

        // 只取第一行（发明人通常在同一行）
        let inventorText = text.substring(startIndex, endIndex)
        const firstLineEnd = inventorText.indexOf('\n')
        if (firstLineEnd > 0) {
          inventorText = inventorText.substring(0, firstLineEnd)
        }
        inventorText = inventorText.trim()

        // 解析发明人列表
        const inventors = this.parseInventors(inventorText)

        if (inventors.length > 0) {
          return {
            value: inventors,
            confidence: 0.85,
            source: 'RULE',
            evidence: match[0] + inventorText,
            needsReview: false,
            conflicts: [],
          }
        }
      }
    }

    return {
      value: null,
      confidence: 0,
      source: 'RULE',
      evidence: '',
      needsReview: true,
      conflicts: [],
    }
  }

  /**
   * 解析发明人列表
   */
  private parseInventors(text: string): string[] {
    // 分隔符：顿号（、）、逗号、分号、空格、中文分号
    const separators = /[,，;；、\s]+/
    let inventors = text.split(separators).map(s => s.trim()).filter(Boolean)

    // 去除括号中的内容
    inventors = inventors.map(inv => inv.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim())

    // 过滤空值和过长的值
    inventors = inventors.filter(inv => inv.length > 0 && inv.length <= 200)

    // 去除可能误识别的关键词
    const keywords = ['申请人', '代理人', '联系人', '地址', '电话', '邮箱']
    inventors = inventors.filter(inv => !keywords.some(kw => inv.includes(kw)))

    return inventors
  }

  /**
   * 提取专利类型
   */
  extractPatentType(text: string): FieldResult {
    // 明确的类型标识（支持空格分隔的格式）
    const typePatterns: { pattern: RegExp; type: PatentType; confidence: number }[] = [
      { pattern: /发\s*明\s*专\s*利\s*申\s*请\s*公\s*布\s*说\s*明\s*书/, type: 'INVENTION', confidence: 0.99 },
      { pattern: /发\s*明\s*专\s*利\s*证\s*书/, type: 'INVENTION', confidence: 0.99 },
      { pattern: /发\s*明\s*专\s*利\s*申\s*请/, type: 'INVENTION', confidence: 0.95 },
      { pattern: /发\s*明\s*专\s*利/, type: 'INVENTION', confidence: 0.95 },
      { pattern: /发\s*明\s*公\s*布/, type: 'INVENTION', confidence: 0.95 },
      { pattern: /实\s*用\s*新\s*型\s*专\s*利/, type: 'UTILITY_MODEL', confidence: 0.95 },
      { pattern: /实\s*用\s*新\s*型/, type: 'UTILITY_MODEL', confidence: 0.9 },
      { pattern: /外\s*观\s*设\s*计\s*专\s*利/, type: 'DESIGN', confidence: 0.95 },
      { pattern: /外\s*观\s*设\s*计/, type: 'DESIGN', confidence: 0.9 },
    ]

    for (const { pattern, type, confidence } of typePatterns) {
      const match = text.match(pattern)
      if (match) {
        return {
          value: type,
          confidence,
          source: 'RULE',
          evidence: match[0],
          needsReview: false,
          conflicts: [],
        }
      }
    }

    // 根据专利号末尾字母判断
    const patentNumberMatch = text.match(/CN\d{5,10}([A-Z])/i)
    if (patentNumberMatch) {
      const suffix = patentNumberMatch[1].toUpperCase()
      let type: PatentType = 'UNKNOWN'
      let confidence = 0.7

      if (suffix === 'A') {
        type = 'INVENTION'
      } else if (suffix === 'B') {
        type = 'INVENTION'
      } else if (suffix === 'U') {
        type = 'UTILITY_MODEL'
      } else if (suffix === 'S') {
        type = 'DESIGN'
      } else if (suffix === 'Y') {
        type = 'UTILITY_MODEL'
      } else if (suffix === 'D') {
        type = 'DESIGN'
      }

      if (type !== 'UNKNOWN') {
        return {
          value: type,
          confidence,
          source: 'RULE',
          evidence: patentNumberMatch[0],
          needsReview: false,
          conflicts: [],
        }
      }
    }

    return {
      value: 'UNKNOWN',
      confidence: 0.3,
      source: 'RULE',
      evidence: '',
      needsReview: true,
      conflicts: [],
    }
  }

  /**
   * 提取专利号
   */
  extractPatentNumber(text: string): PatentNumberFieldResult {
    const candidates: PatentNumberCandidate[] = []

    // 授权公告号（支持空格分隔的格式）
    const authMatch = text.match(/授\s*权\s*公\s*告\s*号[:\s]*(CN\s*\d{5,10}\s*[BUS])/i)
    if (authMatch) {
      candidates.push({
        value: authMatch[1].replace(/\s/g, '').toUpperCase(),
        numberType: 'AUTHORIZATION_NUMBER',
        label: '授权公告号',
      })
    }

    // 申请公布号（支持空格分隔的格式）
    const pubMatch = text.match(/申\s*请\s*公\s*布\s*号[:\s]*(CN\s*\d{5,10}\s*A)/i)
    if (pubMatch) {
      candidates.push({
        value: pubMatch[1].replace(/\s/g, '').toUpperCase(),
        numberType: 'PUBLICATION_NUMBER',
        label: '申请公布号',
      })
    }

    // 申请号（支持空格分隔的格式）
    const appMatch = text.match(/申\s*请\s*号[:\s]*(\d{4}\s*\d{5,10}\s*\.\s*\d)/)
    if (appMatch) {
      candidates.push({
        value: appMatch[1].replace(/\s/g, ''),
        numberType: 'APPLICATION_NUMBER',
        label: '申请号',
      })
    }

    // 专利号（ZL开头，支持空格分隔的格式）
    const patentMatch = text.match(/专\s*利\s*号[:\s]*(ZL\s*\d{4}\s*\d{5,10}\s*\.\s*\d)/)
    if (patentMatch) {
      candidates.push({
        value: patentMatch[1].replace(/\s/g, ''),
        numberType: 'PATENT_NUMBER',
        label: '专利号',
      })
    }

    // 通用CN编号（支持空格）
    if (candidates.length === 0) {
      const cnMatches = text.matchAll(/CN\s*(\d{5,10}\s*[A-Z])/gi)
      for (const match of cnMatches) {
        const value = `CN${match[1]}`.replace(/\s/g, '').toUpperCase()
        const suffix = value.slice(-1)

        let numberType: NumberType = 'PUBLICATION_NUMBER'
        let label = '公布号'

        if (suffix === 'B' || suffix === 'U' || suffix === 'S') {
          numberType = 'AUTHORIZATION_NUMBER'
          label = '授权公告号'
        } else if (suffix === 'A') {
          numberType = 'PUBLICATION_NUMBER'
          label = '申请公布号'
        }

        candidates.push({ value, numberType, label })
      }
    }

    // 选择最佳候选
    const selected = this.selectBestPatentNumber(candidates)

    if (selected) {
      return {
        value: selected.value,
        confidence: 0.9,
        source: 'RULE',
        evidence: `${selected.label} ${selected.value}`,
        needsReview: false,
        conflicts: [],
        numberType: selected.numberType,
        candidates,
      }
    }

    return {
      value: null,
      confidence: 0,
      source: 'RULE',
      evidence: '',
      needsReview: true,
      conflicts: [],
      numberType: null,
      candidates,
    }
  }

  /**
   * 选择最佳专利号
   * 优先级：专利号 > 授权公告号 > 申请公布号 > 申请号
   */
  private selectBestPatentNumber(candidates: PatentNumberCandidate[]): PatentNumberCandidate | null {
    if (candidates.length === 0) return null

    const priority: Record<NumberType, number> = {
      'PATENT_NUMBER': 4,
      'AUTHORIZATION_NUMBER': 3,
      'PUBLICATION_NUMBER': 2,
      'APPLICATION_NUMBER': 1,
    }

    // 按优先级排序
    candidates.sort((a, b) => (priority[b.numberType] || 0) - (priority[a.numberType] || 0))

    return candidates[0]
  }
}

/**
 * 创建规则提取器实例
 */
export function createPatentRuleExtractor(): PatentRuleExtractor {
  return new PatentRuleExtractor()
}
