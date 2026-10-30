# 写作库 Studio 6.4 · 网页版

纯静态应用，不依赖任何服务器。文章全文内嵌在 `data/library.js`，改动通过 GitHub API 同步。

## 部署（一次性，约 3 分钟）

1. 新建仓库：https://github.com/new
   - 名字：`zhuku-app`（可改，网址会跟着变）
   - **Visibility 选 Public**（私有仓库不能用 Pages）
   - 不要勾 README / .gitignore / license
2. 把本目录**除 `README.md` 外**的全部文件上传到这个仓库根目录
   - 网页上传：仓库首页 → `Add file` → `Upload files` → 拖进去 → Commit
   - 单次最多 100 个文件，本项目 44 个，可以一次传完
3. 开 Pages：仓库 `Settings` → `Pages`
   - **Source 选 `Deploy from a branch`**（不要选 GitHub Actions，本项目没有构建步骤）
   - Branch 选 `main`，文件夹选 `/ (root)`
   - 点 Save，等 1 分钟左右

部署后的网址：

```
https://<你的用户名>.github.io/zhuku-app/
```

## 更新应用

改了本地的 `index.html` / `js/` / `css/` 之后，重新上传对应文件覆盖即可，Pages 会在 1 分钟内自动重建。

**注意**：`data/library.js` 是 7.6 MB 的种子全文。只有在你确实更新了种子文库时才需要重传它。

## 手机上使用

1. 手机浏览器打开上面的网址
2. 文章会立刻显示（全文内嵌，不需要联网拉取）
3. 要提交改动，先进「设置 → GitHub 同步」，填：
   - 用户名、仓库 `writing-library`、分支 `main`、目录 `写作库同步`
   - Token：fine-grained，只授权 `writing-library`，Contents 读写
4. 点「连接 GitHub」→「检查云端」→「拉取云端」

**Token 只授权 `writing-library`，不要给 `zhuku-app` 写权限。** 这个应用仓库只用来放静态文件。

## 安全说明

**这个仓库是公开的，`data/library.js` 里的 1,448 篇全文任何人下载都能拿到，包括毕设内容。** 这是本方案的前提，已确认接受。

另外：

- Token 存在浏览器的 IndexedDB 里，只在「记住 Token」勾选时落盘
- Token 绝不会进入同步文件，也不会进入这个仓库
- 不要在这个仓库里放任何 Token、密钥、日志

## 目录说明

```
index.html              应用入口
manifest.webmanifest    PWA 清单（可添加到手机桌面）
css/                    9 个样式表
js/                     24 个模块，加载顺序在 index.html 里写死
data/library.js         1,448 篇种子全文（7.6 MB）
data/workspace.json     写作台工程（思维导图等）
data/plugins.json       插件清单
data/settings.json      默认设置
data/system.json        系统信息
icons/                  应用图标
```

`tools/` 目录（mock-github.mjs、serve.mjs）是本地测试工具，**没有**包含在本发布副本里，不需要上传。
