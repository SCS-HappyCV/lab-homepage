# Student Photos

把真实成员照片放在这个目录，推荐按届别再分子目录：

```text
src/assets/students/2026/name.jpg
src/assets/students/2025/name.jpg
src/assets/students/2024/name.jpg
```

在 `src/data/students.ts` 中导入照片后赋给 `photo` 字段即可。未填写照片时，成员页会自动显示姓名缩写头像。
