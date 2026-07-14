/**
 * 专利数据导入脚本
 * 使用简化仓库导入示例数据
 */
import { openDatabase } from '../src/db.js'
import { createSimplePatentRepository } from '../src/patent/simple-patent.repo.js'
import { loadConfig } from '../src/config.js'

const samplePatents = [
  {
    patent_name: '一种基于深度学习的图像目标检测方法',
    patent_number: 'CN202310123456.7',
    inventors: ['周维', '张三', '李四'],
    patent_type: '发明',
  },
  {
    patent_name: '基于多模态融合的场景理解系统及方法',
    patent_number: 'CN202310234567.8',
    inventors: ['许海霞', '王五', '赵六'],
    patent_type: '发明',
  },
  {
    patent_name: '一种轻量化卷积神经网络结构',
    patent_number: 'CN202320345678.9',
    inventors: ['周维', '钱七'],
    patent_type: '实用新型',
  },
  {
    patent_name: '智能监控摄像头外观设计',
    patent_number: 'CN202330456789.0',
    inventors: ['孙八'],
    patent_type: '外观设计',
  },
  {
    patent_name: '基于注意力机制的图像分割方法',
    patent_number: 'CN202310567890.1',
    inventors: ['许海霞', '周九', '吴十'],
    patent_type: '发明',
  },
]

async function importPatents() {
  console.log('开始导入专利数据...')

  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const repo = createSimplePatentRepository(db)

  let imported = 0
  let skipped = 0

  for (const patent of samplePatents) {
    try {
      repo.create(patent)
      console.log(`✓ 导入专利: ${patent.patent_name}`)
      imported++
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        console.log(`- 跳过已存在: ${patent.patent_name}`)
        skipped++
      } else {
        console.error(`✗ 导入失败: ${patent.patent_name}`, error.message)
      }
    }
  }

  console.log('\n导入完成!')
  console.log(`  成功导入: ${imported} 条`)
  console.log(`  跳过已存在: ${skipped} 条`)
  console.log(`  失败: ${samplePatents.length - imported - skipped} 条`)

  // 验证导入结果
  const total = repo.count()
  console.log(`\n当前数据库中共有 ${total} 条专利记录`)
}

importPatents().catch(console.error)
