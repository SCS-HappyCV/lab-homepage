# 照片墙相册：后端存储与上传设计

日期：2026-08-07
状态：已确认，待实现

## 背景与目标

照片墙（Gallery）目前是纯静态方案：相册数据写死在 `src/data/gallery/years/*.ts`，图片放在 `public/gallery/lab/`，缩略图靠手动跑 `npm run thumbs` 生成。页面里虽然有个"新建相册"按钮，但数据只存在浏览器 `localStorage`，照片仍需手动放进 `public/`，不是真正的功能。

本项目要把照片墙改为和成员头像一致的"后端 + 上传目录"模式：图片存到 `/var/www/uploads/albums/`，元数据存 SQLite，为后续做后台相册上传管理界面打基础。

**本轮范围**：后端（建表 + API + 上传/压缩/缩略图）、把现有 3 个相册迁移到新存储、照片墙页面改为从 API 读取。**不做**后台管理界面（后续迭代）。

## 已确认的决策

1. 文件存放在 `/var/www/uploads/albums/`（与 `students/` 平级，自动复用已挂载的 `/uploads` 静态服务）。
2. 按相册 ID 分组目录：`albums/<albumId>/`，内含 `thumbs/`。
3. 文件名保留可读前缀 + 时间戳后缀：`<ascii-slug>-<timestamp>.jpg`；非 ASCII 字符剥离，剥离后为空回退 `photo`。
4. 封面是独立字段，单独上传/更换，不引用相册内照片。
5. 两张表 `albums` + `photos`，外键级联删除。
6. 全栈统一 camelCase（数据库列名也用 camelCase，与现有 `students` 表一致，无需映射层）。
7. 上传模式：先建相册拿到 albumId，再批量传照片，文件直接进正式目录并即时写库（无临时暂存）。
8. 批量上传一次请求带多张（`upload.array('photos', 30)`），单张 5MB；整批失败则回滚已写记录和文件。
9. 功能含：相册增删改查、批量上传照片、删除单张、改 caption、照片排序、更换封面、删除整个相册。
10. 代码中 `event`/`GalleryEvent` 全面重命名为 `album`/`Album`。
11. 移除页面现有 localStorage 新建相册编辑器（本轮无后台界面，留着会误导）。
12. 现有静态数据迁移后，`public/gallery/lab/2026/` 等暂时保留备份，不删除。

## 存储布局

```
/var/www/uploads/albums/
└── <albumId>/                       例如 2026-graduation
    ├── cover-<timestamp>.jpg        封面原图
    ├── <slug>-<timestamp>.jpg       照片原图
    └── thumbs/
        ├── cover-<timestamp>.webp   封面缩略图
        └── <slug>-<timestamp>.webp  照片缩略图
```

- 原图 JPEG，压缩复用 `server/src/image-utils.ts` 的 `compressImage`（长边 1200、q82、<800KB 直存）。
- 缩略图 WebP，960×960 `fit: inside`、不放大、q80，与现有 `scripts/generate-gallery-thumbnails.mjs` 规格一致。新增 `generateThumbnail(src, dest)` 工具函数。
- 时间戳 `Date.now()` 保证每次上传/更换都是新 URL，绕过 Cloudflare 缓存。
- 目录由配置 `ALBUM_UPLOAD_DIR` 指定，默认 `/var/www/uploads/albums`（开发环境回退到 `data/uploads/albums`）。
- 注意：`albumUploadDir` 必须与学生头像的 `uploadDir` 同父目录（生产都是 `/var/www/uploads` 的子目录，开发都是 `data/uploads` 的子目录），因为 `server/src/index.ts` 把 `/var/www/uploads` 挂载到 `/uploads`，只有在其下的文件才能通过 `/uploads/albums/...` 访问。

### 文件名清洗规则

```
slug = basename(originalName, ext)
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9_-]/g, '')   // 剥离中文等非 ASCII
  .slice(0, 40)
  .replace(/^-+|-+$/g, '')
if (!slug) slug = 'photo'
filename = `${slug}-${Date.now()}.jpg`
```

