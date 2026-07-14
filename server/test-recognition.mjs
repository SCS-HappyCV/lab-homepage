/**
 * 专利识别功能测试脚本
 * 使用方法: npx tsx test-recognition.mjs <pdf文件路径>
 */

import { createPatentRuleExtractor } from './src/patent/services/patent-rule-extractor.js'
import { createPatentValidator } from './src/patent/services/patent-validator.js'
import fs from 'fs/promises'

const pdfFile = process.argv[2]

if (!pdfFile) {
  console.error('❌ 请提供PDF文件路径')
  console.error('使用方法: npx tsx test-recognition.mjs <pdf文件路径>')
  process.exit(1)
}

console.log('📄 测试文件:', pdfFile)
console.log('')

async function extractTextFromPdf(filePath) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const buffer = await fs.readFile(filePath)
    const data = new Uint8Array(buffer)
    const pdf = await pdfjsLib.getDocument({ data }).promise

    let fullText = ''
    const maxPages = Math.min(pdf.numPages, 2)

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map(item => item.str).join(' ')
      fullText += pageText + '\n'
    }

    return {
      text: fullText,
      numPages: pdf.numPages,
      characterCount: fullText.length,
    }
  } catch (error) {
    console.error('PDF extraction error:', error.message)
    throw error
  }
}

function normalizeText(text) {
  let normalized = text
  normalized = normalized.replace(/：/g, ':')
  normalized = normalized.replace(/[ \t]+/g, ' ')
  normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  normalized = normalized.replace(/CN\s*\n\s*(\d{5,10}[A-Z])/gi, 'CN$1')
  return normalized
}

async function testRecognition() {
  try {
    // 检查文件是否存在
    await fs.access(pdfFile)
    const stats = await fs.stat(pdfFile)
    console.log('📊 文件大小:', (stats.size / 1024).toFixed(1), 'KB')
    console.log('')

    // 1. 测试PDF文本提取
    console.log('=' .repeat(60))
    console.log('📝 步骤1: PDF文本提取')
    console.log('=' .repeat(60))

    const pdfResult = await extractTextFromPdf(pdfFile)
    const normalizedText = normalizeText(pdfResult.text)

    console.log('✅ 文本提取成功')
    console.log('   - 总页数:', pdfResult.numPages)
    console.log('   - 提取页数:', Math.min(pdfResult.numPages, 2))
    console.log('   - 总字符数:', pdfResult.characterCount)
    console.log('   - 需要OCR:', pdfResult.characterCount < 80 ? '是' : '否')
    console.log('')

    // 显示提取的文本（前1000字符）
    console.log('📄 提取的文本（前1000字符）:')
    console.log('-'.repeat(60))
    console.log(normalizedText.substring(0, 1000))
    console.log('-'.repeat(60))
    console.log('')

    // 2. 测试规则提取
    console.log('=' .repeat(60))
    console.log('🔍 步骤2: 规则提取')
    console.log('=' .repeat(60))

    const ruleExtractor = createPatentRuleExtractor()
    const ruleResult = ruleExtractor.extract(normalizedText)

    console.log('✅ 规则提取完成')
    console.log('')

    // 显示规则提取结果
    console.log('📋 规则提取结果:')
    console.log('')

    console.log('【专利名称】')
    console.log('   值:', ruleResult.patentName.value || '❌ 未识别')
    console.log('   置信度:', ruleResult.patentName.confidence > 0 ? `${(ruleResult.patentName.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('   来源:', ruleResult.patentName.source)
    console.log('   证据:', ruleResult.patentName.evidence || '无')
    console.log('')

    console.log('【发明人】')
    console.log('   值:', ruleResult.inventors.value || '❌ 未识别')
    console.log('   置信度:', ruleResult.inventors.confidence > 0 ? `${(ruleResult.inventors.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('   来源:', ruleResult.inventors.source)
    console.log('   证据:', ruleResult.inventors.evidence || '无')
    console.log('')

    console.log('【专利类型】')
    console.log('   值:', ruleResult.patentType.value || '❌ 未识别')
    console.log('   置信度:', ruleResult.patentType.confidence > 0 ? `${(ruleResult.patentType.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('   来源:', ruleResult.patentType.source)
    console.log('   证据:', ruleResult.patentType.evidence || '无')
    console.log('')

    console.log('【专利号】')
    console.log('   值:', ruleResult.patentNumber.value || '❌ 未识别')
    console.log('   编号类型:', ruleResult.patentNumber.numberType || 'N/A')
    console.log('   置信度:', ruleResult.patentNumber.confidence > 0 ? `${(ruleResult.patentNumber.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('   来源:', ruleResult.patentNumber.source)
    console.log('   证据:', ruleResult.patentNumber.evidence || '无')
    if (ruleResult.patentNumber.candidates && ruleResult.patentNumber.candidates.length > 0) {
      console.log('   候选值:')
      ruleResult.patentNumber.candidates.forEach((c, i) => {
        console.log(`     ${i + 1}. ${c.value} (${c.label})`)
      })
    }
    console.log('')

    // 3. 测试校验服务
    console.log('=' .repeat(60))
    console.log('✅ 步骤3: 结果校验')
    console.log('=' .repeat(60))

    const validator = createPatentValidator()
    const needsLlm = validator.needsLlm(ruleResult)
    const needsManualReview = validator.needsManualReview(ruleResult)
    const warnings = validator.generateWarnings(ruleResult, 'SKIPPED', 'SKIPPED')

    console.log('需要大模型:', needsLlm ? '✅ 是' : '❌ 否')
    console.log('需要人工审核:', needsManualReview ? '✅ 是' : '❌ 否')
    console.log('警告数量:', warnings.length)
    console.log('')

    if (warnings.length > 0) {
      console.log('⚠️  警告信息:')
      warnings.forEach(w => {
        console.log(`   - [${w.code}] ${w.field}: ${w.message}`)
      })
      console.log('')
    }

    // 4. 总结
    console.log('=' .repeat(60))
    console.log('📊 测试总结')
    console.log('=' .repeat(60))

    const fields = [
      { name: '专利名称', result: ruleResult.patentName },
      { name: '发明人', result: ruleResult.inventors },
      { name: '专利类型', result: ruleResult.patentType },
      { name: '专利号', result: ruleResult.patentNumber },
    ]

    let recognizedCount = 0
    fields.forEach(f => {
      const status = f.result.value ? '✅' : '❌'
      const confidence = f.result.confidence > 0 ? ` (${(f.result.confidence * 100).toFixed(0)}%)` : ''
      console.log(`${status} ${f.name}: ${f.result.value || '未识别'}${confidence}`)
      if (f.result.value) recognizedCount++
    })

    console.log('')
    console.log(`🎯 识别率: ${recognizedCount}/${fields.length} (${(recognizedCount / fields.length * 100).toFixed(0)}%)`)
    console.log('')

    if (needsLlm) {
      console.log('💡 建议: 当前识别结果不完整，建议调用大模型进行补全')
    } else if (needsManualReview) {
      console.log('💡 建议: 部分字段置信度较低，建议人工确认')
    } else {
      console.log('💡 建议: 识别结果良好，可以直接使用')
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

testRecognition()
