# dsh-reasoning-levels

> 在 DeepSeek Harness（DSH）的「设置 → 插件 → 思考强度」里，按模型勾选可用的思考档位；写入当前 profile 的 `cordis.patch.yml` 并即时生效。

[![DSH](https://img.shields.io/badge/DSH-plugin-4b8bf5)](https://github.com/deepseek-ai/deepseek-harness)
[![test](https://github.com/bbpeople/dsh-reasoning-levels/actions/workflows/test.yml/badge.svg)](https://github.com/bbpeople/dsh-reasoning-levels/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

---

## 为什么需要它

DSH 的模型选择器会读取每个模型的 `reasoningEfforts` 声明来决定展示哪些思考档位（关闭 / 极低 / 低 / 中 / 高 / 超高 / 最高）。手写 `cordis.patch.yml` 里的这段嵌套 YAML 既繁琐又容易写错：

```yaml
- id: llm-pi-ai
  config:
    providers:
      some-gateway:
        models:
          - id: some-model
            reasoningEfforts:
              off: null
              high: high
              max: max
```

本插件把这件事变成**勾选框**。

## 功能

- **按模型勾选档位** — 每个模型一行，勾选它支持的思考强度档位
- **三种模式** — `按档位` / `非推理模型（false）` / `跟随内置目录（不写字段）`
- **按供应商折叠模型列表** — 点击供应商标题折叠或展开，折叠时仍显示 `N 个模型 · 已单独配置 M`
- **全部展开 / 全部折叠** — 一键操作所有供应商
- **记住折叠状态** — 存于浏览器 `localStorage`，刷新后保持
- **键盘可达** — 标题支持 `Enter` / 空格切换，带 `aria-expanded`
- **即时生效** — 保存后经 `configEditor` 原子写入，无需重启
- **安全写入** — 走官方 `configEditor.edit()` 通道：写前校验完整候选值、保留其余 YAML 注释与 `!!js` 表达式、与 HMR 串行、失败自动回滚

## 界面

```
思考强度                                          [全部展开] [全部折叠] [刷新]
勾选每个模型可用的思考档位，写入当前 profile 的 cordis.patch.yml 并立即生效；
点击供应商名称可折叠或展开其模型列表，折叠状态会记住。
配置文件：C:/Users/你/.dsh/profiles/desktop/cordis.patch.yml

▸ Xxx                     xxx · 2 个模型 · 已单独配置 1
▾ Xxx                     xxx · 3 个模型
    ┌──────────────────────────────────────────────────────────┐
    │ model-name   provider/model-id        [按档位 ▾]          │
    │ ☑关闭 ☐极低 ☐低 ☐中 ☑高 ☐超高 ☑最高                      │
    └──────────────────────────────────────────────────────────┘
```

## 安装

### 方式一：DSH「添加插件」对话框（推荐）

打开 **设置 → 插件 → 添加插件**，在输入框填任一来源后点「安装」：

| 安装源 | 填什么 |
|---|---|
| npm 官方源 | `dsh-reasoning-levels` |
| GitHub 仓库 | `https://github.com/bbpeople/dsh-reasoning-levels` |

安装器会把包写入当前 profile 的依赖、按包内 `cordis.patch.yml` 登记插件条目并自动启用，无需手工编辑任何配置。包无构建步骤（`lib/` 与 `client.js` 均为源码直发），不会触发构建脚本授权。

### 方式二：本地开发（junction 链接）

开发本机代码时用：克隆仓库后链接到 profile 的共享解析目录，再在 profile 补丁里登记。

```powershell
git clone https://github.com/bbpeople/dsh-reasoning-levels.git "$HOME\.dsh\plugins\dsh-reasoning-levels"

# 建 junction（Windows，无需管理员权限）
New-Item -ItemType Junction `
  -Path "$HOME\.dsh\profiles\node_modules\dsh-reasoning-levels" `
  -Target "$HOME\.dsh\plugins\dsh-reasoning-levels"
```

> `profiles/node_modules` 是各 profile 共享的解析目录；服务端 import 与浏览器端 `client.js` 解析都要求**包名形式**，所以必须走 junction，不能用绝对路径。

然后在 `~/.dsh/profiles/<你的 profile>/cordis.patch.yml` 数组里追加（内容与包内 `cordis.patch.yml` 相同）：

```yaml
- insert:
    - id: reasoning-levels
      name: dsh-reasoning-levels
      inject:
        - webServer
        - configEditor
```

重启 DSH（或新开会话）。打开 **设置 → 插件 → 思考强度**。

## 工作原理

插件是标准的 DSH 双半结构：

| 半 | 文件 | 职责 |
|---|---|---|
| 宿主半 | [`lib/index.js`](./lib/index.js) | 通过 `ctx.get('configEditor')` 读写当前 profile 的配置；用 `webServer.register({ kind: 'prefix', path: '/rlevels' })` 暴露 JSON 端点 |
| 客户端半 | [`lib/client.js`](./lib/client.js) | 用 `ctx.get('slots')` 注册到 `settings.plugins.tab`；纯 `React.createElement` 渲染，无构建步骤 |

HTTP 端点：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/rlevels/list` | 返回 `levels` / `entryFound` / `documentPath` / `providers[]` 全量快照 |
| `POST` | `/rlevels/set` | 体为 `{ provider, model, mode, levels[] }`，写入并返回最新快照 |

写入遵循宿主规则：`reasoningEfforts` 至少要有**一个高于 `off` 的档位**，否则应写 `false` 或省略字段——插件在前后端都做了这道校验。

档位集合与升序对齐宿主的 `THINKING_LEVELS`：`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`。`wire` 值默认等于档位名（`off` 为 `null`），已存在的自定义 `wire` 值会被保留。

## 开发

### 测试

折叠逻辑有一份无浏览器依赖的回归测试——用极简 React 垫片加载真实插件代码并断言行为：

```powershell
node test/collapse.test.mjs
```

覆盖 22 项断言：默认折叠、点击展开、`▸`/`▾` 指示、`aria-expanded` 同步、摘要计数、全部展开/折叠、`localStorage` 持久化、Enter 键可达性。

### 客户端代码如何生效

DSH 的客户端模块服务**每次请求都从磁盘读取** `client.js`，并按文件的 `mtime`/`ctime`/`size` 计算修订号（`rev`）：

```js
// @deepseek-ai/dsh-client-modules
bundle: readFileSync(clientPath)
function artifactRevision(baseline) { /* hash(mtimeMs, ctimeMs, size) */ }
```

所以改完 `lib/client.js` **不需要重新构建**，刷新页面即可（客户端会按新 `rev` 重新加载模块）。

## 兼容性

- 要求 DSH `0.2.0-rc.1` 及以上（在 `0.2.0-rc.2` 上实测通过）
- 依赖服务：`configEditor`、`webServer`、`slots`
- 仅适用于配置了 `llm-pi-ai` 条目（多供应商模型）的 profile

## 许可证

[MIT](./LICENSE)
