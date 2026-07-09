import { createApp } from './index.js'
import { loadConfig } from './config.js'

const config = loadConfig()
const app = createApp({ config })

app.listen(config.port, () => {
  console.log(`Lab homepage API listening on port ${config.port}`)
})
