# Happy Computer Vision Lab Homepage

这是为 GitHub Pages 准备的 Vue 3 + Vite 实验室主页。页面包括首页、团队成员页和照片墙页，适合长期维护实验室介绍、学生档案、成果入口和团队活动照片。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

构建产物会输出到 `docs/`。如果不使用 GitHub Actions，也可以在 GitHub 仓库的 `Settings -> Pages` 中选择 `Deploy from a branch`，然后把发布目录设置为 `main / docs`。

## 成员信息维护

团队成员页地址是 `/#/people`。成员数据已经按年份拆分：

```text
src/data/students/
  index.ts          # 自动汇总所有年份，不需要日常修改
  types.ts          # 成员字段类型
  helpers.ts        # 成员照片路径工具
  years/
    2025.ts
    2024.ts
    2023.ts
```

### 新增或修改某一年成员

直接编辑对应年份文件，例如：

```text
src/data/students/years/2025.ts
```

新增成员时，在默认导出的数组里加一项：

```ts
{
  id: '2025-zhang-san',
  name: '张三',
  cohort: '2025',
  degree: '硕士研究生',
  role: '在读学生',
  status: 'current',
  nativePlace: '湖南长沙',
  wechat: 'happycv_lab',
  photo: studentPhoto('2025', 'zhang-san.jpg'),
  research: ['计算机视觉', '多模态学习'],
  email: 'zhangsan@example.com',
  phone: '13800000000',
  bio: '个人简介。',
  achievements: ['代表性成果 1', '代表性成果 2'],
  experiences: ['2021-2025 本科阶段学习', '2025-至今 实验室硕士阶段学习'],
}
```

毕业生把 `status` 改为 `alumni`，并增加 `destination`：

```ts
status: 'alumni',
destination: '某科技企业算法工程师',
```

### 新增一个年份

例如新增 2026 届成员：

1. 新建文件：

```text
src/data/students/years/2026.ts
```

2. 写入基础结构：

```ts
import { studentPhoto } from '../helpers'
import type { StudentProfile } from '../types'

export default [
  {
    id: '2026-zhang-san',
    name: '张三',
    cohort: '2026',
    degree: '硕士研究生',
    role: '在读学生',
    status: 'current',
    photo: studentPhoto('2026', 'zhang-san.jpg'),
    research: ['计算机视觉'],
    email: 'zhangsan@example.com',
    bio: '个人简介。',
    achievements: [],
    experiences: [],
  },
] satisfies StudentProfile[]
```

`src/data/students/index.ts` 会自动读取 `years/*.ts`，不需要手动注册。成员页里的年份筛选也会自动出现。

### 成员照片放哪里

成员照片统一放在 `public/students/` 下，建议按年份分目录，并使用英文或拼音文件名：

```text
public/students/2026/zhang-san.jpg
public/students/2025/yuan-tong.jpg
public/students/2023/wu-zhiming.jpg
```

数据里这样写：

```ts
photo: studentPhoto('2025', 'yuan-tong.jpg')
```

不需要逐张 `import` 图片。`studentPhoto(...)` 会自动根据 GitHub Pages 的部署路径生成正确 URL。未填写照片时，成员页会自动显示姓名缩写头像。

电话和微信属于个人隐私字段，建议仅在本人明确同意后公开。

## 照片墙维护

照片墙页地址是 `/#/gallery`。照片数据已经按年份拆分：

```text
src/data/gallery/
  index.ts          # 自动汇总所有年份，不需要日常修改
  types.ts          # 照片字段类型
  helpers.ts        # 照片 public 路径工具
  years/
    2026.ts
    2025.ts
```

### 新增或修改某一年照片

直接编辑对应年份文件，例如：

```text
src/data/gallery/years/2026.ts
```

新增照片时，在默认导出的数组里加一项：

```ts
{
  id: '2026-graduation-09',
  year: '2026',
  category: '毕业照',
  title: '2026 届毕业合影',
  date: '2026-06',
  location: '湘潭大学信息科技大楼',
  image: labPhoto('2026', 'DSC_1900.JPG'),
  featured: true,
}
```

字段说明：

```text
id        唯一标识，不能和其他照片重复
year      年份，会决定年度照片墙分组
category  类型，例如 毕业照 / 生活照 / 组会活动 / 比赛参会
title     照片标题
date      日期，推荐 YYYY-MM 或 YYYY-MM-DD
location  地点
image     图片路径
featured  可选，true 表示可进入首页和照片墙顶部展示
```

照片墙年份、类型筛选和年度分组都会根据数据自动生成。新增一个 `category` 后，页面上方的类型筛选按钮也会自动出现。

### 新增一个年份

例如新增 2027 年照片：

1. 把照片放到：

```text
public/gallery/lab/2027/
```

2. 新建文件：

```text
src/data/gallery/years/2027.ts
```

3. 写入基础结构：

```ts
import { labPhoto } from '../helpers'
import type { GalleryItem } from '../types'

export default [
  {
    id: '2027-graduation-01',
    year: '2027',
    category: '毕业照',
    title: '2027 届毕业合影',
    date: '2027-06',
    location: '湘潭大学',
    image: labPhoto('2027', 'graduation-01.jpg'),
    featured: true,
  },
] satisfies GalleryItem[]
```

`src/data/gallery/index.ts` 会自动读取 `years/*.ts`，不需要手动注册。照片墙会按 `year` 自动生成年度区块，年度区块中的照片会根据图片真实长宽比自动排成 justified mosaic，每一行会尽量铺满容器宽度。

### 照片放哪里

照片墙图片统一放在 `public/gallery/` 下。当前项目主要用：

```text
public/gallery/lab/2026/DSC_1795.JPG
public/gallery/lab/2026/DSC_1900.JPG
public/gallery/lab/lab-life.jpg
```

年份目录里的照片这样写：

```ts
image: labPhoto('2026', 'DSC_1795.JPG')
```

通用照片直接放在 `public/gallery/lab/` 下时这样写：

```ts
image: labPhoto('lab-life.jpg')
```

同样不需要逐张 `import` 图片。

## GitHub Pages 发布

仓库已经包含 `.github/workflows/deploy.yml`。推送到 `main` 后，在仓库设置里打开 `Settings -> Pages`，推荐将 Source 设置为 `GitHub Actions`。

`vite.config.ts` 使用 `base: './'`，适合发布到组织根站点或项目子路径。当前路由使用 hash 模式，刷新 `/#/people`、`/#/gallery` 这类页面不会出现 404。
