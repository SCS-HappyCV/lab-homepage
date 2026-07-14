/**
 * 服务器端识别功能测试
 * 直接在服务器端测试识别流程，不需要API认证
 */

import { createPdfTextExtractor } from './src/patent/services/pdf-text-extractor.js'
import { createPatentRuleExtractor } from './src/patent/services/patent-rule-extractor.js'
import { createPatentValidator } from './src/patent/services/patent-validator.js'
import { createPatentFileStorage } from './src/patent/services/patent-file-storage.js'
import fs from 'fs/promises'
import path from 'path'

const pdfFile = process.argv[2]

if (!pdfFile) {
  console.error('❌ 请提供PDF文件路径')
  console.error('使用方法: npx tsx test-server-recognition.mjs <pdf文件路径>')
  process.exit(1)
}

console.log('============================================================')
console.log('📄 服务器端专利识别测试')
console.log('============================================================')
console.log('')
console.log('📁 测试文件:', pdfFile)
console.log('')

async function testServerRecognition() {
  try {
    // 1. 检查文件
    console.log('🔍 步骤1: 检查文件...')
    await fs.access(pdfFile)
    const stats = await fs.stat(pdfFile)
    console.log('✅ 文件存在')
    console.log('📊 文件大小:', (stats.size / 1024).toFixed(1), 'KB')
    console.log('')

    // 2. 测试PDF文本提取
    console.log('📝 步骤2: PDF文本提取...')
    const pdfExtractor = createPdfTextExtractor({
      parsePageCount: 2,
      minTextLength: 80,
    })

    const textResult = await pdfExtractor.extractAndNormalize(pdfFile)

    console.log('✅ 文本提取成功')
    console.log('   - 总字符数:', textResult.totalCharacterCount)
    console.log('   - 需要OCR:', textResult.needsOcr ? '是' : '否')
    console.log('   - 页数:', textResult.pages.length)
    console.log('')

    // 显示提取的文本
    console.log('📄 提取的文本（前500字符）:')
    console.log('-'.repeat(60))
    console.log(textResult.normalizedText.substring(0, 500))
    console.log('-'.repeat(60))
    console.log('')

    // 3. 测试规则提取
    console.log('🔍 步骤3: 规则提取...')
    const ruleExtractor = createPatentRuleExtractor()
    const ruleResult = ruleExtractor.extract(textResult.normalizedText)

    console.log('✅ 规则提取完成')
    console.log('')

    // 显示结果
    console.log('📋 识别结果:')
    console.log('')

    console.log('【专利名称】')
    console.log('   值:', ruleResult.patentName.value || '❌ 未识别')
    console.log('   置信度:', ruleResult.patentName.confidence > 0 ? `${(ruleResult.patentName.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('')

    console.log('【发明人】')
    if (Array.isArray(ruleResult.inventors.value)) {
      console.log('   值:', ruleResult.inventors.value.join(', '))
    } else {
      console.log('   值:', ruleResult.inventors.value || '❌ 未识别')
    }
    console.log('   置信度:', ruleResult.inventors.confidence > 0 ? `${(ruleResult.inventors.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('')

    console.log('【专利类型】')
    console.log('   值:', ruleResult.patentType.value || '❌ 未识别')
    console.log('   置信度:', ruleResult.patentType.confidence > 0 ? `${(ruleResult.patentType.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('')

    console.log('【专利号】')
    console.log('   值:', ruleResult.patentNumber.value || '❌ 未识别')
    console.log('   编号类型:', ruleResult.patentNumber.numberType || 'N/A')
    console.log('   置信度:', ruleResult.patentNumber.confidence > 0 ? `${(ruleResult.patentNumber.confidence * 100).toFixed(0)}%` : 'N/A')
    console.log('')

    // 4. 测试校验
    console.log('✅ 步骤4: 结果校验...')
    const validator = createPatentValidator()
    const needsLlm = validator.needsLlm(ruleResult)
    const needsManualReview = validator.needsManualReview(ruleResult)

    console.log('需要大模型:', needsLlm ? '是' : '否')
    console.log('需要人工审核:', needsManualReview ? '是' : '否')
    console.log('')

    // 5. 总结
    console.log('============================================================')
    console.log('📊 测试总结')
    console.log('============================================================')
    console.log('')

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

    if (recognizedCount === fields.length) {
      console.log('💡 结论: 服务器端识别功能正常工作！')
      console.log('   问题可能是：')
      console.log('   1. 后端服务未加载最新代码')
      console.log('   2. API认证问题')
      console.log('   3. 前端调用方式问题')
    } else {
      console.log('💡 结论: 识别功能需要优化')
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

testServerRecognition()
