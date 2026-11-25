# ai-mock

带管理界面的第三方 API Mock 工具：多项目、多测试环境、条件响应分支、JS 脚本返回体，配置持久化到 **SQLite / MySQL / SQL Server**。

## 功能

- **多项目 / 多环境**：项目通过 slug 暴露 Mock 地址，每个项目可建任意个环境（dev/test…），环境支持变量（脚本中 `env.KEY` 读取）
- **API 管理**：增删改查，路径支持 `:param` 与 `*` 通配，按顺序 + 具体度匹配
- **条件响应分支**：一个 API 可配多条分支，按顺序求值，支持三种条件：
  - `始终` —— 无条件命中
  - `规则` —— 可视化条件构建器（query/header/body/路径参数/环境变量 × 14 种操作符，嵌套 AND/OR/NOT）
  - `JS 表达式` —— 如 `req.query.status === 'active' && req.body.amount > 100`
  - 全部不命中时走 **★ 默认兜底分支**；UI 以纵向流程图展示「命中/不匹配 ↓」关系，支持拖拽排序、启停
- **返回体脚本**：Monaco 编辑器写 JS 脚本，沙箱异步执行（2s 超时），可用 `req` / `env` / `faker` / `helpers`，支持 `setStatus` / `setHeader` / `delay` 副作用
- **测试面板**：编辑器内填样例请求干跑匹配管线，即时看到命中分支、状态码、响应体、警告
- **请求日志**：每个项目的 Mock 访问记录（命中原因、耗时、分支），支持按 方法/路径/命中/状态码/分支/时间范围 过滤查询
- **MCP 服务**：智能体框架（Claude Code、Agent SDK 等）可通过 MCP 直接管理 mock 配置、干跑匹配、查询日志（HTTP + stdio 双模式）
- **Token 鉴权**：配置 token 后 `/api` 与 `/mcp` 需要 Bearer 鉴权（可选收紧 `/mock`）
- **数据库可切换**：SQLite（默认）/ MySQL / SQL Server 2016+（含 2021），界面里测试连接、保存即迁移

## 快速开始

```bash
npm install
npm run dev
```

- 管理界面（开发）：http://localhost:5173 （Vite 代理 `/api`、`/mock` 到后端）
- 后端 / Mock 服务：http://127.0.0.1:3210 （端口用 `PORT` 环境变量修改）

生产方式（单端口，后端直接托管已构建的前端）：

```bash
npm run build        # 构建 shared + web（server 以 tsx 直接运行）
npm start            # http://127.0.0.1:3210
```

## Mock URL 格式

```
http://{host}:{port}/mock/{projectSlug}/{envSlug}{apiPath}
```

示例：

```
GET  http://127.0.0.1:3210/mock/orders/dev/api/users/42?status=active
POST http://127.0.0.1:3210/mock/orders/test/api/orders
```

- project / env 均可用 slug 或 id
- 响应带调试头：`X-Ai-Mock-Api`、`X-Ai-Mock-Branch`、`X-Ai-Mock-Branch-Name`；条件表达式出错时附 `X-Ai-Mock-Warning`
- 未匹配：404 `no_mock_matched`；无可用分支：500 `no_branch_matched`；脚本错误：500 `script_error`

## 使用流程

1. **项目列表** → 新建项目（名称 + slug）
2. 项目页 → **环境** tab → 新建环境（如 `dev`），可配置环境变量
3. 项目页 → **API** tab → 新建 API（方法 + 路径），自动带一个默认分支
4. 进入 **API 编辑器**：
   - 左侧分支流程图：添加/拖拽排序/启停/删除分支
   - 右侧编辑选中分支：匹配条件（规则构建器或 JS 表达式）→ 响应配置（状态码/头/延迟）→ 返回体（静态 JSON 或 JS 脚本）
   - **保存分支** → 底部 **测试面板** 干跑验证
5. 复制 Mock 地址直接调用；**请求日志** 页可回看访问记录

## 响应脚本参考

脚本在独立 `node:vm` 沙箱中以 `async` 函数执行，用 `return` 返回值（对象自动 JSON 序列化）：

```js
setStatus(201);
setHeader('X-Custom', 'yes');
return {
  id: helpers.uuid(),
  email: faker.internet.email(),
  amount: helpers.randomInt(1, 100),
  region: env.REGION,          // 环境变量
  echo: req.body,              // 请求体
  q: req.query.page,           // query
  userId: req.params.id,       // 路径参数
  ua: req.headers['user-agent']
};
```

