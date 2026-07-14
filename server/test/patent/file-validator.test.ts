/**
 * 文件校验工具测试
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  validatePatentNumber,
  validatePatentType,
  validateInventors,
  validatePatentName,
} from '../../src/patent/utils/file-validator.js'

describe('Patent File Validator', () => {
  describe('validatePatentNumber', () => {
    it('should validate authorization number format', () => {
      const result = validatePatentNumber('CN114123456B')
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.numberType, 'AUTHORIZATION_NUMBER')
    })

    it('should validate publication number format', () => {
      const result = validatePatentNumber('CN114123456A')
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.numberType, 'PUBLICATION_NUMBER')
    })

    it('should validate application number format', () => {
      const result = validatePatentNumber('202210123456.7')
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.numberType, 'APPLICATION_NUMBER')
    })

    it('should validate patent number with ZL prefix', () => {
      const result = validatePatentNumber('ZL202210123456.7')
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.numberType, 'PATENT_NUMBER')
    })

    it('should reject empty patent number', () => {
      const result = validatePatentNumber('')
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject patent number without digits', () => {
      const result = validatePatentNumber('ABC')
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should accept patent number with enough digits', () => {
      const result = validatePatentNumber('CN12345')
      assert.strictEqual(result.valid, true)
    })
  })

  describe('validatePatentType', () => {
    it('should accept INVENTION', () => {
      assert.strictEqual(validatePatentType('INVENTION'), true)
    })

    it('should accept UTILITY_MODEL', () => {
      assert.strictEqual(validatePatentType('UTILITY_MODEL'), true)
    })

    it('should accept DESIGN', () => {
      assert.strictEqual(validatePatentType('DESIGN'), true)
    })

    it('should accept UNKNOWN', () => {
      assert.strictEqual(validatePatentType('UNKNOWN'), true)
    })

    it('should reject invalid type', () => {
      assert.strictEqual(validatePatentType('INVALID'), false)
    })
  })

  describe('validateInventors', () => {
    it('should accept valid inventors array', () => {
      const result = validateInventors(['张三', '李四'])
      assert.strictEqual(result.valid, true)
    })

    it('should reject empty array', () => {
      const result = validateInventors([])
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject non-array input', () => {
      const result = validateInventors('张三' as any)
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject inventor with empty name', () => {
      const result = validateInventors(['张三', ''])
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject inventor with too long name', () => {
      const longName = 'A'.repeat(201)
      const result = validateInventors([longName])
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })
  })

  describe('validatePatentName', () => {
    it('should accept valid patent name', () => {
      const result = validatePatentName('一种点云数据处理方法')
      assert.strictEqual(result.valid, true)
    })

    it('should reject empty name', () => {
      const result = validatePatentName('')
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject too short name', () => {
      const result = validatePatentName('A')
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should reject too long name', () => {
      const longName = 'A'.repeat(301)
      const result = validatePatentName(longName)
      assert.strictEqual(result.valid, false)
      assert.ok(result.error)
    })

    it('should accept name with 2 characters', () => {
      const result = validatePatentName('方法')
      assert.strictEqual(result.valid, true)
    })

    it('should accept name with 300 characters', () => {
      const longName = 'A'.repeat(300)
      const result = validatePatentName(longName)
      assert.strictEqual(result.valid, true)
    })
  })
})