封面固定 slug 为 `cover`。缩略图与原图同名、扩展名 `.webp`。

## 数据库

在现有 SQLite 库（`server/src/db.ts` 的 `initDatabase`）中建表，列名 camelCase：

```sql
CREATE TABLE IF NOT EXISTS albums (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  year        TEXT NOT NULL,
  date        TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  categories  TEXT NOT NULL DEFAULT '[]',   -- JSON 字符串数组
  coverUrl    TEXT NOT NULL DEFAULT '',
  coverThumb  TEXT NOT NULL DEFAULT '',
  featured    INTEGER NOT NULL DEFAULT 0,
  sortOrder   INTEGER NOT NULL DEFAULT 0,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  albumId    TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  imageUrl   TEXT NOT NULL,
  thumbUrl   TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  sortOrder  INTEGER NOT NULL DEFAULT 0,
  createdAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(albumId, sortOrder);
```

连接建立后执行 `PRAGMA foreign_keys = ON`（node:sqlite 默认关闭外键约束），让删相册时级联删照片生效。

`categories` 在 repo 层序列化为 JSON 字符串存储、读出时解析为 `string[]`（与 students 表的 `research`/`achievements` 数组字段做法一致）。

## 类型定义

新建 `server/src/albums/types.ts`（后端）与更新前端 `src/data/gallery/types.ts`，字段一致：

```ts
interface Album {
  id: string
  title: string
  year: string
  date: string
  location: string
  description: string
  categories: string[]
  coverUrl: string
  coverThumb: string
  featured: boolean
  sortOrder: number
  photos?: Photo[]      // 列表接口不含，详情接口含
  photosCount?: number  // 列表接口用
  createdAt: string
  updatedAt: string
}

interface Photo {
  id: string
  albumId: string
  imageUrl: string
  thumbUrl: string
  caption: string
  sortOrder: number
  createdAt: string
}
```

## 后端模块

沿用现有分层：

- `server/src/albums/albums.repo.ts`：`AlbumRepository`，风格对齐 `students.repo.ts`。
  - `list()` 返回相册（含 `photosCount` 聚合，不含 photos 明细），按 sortOrder/年份/标题排序。
  - `get(id)` 返回相册 + 其 photos 数组（按 sortOrder、createdAt 排序）。
  - `create/update/delete`。
  - `addPhotos(albumId, photos[])`、`updatePhotoCaption`、`reorderPhotos(albumId, orderedIds)`、`deletePhoto(id)`。
- `server/src/albums/albums.routes.ts`：Express router，工厂函数 `createAlbumRouter({ repo, authService, albumUploadDir })`，在 `index.ts` 挂载。
- 图片处理工具加到 `server/src/image-utils.ts`：`generateThumbnail(src, dest)`、`slugifyImageName(name)`；`compressImage` 已存在可复用。

