# 照片墙相册后端存储 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把照片墙从「前端静态数据 + public/ 图片」改为「SQLite 元数据 + /var/www/uploads/albums 图片」，后端提供相册/照片的增删改查与批量上传 API，页面从 API 读取，并把现有 3 个相册迁移到新存储。

**Architecture:** 沿用现有成员模块的分层——`db.ts` 建两张 camelCase 表（albums / photos，外键级联），`albums/albums.repo.ts` 做数据访问，`albums/albums.routes.ts` 以工厂函数 `createAlbumRouter({ repo, authService, albumUploadDir })` 创建 Express router，在 `index.ts` 挂载。图片复用并扩展 `image-utils.ts`（压缩、新增缩略图与文件名清洗）。前端 `memberApi` 增加相册方法，`GalleryPage.vue` 改为 onMounted 拉列表、点进详情拉照片，移除 localStorage 编辑器。一次性脚本 `migrate-gallery.ts` 迁移现有 3 个相册。

**Tech Stack:** Node.js 22 + node:sqlite (DatabaseSync)、Express 4、Multer 2、Sharp、TypeScript 6（NodeNext）、Vue 3 `<script setup>`、Vite 5。测试用 node:test + tsx + supertest。

## Global Constraints

- 数据库列名全栈统一 **camelCase**（与现有 `students` 表一致，不做 snake/camel 映射）。
- 图片目录由 `ALBUM_UPLOAD_DIR` 指定，生产为 `/var/www/uploads/albums`；默认 `path.join(process.cwd(), 'data', 'uploads', 'albums')`。该目录必须是静态服务根 `/var/www/uploads`（即 `path.dirname(config.uploadDir)`）的子目录，这样 `/uploads/albums/...` 才能被现有 `express.static` 访问。
- 文件命名：原图 `albums/<albumId>/<ascii-slug>-<timestamp>.jpg`；封面固定 `cover-<timestamp>.jpg`；缩略图 `albums/<albumId>/thumbs/<同名>.webp`。非 ASCII 字符剥离，剥离后为空回退 `photo`（封面为 `cover`）。
- 原图 JPEG，复用 `compressImage`（长边 1200、q82、<800KB 直存）；缩略图 WebP，960×960 `fit: inside`、不放大、q80，与 `scripts/generate-gallery-thumbnails.mjs` 一致。
- 上传约束：仅 jpg/png/webp，单张 5MB，单次批量最多 30 张；批量整批失败则回滚已写记录与已生成文件。
- 后端进程在生产由 PM2 运行**编译产物** `dist/src/server.js`，后端改动后必须 `cd server && npm run build` 再重启（`./restart.sh` 已包含）。
- Git 提交直接到 main，提交信息末尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 本轮**不做**后台管理 UI；`public/gallery/` 旧素材迁移后保留备份不删。

## File Structure

**新建：**
- `server/src/albums/types.ts` — 后端 Album/Photo/NewPhoto/AlbumInput 类型。
- `server/src/albums/albums.repo.ts` — AlbumRepository 工厂函数。
- `server/src/albums/albums.routes.ts` — createAlbumRouter 工厂函数与 9 个路由。
- `server/test/albums/albums.repo.test.ts` — 仓库层测试。
- `server/test/albums/albums.routes.test.ts` — 路由层测试。
- `server/scripts/migrate-gallery.ts` — 一次性迁移脚本。

**修改：**
- `server/src/types.ts` — ServerConfig 增加 `albumUploadDir`。
- `server/src/config.ts` — loadConfig 读取 `ALBUM_UPLOAD_DIR`。
- `server/src/db.ts` — `PRAGMA foreign_keys = ON`，建 albums/photos 表与索引。
- `server/src/image-utils.ts` — 新增 `slugifyImageName`、`generateThumbnail`、`generateAlbumPhotoPath`、`generateAlbumCoverPath`、`thumbnailPathFor`。
- `server/src/index.ts` — 创建 albumRepo、挂载 createAlbumRouter。
- `server/test/app.test.ts`、`server/test/auth.test.ts`、`server/test/students.routes.test.ts` — 各自的 `config()` 补 `albumUploadDir`。
- `src/data/gallery/types.ts` — 增加前端 `Album`/`Photo` 类型（保留旧 GalleryEvent 供遗留数据文件用）。
- `src/utils/api.ts` — memberApi 增加相册方法。
- `src/pages/GalleryPage.vue` — 改为读 API，移除 localStorage 编辑器，event→album/coverImage→coverUrl 重命名。

---

### Task 1: 数据库表结构、配置与共享类型

**Files:**
- Create: `server/src/albums/types.ts`
- Modify: `server/src/types.ts:27-34`
- Modify: `server/src/config.ts:7-16`
- Modify: `server/src/db.ts:18-68`
- Modify: `server/test/app.test.ts:7-16`
- Modify: `server/test/auth.test.ts:8-17`
- Modify: `server/test/students.routes.test.ts:12-21`
- Test: `server/test/albums/db-schema.test.ts`

**Interfaces:**
- Produces（后续任务依赖）:
  - 后端类型 `Album`、`AlbumListItem`、`AlbumBase`、`Photo`、`NewPhoto`、`AlbumInput`，均从 `../src/albums/types.js` 导出。
  - `ServerConfig.albumUploadDir: string`。
  - `loadConfig()` 返回包含 `albumUploadDir`。
  - `initDatabase(db)` 执行后存在 `albums`、`photos` 表与 `idx_photos_album` 索引，且外键级联开启。

- [ ] **Step 1: 写建表失败测试**

创建 `server/test/albums/db-schema.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase } from '../../src/db.js'

function freshDb() {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)
  return db
}

test('initDatabase creates albums and photos tables with camelCase columns', () => {
  const db = freshDb()
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  const names = tables.map((t) => t.name)
  assert.ok(names.includes('albums'), 'albums table should exist')
  assert.ok(names.includes('photos'), 'photos table should exist')

  const albumCols = db.prepare(`PRAGMA table_info(albums)`).all() as { name: string }[]
  assert.ok(albumCols.some((c) => c.name === 'coverUrl'))
  assert.ok(albumCols.some((c) => c.name === 'coverThumb'))
  assert.ok(albumCols.some((c) => c.name === 'sortOrder'))
  assert.ok(albumCols.some((c) => c.name === 'createdAt'))

  const photoCols = db.prepare(`PRAGMA table_info(photos)`).all() as { name: string }[]
  assert.ok(photoCols.some((c) => c.name === 'albumId'))
  assert.ok(photoCols.some((c) => c.name === 'imageUrl'))
  assert.ok(photoCols.some((c) => c.name === 'thumbUrl'))
  assert.ok(photoCols.some((c) => c.name === 'sortOrder'))
})

test('deleting an album cascades to its photos when foreign keys are on', () => {
  const db = freshDb()
  db.prepare(`INSERT INTO albums (id, title, year, date, location, description, categories, coverUrl, coverThumb, featured, sortOrder, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('a1', 'A', '2026', '', '', '', '[]', '', '', 0, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  db.prepare(`INSERT INTO photos (id, albumId, imageUrl, thumbUrl, caption, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run('p1', 'a1', '/img.jpg', '/t.webp', '', 0, '2026-01-01T00:00:00Z')

  db.prepare('DELETE FROM albums WHERE id = ?').run('a1')
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM photos').get() as { n: number }
  assert.equal(remaining.n, 0, 'photos should be cascade-deleted')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx tsx --test test/albums/db-schema.test.ts`
Expected: FAIL（albums 表不存在）。

- [ ] **Step 3: 创建后端类型文件**

创建 `server/src/albums/types.ts`：

```ts
export interface Photo {
  id: string
  albumId: string
  imageUrl: string
  thumbUrl: string
  caption: string
  sortOrder: number
  createdAt: string
}

export interface AlbumBase {
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
  createdAt: string
  updatedAt: string
}

export interface AlbumListItem extends AlbumBase {
  photosCount: number
}

export interface Album extends AlbumBase {
  photos: Photo[]
}

export interface NewPhoto {
  imageUrl: string
  thumbUrl: string
  caption?: string
}

export interface AlbumInput {
  title: string
  year: string
  date?: string
  location?: string
  description?: string
  categories?: string[]
  coverUrl?: string
  coverThumb?: string
  featured?: boolean
  sortOrder?: number
}
```

- [ ] **Step 4: 扩展 ServerConfig**

在 `server/src/types.ts` 的 `ServerConfig` 接口末尾（`uploadDir: string` 之后）加一行：

```ts
  albumUploadDir: string
```

- [ ] **Step 5: 扩展 loadConfig**

在 `server/src/config.ts` 的返回对象里，`uploadDir:` 那一行之后加：

```ts
    albumUploadDir: process.env.ALBUM_UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads', 'albums'),
```

- [ ] **Step 6: 建表 + 开启外键**

把 `server/src/db.ts` 的 `initDatabase` 替换为下面内容（保留 students 建表与三个 ALTER 兼容块、`migratePatentTables(db)` 调用，在最前面加 PRAGMA，最后加相册建表）：

```ts
export function initDatabase(db: AppDatabase) {
  // node:sqlite 默认关闭外键约束，需显式开启以启用 ON DELETE CASCADE
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cohort TEXT NOT NULL,
      degree TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('current', 'alumni')),
      research TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      wechat TEXT,
      nativePlace TEXT,
      birthDate TEXT,
      photo TEXT,
      coverPhoto TEXT,
      destination TEXT,
      advisor TEXT NOT NULL DEFAULT '周维',
      bio TEXT NOT NULL,
      achievements TEXT NOT NULL,
      experiences TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  // 为已有数据库添加 birthDate 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN birthDate TEXT`)
  } catch {
    // 列已存在，忽略错误
  }

  // 为已有数据库添加 coverPhoto 列（兼容旧数据库）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN coverPhoto TEXT`)
  } catch {
    // 列已存在，忽略错误
  }

  // 为已有数据库添加 advisor 列（导师，默认"周维"）
  try {
    db.exec(`ALTER TABLE students ADD COLUMN advisor TEXT NOT NULL DEFAULT '周维'`)
  } catch {
    // 列已存在，忽略错误
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      year        TEXT NOT NULL,
      date        TEXT NOT NULL DEFAULT '',
      location    TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      categories  TEXT NOT NULL DEFAULT '[]',
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
  `)

  // 执行专利模块迁移（创建 patents_simple 等表）
  migratePatentTables(db)
}
```

> 注意：`PRAGMA foreign_keys = ON` 对每个连接生效；`openDatabase` 创建的单一长连接在应用生命周期内复用，因此在 `initDatabase` 开启即可覆盖该连接的所有后续操作。

- [ ] **Step 7: 给现有测试 config() 补字段**

下列三个文件的 `config()` 函数返回对象里，`uploadDir: '/tmp/lab-homepage-test-uploads',` 这一行之后都加一行 `albumUploadDir: '/tmp/lab-homepage-test-albums',`：

- `server/test/app.test.ts`
- `server/test/auth.test.ts`
- `server/test/students.routes.test.ts`

- [ ] **Step 8: 运行全部后端测试确认通过**

Run: `cd server && npm test`
Expected: 现有所有测试 + 新增的 db-schema 测试全部 PASS（新模块的 repo/routes 测试尚未创建）。

- [ ] **Step 9: 类型检查**

Run: `cd server && npm run build`
Expected: tsc 无错误（dist 生成成功）。

- [ ] **Step 10: Commit**

```bash
git add server/src/albums/types.ts server/src/types.ts server/src/config.ts server/src/db.ts \
  server/test/albums/db-schema.test.ts server/test/app.test.ts server/test/auth.test.ts server/test/students.routes.test.ts
git commit -m "feat(albums): 新增相册表结构、配置与共享类型

- ServerConfig/loadConfig 增加 albumUploadDir
- initDatabase 建 albums/photos 表并开启外键级联
- 新增后端 Album/Photo 类型

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 图片工具——文件名清洗、相册路径与缩略图

**Files:**
- Modify: `server/src/image-utils.ts`
- Test: `server/test/albums/image-utils.test.ts`

**Interfaces:**
- Consumes: `sharp`（已在 image-utils.ts 顶部导入）、`ensureDirectory`（同文件已存在）。
- Produces:
  - `slugifyImageName(name: string): string`
  - `generateAlbumPhotoPath(albumId: string, originalName: string, timestamp?: number): string`（相对路径，POSIX 分隔由调用方处理）
  - `generateAlbumCoverPath(albumId: string, timestamp?: number): string`
  - `thumbnailPathFor(imageRelPath: string): string`（把 `a/b.jpg` 映射为 `a/thumbs/b.webp`）
  - `generateThumbnail(src: string, dest: string): Promise<void>`

- [ ] **Step 1: 写失败测试**

创建 `server/test/albums/image-utils.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  slugifyImageName,
  generateAlbumPhotoPath,
  generateAlbumCoverPath,
  thumbnailPathFor,
  generateThumbnail,
} from '../../src/image-utils.js'

