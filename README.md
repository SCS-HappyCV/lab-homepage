# Happy Computer Vision Lab Homepage

这是为 GitHub Pages 准备的 Vue 3 + Vite 实验室主页。页面内容目前使用现有组织自述里的实验室信息和照片作为基础，可以继续补充论文、数据集、成员和项目链接。

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

## 成员信息维护

团队成员页地址是 `/#/people`，数据集中维护在：

```text
src/data/students.ts
```

每个成员支持照片、成果、经历、电话、邮箱和毕业去向。真实照片建议放在：

```text
src/assets/students/
```

然后在 `students.ts` 中导入并赋给成员的 `photo` 字段。电话属于个人隐私字段，建议仅在本人明确同意后公开。

## 照片墙维护

照片墙页面地址是 `/#/gallery`，数据集中维护在：

```text
src/data/gallery.ts
```

真实照片建议按年份放在：

```text
src/assets/gallery/2026/graduation-01.jpg
src/assets/gallery/2025/conference-01.jpg
src/assets/gallery/2024/life-01.jpg
```

每条照片数据包含年份、类型、标题、日期、地点、介绍和参与人员。页面默认按 `date` 从新到旧排序，`featured: true` 的照片会进入首页和照片墙精选区。

## GitHub Pages 发布

仓库已经包含 `.github/workflows/deploy.yml`。推送到 `main` 后，在仓库设置里打开 `Settings -> Pages`，将 Source 设置为 `GitHub Actions`。

`vite.config.ts` 使用 `base: './'`，适合发布到组织根站点或项目子路径。如果后续需要 Vue Router 的 history 模式，再按仓库名显式配置 `base`。