### API 列表

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/albums` | 公开 | 相册列表（不含 photos，含 photosCount） |
| GET | `/albums/:id` | 公开 | 单个相册含 photos |
| POST | `/albums` | admin | 建相册，后端生成 id，返回空相册 |
| PUT | `/albums/:id` | admin | 改元数据 |
| DELETE | `/albums/:id` | admin | 删相册：事务删记录 + `fs.rm` 整个目录 |
| POST | `/albums/:id/photos` | admin | 批量上传：`upload.array('photos', 30)`，逐张压缩+缩略图+写库 |
| PUT | `/albums/:id/photos/reorder` | admin | body `{ orderedIds: string[] }`，更新 sortOrder |
| PUT | `/photos/:id` | admin | 改 caption |
| DELETE | `/photos/:id` | admin | 删单张：删记录 + 删原图和缩略图 |
| POST | `/albums/:id/cover` | admin | 换封面：`upload.single('photo')`，删旧封面文件 |

### 关键行为

- **相册 ID 生成**：`slugify(title)` + `-` + 6 位随机十六进制（如 `2026-graduation`、`album-a3f9c2`）。标题转 ASCII slug，剥离中文后为空回退 `album`。创建时若偶发冲突则重新生成随机后缀重试。
- **批量上传**：multer 先把原始文件存到相册目录下的临时名（`raw-<ts>-<rand>.<ext>`），逐张压缩到最终名、生成缩略图、删临时文件；收集成功写入的记录。任一环节失败，删除本次已生成的最终文件和已写记录，返回 500。成功时 `sortOrder` 取当前相册最大 sortOrder 之后递增，保证新照片排在末尾。
- **删整个相册**：先删 DB 记录（外键级联删 photos），再 `fs.rm(albumUploadDir/<id>, { recursive, force: true })`。目录删除失败仅记录日志（DB 已清，不阻塞响应）。
- **换封面**：压缩新封面并生成缩略图 → 更新 `coverUrl`/`coverThumb` → 删旧封面原图和缩略图（若存在且路径不同）。
- **Multer 错误**：复用成员模块的错误处理中间件模式（超限/类型错误返回 400 JSON）。文件类型 jpg/png/webp，单张 5MB，单次最多 30 张。

### 配置

- `server/src/types.ts` 的 `ServerConfig` 增加 `albumUploadDir: string`。
- `server/src/config.ts` 读取 `ALBUM_UPLOAD_DIR`，默认 `path.join(cwd(), 'data', 'uploads', 'albums')`；生产 `.env` 设为 `/var/www/uploads/albums`。
- `server/src/index.ts` 创建 repo 和 router 并挂载；静态服务无需改动（`/var/www/uploads` 已挂到 `/uploads`）。

## 数据迁移

一次性脚本 `server/scripts/migrate-gallery.ts`（用 tsx 运行，对齐现有 `migrate-static-photos.ts` 风格），可重复执行（先按已知 id 删除旧相册记录和目录再导入）：

- 在脚本内直接定义三个相册的元数据与照片文件清单（标题、年份、日期、地点、分类、caption、源文件相对路径、封面）。**不** import 前端的 `src/data/gallery/years/*.ts`，因为那些模块依赖 `publicAsset`/`import.meta.env.BASE_URL`，在 Node/tsx 环境会报错。脚本内数据作为一次性快照维护即可。
- 为 3 个相册建记录，保留原 id：`2026-graduation`、`2025-summer-life`、`2025-campus-moment`。
- 复制并处理图片：
  - 2026 毕业照：源 `public/gallery/lab/2026/*.JPG` → `albums/2026-graduation/`，逐张压缩生成带时间戳文件名 + 缩略图，caption 沿用现有（信息楼、铜像广场等）。
  - `lab-life.jpg`、`campus-moment.jpg`：从 `public/gallery/lab/` 各**复制**一份到对应 2025 相册目录；`public/` 原件保留（`lab-life.jpg` 仍被成员页引用）。
- 各相册封面沿用原 `coverImage` 对应的图，生成独立封面文件。
- 迁移完成后打印每个相册的照片数。

## 前端改动

### API 客户端

`src/utils/api.ts` 的 `memberApi` 增加相册方法（命名空间上仍挂在 memberApi 或新增 `albumApi`；为改动小，先挂 memberApi）：

```ts
listAlbums()                          // GET /albums
getAlbum(id)                          // GET /albums/:id
createAlbum(input)                    // POST /albums
updateAlbum(id, input)                // PUT /albums/:id
deleteAlbum(id)                       // DELETE /albums/:id
uploadAlbumPhotos(id, files)          // POST /albums/:id/photos, FormData photos
reorderAlbumPhotos(id, orderedIds)    // PUT .../photos/reorder
updatePhotoCaption(photoId, caption)  // PUT /photos/:id
deletePhoto(photoId)                  // DELETE /photos/:id
uploadAlbumCover(id, file)            // POST /albums/:id/cover
```

### GalleryPage.vue

- `onMounted` 调 `listAlbums()` 填充列表；打开相册时按需 `getAlbum(id)`（列表已含 coverUrl 等，点进详情再取 photos）。
- 删除 `galleryEvents`/`galleryCategories`/`galleryYears` 的静态 import 与 `customEvents` localStorage 逻辑：
  - 分类、年份从后端返回的数据里 `computed` 聚合。
  - 移除 `createEmptyForm`/`fillFormFromEvent`/`saveCustomEvent`/`deleteCustomEvent`/`persistCustomEvents`/`loadCustomEvents`/`isCustomEvent`、编辑器弹窗模板、"新建相册"按钮、卡片与弹窗上的编辑/删除按钮。
- 字段重命名：`coverImage`→`coverUrl`、`coverThumbnail`→`coverThumb`、`GalleryEvent`→`Album`、`GalleryPhoto`→`Photo`、`selectedEvent`→`selectedAlbum`、`openEvent`→`openAlbum` 等。
- 图片 URL 用已有 `resolvePhotoUrl`（处理 `/uploads` 前缀拼接 API 域名）。
- 加载/错误态：列表加载中显示骨架或提示，失败显示错误并提供重试（对齐 PeoplePage 的 `apiError`/`isLoadingMembers` 模式）。
- 筛选（分类/年份/搜索）、排序、hero 精选、分组、相册详情 modal、lightbox 翻页等展示逻辑保持不变，仅把数据源从静态+localStorage 改为后端。

### 静态数据与素材

- `src/data/gallery/` 迁移后不再被页面引用，保留文件到本功能验证无误后，由用户确认再删（本 spec 不删）。
- `public/gallery/lab/hero-group.jpg`（首页）、`lab-life.jpg`（成员页背景）继续作为网站素材留在 `public/`，不动。
- `public/gallery/lab/2026/`、`campus-moment.jpg` 迁移后保留备份。

## 测试

`server/test/albums/` 下新增：

- `albums.repo.test.ts`：建表（内存库）、CRUD、列表 photosCount 聚合、详情含 photos 排序、级联删除、reorder。
- `albums.routes.test.ts`：用临时上传目录 + supertest：
  - 公开读 vs 写入需 401。
  - 建相册 → 批量上传 2 张（用 sharp 生成测试 jpg）→ 详情能读到、磁盘有原图和 thumbs/webp。
  - 批量上传其中一张非法类型时整批 400，不残留半成品文件/记录。
  - 换封面后旧封面文件被删。
  - 删单张删两张文件；删整个相册删整个目录。
  - reorder 后顺序生效。
- 迁移脚本不写自动化测试（一次性脚本，手动运行验证）。

## 验证步骤

1. `cd server && npm test` 全绿；`npm run build`（后端 tsc）无类型错误。
2. 根目录 `npm run build`（前端）通过。
3. 配置 `.env` 的 `ALBUM_UPLOAD_DIR=/var/www/uploads/albums`，重启后端。
4. 运行 `npx tsx server/scripts/migrate-gallery.ts`，确认输出 3 个相册、照片数正确；磁盘上 `albums/<id>/` 有原图和 `thumbs/*.webp`。
5. 访问照片墙页面：列表显示 3 个相册、封面正确；点进相册照片网格与 lightbox 正常；分类/年份/搜索可用。
6. 用 curl 带 admin token 测一次批量上传、换封面、删单张、删相册，确认文件随记录增删。
7. 浏览器硬刷新，确认新上传图片 URL 带时间戳、Cloudflare 不返回旧缓存。

## 不在本轮范围

- 后台相册管理 UI（新建/编辑表单、拖拽排序、上传组件）——下一轮基于这套 API 实现。
- 清理旧的 `src/data/gallery/`、`public/gallery/lab/2026/`——验证后单独处理。
- 照片 EXIF 拍摄时间、AI 标签、大图分页等增强功能。
