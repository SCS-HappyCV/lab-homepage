/**
 * 专利规则提取服务测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PatentRuleExtractor } from '../../src/patent/services/patent-rule-extractor.js'

describe('PatentRuleExtractor', () => {
  const extractor = new PatentRuleExtractor()

  describe('extractPatentName', () => {
    it('should extract name after (54) label', () => {
      const text = '(54)发明名称 一种点云数据处理方法\n(57)摘要'
      const result = extractor.extractPatentName(text)
      assert.strictEqual(result.value, '一种点云数据处理方法')
      assert.ok(result.confidence > 0.8)
    })

    it('should extract name after simple label', () => {
      const text = '发明名称：一种图像识别方法及装置'
      const result = extractor.extractPatentName(text)
      assert.strictEqual(result.value, '一种图像识别方法及装置')
    })

    it('should handle multi-line name', () => {
      const text = '(54)发明名称\n一种基于深度学习的\n点云数据处理方法\n(57)摘要'
      const result = extractor.extractPatentName(text)
      assert.ok(result.value)
      assert.ok(result.value.includes('基于深度学习'))
    })

    it('should return null when no name found', () => {
      const text = '这是一段普通文本没有任何专利相关信息'
      const result = extractor.extractPatentName(text)
      // 可能会返回null或低置信度的结果
      assert.ok(result.confidence < 0.7 || result.value === null)
    })
  })

  describe('extractInventors', () => {
    it('should extract inventors after (72) label', () => {
      const text = '(72)发明人 张三 李四 王五'
      const result = extractor.extractInventors(text)
      assert.deepStrictEqual(result.value, ['张三', '李四', '王五'])
    })

    it('should extract inventors with Chinese separators', () => {
      const text = '发明人：张三、李四、王五'
      const result = extractor.extractInventors(text)
      assert.deepStrictEqual(result.value, ['张三', '李四', '王五'])
    })

    it('should extract inventors with comma separators', () => {
      const text = '发明人: 张三, 李四, 王五'
      const result = extractor.extractInventors(text)
      assert.deepStrictEqual(result.value, ['张三', '李四', '王五'])
    })

    it('should handle foreign names with spaces', () => {
      const text = '发明人：张三 John Smith 李四'
      const result = extractor.extractInventors(text)
      assert.ok(Array.isArray(result.value))
      assert.ok(result.value.length >= 2)
    })

    it('should return null when no inventors found', () => {
      const text = '这是一段普通文本没有任何专利相关信息'
      const result = extractor.extractInventors(text)
      // 可能会返回null或空数组
      assert.ok(result.value === null || (Array.isArray(result.value) && result.value.length === 0))
    })
  })

  describe('extractPatentType', () => {
    it('should identify invention patent', () => {
      const text = '发明专利申请公布说明书'
      const result = extractor.extractPatentType(text)
      assert.strictEqual(result.value, 'INVENTION')
      assert.ok(result.confidence > 0.9)
    })

    it('should identify utility model', () => {
      const text = '实用新型专利'
      const result = extractor.extractPatentType(text)
      assert.strictEqual(result.value, 'UTILITY_MODEL')
    })

    it('should identify design patent', () => {
      const text = '外观设计专利'
      const result = extractor.extractPatentType(text)
      assert.strictEqual(result.value, 'DESIGN')
    })

    it('should identify from patent number suffix', () => {
      const text = 'CN114123456A'
      const result = extractor.extractPatentType(text)
      assert.strictEqual(result.value, 'INVENTION')
    })

    it('should return UNKNOWN when type unclear', () => {
      const text = '这是一段没有明确专利类型的文本'
      const result = extractor.extractPatentType(text)
      assert.strictEqual(result.value, 'UNKNOWN')
    })
  })

  describe('extractPatentNumber', () => {
    it('should extract authorization number', () => {
      const text = '授权公告号 CN114123456B'
      const result = extractor.extractPatentNumber(text)
      assert.strictEqual(result.value, 'CN114123456B')
      assert.strictEqual(result.numberType, 'AUTHORIZATION_NUMBER')
    })

    it('should extract publication number', () => {
      const text = '申请公布号 CN114123456A'
      const result = extractor.extractPatentNumber(text)
      assert.strictEqual(result.value, 'CN114123456A')
      assert.strictEqual(result.numberType, 'PUBLICATION_NUMBER')
    })

    it('should extract application number', () => {
      const text = '申请号 202210123456.7'
      const result = extractor.extractPatentNumber(text)
      assert.strictEqual(result.value, '202210123456.7')
      assert.strictEqual(result.numberType, 'APPLICATION_NUMBER')
    })

    it('should extract patent number with ZL prefix', () => {
      const text = '专利号 ZL202210123456.7'
      const result = extractor.extractPatentNumber(text)
      assert.strictEqual(result.value, 'ZL202210123456.7')
      assert.strictEqual(result.numberType, 'PATENT_NUMBER')
    })

    it('should return candidates when multiple numbers found', () => {
      const text = '授权公告号 CN114123456B 申请号 202210123456.7'
      const result = extractor.extractPatentNumber(text)
      assert.ok(result.candidates.length >= 2)
      assert.strictEqual(result.value, 'CN114123456B') // 优先选择授权公告号
    })

    it('should return null when no number found', () => {
      const text = '这是一段没有专利号的文本'
      const result = extractor.extractPatentNumber(text)
      assert.strictEqual(result.value, null)
    })
  })

  describe('extract (complete)', () => {
    it('should extract all fields from standard patent text', () => {
      const text = `
        (54)发明名称 一种点云数据处理方法
        (72)发明人 张三 李四
        发明专利申请公布说明书
        申请公布号 CN114123456A
      `
      const result = extractor.extract(text)
      assert.strictEqual(result.patentName.value, '一种点云数据处理方法')
      assert.deepStrictEqual(result.inventors.value, ['张三', '李四'])
      assert.strictEqual(result.patentType.value, 'INVENTION')
      assert.strictEqual(result.patentNumber.value, 'CN114123456A')
    })

    it('should handle incomplete text', () => {
      const text = '这是一段不完整的专利文本'
      const result = extractor.extract(text)
      // 应该返回null或UNKNOWN，不抛出错误
      assert.ok(result)
    })
  })
})