test('slugifyImageName strips extension, non-ASCII, and collapses to ascii slug', () => {
  assert.equal(slugifyImageName('DSC_1795.JPG'), 'dsc_1795')
  assert.equal(slugifyImageName('毕业合影 2026.png'), '2026')
  assert.equal(slugifyImageName('中文纯名称.webp'), 'photo')
  assert.equal(slugifyImageName('My Photo (1).jpg'), 'my-photo-1')
  assert.equal(slugifyImageName('a'.repeat(60) + '.jpg').length, 40)
})

test('generateAlbumPhotoPath uses slug and timestamp suffix', () => {
  const rel = generateAlbumPhotoPath('2026-graduation', 'DSC_1795.JPG', 1700000000000)
  assert.equal(rel, join('2026-graduation', 'dsc_1795-1700000000000.jpg'))
})

test('generateAlbumCoverPath uses fixed cover slug', () => {
  const rel = generateAlbumCoverPath('2026-graduation', 1700000000000)
  assert.equal(rel, join('2026-graduation', 'cover-1700000000000.jpg'))
})

test('thumbnailPathFor maps image to thumbs webp', () => {
  assert.equal(
    thumbnailPathFor(join('2026-graduation', 'dsc_1795-1.jpg')),
    join('2026-graduation', 'thumbs', 'dsc_1795-1.webp'),
  )
})

test('generateThumbnail writes a webp thumbnail under 960px', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'album-thumb-'))
  try {
    const src = join(dir, 'big.jpg')
    await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg().toFile(src)

    const dest = join(dir, 'thumbs', 'big.webp')
    await generateThumbnail(src, dest)

    assert.ok(existsSync(dest), 'thumbnail file should exist')
    const meta = await sharp(dest).metadata()
    assert.equal(meta.format, 'webp')
    assert.ok((meta.width ?? 0) <= 960)
    assert.ok((meta.height ?? 0) <= 960)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx tsx --test test/albums/image-utils.test.ts`
Expected: FAIL（函数未导出 / 未定义）。

- [ ] **Step 3: 实现工具函数**

在 `server/src/image-utils.ts` 末尾追加：

```ts
/**
 * 把上传文件名清洗为 ASCII slug：去掉扩展名、转小写、空白转连字符、
 * 剥离非 [a-z0-9_-] 字符（含中文），截断到 40 字符；结果为空时回退 'photo'。
 */
export function slugifyImageName(name: string): string {
  const base = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '')
  return base || 'photo'
}

/**
 * 生成相册照片的相对存放路径：<albumId>/<slug>-<timestamp>.jpg。
 * 时间戳保证每次上传都是新 URL，绕过 CDN 缓存。
 */
export function generateAlbumPhotoPath(albumId: string, originalName: string, timestamp?: number): string {
  const slug = slugifyImageName(originalName)
  const suffix = timestamp ?? Date.now()
  return path.join(albumId, `${slug}-${suffix}.jpg`)
}

/**
 * 生成相册封面的相对存放路径：<albumId>/cover-<timestamp>.jpg。
 */
export function generateAlbumCoverPath(albumId: string, timestamp?: number): string {
  const suffix = timestamp ?? Date.now()
  return path.join(albumId, `cover-${suffix}.jpg`)
}

/**
 * 给定原图相对路径，返回其缩略图相对路径：同级 thumbs/ 目录、同名 .webp。
 */
export function thumbnailPathFor(imageRelPath: string): string {
  const ext = path.extname(imageRelPath)
  const webp = imageRelPath.slice(0, imageRelPath.length - ext.length) + '.webp'
  return path.join(path.dirname(webp), 'thumbs', path.basename(webp))
}

/**
 * 生成 WebP 缩略图：960×960 fit:inside、不放大、q80，自动按 EXIF 旋转。
 */
export async function generateThumbnail(src: string, dest: string): Promise<void> {
  await ensureDirectory(path.dirname(dest))
  await sharp(src)
    .rotate()
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(dest)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx tsx --test test/albums/image-utils.test.ts`
Expected: PASS（5 个测试全过）。

- [ ] **Step 5: 全量测试 + 类型检查**

Run: `cd server && npm test && npm run build`
Expected: 全绿，tsc 无错。

- [ ] **Step 6: Commit**

```bash
git add server/src/image-utils.ts server/test/albums/image-utils.test.ts
git commit -m "feat(albums): 新增文件名清洗、相册路径与缩略图工具

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: AlbumRepository 数据仓库

**Files:**
- Create: `server/src/albums/albums.repo.ts`
- Test: `server/test/albums/albums.repo.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`（from `../db.js`）、类型 from `./types.js`。
- Produces（后续 routes 依赖）:

```ts
export interface AlbumRepository {
  list(): AlbumListItem[]                 // 含 photosCount，不含 photos；按 sortOrder, year DESC, title 排序
  get(id: string): Album | null           // 含 photos，photos 按 sortOrder, createdAt 排序
  create(input: AlbumInput): Album        // 不接收 id；由调用方在 input.id? —— 见下：create(id, input)
  update(id: string, input: AlbumInput): Album | null
  updateCover(id: string, coverUrl: string, coverThumb: string): Album | null
  delete(id: string): boolean
  addPhotos(albumId: string, photos: NewPhoto[]): Photo[]   // 自动分配 id/createdAt/sortOrder，事务批量插入
  updatePhotoCaption(photoId: string, caption: string): Photo | null
  reorderPhotos(albumId: string, orderedIds: string[]): boolean
  getPhoto(photoId: string): Photo | null
  deletePhoto(photoId: string): Photo | null
}
export function createAlbumRepository(db: AppDatabase): AlbumRepository
export class AlbumValidationError extends Error
```

> 说明：`create` 的签名用 `create(id: string, input: AlbumInput)`，因为相册 id（slug+随机后缀）由路由层生成；repo 负责校验与持久化。迁移脚本也会显式传入已知 id。

- [ ] **Step 1: 写失败测试**

创建 `server/test/albums/albums.repo.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDatabase } from '../../src/db.js'
import { createAlbumRepository, AlbumValidationError } from '../../src/albums/albums.repo.js'
import type { AlbumInput } from '../../src/albums/types.js'

function createTestRepo() {
  const db = new DatabaseSync(':memory:')
  initDatabase(db)
  return createAlbumRepository(db)
}

function sampleInput(overrides: Partial<AlbumInput> = {}): AlbumInput {
  return {
    title: '2026 届毕业合影',
    year: '2026',
    date: '2026-06',
    location: '湘潭大学',
    description: '毕业照',
    categories: ['毕业照'],
    featured: true,
    sortOrder: 0,
    ...overrides,
  }
}

test('create and list return photosCount without photos array', () => {
  const repo = createTestRepo()
  const created = repo.create('2026-graduation', sampleInput())
  assert.equal(created.id, '2026-graduation')
  assert.deepEqual(created.categories, ['毕业照'])
  assert.equal(created.featured, true)

  const list = repo.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].photosCount, 0)
  assert.equal('photos' in list[0], false)
})

test('get returns album with photos sorted by sortOrder then createdAt', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [
    { imageUrl: '/uploads/albums/a1/b-2.jpg', thumbUrl: '/uploads/albums/a1/thumbs/b-2.webp', caption: '二' },
    { imageUrl: '/uploads/albums/a1/a-1.jpg', thumbUrl: '/uploads/albums/a1/thumbs/a-1.webp', caption: '一' },
  ])

  const album = repo.get('a1')
  assert.ok(album)
  assert.equal(album!.photos.length, 2)
  assert.equal(album!.photos[0].caption, '二') // sortOrder 0
  assert.equal(album!.photos[1].caption, '一')
  assert.equal(repo.list()[0].photosCount, 2)
})

test('addPhotos appends sortOrder after existing photos', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [{ imageUrl: '/x1.jpg', thumbUrl: '/t1.webp' }])
  repo.addPhotos('a1', [{ imageUrl: '/x2.jpg', thumbUrl: '/t2.webp' }])
  const photos = repo.get('a1')!.photos
  assert.deepEqual(photos.map((p) => p.sortOrder), [0, 1])
})

test('update changes metadata and bumps updatedAt', () => {
  const repo = createTestRepo()
  const created = repo.create('a1', sampleInput())
  const updated = repo.update('a1', { ...sampleInput(), title: '新标题', location: '长沙' })
  assert.ok(updated)
  assert.equal(updated!.title, '新标题')
  assert.equal(updated!.location, '长沙')
  assert.ok(Number.isNaN(Date.parse(updated!.updatedAt)) === false)
  // 更新不应清空已存在的封面
  assert.equal(updated!.coverUrl, created.coverUrl)
})

test('update returns null for unknown album', () => {
  const repo = createTestRepo()
  assert.equal(repo.update('missing', sampleInput()), null)
})

test('delete cascades photos', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  repo.addPhotos('a1', [{ imageUrl: '/x.jpg', thumbUrl: '/t.webp' }])
  assert.equal(repo.delete('a1'), true)
  assert.equal(repo.get('a1'), null)
})

test('reorderPhotos reassigns sortOrder by provided id order', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  const added = repo.addPhotos('a1', [
    { imageUrl: '/1.jpg', thumbUrl: '/1.webp' },
    { imageUrl: '/2.jpg', thumbUrl: '/2.webp' },
    { imageUrl: '/3.jpg', thumbUrl: '/3.webp' },
  ])
  const reordered = [added[2].id, added[0].id, added[1].id]
  assert.equal(repo.reorderPhotos('a1', reordered), true)
  const photos = repo.get('a1')!.photos
  assert.deepEqual(photos.map((p) => p.id), reordered)
  assert.deepEqual(photos.map((p) => p.sortOrder), [0, 1, 2])
})

test('updatePhotoCaption and deletePhoto work', () => {
  const repo = createTestRepo()
  repo.create('a1', sampleInput())
  const [photo] = repo.addPhotos('a1', [{ imageUrl: '/x.jpg', thumbUrl: '/t.webp', caption: '旧' }])
  const updated = repo.updatePhotoCaption(photo.id, '新 caption')
  assert.equal(updated?.caption, '新 caption')
  const deleted = repo.deletePhoto(photo.id)
  assert.equal(deleted?.id, photo.id)
  assert.equal(repo.getPhoto(photo.id), null)
})

test('create rejects blank title or year', () => {
  const repo = createTestRepo()
  assert.throws(() => repo.create('a1', sampleInput({ title: '  ' })), AlbumValidationError)
  assert.throws(() => repo.create('a2', sampleInput({ year: '' })), AlbumValidationError)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx tsx --test test/albums/albums.repo.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现仓库**

创建 `server/src/albums/albums.repo.ts`：

```ts
import { randomUUID } from 'node:crypto'
import type { AppDatabase } from '../db.js'
import type { Album, AlbumBase, AlbumInput, AlbumListItem, NewPhoto, Photo } from './types.js'

export class AlbumValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlbumValidationError'
  }
}

