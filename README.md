# Happy Computer Vision Lab Homepage

实验室主页项目，包含前端展示和后端管理两部分。前端基于 Vue 3 构建，构建产物由服务器 nginx 托管；后端基于 Express + SQLite，提供成员管理 API，通过 PM2 部署。

**线上地址**: https://www.scs-happycv.top/ （前端） · https://api.scs-happycv.top/ （后端 API）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vue 3 (Composition API + `<script setup>`) |
| 路由 | Vue Router 4 (Hash 模式) |
| 构建工具 | Vite 5 |
| 图标 | Lucide Vue Next |
| 后端运行时 | Node.js 22+ |
| 后端框架 | Express 4 |
| 数据库 | SQLite (`node:sqlite` 内置模块) |
| 认证 | JWT |
| 图片处理 | Sharp |
| 进程管理 | PM2 |

---

## 数据来源

- **成员数据**：来自后端 API（`/api/students`），非本地文件。成员照片、背景图由后端上传接口管理，经 Sharp 压缩后存于上传目录。
- **照片墙数据**：来自后端 API（`/api/albums`），相册与照片通过应用内后台上传管理。
- 前端 `src/data/` 仅保留类型定义，不再维护静态数据文件。

---

## 项目结构

```
lab-homepage/
├── src/                          # 前端源码
│   ├── components/               # 可复用组件
│   │   ├── DatePicker.vue        # 日期选择器
│   │   ├── ImageCropper.vue      # 图片裁剪
│   │   ├── PhotoUploader.vue     # 成员照片/头像上传
│   │   ├── PatentModal.vue       # 专利详情弹窗
│   │   ├── PatentRecognitionConfirm.vue # 专利识别确认
│   │   └── PatentUploadDialog.vue # 专利上传对话框
│   ├── data/                     # 类型定义 (真实数据来自后端 API)
│   │   ├── gallery/types.ts      # 相册 / 照片类型
│   │   └── students/types.ts     # 成员类型
│   ├── pages/                    # 页面组件
│   │   ├── HomePage.vue          # 首页
│   │   ├── PeoplePage.vue        # 成员页
│   │   ├── GalleryPage.vue       # 照片墙页
│   │   └── LoginWindow.vue       # 登录弹窗
│   ├── utils/                    # 工具函数 (API 客户端、认证、资源路径)
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口
│   ├── router.ts                 # 路由配置
│   └── style.css                 # 全局样式
├── server/                       # 后端服务
│   ├── src/                      # 服务端源码
│   │   ├── auth.ts               # 认证服务 (JWT)
│   │   ├── config.ts             # 配置加载
│   │   ├── db.ts                 # 数据库初始化
│   │   ├── image-utils.ts        # 图片处理
│   │   ├── index.ts              # Express 应用
│   │   ├── server.ts             # 服务器启动
│   │   ├── students.repo.ts      # 成员数据仓库
│   │   ├── students.routes.ts    # 成员路由
│   │   ├── patents.routes.ts     # 专利路由
│   │   └── patent/               # 专利识别模块
│   ├── scripts/                  # 数据库脚本
│   └── test/                     # 后端测试
├── public/                       # 静态资源
│   ├── cover-home.jpg            # 首页背景图
│   ├── cover-students.jpg        # 团队成员页背景图
│   └── favicon.svg
├── docs/                         # 前端构建输出 (nginx 托管，restart.sh 生成)
├── restart.sh                    # 一键构建并重启
└── ecosystem.config.cjs          # PM2 配置
```

---

## 部署

### 快速开始

#### 前端开发

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`

#### 后端开发

```bash
cd server
npm install
# 创建 .env 文件，参考下方"环境配置"章节填入配置
npm run dev             # 启动开发服务器 (默认端口 3001)
```

前端本地开发时，`vite.config.ts` 已配置将 `/uploads` 请求代理到后端。

### 生产部署（服务器）

本项目直接部署在服务器上，不依赖 GitHub Pages。使用项目根目录的 [`restart.sh`](restart.sh) 一键构建并重启：

```bash
./restart.sh
```

该脚本会依次完成：

1. 构建前端到 `docs/`（`vite build`，`outDir: docs`）
2. 构建后端到 `server/dist/`（`tsc`）
3. 重启 PM2 进程 `lab-homepage-api`

架构：

- **前端**：构建产物 `docs/` 由 nginx 托管，对外为 `https://www.scs-happycv.top`
- **后端**：PM2 进程 `lab-homepage-api` 监听 `127.0.0.1:3003`，反向代理对外为 `https://api.scs-happycv.top`
- 路由使用 Hash 模式，刷新不会 404

> 多用户管理说明：本项目使用共享 `PM2_HOME=/var/www/lab-homepage/.pm2`。若其他用户也需要执行 `pm2 status`、`pm2 logs` 等命令，需要在其 shell 配置中设置 `PM2_HOME`：
> - bash: `export PM2_HOME=/var/www/lab-homepage/.pm2`
> - fish: `set -x PM2_HOME /var/www/lab-homepage/.pm2`

验证服务：

```bash
curl https://api.scs-happycv.top/health
pm2 logs lab-homepage-api
```

---

## 后端服务

### 环境配置

`server/.env` 示例：

```env
PORT=3003
ADMIN_PASS_HASH=<sha256-hash>
JWT_SECRET=<long-random-secret>
SQLITE_PATH=./data/lab-homepage.db
CORS_ORIGIN=https://www.scs-happycv.top
UPLOAD_DIR=/var/www/uploads/students
```

> 默认端口为 3001，生产环境使用 3003。

生成管理员密码哈希：

```bash
node -e "console.log(require('node:crypto').createHash('sha256').update('your-passphrase').digest('hex'))"
```

前端 API 地址在 `.env.development` / `.env.production` 中配置：

```env
VITE_API_BASE_URL=http://172.16.224.21:3003  # 开发 (.env.development)
VITE_API_BASE_URL=https://api.scs-happycv.top # 生产 (.env.production)
```

### 初始化数据库

如果有备份的 `server/data/export-students.json`，可导入到 SQLite：

```bash
cd server
npm run db:import-json
```

导入后 SQLite 即为数据源。

### 数据库脚本

| 命令 | 说明 |
|---|---|
| `npm run db:export` | 从 SQLite 导出成员数据到 JSON |
| `npm run db:import-json` | 从 JSON 文件导入 |
| `npm run db:migrate-static-photos` | 迁移 `public/students/` 静态照片到上传目录 |

---

## 测试

```bash
# 前端测试
npm test

# 后端测试
cd server && npm test
```

后端测试覆盖：认证流程、成员 CRUD、数据仓库、API 路由、数据导入。

---

## 脚本一览

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动前端开发服务器 |
| `npm run build` | 构建前端到 `docs/` |
| `npm test` | 运行前端测试 |
| `cd server && npm run dev` | 启动后端开发服务器 |
| `cd server && npm run build` | 编译后端 TypeScript |
| `cd server && npm test` | 运行后端测试 |
| `cd server && npm run db:export` | 导出成员数据到 JSON |
| `./restart.sh` | 生产环境一键构建并重启服务 |

---

## 注意事项

- `.env` 文件已在 `.gitignore` 中，不要提交敏感信息
- 成员照片、相册照片由后端上传接口经 Sharp 自动压缩，无需本地脚本
- `docs/` 是前端构建输出，由 `./restart.sh` 生成并部署到 nginx
- 成员的电话、微信属于隐私字段，仅在本人同意后公开
- 定期运行 `npm run db:export` 备份数据库