| 对象 | 说明 |
|---|---|
| `req` | `{ method, path, params, query, headers, body }`（只读快照） |
| `env` | 当前环境变量 `Record<string,string>` |
| `faker` | [@faker-js/faker](https://fakerjs.dev) 实例 |
| `helpers` | `uuid()` `randomInt(min,max)` `randomFloat(min,max,digits)` `pick(arr)` `sleep(ms)` `now()` `isoNow()` `format(tpl,vars)` |
| `setStatus(code)` | 覆盖状态码 |
| `setHeader(k,v)` | 追加/覆盖响应头 |
| `delay(ms)` | 追加延迟（与分支延迟相加，上限 60s） |

脚本超时 2s。脚本/表达式在独立 **worker 线程**的 `node:vm` 中执行：vm 超时覆盖同步段，`await` 之后的阻塞循环由主线程硬终止 worker 兜底（不会挂死服务器），出错响亮失败 500。

## 条件规则参考

**规则模式**字段来源：`query` / `header`（大小写不敏感）/ `body`（支持 `user.id` 点路径）/ `params` / `method` / `env`。

操作符：`eq` `ne` `contains` `not_contains` `starts_with` `ends_with` `gt` `gte` `lt` `lte` `in`（数组或逗号分隔）`exists` `not_exists` `matches`（正则）。

**表达式模式**在与脚本相同的沙箱中求值，可用同样的 `req/env/helpers/faker`，返回真值即命中；**执行出错会跳过该分支继续向下求值**（fail-open），并记录警告。`matches` 正则在带 200ms 预算的 vm 中执行，灾难性回溯会被中断并按不匹配处理（附警告）。

## Token 鉴权

**未配置任何 token 时鉴权完全关闭**（本地开发零配置）；配置任意一个 token 后，`/api/*`（`/api/health` 除外）与 `/mcp` 立即要求 `Authorization: Bearer <token>`。

两种配置方式（可同时用）：

| 方式 | 说明 |
|---|---|
| 环境变量 `AIMOCK_TOKEN` | 逗号分隔多个；每次请求实时读取，取消设置即吊销 |
| `data/tokens.json` | 界面「访问 Token」页或 `POST /api/tokens` 创建；存 SHA-256 哈希，明文只返回一次 |

```
AIMOCK_TOKEN=secret1,secret2            # 启用鉴权
AIMOCK_REQUIRE_MOCK_AUTH=true           # 可选：/mock/* 也要求 token
```

- 自举顺序：零 token 时 API 开放 → 首次 `POST /api/tokens` 成功 → 之后全部要求鉴权
- Web 界面：「访问 Token」页创建 token 并保存到浏览器（localStorage），之后请求自动带头
- **stdio MCP 无鉴权**（本地子进程，由你启动，信任模型等同直接读 sqlite 文件）

## MCP（智能体框架接入）

同一套 18 个工具，两种传输：

| 工具分组 | 工具 |
|---|---|
| 项目 | `list_projects` `get_project` `create_project` `update_project` `delete_project` |
| 环境 | `list_environments` `create_environment` `update_environment` `delete_environment` |
| API | `list_apis` `create_api` `get_api` `update_api` `delete_api` |
| 分支 | `create_branch` `update_branch` `delete_branch` |
| 测试 | `simulate_request`（干跑匹配，不写日志） `get_logs`（带过滤的日志断言） |

### stdio（本地 agent，如 Claude Code）

```bash
npm run mcp        # = npx tsx server/src/mcp/cli.ts
```

```bash
claude mcp add ai-mock -- npx tsx E:/projects/ai-mock/server/src/mcp/cli.ts
```

stdio 模式直接读写数据库，**无需 token**；stdout 是 JSON-RPC 通道，切勿在该进程里打印日志。

### Streamable HTTP（远程/同机均可）

服务启动后挂载在 `POST http://127.0.0.1:3210/mcp`（无状态模式，每次请求独立；GET/DELETE 返回 405）：

```bash
claude mcp add --transport http ai-mock-http http://127.0.0.1:3210/mcp \
  --header "Authorization: Bearer <token>"    # 配置了 token 时
```

curl 示例：

```bash
curl -X POST http://127.0.0.1:3210/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

> 注意：管理接口 `bodyLimit` 为 1MB，工具参数中的超大 `staticBody`/`script` 会 413。

## 日志查询（测试断言）

```
GET /api/projects/{id}/logs?limit=50&method=POST&path=/api/orders&matched=true
    &status=200&branchId=…&apiId=…&environmentId=…
    &from=2026-11-25T00:00:00.000Z&to=2026-11-25T23:59:59.999Z
```

| 参数 | 说明 |
|---|---|
| `limit` | 1–1000，默认 200 |
| `method` / `path` | 精确匹配 |
| `matched` | `true` / `false`（命中与否） |
| `status` | 状态码 100–599 |
| `branchId` / `apiId` / `environmentId` | 关联对象过滤 |
| `from` / `to` | ISO 时间范围（含边界） |

测试断言示例：发起请求后查 `?branchId=<id>&matched=true`，有记录即证明命中了该分支（MCP 里同名工具 `get_logs` 参数相同，外加 `projectId`）。

## 数据库切换

界面「数据库设置」中切换，或修改 `data/connection.json`（首次启动自动生成，默认 SQLite：`data/ai-mock.sqlite`）。环境变量可覆盖（容器/CI 用）：

```
AIMOCK_DB_CLIENT=sqlite|mysql|mssql
AIMOCK_DB_HOST / AIMOCK_DB_PORT / AIMOCK_DB_USER / AIMOCK_DB_PASSWORD / AIMOCK_DB_DATABASE
AIMOCK_DB_FILENAME（sqlite）
```

> 切换引擎只迁移表结构，**不会搬迁已有数据**（导出/导入为后续计划）。

### 跨方言验证（docker）

```bash
docker compose up -d          # MySQL :3307、SQL Server :1434（含健康检查）
# SQL Server 需手动建库一次：
docker exec ai-mock-mssql-1 /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'AiMock_Passw0rd!' -C -Q "CREATE DATABASE ai_mock"

# MySQL 全套测试
AIMOCK_DB_CLIENT=mysql AIMOCK_DB_HOST=127.0.0.1 AIMOCK_DB_PORT=3307 \
AIMOCK_DB_USER=root AIMOCK_DB_PASSWORD=root AIMOCK_DB_DATABASE=ai_mock \
npx vitest run --no-file-parallelism

# SQL Server 全套测试
AIMOCK_DB_CLIENT=mssql AIMOCK_DB_HOST=127.0.0.1 AIMOCK_DB_PORT=1434 \
AIMOCK_DB_USER=sa AIMOCK_DB_PASSWORD='AiMock_Passw0rd!' AIMOCK_DB_DATABASE=ai_mock \
npx vitest run --no-file-parallelism
```

## 测试

```bash
npm test          # 单测 + 集成（SQLite 内存库），127 个用例
npm run typecheck # 三个 workspace 的类型检查
```

覆盖：规则求值、路径匹配、脚本沙箱（超时/eval 屏蔽/副作用）、CRUD 与级联删除、Mock 管线（分支顺序/表达式 fail-open/缓存失效/preview 一致性）、Token 鉴权（开关/自举/吊销）、日志过滤查询、MCP 工具全链路（InMemory 传输 + HTTP 传输）。

## 项目结构

```
shared/          类型、zod schema、条件求值器（前后端共用）
server/          Fastify + Knex：/api/* 管理接口、/mock/* Mock 管线、vm 脚本沙箱
  src/auth/      Token 存取与 Bearer 鉴权钩子
  src/mcp/       MCP 服务（tools/ + http.ts 无状态 Streamable HTTP + cli.ts stdio 入口）
  src/services/  路由与 MCP 共用的多步逻辑（API 创建、preview 干跑）
web/             React + Vite + Tailwind + Monaco 管理界面
tests/           unit + integration
```

## 安全说明

- 脚本沙箱 `node:vm` **不是安全边界**：它隔离了宿主全局并禁用了 `eval`/`Function`/WASM，但不防御蓄意恶意代码。本工具面向本地/内网运行**自己编写**的脚本；如需托管不可信脚本，请替换为 `isolated-vm`（`runScript` 签名已预留）。
- 管理接口**默认无鉴权**（未配置 token 时），默认只绑定 `127.0.0.1`；暴露到局域网前请至少配置 `AIMOCK_TOKEN`（见「Token 鉴权」），或自行加反向代理鉴权。
- stdio MCP 进程无鉴权，等同获得数据库读写权限——只接入你信任的 agent 配置。