export interface AlbumRepository {
  list(): AlbumListItem[]
  get(id: string): Album | null
  create(id: string, input: AlbumInput): Album
  update(id: string, input: AlbumInput): Album | null
  updateCover(id: string, coverUrl: string, coverThumb: string): Album | null
  delete(id: string): boolean
  addPhotos(albumId: string, photos: NewPhoto[]): Photo[]
  updatePhotoCaption(photoId: string, caption: string): Photo | null
  reorderPhotos(albumId: string, orderedIds: string[]): boolean
  getPhoto(photoId: string): Photo | null
  deletePhoto(photoId: string): Photo | null
}

type AlbumRow = Omit<AlbumBase, 'categories' | 'featured'> & {
  categories: string
  featured: number
}

type PhotoRow = Photo

export function createAlbumRepository(db: AppDatabase): AlbumRepository {
  return {
    list() {
      const rows = db
        .prepare(
          `SELECT a.*, (SELECT COUNT(*) FROM photos p WHERE p.albumId = a.id) AS photosCount
           FROM albums a
           ORDER BY a.sortOrder ASC, a.year DESC, a.title ASC`,
        )
        .all() as (AlbumRow & { photosCount: number })[]
      return rows.map((row) => ({ ...albumFromRow(row), photosCount: row.photosCount }))
    },

    get(id) {
      const row = db.prepare('SELECT * FROM albums WHERE id = ?').get(id) as AlbumRow | undefined
      if (!row) return null
      const photos = db
        .prepare('SELECT * FROM photos WHERE albumId = ? ORDER BY sortOrder ASC, createdAt ASC')
        .all(id) as PhotoRow[]
      return { ...albumFromRow(row), photos }
    },

    create(id, input) {
      const normalized = normalizeInput(input)
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO albums
          (id, title, year, date, location, description, categories, coverUrl, coverThumb, featured, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        normalized.title,
        normalized.year,
        normalized.date,
        normalized.location,
        normalized.description,
        JSON.stringify(normalized.categories),
        normalized.coverUrl,
        normalized.coverThumb,
        normalized.featured ? 1 : 0,
        normalized.sortOrder,
        now,
        now,
      )
      return this.get(id)!
    },

    update(id, input) {
      if (!albumExists(db, id)) return null
      const normalized = normalizeInput(input)
      db.prepare(
        `UPDATE albums SET
          title = ?, year = ?, date = ?, location = ?, description = ?, categories = ?,
          featured = ?, sortOrder = ?, updatedAt = ?
         WHERE id = ?`,
      ).run(
        normalized.title,
        normalized.year,
        normalized.date,
        normalized.location,
        normalized.description,
        JSON.stringify(normalized.categories),
        normalized.featured ? 1 : 0,
        normalized.sortOrder,
        new Date().toISOString(),
        id,
      )
      return this.get(id)
    },

    updateCover(id, coverUrl, coverThumb) {
      if (!albumExists(db, id)) return null
      db.prepare('UPDATE albums SET coverUrl = ?, coverThumb = ?, updatedAt = ? WHERE id = ?').run(
        coverUrl,
        coverThumb,
        new Date().toISOString(),
        id,
      )
      return this.get(id)
    },

    delete(id) {
      const result = db.prepare('DELETE FROM albums WHERE id = ?').run(id)
      return result.changes > 0
    },

    addPhotos(albumId, photos) {
      if (photos.length === 0) return []
      const now = new Date().toISOString()
      const maxRow = db.prepare('SELECT COALESCE(MAX(sortOrder), -1) AS m FROM photos WHERE albumId = ?').get(albumId) as { m: number }
      let startOrder = maxRow.m + 1

      const created: Photo[] = []
      db.exec('BEGIN')
      try {
        const insert = db.prepare(
          `INSERT INTO photos (id, albumId, imageUrl, thumbUrl, caption, sortOrder, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const photo of photos) {
          const record: Photo = {
            id: randomUUID(),
            albumId,
            imageUrl: photo.imageUrl,
            thumbUrl: photo.thumbUrl,
            caption: (photo.caption ?? '').trim(),
            sortOrder: startOrder++,
            createdAt: now,
          }
          insert.run(record.id, record.albumId, record.imageUrl, record.thumbUrl, record.caption, record.sortOrder, record.createdAt)
          created.push(record)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return created
    },

    updatePhotoCaption(photoId, caption) {
      const result = db.prepare('UPDATE photos SET caption = ? WHERE id = ?').run(String(caption ?? '').trim(), photoId)
      if (result.changes === 0) return null
      return this.getPhoto(photoId)
    },

    reorderPhotos(albumId, orderedIds) {
      const existing = db.prepare('SELECT id FROM photos WHERE albumId = ?').all(albumId) as { id: string }[]
      if (existing.length !== orderedIds.length) return false
      const existingSet = new Set(existing.map((r) => r.id))
      if (!orderedIds.every((id) => existingSet.has(id))) return false

      db.exec('BEGIN')
      try {
        const update = db.prepare('UPDATE photos SET sortOrder = ? WHERE id = ? AND albumId = ?')
        orderedIds.forEach((id, index) => update.run(index, id, albumId))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return true
    },

    getPhoto(photoId) {
      const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId) as PhotoRow | undefined
      return row ?? null
    },

    deletePhoto(photoId) {
      const photo = this.getPhoto(photoId)
      if (!photo) return null
      db.prepare('DELETE FROM photos WHERE id = ?').run(photoId)
      return photo
    },
  }
}

function albumExists(db: AppDatabase, id: string): boolean {
  return Boolean(db.prepare('SELECT id FROM albums WHERE id = ?').get(id))
}

function albumFromRow(row: AlbumRow): AlbumBase {
  return {
    ...row,
    categories: parseStringArray(row.categories),
    featured: Boolean(row.featured),
  }
}

function normalizeInput(input: AlbumInput): Required<Pick<AlbumInput, 'title' | 'year' | 'date' | 'location' | 'description' | 'categories' | 'coverUrl' | 'coverThumb' | 'featured' | 'sortOrder'>> {
  const title = String(input.title ?? '').trim()
  const year = String(input.year ?? '').trim()
  if (!title) throw new AlbumValidationError('title is required')
  if (!year) throw new AlbumValidationError('year is required')

  return {
    title,
    year,
    date: String(input.date ?? '').trim(),
    location: String(input.location ?? '').trim(),
    description: String(input.description ?? '').trim(),
    categories: Array.isArray(input.categories)
      ? input.categories.map((c) => String(c).trim()).filter(Boolean)
      : [],
    coverUrl: String(input.coverUrl ?? '').trim(),
    coverThumb: String(input.coverThumb ?? '').trim(),
    featured: Boolean(input.featured),
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx tsx --test test/albums/albums.repo.test.ts`
Expected: PASS（9 个测试全过）。

- [ ] **Step 5: 全量测试 + 类型检查**

Run: `cd server && npm test && npm run build`
Expected: 全绿，tsc 无错。

- [ ] **Step 6: Commit**

```bash
git add server/src/albums/albums.repo.ts server/test/albums/albums.repo.test.ts
git commit -m "feat(albums): 新增 AlbumRepository 数据仓库

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 相册路由与上传处理

**Files:**
- Create: `server/src/albums/albums.routes.ts`
- Test: `server/test/albums/albums.routes.test.ts`

**Interfaces:**
- Consumes:
  - `createAlbumRepository` / `AlbumRepository` / `AlbumValidationError` from `./albums.repo.js`
  - `requireAdmin` / `AuthService` from `../auth.js`
  - `compressImage`, `ensureDirectory`, `generateAlbumPhotoPath`, `generateAlbumCoverPath`, `generateThumbnail`, `thumbnailPathFor`, `slugifyImageName` from `../image-utils.js`
  - 类型 from `./types.js`
- Produces:
  - `createAlbumRouter({ repo, authService, albumUploadDir }): Router`，挂载路径：
    - `GET /albums`（公开）
    - `GET /albums/:id`（公开）
    - `POST /albums`（admin）
    - `PUT /albums/:id`（admin）
    - `DELETE /albums/:id`（admin）
    - `POST /albums/:id/photos`（admin，`upload.array('photos', 30)`）
    - `PUT /albums/:id/photos/reorder`（admin）
    - `POST /albums/:id/cover`（admin，`upload.single('photo')`）
    - `PUT /photos/:id`（admin，改 caption）
    - `DELETE /photos/:id`（admin）

- [ ] **Step 1: 写失败测试**

创建 `server/test/albums/albums.routes.test.ts`：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createApp } from '../../src/index.js'
import { hashPassphrase } from '../../src/auth.js'
import { withTestAgent } from '../test-utils.js'
import type { ServerConfig } from '../../src/types.js'

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 3001,
    adminPassHash: hashPassphrase('secret-passphrase'),
    jwtSecret: 'test-secret',
    sqlitePath: ':memory:',
    corsOrigin: '*',
    uploadDir: '/tmp/lab-homepage-test-uploads',
    albumUploadDir: '/tmp/lab-homepage-test-albums',
    ...overrides,
  }
}

async function makeTestJpeg(directory: string, filename: string, background = { r: 10, g: 20, b: 30 }) {
  const filePath = join(directory, filename)
  await sharp({ create: { width: 800, height: 600, channels: 3, background } })
    .jpeg().toFile(filePath)
  return filePath
}

test('album reads are public; writes require auth', async () => {
  const app = createApp({ config: config() })
  await withTestAgent(app, async (request) => {
    await request.get('/albums').expect(200).expect([])
    await request.post('/albums').send({ title: 'X', year: '2026' }).expect(401)
  })
})

test('create album returns 201 with generated id', async () => {
  const app = createApp({ config: config() })
  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
    const res = await request.post('/albums')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '毕业合影', year: '2026', categories: ['毕业照'] })
      .expect(201)
    assert.match(res.body.id, /^album-[0-9a-f]{6}$/, '中文标题剥离后回退 album- 前缀')
    assert.equal(res.body.title, '毕业合影')
  })
})

test('batch upload compresses, makes webp thumbnails, and lists photos', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Summer', year: '2025' }).expect(201)
      const albumId = created.body.id

      const p1 = await makeTestJpeg(scratch, 'first.jpg', { r: 200, g: 0, b: 0 })
      const p2 = await makeTestJpeg(scratch, 'second.jpg', { r: 0, g: 200, b: 0 })
      const upload = await request.post(`/albums/${albumId}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photos', p1)
        .attach('photos', p2)
        .expect(201)

      assert.equal(upload.body.photos.length, 2)
      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.equal(album.body.photos.length, 2)
      assert.match(album.body.photos[0].imageUrl, /^\/uploads\/albums\/.+\/first-\d+\.jpg$/)
      assert.match(album.body.photos[0].thumbUrl, /^\/uploads\/albums\/.+\/thumbs\/first-\d+\.webp$/)

      // 磁盘文件存在
      const firstRel = album.body.photos[0].imageUrl.replace('/uploads/albums/', '')
      const thumbRel = album.body.photos[0].thumbUrl.replace('/uploads/albums/', '')
      assert.ok(existsSync(join(albumDir, firstRel)), 'original should exist')
      assert.ok(existsSync(join(albumDir, thumbRel)), 'thumbnail should exist')

      // 列表 photosCount
      const list = await request.get('/albums').expect(200)
      assert.equal(list.body[0].photosCount, 2)
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('batch upload rejects unsupported type and leaves no partial files', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Mix', year: '2025' }).expect(201)
      const albumId = created.body.id

      const good = await makeTestJpeg(scratch, 'good.jpg')
      const bad = join(scratch, 'bad.txt')
      writeFileSync(bad, 'not an image')

      const res = await request.post(`/albums/${albumId}/photos`)
        .set('Authorization', `Bearer ${token}`)
        .attach('photos', good)
        .attach('photos', bad, { filename: 'bad.txt', contentType: 'text/plain' })
      assert.equal(res.status, 400)

      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.equal(album.body.photos.length, 0, 'no photos should be committed')

      // 相册目录不应残留最终图片（仅有空 thumbs 目录可接受）
      const files = readdirSync(join(albumDir, albumId)).filter((f) => f !== 'thumbs')
      assert.deepEqual(files, [], 'no original files should remain')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('uploading cover replaces it and deletes old cover files', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Cover', year: '2025' }).expect(201)
      const albumId = created.body.id

      const c1 = await makeTestJpeg(scratch, 'c1.jpg')
      const first = await request.post(`/albums/${albumId}/cover`).set('Authorization', `Bearer ${token}`)
        .attach('photo', c1).expect(200)
      const oldCoverUrl = first.body.coverUrl
      const oldCoverPath = join(albumDir, oldCoverUrl.replace('/uploads/albums/', ''))
      assert.ok(existsSync(oldCoverPath))

      const c2 = await makeTestJpeg(scratch, 'c2.jpg')
      const second = await request.post(`/albums/${albumId}/cover`).set('Authorization', `Bearer ${token}`)
        .attach('photo', c2).expect(200)
      assert.notEqual(second.body.coverUrl, oldCoverUrl)
      assert.ok(!existsSync(oldCoverPath), 'old cover original should be deleted')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('delete photo removes both files; delete album removes whole directory', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Del', year: '2025' }).expect(201)
      const albumId = created.body.id
      const p = await makeTestJpeg(scratch, 'p.jpg')
      const up = await request.post(`/albums/${albumId}/photos`).set('Authorization', `Bearer ${token}`)
        .attach('photos', p).expect(201)
      const photo = up.body.photos[0]
      const origPath = join(albumDir, photo.imageUrl.replace('/uploads/albums/', ''))
      const thumbPath = join(albumDir, photo.thumbUrl.replace('/uploads/albums/', ''))

      await request.delete(`/photos/${photo.id}`).set('Authorization', `Bearer ${token}`).expect(204)
      assert.ok(!existsSync(origPath))
      assert.ok(!existsSync(thumbPath))

      assert.ok(existsSync(join(albumDir, albumId)))
      await request.delete(`/albums/${albumId}`).set('Authorization', `Bearer ${token}`).expect(204)
      assert.ok(!existsSync(join(albumDir, albumId)), 'album directory should be removed')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('reorder updates photo order; caption update works', async () => {
  const app = createApp({ config: config() })
  await withTestAgent(app, async (request) => {
    const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
    const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Order', year: '2025' }).expect(201)
    const albumId = created.body.id
    // 直接借 repo 插两张照片以避免依赖文件上传顺序
    const { openDatabase } = await import('../../src/db.js')
    // 用 createApp 内部的库不好取，改走上传两张图更稳妥；这里用上传：
  })
})
```

> 上面最后一个测试只写了壳。请把它替换为下面这个完整版本（利用临时目录上传两张再排序）：

```ts
test('reorder updates photo order; caption update works', async () => {
  const albumDir = mkdtempSync(join(tmpdir(), 'album-uploads-'))
  const scratch = mkdtempSync(join(tmpdir(), 'album-scratch-'))
  const app = createApp({ config: config({ albumUploadDir: albumDir }) })
  try {
    await withTestAgent(app, async (request) => {
      const token = (await request.post('/auth/login').send({ password: 'secret-passphrase' }).expect(200)).body.token
      const created = await request.post('/albums').set('Authorization', `Bearer ${token}`)
        .send({ title: 'Order', year: '2025' }).expect(201)
      const albumId = created.body.id
      const a = await makeTestJpeg(scratch, 'a.jpg')
      const b = await makeTestJpeg(scratch, 'b.jpg')
      const up = await request.post(`/albums/${albumId}/photos`).set('Authorization', `Bearer ${token}`)
        .attach('photos', a).attach('photos', b).expect(201)
      const [first, second] = up.body.photos as { id: string }[]

      await request.put(`/albums/${albumId}/photos/reorder`).set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: [second.id, first.id] }).expect(200)
      const album = await request.get(`/albums/${albumId}`).expect(200)
      assert.deepEqual(album.body.photos.map((p: { id: string }) => p.id), [second.id, first.id])

      await request.put(`/photos/${first.id}`).set('Authorization', `Bearer ${token}`)
        .send({ caption: '新说明' }).expect(200)
      const after = await request.get(`/albums/${albumId}`).expect(200)
      const target = after.body.photos.find((p: { id: string }) => p.id === first.id)
      assert.equal(target.caption, '新说明')
    })
  } finally {
    rmSync(albumDir, { recursive: true, force: true })
    rmSync(scratch, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx tsx --test test/albums/albums.routes.test.ts`
Expected: FAIL（`/albums` 路由 404，因为还没在 index.ts 挂载；createApp 也还不认识 albumUploadDir 的使用方）。

- [ ] **Step 3: 实现路由**

创建 `server/src/albums/albums.routes.ts`：

```ts
import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { requireAdmin, type AuthService } from '../auth.js'
import {
  compressImage,
  ensureDirectory,
  generateAlbumCoverPath,
  generateAlbumPhotoPath,
  generateThumbnail,
  slugifyImageName,
  thumbnailPathFor,
} from '../image-utils.js'
import { AlbumValidationError, type AlbumRepository } from './albums.repo.js'
import type { AlbumInput } from './types.js'

export interface AlbumRouterDeps {
  repo: AlbumRepository
  authService: AuthService
  albumUploadDir: string
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_PHOTOS_PER_BATCH = 30
const URL_PREFIX = '/uploads/albums/'

export function createAlbumRouter({ repo, authService, albumUploadDir }: AlbumRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)

  const storage = multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        const albumDir = path.join(albumUploadDir, String(req.params.id ?? ''))
        await ensureDirectory(albumDir)
        cb(null, albumDir)
      } catch (error) {
        cb(error as Error, '')
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
      cb(null, `raw-${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true)
      else cb(new Error('不支持的文件类型，请上传 jpg、png 或 webp 格式的图片'))
    },
  })

  // 公开读
  router.get('/albums', (_req, res) => {
    res.json(repo.list())
  })

  router.get('/albums/:id', (req, res) => {
    const album = repo.get(String(req.params.id))
    if (!album) {
      res.status(404).json({ error: 'Album not found' })
      return
    }
    res.json(album)
  })

  // 建相册（后端生成 id）
  router.post('/albums', adminOnly, (req, res) => {
    try {
      const input = parseAlbumInput(req.body)
      const id = generateAlbumId(input.title, (candidate) => !repo.get(candidate))
      const album = repo.create(id, input)
      res.status(201).json(album)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  // 改元数据
  router.put('/albums/:id', adminOnly, (req, res) => {
    try {
      const id = String(req.params.id)
      const updated = repo.update(id, parseAlbumInput(req.body))
      if (!updated) {
        res.status(404).json({ error: 'Album not found' })
        return
      }
      res.json(updated)
    } catch (error) {
      handleWriteError(error, res)
    }
  })

  // 删相册：DB 级联删照片，再删整个目录
  router.delete('/albums/:id', adminOnly, async (req, res) => {
    const id = String(req.params.id)
    if (!repo.delete(id)) {
      res.status(404).json({ error: 'Album not found' })
      return
    }
    try {
      await fs.rm(path.join(albumUploadDir, id), { recursive: true, force: true })
    } catch (error) {
      // DB 已清，目录删除失败不阻塞响应
      console.error('Failed to remove album directory:', error)
    }
    res.status(204).send()
  })

  // 批量上传照片
  router.post('/albums/:id/photos', adminOnly, upload.array('photos', MAX_PHOTOS_PER_BATCH), async (req, res) => {
    const id = String(req.params.id)
    const album = repo.get(id)
    if (!album) {
      await cleanupRawFiles(req.files)
      res.status(404).json({ error: 'Album not found' })
      return
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (files.length === 0) {
      res.status(400).json({ error: '请选择要上传的照片' })
      return
    }

    const created: Array<{ imageUrl: string; thumbUrl: string; caption?: string }> = []
    const produced: string[] = [] // 已生成的最终文件绝对路径（原图），用于失败回滚

    try {
      for (const file of files) {
        const imageRel = generateAlbumPhotoPath(id, file.originalname)
        const thumbRel = thumbnailPathFor(imageRel)
        const imageAbs = path.join(albumUploadDir, imageRel)
        const thumbAbs = path.join(albumUploadDir, thumbRel)

        await ensureDirectory(path.dirname(imageAbs))
        await compressImage(file.path, imageAbs)
        await generateThumbnail(imageAbs, thumbAbs)
        await fs.unlink(file.path).catch(() => {})

        produced.push(imageAbs, thumbAbs)
        created.push({
          imageUrl: toAlbumUrl(imageRel),
          thumbUrl: toAlbumUrl(thumbRel),
        })
      }

      const photos = repo.addPhotos(id, created)
      res.status(201).json({ photos })
    } catch (error) {
      // 回滚：删除本次已生成的文件；addPhotos 内部已用事务保证 DB 原子性
      await Promise.all(produced.map((p) => fs.rm(p, { force: true }).catch(() => {})))
      await cleanupRawFiles(files)
      console.error('Album photo upload error:', error)
      res.status(500).json({ error: '照片上传失败' })
    }
  })

  // 照片排序
  router.put('/albums/:id/photos/reorder', adminOnly, (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds)
      ? req.body.orderedIds.filter((x: unknown): x is string => typeof x === 'string')
      : []
    const ok = repo.reorderPhotos(String(req.params.id), orderedIds)
    if (!ok) {
      res.status(400).json({ error: '排序数据与相册照片不匹配' })
      return
    }
    res.json({ ok: true })
  })

  // 换封面
  router.post('/albums/:id/cover', adminOnly, upload.single('photo'), async (req, res) => {
    const id = String(req.params.id)
    const album = repo.get(id)
    if (!album) {
      await cleanupRawFiles(req.file ? [req.file] : [])
      res.status(404).json({ error: 'Album not found' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: '请选择要上传的封面' })
      return
    }

    try {
      const coverRel = generateAlbumCoverPath(id)
      const thumbRel = thumbnailPathFor(coverRel)
      const coverAbs = path.join(albumUploadDir, coverRel)
      const thumbAbs = path.join(albumUploadDir, thumbRel)

      await ensureDirectory(path.dirname(coverAbs))
      await compressImage(req.file.path, coverAbs)
      await generateThumbnail(coverAbs, thumbAbs)
      await fs.unlink(req.file.path).catch(() => {})

      const oldCover = album.coverUrl
      const oldThumb = album.coverThumb
      repo.updateCover(id, toAlbumUrl(coverRel), toAlbumUrl(thumbRel))

      // 删除旧封面原图与缩略图
      await Promise.all([deleteAlbumFile(oldCover), deleteAlbumFile(oldThumb)])

      res.json(repo.get(id))
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {})
      console.error('Album cover upload error:', error)
      res.status(500).json({ error: '封面上传失败' })
    }
  })

  // 改 caption
  router.put('/photos/:id', adminOnly, (req, res) => {
    const caption = String(req.body?.caption ?? '')
    const updated = repo.updatePhotoCaption(String(req.params.id), caption)
    if (!updated) {
      res.status(404).json({ error: 'Photo not found' })
      return
    }
    res.json(updated)
  })

  // 删单张
  router.delete('/photos/:id', adminOnly, async (req, res) => {
    const photo = repo.deletePhoto(String(req.params.id))
    if (!photo) {
      res.status(404).json({ error: 'Photo not found' })
      return
    }
    await Promise.all([deleteAlbumFile(photo.imageUrl), deleteAlbumFile(photo.thumbUrl)])
    res.status(204).send()
  })

  // multer 在遇到非法文件/超限时会直接 next(error)，不会进入路由处理器；
  // 此时同批已写入磁盘的 raw-* 临时文件需要在错误中间件里清理，避免孤儿文件。
  router.use(async (error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (
      error instanceof multer.MulterError ||
      (error instanceof Error && error.message.includes('不支持的文件类型'))
    ) {
      const dir = path.join(albumUploadDir, String(req.params.id ?? ''))
      const files = await fs.readdir(dir).catch(() => [] as string[])
      await Promise.all(
        files
          .filter((f) => f.startsWith('raw-'))
          .map((f) => fs.unlink(path.join(dir, f)).catch(() => {})),
      )
    }
    handleUploadError(error, req, res, next)
  })

  return router

  function toAlbumUrl(relPath: string): string {
    return `${URL_PREFIX}${relPath.split(path.sep).join('/')}`
  }

  async function deleteAlbumFile(url: string): Promise<void> {
    if (!url.startsWith(URL_PREFIX)) return
    const abs = path.join(albumUploadDir, url.slice(URL_PREFIX.length))
    try {
      await fs.unlink(abs)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to delete album file:', error)
      }
    }
  }
}

async function cleanupRawFiles(files: Array<{ path: string }> | undefined): Promise<void> {
  if (!files) return
  await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})))
}

function parseAlbumInput(body: unknown): AlbumInput {
  const data = (body ?? {}) as Record<string, unknown>
  return {
    title: String(data.title ?? ''),
    year: String(data.year ?? ''),
    date: typeof data.date === 'string' ? data.date : '',
    location: typeof data.location === 'string' ? data.location : '',
    description: typeof data.description === 'string' ? data.description : '',
    categories: Array.isArray(data.categories)
      ? data.categories.filter((c): c is string => typeof c === 'string')
      : [],
    featured: Boolean(data.featured),
    sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : 0,
  }
}

function generateAlbumId(title: string, isAvailable: (id: string) => boolean): string {
  const base = slugifyImageName(title) || 'album'
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${crypto.randomBytes(3).toString('hex')}`
    if (isAvailable(candidate)) return candidate
  }
  // 极端情况下回退到更长随机串
  return `${base}-${crypto.randomBytes(6).toString('hex')}`
}

function handleWriteError(error: unknown, res: Response): void {
  if (error instanceof AlbumValidationError) {
    res.status(400).json({ error: error.message })
    return
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Album id already exists' })
    return
  }
  console.error('Album write error:', error)
  if (!res.headersSent) res.status(500).json({ error: '保存失败' })
}

function handleUploadError(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: '文件大小超过限制（最大 5MB）' })
      return
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: `一次最多上传 ${MAX_PHOTOS_PER_BATCH} 张照片` })
      return
    }
  }
  if (error instanceof Error && error.message.includes('不支持的文件类型')) {
    res.status(400).json({ error: error.message })
    return
  }
  next(error)
}
```

> `repo.updateCover(...)` 已在 Task 3 的 `AlbumRepository` 接口中声明（`update(id, input)` 不改封面，因此封面单独走 `updateCover`）。

- [ ] **Step 4: 在 index.ts 挂载路由**

修改 `server/src/index.ts`：

1. 在现有 import 区（`createStudentRouter` 那几行附近）加：

```ts
import { createAlbumRepository } from './albums/albums.repo.js'
import { createAlbumRouter } from './albums/albums.routes.js'
```

2. 在 `const studentRepo = createStudentRepository(db)` 之后加：

```ts
  const albumRepo = createAlbumRepository(db)
```

3. 在 `app.use(createStudentRouter(...))` 那一块之后、`app.get('/health', ...)` 之前加：

```ts
  app.use(createAlbumRouter({ repo: albumRepo, authService, albumUploadDir: config.albumUploadDir }))
```

> 静态服务无需改动：`path.dirname(config.uploadDir)` 生产为 `/var/www/uploads`，`/var/www/uploads/albums/` 已在其下。

- [ ] **Step 5: 运行路由测试确认通过**

Run: `cd server && npx tsx --test test/albums/albums.routes.test.ts`
Expected: 7 个测试全 PASS。

- [ ] **Step 6: 全量测试 + 类型检查**

Run: `cd server && npm test && npm run build`
Expected: 全绿，tsc 无错（若 tsc 报 `updateCover` 不存在，确认 Step 3 末尾的接口补充已完成）。

- [ ] **Step 7: Commit**

```bash
git add server/src/albums/albums.routes.ts server/src/albums/albums.repo.ts \
  server/src/index.ts server/test/albums/albums.routes.test.ts
git commit -m "feat(albums): 新增相册路由与批量上传/封面/排序接口

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 迁移脚本——把现有 3 个相册导入新存储

**Files:**
- Create: `server/scripts/migrate-gallery.ts`
- Reference: `public/gallery/lab/2026/*.JPG`、`public/gallery/lab/1.jpg..11.jpg`、`public/gallery/lab/lab-life.jpg`、`public/gallery/lab/campus-moment.jpg`
- Reference: `server/scripts/migrate-static-photos.ts`（风格参照）

**Interfaces:**
- Consumes: `loadConfig`、`openDatabase`、`createAlbumRepository`、`compressImage`、`generateThumbnail`、`ensureDirectory`、`generateAlbumPhotoPath`、`generateAlbumCoverPath`、`thumbnailPathFor`。
- Produces: 可重复执行的脚本 `npx tsx scripts/migrate-gallery.ts`，幂等（先按已知 id 删除旧相册记录与目录再导入）。

- [ ] **Step 1: 确认源文件存在**

Run:

```bash
ls public/gallery/lab/2026/DSC_1795.JPG public/gallery/lab/1.jpg \
   public/gallery/lab/lab-life.jpg public/gallery/lab/campus-moment.jpg
```

Expected: 四个路径均存在（无 "No such file"）。

- [ ] **Step 2: 编写迁移脚本**

创建 `server/scripts/migrate-gallery.ts`：

```ts
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { openDatabase } from '../src/db.js'
import { createAlbumRepository } from '../src/albums/albums.repo.js'
import {
  compressImage,
  ensureDirectory,
  generateAlbumCoverPath,
  generateAlbumPhotoPath,
  generateThumbnail,
  thumbnailPathFor,
} from '../src/image-utils.js'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const publicLabDir = join(projectRoot, 'public', 'gallery', 'lab')

interface MigratePhoto {
  source: string       // 绝对路径
  originalName: string // 用于生成 slug 文件名
  caption?: string
}

interface MigrateAlbum {
  id: string
  title: string
  year: string
  date: string
  location: string
  description: string
  categories: string[]
  featured: boolean
  coverOriginalName: string // 从 photos 中选哪张做封面（匹配 originalName）
  photos: MigratePhoto[]
}

const albums: MigrateAlbum[] = [
  {
    id: '2026-graduation',
    title: '2026 届毕业合影',
    year: '2026',
    date: '2026-06',
    location: '湘潭大学',
    description: '记录 2026 届毕业生在实验室、校园里的珍贵瞬间，包含信息楼、铜像广场、三拱门等地标合影。',
    categories: ['毕业照'],
    featured: true,
    coverOriginalName: 'DSC_1795.JPG',
    photos: [
      { source: join(publicLabDir, '2026', 'DSC_1795.JPG'), originalName: 'DSC_1795.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', 'DSC_1759.JPG'), originalName: 'DSC_1759.JPG', caption: '工科楼' },
      { source: join(publicLabDir, '2026', 'DSC_1773.JPG'), originalName: 'DSC_1773.JPG', caption: '信息楼' },
      { source: join(publicLabDir, '2026', 'DSC_1780.JPG'), originalName: 'DSC_1780.JPG', caption: '信息楼' },
      { source: join(publicLabDir, '2026', 'DSC_1838.JPG'), originalName: 'DSC_1838.JPG', caption: '信息科技大楼 632' },
      { source: join(publicLabDir, '2026', 'DSC_1850.JPG'), originalName: 'DSC_1850.JPG', caption: '信息科技大楼 616' },
      { source: join(publicLabDir, '2026', 'DSC_1824.JPG'), originalName: 'DSC_1824.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', 'DSC_1820.JPG'), originalName: 'DSC_1820.JPG', caption: '信息科技大楼' },
      { source: join(publicLabDir, '2026', '1.jpg'), originalName: '1.jpg', caption: '诗词碑' },
      { source: join(publicLabDir, '2026', '2.jpg'), originalName: '2.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '3.jpg'), originalName: '3.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '4.jpg'), originalName: '4.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '5.jpg'), originalName: '5.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '6.jpg'), originalName: '6.jpg', caption: '铜像广场' },
      { source: join(publicLabDir, '2026', '7.jpg'), originalName: '7.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '8.jpg'), originalName: '8.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '9.jpg'), originalName: '9.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '10.jpg'), originalName: '10.jpg', caption: '南门' },
      { source: join(publicLabDir, '2026', '11.jpg'), originalName: '11.jpg', caption: '三拱门' },
    ],
  },
  {
    id: '2025-summer-life',
    title: '夏季户外合影',
    year: '2025',
    date: '2025-06',
    location: '湘潭大学校园',
    description: '2025 年夏季实验室成员户外合影，记录轻松愉快的团队时光。',
    categories: ['生活照'],
    featured: true,
    coverOriginalName: 'lab-life.jpg',
    photos: [
      { source: join(publicLabDir, 'lab-life.jpg'), originalName: 'lab-life.jpg' },
    ],
  },
  {
    id: '2025-campus-moment',
    title: '校园生活片段',
    year: '2025',
    date: '2025-06',
    location: '湘潭大学校园湖畔',
    description: '校园湖畔的日常随拍，捕捉实验室生活的温馨瞬间。',
    categories: ['生活照'],
    featured: true,
    coverOriginalName: 'campus-moment.jpg',
    photos: [
      { source: join(publicLabDir, 'campus-moment.jpg'), originalName: 'campus-moment.jpg' },
    ],
  },
]

async function processAlbumPhoto(
  albumUploadDir: string,
  albumId: string,
  source: string,
  originalName: string,
): Promise<{ imageUrl: string; thumbUrl: string }> {
  if (!existsSync(source)) {
    throw new Error(`源文件不存在: ${source}`)
  }
  const imageRel = generateAlbumPhotoPath(albumId, originalName)
  const thumbRel = thumbnailPathFor(imageRel)
  const imageAbs = join(albumUploadDir, imageRel)
  const thumbAbs = join(albumUploadDir, thumbRel)

  await ensureDirectory(join(albumUploadDir, albumId))
  await compressImage(source, imageAbs)
  await generateThumbnail(imageAbs, thumbAbs)

  return { imageUrl: `/uploads/albums/${imageRel.replace(/\\/g, '/')}`, thumbUrl: `/uploads/albums/${thumbRel.replace(/\\/g, '/')}` }
}

async function processCover(
  albumUploadDir: string,
  albumId: string,
  source: string,
): Promise<{ coverUrl: string; coverThumb: string }> {
  if (!existsSync(source)) throw new Error(`封面源文件不存在: ${source}`)
  const coverRel = generateAlbumCoverPath(albumId)
  const thumbRel = thumbnailPathFor(coverRel)
  const coverAbs = join(albumUploadDir, coverRel)
  const thumbAbs = join(albumUploadDir, thumbRel)

  await ensureDirectory(join(albumUploadDir, albumId))
  await compressImage(source, coverAbs)
  await generateThumbnail(coverAbs, thumbAbs)

  return { coverUrl: `/uploads/albums/${coverRel.replace(/\\/g, '/')}`, coverThumb: `/uploads/albums/${thumbRel.replace(/\\/g, '/')}` }
}

async function main() {
  const config = loadConfig()
  const db = openDatabase(config.sqlitePath)
  const repo = createAlbumRepository(db)

  await ensureDirectory(config.albumUploadDir)

  for (const album of albums) {
    // 幂等：删除已有记录（级联删照片）与目录
    repo.delete(album.id)
    const albumDir = join(config.albumUploadDir, album.id)
    rmSync(albumDir, { recursive: true, force: true })

    repo.create(album.id, {
      title: album.title,
      year: album.year,
      date: album.date,
      location: album.location,
      description: album.description,
      categories: album.categories,
      featured: album.featured,
      sortOrder: 0,
    })

    const photoInputs = []
    for (const photo of album.photos) {
      const processed = await processAlbumPhoto(config.albumUploadDir, album.id, photo.source, photo.originalName)
      photoInputs.push({ ...processed, caption: photo.caption })
    }
    repo.addPhotos(album.id, photoInputs)

    const coverSource =
      album.photos.find((p) => p.originalName === album.coverOriginalName)?.source ?? album.photos[0].source
    const cover = await processCover(config.albumUploadDir, album.id, coverSource)
    repo.updateCover(album.id, cover.coverUrl, cover.coverThumb)

    console.log(`已迁移相册 ${album.id}: ${photoInputs.length} 张照片，封面 ${cover.coverUrl}`)
  }

  console.log('迁移完成。')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

- [ ] **Step 3: 类型检查**

Run: `cd server && npm run build`
Expected: tsc 无错（scripts 目录在 tsconfig include 内）。

- [ ] **Step 4: 在本地用临时上传目录试跑脚本（幂等）**

Run:

```bash
cd server
ALBUM_UPLOAD_DIR="$(mktemp -d)/albums" SQLITE_PATH=":memory:" npx tsx scripts/migrate-gallery.ts
```

Expected: 打印三行「已迁移相册 ... N 张照片」+「迁移完成。」；2026-graduation 为 19 张，两个 2025 相册各 1 张。

> 说明：`:memory:` 库随进程退出即销毁，此步只验证脚本逻辑与图片处理无异常；真实迁移在 Task 7 验证步骤里对生产库执行。

- [ ] **Step 5: Commit**

```bash
git add server/scripts/migrate-gallery.ts
git commit -m "feat(albums): 新增现有照片墙到后端存储的迁移脚本

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 前端 API 客户端与类型

**Files:**
- Modify: `src/data/gallery/types.ts`
- Modify: `src/utils/api.ts`
- Test: `npm run build`（前端类型检查）

**Interfaces:**
- Consumes: 后端 `Album`/`Photo` 字段（camelCase）。
- Produces:
  - 前端类型 `Album`、`AlbumListItem`、`Photo`，从 `../data/gallery/types` 导出。
  - `memberApi` 方法：`listAlbums()`、`getAlbum(id)`、`createAlbum(input)`、`updateAlbum(id, input)`、`deleteAlbum(id)`、`uploadAlbumPhotos(id, files)`、`reorderAlbumPhotos(id, orderedIds)`、`updatePhotoCaption(photoId, caption)`、`deletePhoto(photoId)`、`uploadAlbumCover(id, file)`。

- [ ] **Step 1: 增加前端类型**

在 `src/data/gallery/types.ts` 末尾追加（保留现有 GalleryEvent/GalleryPhoto 不动）：

```ts
export interface Photo {
  id: string
  albumId: string
  imageUrl: string
  thumbUrl: string
  caption: string
  sortOrder: number
  createdAt: string
}

export interface AlbumBase {
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
  createdAt: string
  updatedAt: string
}

export interface AlbumListItem extends AlbumBase {
  photosCount: number
}

export interface Album extends AlbumBase {
  photos: Photo[]
}

export interface AlbumInput {
  title: string
  year: string
  date?: string
  location?: string
  description?: string
  categories?: string[]
  featured?: boolean
  sortOrder?: number
}
```

- [ ] **Step 2: 在 api.ts 引入类型并新增方法**

在 `src/utils/api.ts` 顶部的类型 import 之后加：

```ts
import type { Album, AlbumListItem, AlbumInput, Photo } from '../data/gallery/types'
```

在 `memberApi` 返回对象里（`deleteStudent` 方法之后、专利相关方法之前）插入：

```ts
    // 相册相关 API
    listAlbums() {
      return requestJson<AlbumListItem[]>('/albums')
    },

    getAlbum(id: string) {
      return requestJson<Album>(`/albums/${encodeURIComponent(id)}`)
    },

    createAlbum(input: AlbumInput) {
      return requestJson<Album>('/albums', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },

    updateAlbum(id: string, input: AlbumInput) {
      return requestJson<Album>(`/albums/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
    },

    deleteAlbum(id: string) {
      return requestJson<void>(`/albums/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    uploadAlbumPhotos(id: string, files: File[]): Promise<{ photos: Photo[] }> {
      const formData = new FormData()
      files.forEach((file) => formData.append('photos', file))
      return fetchImpl(`${normalizedBaseUrl}/albums/${encodeURIComponent(id)}/photos`, {
        method: 'POST',
        headers: { Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '' },
        body: formData,
      }).then(handleUploadResponse)
    },

    reorderAlbumPhotos(id: string, orderedIds: string[]) {
      return requestJson<{ ok: boolean }>(`/albums/${encodeURIComponent(id)}/photos/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIds }),
      })
    },

    updatePhotoCaption(photoId: string, caption: string) {
      return requestJson<Photo>(`/photos/${encodeURIComponent(photoId)}`, {
        method: 'PUT',
        body: JSON.stringify({ caption }),
      })
    },

    deletePhoto(photoId: string) {
      return requestJson<void>(`/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' })
    },

    uploadAlbumCover(id: string, file: File): Promise<Album> {
      const formData = new FormData()
      formData.append('photo', file)
      return fetchImpl(`${normalizedBaseUrl}/albums/${encodeURIComponent(id)}/cover`, {
        method: 'POST',
        headers: { Authorization: storage.getToken() ? `Bearer ${storage.getToken()}` : '' },
        body: formData,
      }).then(handleUploadResponse)
    },
```

在 `createMemberApi` 函数外部（文件底部 `export const memberApi` 之前）加一个共享的上传响应处理函数：

```ts
async function handleUploadResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || error.message || `Upload failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}
```

- [ ] **Step 3: 前端类型检查 / 构建**

Run: `npm run build`
Expected: Vite/TypeScript 构建通过（GalleryPage 还没改用新方法，未使用的导出不会报错）。

- [ ] **Step 4: Commit**

```bash
git add src/data/gallery/types.ts src/utils/api.ts
git commit -m "feat(albums): 前端新增相册类型与 memberApi 相册方法

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: GalleryPage 改为读 API，移除 localStorage 编辑器

**Files:**
- Modify: `src/pages/GalleryPage.vue`（整文件替换）

**Interfaces:**
- Consumes: `memberApi`（listAlbums/getAlbum）、类型 `Album`/`AlbumListItem`/`Photo`、`resolvePhotoUrl`（from `../utils/publicAsset`，已存在）。
- 行为：onMounted 拉 `listAlbums()` 填列表；分类、年份从返回数据 computed 聚合；打开相册时若该相册没有 `photos`，调 `getAlbum(id)` 取照片；图片用 `resolvePhotoUrl` 解析；加载/错误态对齐 PeoplePage 的 `isLoading`/`apiError` 模式。
- 移除：`galleryEvents`/`galleryCategories`/`galleryYears`/`labImage` 静态 import、所有 customEvents/localStorage 逻辑、编辑器弹窗、卡片与弹窗上的编辑/删除按钮、"新建相册"按钮、`Plus`/`Save`/`Pencil` 图标导入。
- 字段重命名：`coverImage`→`coverUrl`、`coverThumbnail`→`coverThumb`、`GalleryEvent`→`Album`、`GalleryPhoto`→`Photo`、`selectedEvent`→`selectedAlbum`、`openEvent`→`openAlbum` 等。

- [ ] **Step 1: 整文件替换 GalleryPage.vue**

用以下内容完整替换 `src/pages/GalleryPage.vue`（CSS 中与编辑器/操作按钮相关的样式一并移除，其余展示样式保持不变）：

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  X,
  Calendar,
  MapPin,
  Images,
  Search,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from 'lucide-vue-next'
import { memberApi } from '../utils/api'
import { resolvePhotoUrl } from '../utils/publicAsset'
import type { Album, AlbumListItem, Photo } from '../data/gallery/types'

const allCategories = '全部'

type SortOrder = 'desc' | 'asc'

const albums = ref<AlbumListItem[]>([])
const isLoading = ref(false)
const apiError = ref('')

const activeCategories = ref<string[]>([allCategories])
const activeYear = ref('全部')
const searchText = ref('')
const sortOrder = ref<SortOrder>('desc')
const selectedAlbum = ref<Album | null>(null)
const selectedPhoto = ref<Photo | null>(null)
const photoRatios = ref<Record<string, number>>({})
const detailLoading = ref(false)

const categories = computed(() => {
  const set = new Set<string>()
  albums.value.forEach((album) => album.categories.forEach((c) => set.add(c)))
  return [allCategories, ...Array.from(set).sort()]
})

const years = computed(() =>
  Array.from(new Set(albums.value.map((album) => album.year))).sort((a, b) => Number(b) - Number(a)),
)

const heroGallery = computed(() => {
  const featured = albums.value.filter((album) => album.featured).slice(0, 3)
  return featured.length > 0 ? featured : albums.value.slice(0, 3)
})

const filteredAlbums = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return albums.value.filter((album) => {
    const matchesCategory =
      activeCategories.value.includes(allCategories) ||
      activeCategories.value.some((category) => album.categories.includes(category))
    const matchesYear = activeYear.value === '全部' || album.year === activeYear.value
    const text = [album.title, album.year, album.location, album.date, ...(album.categories || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesCategory && matchesYear && (!keyword || text.includes(keyword))
  })
})

const sortedAlbums = computed(() => {
  const list = [...filteredAlbums.value]
  list.sort((a, b) => {
    const order = sortOrder.value === 'asc' ? 1 : -1
    const dateDiff = (a.date || '').localeCompare(b.date || '')
    if (dateDiff !== 0) return dateDiff * order
    return a.year.localeCompare(b.year) * order
  })
  return list
})

const groupedAlbums = computed(() => {
  const groups = new Map<string, AlbumListItem[]>()
  sortedAlbums.value.forEach((album) => {
    if (!groups.has(album.year)) groups.set(album.year, [])
    groups.get(album.year)!.push(album)
  })
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, list]) => ({ year, events: list }))
})

