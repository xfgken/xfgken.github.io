# xfgken 个人主页（纯静态版）

适合直接丢到 GitHub Pages 的版本：**没有后端，不需要 Python / 数据库**。

- 全部内容内嵌在 `js/content-data.js`（由本地后端的 `data/content.json` 生成）
- “联系我”表单已停用（静态站点没有服务器接收），提交时会提示去 GitHub 交流
- 后台（/admin）不在这个目录里，需要本地跑 `python3 server.py` 使用

## 发布步骤

```bash
cd docs
git init
git add .
git commit -m "个人主页（静态版）"
git branch -M main
git remote add origin https://github.com/xfgken/<仓库名>.git
git push -u origin main
```

然后到 GitHub 仓库 → **Settings → Pages → Source: Deploy from a branch → main / (root)** 保存。

- 若仓库叫 `xfgken.github.io` → 访问 `https://xfgken.github.io/`
- 若仓库叫 `homepage` 之类 → 访问 `https://xfgken.github.io/homepage/`
