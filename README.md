# 黑蚊子的门 · 小镇博客

基于 Astro、React 与 Babylon.js 的静态小镇博客。文章数据在构建时生成建筑：普通文章对应一栋建筑，同系列文章对应同一栋建筑的不同楼层。

## 本地运行

```bash
npm install
npm run dev
```

完整验证与静态构建：

```bash
npm run verify
```

构建产物位于 `dist/`，可以直接部署到支持静态站点的托管平台。

框架通用配置、资源目录、文章字段与部署说明见 [`docs/USAGE.md`](docs/USAGE.md)。

## 修改个人资料

编辑 `src/config/site.ts`：

- 站点名称、描述、网址；
- 昵称、头像、简介；
- Email、GitHub、Steam 等个人链接；
- 友链及友链头像。

个人和友链图片位于 `public/assets/profile/`、`public/assets/friends/`。

## 添加文章

在 `src/content/posts/` 新增 Markdown 文件。核心 frontmatter：

```yaml
---
townId: "不会改变且全站唯一的文章 ID"
title: "文章标题"
description: "摘要"
date: "2026-08-29T12:00:00+08:00"
category: "分类"
tags: ["标签"]
cover: "/assets/posts/example/cover.png" # 可选
coverAlt: "封面说明"                 # 可选，仅用于无障碍图片替代文本
draft: false
---
```

同系列文章额外填写相同的 `series`，并使用从 `0` 开始且不重复的 `seriesIndex`。构建会拒绝重复 `townId`、重复系列顺序或不完整字段。`draft: true` 和构建日期之后发布的文章不会出现在公开站点。