const activeFiltersCount = computed(() => {
  let count = 0
  if (!activeCategories.value.includes(allCategories)) count += activeCategories.value.length
  if (activeYear.value !== '全部') count += 1
  if (searchText.value.trim().length > 0) count += 1
  return count
})

function toggleCategorySelection(category: string) {
  if (category === allCategories) {
    activeCategories.value = [allCategories]
  } else {
    const filtered = activeCategories.value.filter((c) => c !== allCategories)
    if (filtered.includes(category)) {
      const next = filtered.filter((c) => c !== category)
      activeCategories.value = next.length > 0 ? next : [allCategories]
    } else {
      activeCategories.value = [...filtered, category]
    }
  }
}

function resetFilters() {
  activeCategories.value = [allCategories]
  activeYear.value = '全部'
  searchText.value = ''
  sortOrder.value = 'desc'
}

async function openAlbum(album: AlbumListItem) {
  selectedAlbum.value = { ...album, photos: [] } as unknown as Album
  selectedPhoto.value = null
  document.body.style.overflow = 'hidden'
  detailLoading.value = true
  try {
    selectedAlbum.value = await memberApi.getAlbum(album.id)
  } catch {
    apiError.value = '相册照片加载失败，请稍后重试。'
  } finally {
    detailLoading.value = false
  }
}

