# Happy Computer Vision Lab Homepage

实验室主页项目，包含前端展示和后端管理两部分。前端基于 Vue 3 构建，部署在 GitHub Pages；后端基于 Express + SQLite，提供成员管理 API，通过 PM2 部署。

**线上地址**: https://scs-happycv.github.io/lab-homepage/

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

## 快速开始

### 前端开发

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`，页面包括：

- `/` — 首页
- `/#/people` — 团队成员页
- `/#/gallery` — 照片墙页

### 后端开发

```bash
cd server
npm install
# 创建 .env 文件，参考下方"环境配置"章节填入配置
npm run dev             # 启动开发服务器 (默认端口 3001)
```

前端本地开发时，`vite.config.ts` 已配置将 `/uploads` 请求代理到后端。

---

## 项目结构

```
lab-homepage/
├── src/                          # 前端源码
│   ├── components/               # 可复用组件
│   ├── data/                     # 静态数据层
│   │   ├── gallery/              # 照片墙数据 (按年份拆分)
│   │   └── students/             # 成员数据 (按届别拆分)
│   ├── pages/                    # 页面组件
│   ├── utils/                    # 工具函数 (API 客户端、认证等)
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口
│   ├── router.ts                 # 路由配置
│   └── style.css                 # 全局样式
├── server/                       # 后端服务
│   ├── src/                      # 服务端源码
│   │   ├── auth.ts               # 认证中间件
│   │   ├── config.ts             # 配置加载
│   │   ├── db.ts                 # 数据库初始化
│   │   ├── image-utils.ts        # 图片处理
│   │   ├── students.repo.ts      # 成员数据仓库
│   │   └── students.routes.ts    # 成员 API 路由
│   ├── scripts/                  # 数据库脚本
│   └── test/                     # 后端测试
├── public/                       # 静态资源
│   ├── gallery/lab/              # 照片墙图片 + 缩略图
│   └── students/                 # 成员照片 (按届别存放)
├── scripts/                      # 前端工具脚本
├── docs/                         # 构建输出 (GitHub Pages)
└── .github/workflows/            # CI/CD
```

---

## 成员数据维护

成员页 (`/#/people`) 优先从后端 API 读取数据，后端不可用时回退到前端静态数据。

### 前端静态数据

数据按届别拆分在 `src/data/students/years/` 下：

```
src/data/students/
  index.ts          # 自动汇总，不需要日常修改
  types.ts          # 类型定义
  helpers.ts        # 照片路径工具
  years/
    2025.ts
    2024.ts
    2023.ts
```

**新增成员**：编辑对应年份文件，在数组中添加一项：

```ts
{
  id: '2025-zhang-san',
  name: '张三',
  cohort: '2025',
  degree: '硕士研究生',
  status: 'current',
  nativePlace: '湖南长沙',
  wechat: 'happycv_lab',
  photo: studentPhoto('2025', 'zhang-san.jpg'),
  coverPhoto: studentPhoto('2025', 'zhang-san-cover.jpg'),  // 可选，个人页封面
  research: ['计算机视觉', '多模态学习'],
  email: 'zhangsan@example.com',
  phone: '13800000000',
  bio: '个人简介。',
  achievements: ['代表性成果 1'],
  experiences: ['2021-2025 本科', '2025-至今 硕士'],
}
```

**毕业生**：将 `status` 改为 `'alumni'`，增加 `destination` 字段。

**新增年份**：创建 `src/data/students/years/2026.ts`，`index.ts` 会自动读取，无需手动注册。

### 成员照片

照片放在 `public/students/` 下，按届别分目录：

```
public/students/2025/zhang-san.jpg
public/students/2024/wang-lei.jpg
```

数据中使用 `studentPhoto('2025', 'zhang-san.jpg')` 生成路径。未填照片时自动显示姓名缩写头像。

### 照片压缩

成员照片不展示原图，可直接压缩。新增或替换后运行：

