# Gallery Photos

把实验室照片按年份放在这里，推荐结构：

```text
src/assets/gallery/2026/graduation-01.jpg
src/assets/gallery/2026/life-01.jpg
src/assets/gallery/2025/conference-01.jpg
src/assets/gallery/2025/group-meeting-01.jpg
```

然后在 `src/data/gallery.ts` 中导入图片并添加一条记录。页面会按 `date` 从新到旧排序，`featured: true` 会进入精选照片区域。