function closeAlbum() {
  selectedAlbum.value = null
  selectedPhoto.value = null
  document.body.style.overflow = ''
}

function openPhoto(photo: Photo) {
  selectedPhoto.value = photo
}

function closePhoto() {
  selectedPhoto.value = null
}

function prevPhoto() {
  if (!selectedAlbum.value || !selectedPhoto.value) return
  const photos = selectedAlbum.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index > 0 ? photos[index - 1] : photos[photos.length - 1]
}

function nextPhoto() {
  if (!selectedAlbum.value || !selectedPhoto.value) return
  const photos = selectedAlbum.value.photos
  const index = photos.findIndex((p) => p.id === selectedPhoto.value!.id)
  selectedPhoto.value = index < photos.length - 1 ? photos[index + 1] : photos[0]
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (selectedPhoto.value) closePhoto()
    else if (selectedAlbum.value) closeAlbum()
  } else if (selectedPhoto.value) {
    if (e.key === 'ArrowLeft') prevPhoto()
    if (e.key === 'ArrowRight') nextPhoto()
  }
}

function updatePhotoRatio(photo: Photo) {
  const img = new Image()
  img.onload = () => {
    photoRatios.value[photo.id] = img.naturalWidth / img.naturalHeight
  }
  img.src = resolvePhotoUrl(photo.imageUrl)
}

