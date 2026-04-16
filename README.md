# TAPD MCP Server

用于在 Claude Code 中查询 TAPD Bug 并分析视频附件的 MCP Server。

## 功能

| 工具 | 说明 |
|------|------|
| `tapd-auth` | 浏览器登录 TAPD |
| `tapd-logout` | 退出登录 |
| `list_workspaces` | 列出所有项目空间 |
| `get_bugs_list` | 获取 Bug 列表（支持分页、排序） |
| `get_bug_detail` | 获取 Bug 详情（描述、评论、附件等） |
| `get_bug_workflow` | 获取 Bug 工作流配置（状态流转） |
| `analyze_bug_video` | 下载 Bug 视频附件，提取关键帧进行可视化分析 |

## 安装

```bash
# 1. 添加插件市场（仅首次）
claude plugin marketplace add tianmuji/camscanner-plugins

# 2. 安装插件
claude plugin install tapd@camscanner-plugins
```

安装后重启 Claude Code 即可使用。插件会自动注册 MCP Server 和 `/tapd` Skill。

### 前提条件

- Node.js >= 18
- Playwright Chromium（用于浏览器登录）：`npx playwright install chromium`

## 认证

首次使用时调用 `tapd-auth` 工具，会打开浏览器进行手动登录。

- 浏览器数据持久化在 `~/.tapd-mcp/browser-data/`，保存的密码下次自动填充
- 认证信息保存在 `~/.tapd-mcp/credentials.json`，有效期 7 天

## 视频分析

`analyze_bug_video` 工具可自动下载 Bug 中的视频附件（支持附件和描述中嵌入的视频），通过 ffmpeg 提取关键帧并返回图片供 AI 分析。

- 默认提取 8 帧，最多 15 帧
- 根据视频时长智能计算帧间隔
- 支持 mp4、mov、avi、webm 等常见格式

## 开发者指南

### 发布新版本

```bash
# 1. 修改代码并构建
npm run build

# 2. 更新版本号并发布到 npm
npm version patch   # bug fix: 1.0.0 → 1.0.1
npm version minor   # 新功能: 1.0.0 → 1.1.0
npm version major   # 破坏性变更: 1.0.0 → 2.0.0

npm publish --registry https://registry.npmjs.org/ --access public

# 3. 推送 tag 到远端
git push && git push --tags
```

用户下次启动 Claude Code 时，`npx -y @camscanner/tapd-mcp-server@latest` 会自动拉取新版本。