```bash
npm run optimize:students
```

默认规则：大于 800KB 的照片，最长边压到 1200px，质量 82。可自定义参数：

```bash
npm run optimize:students -- --threshold-kb=600 --max=1000 --quality=80
```

---

## 照片墙维护

照片墙页 (`/#/gallery`) 数据按年份拆分在 `src/data/gallery/years/` 下。

### 新增照片

编辑对应年份文件，添加一项：

```ts
{
  id: '2026-graduation-09',
  year: '2026',
  category: '毕业照',
  title: '2026 届毕业合影',
  date: '2026-06',
  location: '湘潭大学信息科技大楼',
  ...labImage('2026', 'DSC_1900.JPG'),
  featured: true,
}
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识 |
| `year` | 年份，决定分组 |
| `category` | 类型（毕业照 / 生活照 / 组会活动 / 比赛参会） |
| `title` | 照片标题 |
| `date` | 日期，推荐 `YYYY-MM` 或 `YYYY-MM-DD` |
| `location` | 地点 |
| `featured` | 可选，`true` 表示在首页和照片墙顶部展示 |

年份筛选、类型筛选和年度分组均根据数据自动生成。新增 `category` 后筛选按钮也会自动出现。

### 新增年份

1. 将照片放入 `public/gallery/lab/2027/`
2. 创建 `src/data/gallery/years/2027.ts`
3. `index.ts` 自动汇总，无需手动注册

### 缩略图

照片墙默认加载缩略图，点击查看原图。新增或替换原图后运行：

```bash
npm run thumbs
```

自动扫描 `public/gallery/lab/` 下的图片，生成 960×960 以内的 webp 缩略图到对应 `thumbs/` 目录。强制重新生成：

```bash
npm run thumbs -- --force
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
CORS_ORIGIN=https://scs-happycv.github.io
UPLOAD_DIR=/var/www/uploads/students
```

> 默认端口为 3001，生产环境使用 3003。`vite.config.ts` 的开发代理也指向 3003。

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

```bash
cd server
npm run db:import
```

导入后 SQLite 即为数据源。此命令会覆盖已有数据，不要作为常规同步使用。

### 数据库脚本

| 命令 | 说明 |
|---|---|
| `npm run db:import` | 从静态数据导入成员到 SQLite |
| `npm run db:export` | 从 SQLite 导出成员数据 |
| `npm run db:import-json` | 从 JSON 文件导入 |

---

## 部署

### 前端 (GitHub Actions)

推送到 `main` 分支自动触发构建和部署。确保仓库 Settings → Pages 的 Source 设为 `GitHub Actions`。

构建输出到 `docs/` 目录，路由使用 Hash 模式，刷新不会 404。

### 后端 (PM2)

```bash
cd server
npm install
# 创建 .env 文件，参考上方"环境配置"章节
npm run build
npm run db:import
pm2 start ecosystem.config.cjs
pm2 save
```

配置反向代理将 `https://api.scs-happycv.top` 转发到 `http://127.0.0.1:3003`。

验证服务：

```bash
curl https://api.scs-happycv.top/health
pm2 logs lab-homepage-api
```

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
| `npm run thumbs` | 生成照片墙缩略图 |
| `npm run optimize:students` | 压缩成员照片 |
| `npm test` | 运行前端测试 |
| `cd server && npm run dev` | 启动后端开发服务器 |
| `cd server && npm run build` | 编译后端 TypeScript |
| `cd server && npm test` | 运行后端测试 |
| `cd server && npm run db:import` | 导入成员数据到 SQLite |

---

## 注意事项

- `.env` 文件已在 `.gitignore` 中，不要提交敏感信息
- 图片上传前建议先压缩，照片墙图片需运行 `npm run thumbs` 生成缩略图
- 成员的电话、微信属于隐私字段，仅在本人同意后公开
- 定期运行 `npm run db:export` 备份数据库
