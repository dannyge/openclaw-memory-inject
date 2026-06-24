# @dannyge/openclaw-memory-inject

[![CI](https://github.com/dannyge/openclaw-memory-inject/actions/workflows/ci.yml/badge.svg)](https://github.com/dannyge/openclaw-memory-inject/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@dannyge/openclaw-memory-inject)](https://www.npmjs.com/package/@dannyge/openclaw-memory-inject)
[![license](https://img.shields.io/npm/l/@dannyge/openclaw-memory-inject)](./LICENSE)
[![node](https://img.shields.io/node/v/@dannyge/openclaw-memory-inject)](https://www.npmjs.com/package/@dannyge/openclaw-memory-inject)

> **[English](README.md)** | **[中文](README.zh.md)**

新会话自动注入最近的 memory 文件，让 agent 在每次新对话中都能延续上下文。

## 问题背景

OpenClaw 的 `startupContext` 机制只在**裸 `/new` 或 `/reset`**（空消息时）触发。对于 Discord 新开 thread、API 创建 session 等场景，`startupContext` 不会被注入，agent 启动时完全不知道之前发生过什么。

这在多 agent 协作和长期运维中很致命：每次新开一个 thread，agent 就"失忆"了，需要反复解释背景信息。

类似的"memory 在 session 间不连续"问题在 OpenClaw 社区被多次报告过：

- [#11618](https://github.com/openclaw/openclaw/issues/11618) — "Hook to inject relevant memory on session start"（已 close/completed）。这个 issue 最终促使 OpenClaw 在 2026.6 引入 `session_start` + `before_prompt_build` 两个 hook，本插件正是基于这个能力构建的。
- [#32905](https://github.com/openclaw/openclaw/issues/32905) — "session-memory hook saves context but never recalls"（已 close/not_planned）。描述 `session-memory` hook 只能保存、无法在新 session 自动恢复的问题，这正是本插件要直接补上的能力缺口。

## 解决方案

`memory-inject` 通过两个 hook 解决问题：

1. **`session_start`** — 标记"这是一个新 session，需要注入 memory"
2. **`before_prompt_build`** — 在构建 prompt 之前，将最近的 memory 文件内容注入到上下文里

每个 session 至多注入一次。注入时机是 `before_prompt_build`，这意味着 memory 内容会出现在 system prompt 的起始位置，agent 在生成回复之前就能看到。

## 特性

- **多 agent 自动适配** — 通过 `ctx.workspaceDir` 自动定位每个 agent 的 memory 目录，无需为每个 agent 单独配置
- **fail-open 设计** — 配置错误、文件缺失、磁盘 IO 异常都不会阻塞 agent 正常回复
- **零运行时依赖** — 纯 Node.js 标准库实现，不引入任何第三方包
- **token 预算截断** — 可按字符数估算 token，超出预算自动丢弃最旧的文件
- **mtime 排序** — 按文件修改时间倒序，最新修改的文件优先注入
- **正则匹配文件名** — 默认匹配 `YYYY-MM-DD.md` 或 `YYYY-MM-DD-<slug>.md`
- **可配置** — 8 个配置项，覆盖日常和高级场景
- **MIT 许可证**

## 安装

要求 **Node.js 22.19+**（推荐 Node 24）和 **OpenClaw 2026.6+**（引入
`session_start` 和 `before_prompt_build` hook 的版本）。不支持 Node 20 —— 它已 EOL，
且 OpenClaw 本身就要求 22.19+。

### 方式一：从 npm 安装（推荐）

```bash
openclaw plugins install @dannyge/openclaw-memory-inject
```

通过 `openclaw plugins update memory-inject` 更新。

### 方式二：从 GitHub 安装

```bash
openclaw plugins install dannyge/openclaw-memory-inject
```

### 方式三：开发模式（本地链接）

```bash
git clone https://github.com/dannyge/openclaw-memory-inject.git
cd openclaw-memory-inject
npm install && npm run build
openclaw plugins install --link /path/to/openclaw-memory-inject
```

安装后需要重启 gateway：

```bash
openclaw gateway restart
```

## 配置

在 `openclaw.plugin.json` 的 `memory-inject` 段中配置。所有配置项都有合理的默认值，不配置即可使用。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 总开关。设为 `false` 时插件加载但不执行注入 |
| `memoryDir` | string | `"memory"` | 相对于 agent workspaceDir 的 memory 目录 |
| `daysToLoad` | number | `2` | 加载最近几天的 memory 文件（1-365） |
| `maxFiles` | number | `4` | 每个 session 最多注入的文件数（1-100） |
| `maxTokens` | number | `4000` | token 预算（字符数 / 4 估算），超出时丢弃最旧文件 |
| `filenamePattern` | string | `"^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$"` | 文件名匹配正则 |
| `excludeAgents` | string[] | `[]` | 排除的 agent id 列表 |
| `contextLabel` | string | `"Recent memory (auto-injected by memory-inject plugin)"` | 注入内容前的标题行，设为空字符串可省略 |

### 完整 JSON 配置示例

```json
{
  "plugins": {
    "memory-inject": {
      "enabled": true,
      "memoryDir": "memory",
      "daysToLoad": 3,
      "maxFiles": 5,
      "maxTokens": 8000,
      "filenamePattern": "^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$",
      "excludeAgents": [],
      "contextLabel": "Recent memory (auto-injected by memory-inject plugin)"
    }
  }
}
```

## 使用示例

### 基础用法

安装后无需额外配置。插件会自动扫描 `~/.openclaw/agents/<agentId>/workspace/memory/` 下的文件，向每个新 session 注入最近 2 天、最多 4 个、不超过 4000 token 的 memory 内容。

memory 文件示例：

```
~/.openclaw/agents/ops/workspace/memory/
├── 2026-06-23.md          # 今天的
├── 2026-06-22.md          # 昨天的
├── 2026-06-21-deploy.md   # 前天的，带 slug
└── 2026-06-20.md          # 4 天前，超出 daysToLoad 范围，不会被加载
```

### 进阶配置

**一个 agent 需要更长的上下文**：

```json
{
  "plugins": {
    "memory-inject": {
      "daysToLoad": 7,
      "maxFiles": 10,
      "maxTokens": 12000
    }
  }
}
```

**排除敏感 agent**：

```json
{
  "plugins": {
    "memory-inject": {
      "excludeAgents": ["finance", "hr"]
    }
  }
}
```

**自定义 memory 目录**：

```json
{
  "plugins": {
    "memory-inject": {
      "memoryDir": "notes"
    }
  }
}
```

此时会扫描 `~/.openclaw/agents/<agentId>/workspace/notes/`。

**匹配特定文件名格式**：

```json
{
  "plugins": {
    "memory-inject": {
      "filenamePattern": "^(daily|weekly)-\\d{4}-\\d{2}-\\d{2}\\.md$"
    }
  }
}
```

## memory 文件匹配规则

插件按以下步骤筛选和排序 memory 文件：

1. **扫描目录** — 读取 `~/.openclaw/agents/<agentId>/workspace/<memoryDir>/`
2. **正则过滤** — 只保留文件名匹配 `filenamePattern` 的文件（默认 `^\d{4}-\d{2}-\d{2}(-.+)?\.md$`，即 `YYYY-MM-DD.md` 或 `YYYY-MM-DD-<slug>.md`）
3. **时间窗口** — 只保留 `mtime` 在 `daysToLoad` 天内的文件
4. **按 mtime 倒序** — 最新修改的排在前面
5. **数量截断** — 至多保留 `maxFiles` 个文件
6. **token 截断** — 累积字符数超过 `maxTokens * 4` 时，丢弃剩余文件（最旧优先丢弃）

文件内容以纯文本形式读取，编码为 UTF-8。单个文件读取上限为 512KB，超出部分会被截断。

## 多 agent 行为

插件通过 `ctx.workspaceDir` 自动适配每个 agent 的 memory 目录。例如：

- agent `ops` → 扫描 `~/.openclaw/agents/ops/workspace/memory/`
- agent `kbadmin` → 扫描 `~/.openclaw/agents/kbadmin/workspace/memory/`

每个 agent 的 session 只注入自己的 memory 文件，互不干扰。

使用 `excludeAgents` 排除不需要注入的 agent：

```json
{
  "plugins": {
    "memory-inject": {
      "excludeAgents": ["kbadmin", "test-bot"]
    }
  }
}
```

排除的 agent 在 `session_start` 和 `before_prompt_build` 两个阶段都会被跳过，不会产生任何开销。

## 性能 / token 开销

- **每个 session 至多注入 `maxFiles` 个文件** — 默认 4 个
- **注入只发生一次** — 第一个 `before_prompt_build` 触发后，后续同一 session 的构建不再重复注入
- **文件读取为同步操作** — memory 文件通常很小，总读取量受 `maxTokens * 4` 字符上限约束
- **注入内容作为 `prependContext`** — 出现在 prompt 最前面，不会改变消息历史

对于典型的每天 2-3KB 的 memory 文件，4 个文件约消耗 800-1500 token，对 128K 上下文窗口基本无感。

## 安装后验证

端到端验证插件是否在工作的最可靠方法，是去 gateway 日志里找 `[memory-inject]` 注入消息。插件每次成功注入都只会输出一行。

### 1. 准备 memory 文件

插件扫描 `<workspaceDir>/<memoryDir>/`，文件名要匹配 `filenamePattern`（默认 `^\d{4}-\d{2}-\d{2}(-.+)?\.md$`）。以 `ops` agent 为例：

```bash
cd ~/.openclaw/agents/ops/workspace/memory
NOW=$(date +%Y-%m-%d)
YDAY=$(date -v-1d +%Y-%m-%d)
echo "# 测试 memory" > ${NOW}.md
echo "# 昨天的笔记" > ${YDAY}.md
```

`memory/` 目录是**按 agent 划分**的（每个 agent 都有自己的目录：`~/.openclaw/agents/<agentId>/workspace/memory/`）。选一个容易触发新会话的 agent —— 一般是你最常聊的那个。

### 2. 触发一个新会话

"新会话"指的是 gateway 第一次见到的 session。常用触发方式：

- 在该 agent 从未回复过的 Discord 频道发消息（全新话题帖对每个 agent 都有效）
- 在该 agent 的主会话中执行 `/new` 或 `/reset`
- 重启 gateway（缓存重置，所有活跃会话都被当作新会话）

Cron 任务也是合法触发方式 —— 它们创建独立 session。

### 3. 查看 gateway 日志

跟踪 gateway 日志，搜索 `[memory-inject]`：

```bash
# macOS
tail -F ~/Library/Logs/openclaw/gateway.log | grep --line-buffered memory-inject

# 或一次性查询
grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log | tail -5
```

**成功**的输出长这样：

```
[plugins] [memory-inject] injected 1 memory file(s) (~399 tokens) into agent:ops:discord:channel:1478705016792551466
```

看到这行说明插件正常工作。如果没看到，参考下面的 [日志格式说明](#日志格式说明) 理解各种日志行的含义。

### 多 agent 验证

要确认插件对你**所有** agent 都生效，对每个 agent 重复步骤 2。最快的方式是给每个 agent 的 Discord 频道（或主话题）各发一条消息，然后查日志：

```bash
grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log \
  | awk -F'into ' '{print $2}' \
  | sort -u
```

预期：每个 agent 一行，各有独立的 `agent:<id>:...` sessionKey。

### 确认当前生效的配置

想确认插件实际加载的配置：

```bash
openclaw config get plugins.entries.memory-inject.config
```

默认值：

```json
{
  "enabled": true,
  "memoryDir": "memory",
  "daysToLoad": 2,
  "maxFiles": 4,
  "maxTokens": 4000,
  "filenamePattern": "^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$",
  "excludeAgents": [],
  "contextLabel": "Recent memory (auto-injected by memory-inject plugin)"
}
```

## 日志格式说明

插件通过 `api.logger` 输出日志（OpenClaw 会加 `[plugins]` 前缀后写入 gateway 日志）。所有日志行都带字面量字符串 `[memory-inject]`，方便 grep。

| 级别 | 格式 | 何时出现 |
|------|------|----------|
| `info` | `[memory-inject] injected N memory file(s) (~T tokens) into <sessionKey>` | 注入成功，每个 session 恰好一次 |
| `warn` | `[memory-inject] session_start without sessionKey or sessionId; skipping` | `session_start` 触发时没有 session 标识（极少发生 —— 健康的 gateway 不应该出现） |
| `error` | `[memory-inject] failed to load memory: <error message>` | 磁盘读取失败（权限错误、文件消失等）—— 失败开放，session 继续，不影响后续对话 |

### 成功日志详解

```
[plugins] [memory-inject] injected 1 memory file(s) (~399 tokens) into agent:kbadmin:discord:channel:1478685251898445906
└──────┘ └──────────────┘ └────── ┘         └─────┘  └─────────────┘ └──────────────────────┘
   │            │             │                │             │                    │
 OpenClaw   插件 tag    文件数        预估 token 数        sessionKey —— 唯一标识
 日志前缀              of files      = totalChars / 4      本次注入的 session
```

- **文件数**：经过 `maxFiles` 和 `maxTokens` 过滤后实际加载的文件数。可能小于 `daysToLoad` 允许的数量。
- **预估 token 数**：字符数 / 4，保守估计。实际 token 数可能偏差 ±30%（CJK 压缩更好，代码更差）。
- **sessionKey**：OpenClaw session 标识。Discord 场景下格式为 `agent:<id>:discord:channel:<channelId>`；cron 任务下为 `agent:<id>:cron:<jobId>:run:<runId>`。用它能关联到 session transcript。

### 启用 debug 级日志

插件只在 `info` / `warn` / `error` 级别输出。想看 OpenClaw 加载插件的诊断信息（包含本插件），提高 gateway 日志级别：

```bash
openclaw config set diagnostics.logLevel debug
```

然后重启 gateway。启动时看包含 `memory-inject` 的日志，能确认插件的 hook 已经注册。验证完成后恢复原级别。

## 故障排查

### 没有找到 memory 文件

1. **先看日志里的成功行。** 跑
   `grep "\[memory-inject\]" ~/Library/Logs/openclaw/gateway.log`。如果完全没有，说明 hook 没触发 —— 跳到下一节。
2. **检查文件命名是否符合 `filenamePattern`。** 默认要求 `YYYY-MM-DD.md` 或 `YYYY-MM-DD-slug.md`。像 `notes.md` 或 `2026-06-23.txt` 不会被匹配。详见 [memory 文件匹配规则](#memory-文件匹配规则)。
3. **确认文件 mtime 在时间窗内。** `daysToLoad=2` 表示过去 48 小时内的文件。3 天前的文件即使名字带今天的日期也会被跳过。
4. **确认 `enabled` 是 `true`**：`openclaw config get plugins.entries.memory-inject.config`。
5. **检查 `excludeAgents` 列表。** 如果测试的 agent 在里面，插件会静默跳过（这是有意的 —— 不会对被排除的 agent 给出警告）。

### hook 没有触发

1. **检查 OpenClaw 版本**：`openclaw --version`。需要 2026.6+，`session_start` 和 `before_prompt_build` hook 是在这个版本加入的。
2. **确认插件已加载**：`openclaw plugins list | grep memory-inject` 应该显示 `enabled` 状态。如果行不存在，安装失败 —— 跑 `openclaw plugins inspect memory-inject` 看详情。
3. **确认安装后重启过 gateway。** Hook 只在启动时注册。运行中安装不重启的话，插件会显示 enabled 但 hook 不触发。
4. **换个 session 触发方式。** 如果 `/new` 没触发 hook，试试全新的 Discord 话题帖 —— 有时主会话被恢复得太久，`session_start` 很久没触发了。插件专门为新会话设计，对"恢复会话"无效。

### `injected 0 memory file(s)` 是正常输出

如果日志显示 `injected 0 memory file(s)`，说明 hook 触发正常 —— 只是没找到匹配文件。这不是错误。可能原因：

- workspace 下的 `memory/` 目录不存在或为空
- 所有文件都不匹配 `filenamePattern`
- 所有文件 mtime 都超出 `daysToLoad` 时间窗

想让它注入，参考上面的 "没有找到 memory 文件" 步骤。

### 日志中出现 error 行

看到 `[memory-inject] failed to load memory: ...`：

- **Permission denied**：gateway 进程没权限读 memory 文件。检查文件权限，确认 workspace 目录归运行 gateway 的用户所有。
- **File too large**：文件超过 `maxTokens * 4` 字符。要么精简文件内容，要么调高 `maxTokens`，要么调低 `maxFiles` 让它被跳过。
- **EISDIR / Not a file**：`memory/` 路径指向了文件而不是目录。检查 `memoryDir` 配置。

插件在所有错误上**失败开放** —— 加载失败不会阻塞 agent 的 turn，session 会继续（没有注入）。

## 开发

想参与贡献？完整开发环境搭建见 **[CONTRIBUTING.md](CONTRIBUTING.md)**
（构建、测试、类型检查命令、代码规范、发布流程）。

### 项目结构

```
src/
├── index.ts            # 插件入口，注册 hook
├── inject.ts           # hook 逻辑：session_start + before_prompt_build
├── memory-loader.ts    # 扫描、筛选、读取 memory 文件
├── config.ts           # 配置解析和校验
├── session-cache.ts    # session 缓存，保证每个 session 只注入一次
└── types.ts            # TypeScript 类型定义
test/
└── *.test.ts           # 单元测试
```

## 许可证

MIT

## 作者 / 反馈

- 作者：[dannyge](https://github.com/dannyge)
- 问题反馈：[https://github.com/dannyge/openclaw-memory-inject/issues](https://github.com/dannyge/openclaw-memory-inject/issues)
- 贡献指南：**[CONTRIBUTING.md](CONTRIBUTING.md)**