watch(
  () => selectedAlbum.value?.photos,
  (photos) => {
    if (!photos) return
    nextTick(() => {
      photos.forEach((photo) => {
        if (!photoRatios.value[photo.id]) updatePhotoRatio(photo)
      })
    })
  },
  { immediate: true },
)

async function loadAlbums() {
  isLoading.value = true
  apiError.value = ''
  try {
    albums.value = await memberApi.listAlbums()
  } catch {
    apiError.value = '相册数据服务暂时不可用，请稍后刷新重试。'
    albums.value = []
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadAlbums()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <main class="gallery-page">
    <section class="gallery-hero" aria-labelledby="gallery-title">
      <div class="gallery-hero-media">
        <img
          v-for="album in heroGallery"
          :key="album.id"
          :src="resolvePhotoUrl(album.coverUrl)"
          :alt="album.title"
          decoding="async"
        />
      </div>
      <div class="gallery-hero-overlay"></div>
      <div class="gallery-hero-content">
        <p class="eyebrow">Gallery</p>
        <h1 id="gallery-title">记录实验室的每一段时光</h1>
        <p>从毕业合影到日常随拍，用影像留住属于 Happy CV Lab 的故事。</p>
      </div>
    </section>

    <div class="people-directory">
      <div class="cohort-layout">
        <aside class="filter-panel">
          <h2 class="filter-panel-main-title">照片墙</h2>

          <div class="filter-panel-search">
            <Search :size="16" />
            <input v-model="searchText" type="text" placeholder="搜索相册、地点..." />
          </div>

          <div class="filter-group">
            <span class="filter-group-label filter-group-label-lg">排序</span>
            <button
              type="button"
              class="sort-btn sort-btn-compact"
              @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'"
            >
              <ArrowDown v-if="sortOrder === 'desc'" :size="16" />
              <ArrowUp v-else :size="16" />
              日期
            </button>
          </div>

          <h3 class="filter-panel-title filter-panel-title-lg">筛选</h3>

          <div class="filter-group">
            <span class="filter-group-label">分类</span>
            <div class="filter-pill-flex filter-pill-grid-3">
              <button
                v-for="category in categories"
                :key="category"
                type="button"
                :class="['filter-pill', { active: activeCategories.includes(category) }]"
                @click="toggleCategorySelection(category)"
              >
                {{ category }}
              </button>
            </div>
          </div>

          <div class="filter-group">
            <span class="filter-group-label">年份</span>
            <div class="filter-pill-flex filter-pill-grid-3">
              <button
                type="button"
                :class="['filter-pill', { active: activeYear === '全部' }]"
                @click="activeYear = '全部'"
              >
                全部
              </button>
              <button
                v-for="year in years"
                :key="year"
                type="button"
                :class="['filter-pill', { active: activeYear === year }]"
                @click="activeYear = year"
              >
                {{ year }}
              </button>
            </div>
          </div>

          <button
            v-if="activeFiltersCount > 0"
            class="login-btn login-btn-cancel filter-reset"
            type="button"
            @click="resetFilters"
          >
            <RotateCcw :size="14" />
            清除筛选
          </button>

          <p v-if="apiError" class="api-state warning">{{ apiError }}</p>
        </aside>

        <div v-if="isLoading" class="member-groups gallery-groups gallery-empty">
          <p>正在加载相册…</p>
        </div>

        <div v-else-if="groupedAlbums.length === 0" class="member-groups gallery-groups gallery-empty">
          <ImageOff :size="48" />
          <p>没有找到匹配的相册</p>
          <button class="btn-clear" @click="resetFilters">清除筛选</button>
        </div>

        <div v-else class="member-groups gallery-groups">
          <section v-for="group in groupedAlbums" :key="group.year" class="member-group">
            <div class="member-group-heading">
              <h3>{{ group.year }}</h3>
              <span>{{ group.events.length }} 个相册</span>
            </div>
            <div class="events-grid">
              <article
                v-for="album in group.events"
                :key="album.id"
                class="event-card"
                @click="openAlbum(album)"
              >
                <div class="event-card-image">
                  <img
                    :src="resolvePhotoUrl(album.coverThumb || album.coverUrl)"
                    :alt="album.title"
                    loading="lazy"
                  />
                  <div class="event-card-tags">
                    <span v-for="category in album.categories.slice(0, 2)" :key="category" class="event-card-tag">
                      {{ category }}
                    </span>
                  </div>
                  <span class="event-card-count">
                    <Images :size="14" />
                    {{ album.photosCount }}
                  </span>
                </div>
                <div class="event-card-body">
                  <h3 class="event-card-title">{{ album.title }}</h3>
                  <div class="event-card-meta">
                    <span><Calendar :size="14" /> {{ album.date }}</span>
                    <span><MapPin :size="14" /> {{ album.location }}</span>
                  </div>
                  <p v-if="album.description" class="event-card-desc">{{ album.description }}</p>
                  <div class="event-card-categories">
                    <span v-for="category in album.categories" :key="category" class="event-category-chip">
                      {{ category }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Album Detail Modal -->
    <Transition name="fade">
      <div v-if="selectedAlbum" class="event-modal" @click.self="closeAlbum">
        <div class="event-modal-panel">
          <header class="event-modal-header">
            <div class="event-modal-title">
              <div class="event-modal-categories">
                <span v-for="category in selectedAlbum.categories" :key="category" class="event-modal-category">
                  {{ category }}
                </span>
              </div>
              <h2>{{ selectedAlbum.title }}</h2>
              <div class="event-modal-meta">
                <span><Calendar :size="14" /> {{ selectedAlbum.date }}</span>
                <span><MapPin :size="14" /> {{ selectedAlbum.location }}</span>
                <span><Images :size="14" /> {{ selectedAlbum.photos.length }} 张照片</span>
              </div>
            </div>
            <div class="event-modal-actions">
              <button class="event-modal-close" @click="closeAlbum">
                <X :size="22" />
              </button>
            </div>
          </header>

          <p v-if="selectedAlbum.description" class="event-modal-desc">{{ selectedAlbum.description }}</p>

          <div v-if="detailLoading" class="event-photos-grid">照片加载中…</div>
          <div v-else class="event-photos-grid">
            <div
              v-for="photo in selectedAlbum.photos"
              :key="photo.id"
              class="event-photo-item"
              :style="{
                aspectRatio: photoRatios[photo.id] ? String(photoRatios[photo.id]) : '1.5',
              }"
              @click="openPhoto(photo)"
            >
              <img
                :src="resolvePhotoUrl(photo.thumbUrl || photo.imageUrl)"
                :alt="photo.caption || selectedAlbum.title"
                loading="lazy"
              />
              <div v-if="photo.caption" class="event-photo-caption">{{ photo.caption }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Photo Lightbox -->
    <Transition name="fade">
      <div v-if="selectedPhoto" class="photo-lightbox" @click.self="closePhoto">
        <button class="lightbox-nav lightbox-prev" @click.stop="prevPhoto">
          <ChevronLeft :size="32" />
        </button>
        <div class="lightbox-content">
          <img :src="resolvePhotoUrl(selectedPhoto.imageUrl)" :alt="selectedPhoto.caption || ''" />
          <div v-if="selectedPhoto.caption" class="lightbox-caption">{{ selectedPhoto.caption }}</div>
        </div>
        <button class="lightbox-nav lightbox-next" @click.stop="nextPhoto">
          <ChevronRight :size="32" />
        </button>
        <button class="lightbox-close" @click.stop="closePhoto">
          <X :size="24" />
        </button>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.gallery-page {
  min-height: 100vh;
  background: #f8f9fa;
}

.filter-panel-main-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--ink, #17211f);
  margin: 0;
  line-height: 1.2;
}

.filter-panel-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid var(--line, #dce5df);
  transition: border-color 0.2s;
}

.filter-panel-search:focus-within {
  border-color: var(--green, #1f7a5a);
}

.filter-panel-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--ink, #17211f);
}

.filter-panel-search input::placeholder {
  color: var(--muted, #5f6f69);
}

.gallery-groups {
  padding-bottom: 80px;
}

.gallery-groups.gallery-empty {
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 80px 24px;
  color: var(--muted, #5f6f69);
}

.filter-reset {
  width: 100%;
  justify-content: center;
  font-size: 13px;
  padding: 10px 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-panel-title-lg {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink, #17211f);
}

.filter-group-label-lg {
  font-size: 16px;
  font-weight: 800;
  color: var(--ink, #17211f);
}

.sort-btn-compact {
  width: fit-content;
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--line, #dce5df);
  background: #ffffff;
  color: var(--ink, #17211f);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sort-btn-compact:hover {
  border-color: var(--ink, #17211f);
  background: var(--soft, #eef4f0);
}

.filter-pill-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.filter-pill-grid-3 .filter-pill {
  width: 100%;
  justify-content: center;
  padding: 7px 4px;
  font-size: 14px;
}

.filter-reset {
  width: 100%;
}

.events-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.event-card {
  position: relative;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;
}

.event-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
}

.event-card-image {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}

.event-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}

.event-card:hover .event-card-image img {
  transform: scale(1.05);
}

.event-card-tags {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-card-tag {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  backdrop-filter: blur(4px);
}

.event-card-count {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
}

.event-card-body {
  padding: 18px;
}

.event-card-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--ink, #17211f);
}

.event-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--muted, #5f6f69);
  margin-bottom: 10px;
}

.event-card-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.event-card-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted, #5f6f69);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

.event-card-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-category-chip {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--soft, #eef4f0);
  color: var(--green, #1f7a5a);
  font-size: 11px;
  font-weight: 700;
}

.btn-clear {
  padding: 8px 18px;
  border-radius: 999px;
  border: none;
  background: var(--green, #1f7a5a);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-clear:hover {
  opacity: 0.9;
}

.event-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
}

.event-modal-panel {
  width: 100%;
  max-width: 1100px;
  max-height: 90vh;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.event-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px;
  border-bottom: 1px solid var(--line, #dce5df);
}

.event-modal-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.event-modal-category {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--soft, #eef4f0);
  color: var(--green, #1f7a5a);
  font-size: 12px;
  font-weight: 700;
}

.event-modal-title h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--ink, #17211f);
}

.event-modal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--muted, #5f6f69);
}

.event-modal-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.event-modal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: var(--soft, #eef4f0);
  color: var(--ink, #17211f);
  cursor: pointer;
  transition: background 0.2s;
}

.event-modal-close:hover {
  background: var(--line, #dce5df);
}

.event-modal-desc {
  padding: 16px 28px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted, #5f6f69);
}

.event-photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  padding: 24px 28px;
  overflow-y: auto;
}

.event-photo-item {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: #f1f5f9;
}

.event-photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.event-photo-item:hover img {
  transform: scale(1.04);
}

.event-photo-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 10px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.event-photo-item:hover .event-photo-caption {
  opacity: 1;
}

.photo-lightbox {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
}

.lightbox-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lightbox-content img {
  max-width: 100%;
  max-height: 82vh;
  object-fit: contain;
  border-radius: 6px;
}

.lightbox-caption {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.lightbox-nav:hover {
  background: rgba(255, 255, 255, 0.2);
}

.lightbox-prev {
  left: 24px;
}

.lightbox-next {
  right: 24px;
}

.lightbox-close {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1024px) {
  .events-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .events-grid {
    grid-template-columns: 1fr;
  }

  .event-modal {
    padding: 0;
  }

  .event-modal-panel {
    max-height: 100vh;
    border-radius: 0;
  }

  .event-modal-header {
    padding: 16px;
  }

  .event-modal-title h2 {
    font-size: 18px;
  }

  .event-photos-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 16px;
    gap: 8px;
  }
}
</style>
```

- [ ] **Step 2: 前端构建**

Run: `npm run build`
Expected: 构建通过，无 TS 报错。若有未使用变量提示，删除对应声明后再次构建直至通过。

- [ ] **Step 3: 本地联调验证**

启动后端（`cd server && npm run dev`，确保 `.env` 未设 `ALBUM_UPLOAD_DIR`，使用默认 `data/uploads/albums`），在另一个终端跑一次迁移：

```bash
cd server
npx tsx scripts/migrate-gallery.ts
```

再启动前端 `npm run dev`，浏览器打开照片墙页：

- 列表显示 3 个相册，封面正常加载（URL 形如 `/uploads/albums/.../-<ts>.jpg`）。
- 分类（毕业照/生活照）、年份（2026/2025）、搜索、日期升降序可用。
- 点进相册，照片网格与 lightbox 左右翻页正常；caption（信息楼、铜像广场等）显示正确。
- 浏览器/Network 中图片来自 API 域名的 `/uploads/albums/...`，而非旧的 `gallery/lab/...`。

- [ ] **Step 4: Commit**

```bash
git add src/pages/GalleryPage.vue
git commit -m "feat(gallery): 照片墙改为从相册 API 读取，移除 localStorage 编辑器

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: 生产部署与迁移验证

**Files:** 无代码改动；执行部署命令与验证。

- [ ] **Step 1: 确认生产 .env 含 ALBUM_UPLOAD_DIR**

检查 `server/.env`，确保有：

```
ALBUM_UPLOAD_DIR=/var/www/uploads/albums
```

若没有则追加一行。确认 `/var/www/uploads` 是 `UPLOAD_DIR`（`/var/www/uploads/students`）的父目录——静态服务已覆盖。

- [ ] **Step 2: 构建并重启后端 + 前端**

在项目根目录运行：

```bash
./restart.sh
```

该脚本会 `npm run build`（前端）、`cd server && npm run build`（后端 tsc）、`pm2 restart lab-homepage-api`。

Expected: 三个步骤均无错误退出；PM2 状态 online。

- [ ] **Step 3: 运行生产迁移**

```bash
cd server
npx tsx scripts/migrate-gallery.ts
```

Expected: 输出三行「已迁移相册 ...」：`2026-graduation` 19 张、两个 2025 相册各 1 张。脚本幂等，必要时可重跑。

- [ ] **Step 4: 磁盘与接口抽查**

```bash
ls /var/www/uploads/albums/2026-graduation/ | head
ls /var/www/uploads/albums/2026-graduation/thumbs/ | head
curl -s https://api.scs-happycv.top/albums | head -c 600
```

Expected: 相册目录有 `cover-<ts>.jpg` 与若干 `<slug>-<ts>.jpg`；`thumbs/` 有对应 `.webp`；`/albums` 返回 3 条 JSON，含 `photosCount`。

- [ ] **Step 5: 带 token 验证一次写入与删除**

```bash
TOKEN=$(curl -s -X POST https://api.scs-happycv.top/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"<管理员密码>"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

# 建一个临时相册
AID=$(curl -s -X POST https://api.scs-happycv.top/albums \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"tmp-verify","year":"2026"}' | sed -E 's/.*"id":"([^"]+)".*/\1/')
echo "created $AID"

# 传一张测试图（用任意本地 jpg）
curl -s -X POST "https://api.scs-happycv.top/albums/$AID/photos" \
  -H "Authorization: Bearer $TOKEN" -F "photos=@/path/to/test.jpg"

# 删除整个相册，确认目录被删
curl -s -X DELETE "https://api.scs-happycv.top/albums/$AID" -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}\n"
ls /var/www/uploads/albums/ | grep "$AID" || echo "目录已删除"
```

Expected: 上传返回 201 含 photos 数组；删除返回 204；`ls` 无该相册目录。

- [ ] **Step 6: 浏览器硬刷新验证 CDN**

访问 `https://scs-happycv.github.io/`（或实际照片墙页面），硬刷新（Ctrl+F5）：

- 3 个相册封面、照片正常显示。
- 新上传/替换的图片 URL 带时间戳，Cloudflare 不返回旧缓存。

- [ ] **Step 7: 提交部署相关变更（如有）**

若 `restart.sh` 或 `.env.example` 有改动则提交。`.env` 本身在 `.gitignore` 中不提交。

```bash
git add -A
git commit -m "chore(deploy): 相册存储部署与迁移验证

Co-Authored-By: Claude <noreply@anthropic.com>"
```

> 若工作区仅有 `docs/` 构建产物变动，按项目约定「构建产物不入库」不要提交 docs；可 `git checkout -- docs` 丢弃。

---

## 自评审记录（计划作者已核对）

- **Spec 覆盖**：建表 + 外键级联（Task 1）、文件名清洗/缩略图/相册路径（Task 2）、repo CRUD/批量/reorder/级联（Task 3）、9 个路由 + 批量回滚 + 封面替换清理 + 删整相册删目录 + multer 错误（Task 4）、迁移脚本幂等 + 3 相册 19/1/1 张（Task 5）、前端 API 方法（Task 6）、GalleryPage 读 API + 移除 localStorage 编辑器 + 字段重命名（Task 7）、部署迁移验证（Task 8）。
- **类型一致性**：`Album`/`Photo`/`AlbumInput`/`AlbumListItem` 在前后端字段名与类型一致；repo 接口含 `updateCover`（Task 4 Step 3 末尾已提示补入接口）；`slugifyImageName` 在路由与工具测试中签名一致；`thumbnailPathFor` 接收/返回相对路径，路由与脚本一致用 `path.join` + `replace(/\\/g,'/')` 拼 URL。
- **无占位符**：所有代码步骤均给出完整代码；测试均含断言与预期；命令均含 `Run:` 与 `Expected:`。
- **已知取舍**：相册列表项用 `photosCount` 而非 `photos.length`（列表不返回 photos 明细）；`/albums/:id/cover` 与 `/photos` 路由即使相册不存在也会先建目录，handler 捕获 404 并清理 raw 文件（可接受，不产生孤儿最终文件）。
