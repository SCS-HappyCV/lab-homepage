/**
 * 专利完整流程测试（服务端直接测试）
 * 测试：PDF提取 → 规则识别 → 保存
 */

import { createPdfTextExtractor } from './src/patent/services/pdf-text-extractor.js'
import { createPatentRuleExtractor } from './src/patent/services/patent-rule-extractor.js'
import { createPatentValidator } from './src/patent/services/patent-validator.js'
import { createSimplePatentRepository } from './src/patent/simple-patent.repo.js'
import { openDatabase } from './src/db.js'
import { loadConfig } from './src/config.js'
import fs from 'fs/promises'

const pdfFile = process.argv[2]

if (!pdfFile) {
  console.error('❌ 请提供PDF文件路径')
  console.error('使用方法: npx tsx test-full-flow.mjs <pdf文件路径>')
  process.exit(1)
}

console.log('============================================================')
console.log('📄 专利完整流程测试（服务端）')
console.log('============================================================')
console.log('')
console.log('📁 测试文件:', pdfFile)
console.log('')

async function testFullFlow() {
  const startTime = Date.now()

  try {
    // 1. 检查文件
    console.log('🔍 步骤1: 检查文件...')
    await fs.access(pdfFile)
    const stats = await fs.stat(pdfFile)
    console.log('✅ 文件存在')
    console.log('📊 文件大小:', (stats.size / 1024).toFixed(1), 'KB')
    console.log('')

    // 2. PDF文本提取
    console.log('📝 步骤2: PDF文本提取...')
    const pdfExtractor = createPdfTextExtractor({
      parsePageCount: 1,
      minTextLength: 80,
    })

    const extractStart = Date.now()
    const textResult = await pdfExtractor.extractAndNormalize(pdfFile)
    const extractTime = Date.now() - extractStart

    console.log('✅ 文本提取成功')
    console.log('   - 耗时:', extractTime + 'ms')
    console.log('   - 总字符数:', textResult.totalCharacterCount)
    console.log('   - 需要OCR:', textResult.needsOcr ? '是' : '否')
    console.log('')

    // 显示提取的文本（前300字符）
    console.log('📄 提取的文本（前300字符）:')
    console.log('-'.repeat(60))
    console.log(textResult.normalizedText.substring(0, 300))
    console.log('-'.repeat(60))
    console.log('')

    // 3. 规则识别
    console.log('🔍 步骤3: 规则识别...')
    const ruleExtractor = createPatentRuleExtractor()

    const ruleStart = Date.now()
    const ruleResult = ruleExtractor.extract(textResult.normalizedText)
    const ruleTime = Date.now() - ruleStart

    console.log('✅ 规则识别完成')
    console.log('   - 耗时:', ruleTime + 'ms')
    console.log('')

    // 显示识别结果
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

    // 4. 结果校验
    console.log('✅ 步骤4: 结果校验...')
    const validator = createPatentValidator()
    const needsLlm = validator.needsLlm(ruleResult)
    const needsManualReview = validator.needsManualReview(ruleResult)

    console.log('需要大模型:', needsLlm ? '是' : '否')
    console.log('需要人工审核:', needsManualReview ? '是' : '否')
    console.log('')

    // 5. 保存到数据库
    console.log('💾 步骤5: 保存到数据库...')
    const config = loadConfig()
    const db = openDatabase(config.sqlitePath)
    const patentRepo = createSimplePatentRepository(db)

    // 检查是否已存在
    const existingPatent = ruleResult.patentNumber.value
      ? patentRepo.findByPatentNumber(ruleResult.patentNumber.value)
      : null

    if (existingPatent) {
      console.log('⚠️  专利号已存在，跳过保存')
      console.log('   已有专利ID:', existingPatent.id)
    } else {
      // 转换专利类型
      const patentTypeMap = {
        'INVENTION': '发明',
        'UTILITY_MODEL': '实用新型',
        'DESIGN': '外观设计',
        'UNKNOWN': '发明',
      }
      const patentTypeChinese = patentTypeMap[ruleResult.patentType.value] || '发明'

      // 保存专利
      const saveStart = Date.now()
      const savedPatent = patentRepo.create({
        patent_name: ruleResult.patentName.value || '未知专利',
        patent_number: ruleResult.patentNumber.value || `UNKNOWN_${Date.now()}`,
        inventors: Array.isArray(ruleResult.inventors.value) ? ruleResult.inventors.value : [],
        patent_type: patentTypeChinese,
      })
      const saveTime = Date.now() - saveStart

      console.log('✅ 专利保存成功')
      console.log('   - 耗时:', saveTime + 'ms')
      console.log('   - 专利ID:', savedPatent.id)
      console.log('   - 专利名称:', savedPatent.patent_name)
      console.log('   - 专利号:', savedPatent.patent_number)
    }
    console.log('')

    // 6. 验证保存结果
    console.log('🔍 步骤6: 验证保存结果...')
    const totalPatents = patentRepo.count()
    const latestPatents = patentRepo.list(5, 0)

    console.log('✅ 数据库中的专利总数:', totalPatents)
    console.log('')
    console.log('📋 最新专利列表:')
    latestPatents.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.patent_name}`)
      console.log(`      专利号: ${p.patent_number}`)
      console.log(`      类型: ${p.patent_type}`)
      console.log(`      发明人: ${p.inventors.join(', ')}`)
    })
    console.log('')

    // 7. 性能统计
    const totalTime = Date.now() - startTime
    console.log('============================================================')
    console.log('📊 性能统计')
    console.log('============================================================')
    console.log('')
    console.log('总耗时:', totalTime + 'ms')
    console.log('  - PDF提取:', extractTime + 'ms')
    console.log('  - 规则识别:', ruleTime + 'ms')
    console.log('')

    // 8. 总结
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
      console.log('💡 结论: 完整流程测试通过！')
    } else {
      console.log('💡 结论: 部分字段未识别，可能需要优化规则或启用大模型')
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
  }
}

testFullFlow()
