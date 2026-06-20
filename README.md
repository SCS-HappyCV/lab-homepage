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

## GitHub Pages 发布

仓库已经包含 `.github/workflows/deploy.yml`。推送到 `main` 后，在仓库设置里打开 `Settings -> Pages`，将 Source 设置为 `GitHub Actions`。

`vite.config.ts` 使用 `base: './'`，适合发布到组织根站点或项目子路径。如果后续需要 Vue Router 的 history 模式，再按仓库名显式配置 `base`。
