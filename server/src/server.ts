import { createApp } from './index.js'
import { loadConfig } from './config.js'
import { cleanupStagingDir } from './image-utils.js'

const config = loadConfig()
const app = createApp({ config })

// 清空上次运行残留的未提交临时照片
cleanupStagingDir(config.uploadDir).catch((error) => {
  console.warn('Failed to clean photo staging dir:', error)
})

app.listen(config.port, () => {
  console.log(`Lab homepage API listening on port ${config.port}`)
})
