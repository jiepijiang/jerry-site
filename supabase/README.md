# supabase/ —— 留言板后端

主站（jerry-site）唯一的后端。用的是 **jerry-tools 那个 Supabase 项目**（ref `swdnendmdmcyqnnjzytv`），
两个站共用一套数据库，各自建各自的表。

## 为什么是 Supabase

- 留言板本质是「**一个只写的表单**」：页面没有留言列表，提交完就跳回首页。
  这种场景不需要自己写服务端、不需要管进程和部署，一个 Postgres + 一个 RPC 就够。
- 主站托管在 **GitHub Pages，没有服务端**（纯静态）。任何后端都得另找地方托管，
  还得自己配 CORS。Supabase 免费额度够用，且 anon key 天生就是给前端用的。
- 校验和限流放在**数据库函数**里，客户端改不了 —— 这比放在前端强得多。

## 目录

```
supabase/
  migrations/001-guestbook.sql   ← 表 + RLS + 写入函数（幂等，可重复执行）
  README.md                      ← 本文件
```

## 怎么跑

**在 Supabase 控制台 → SQL Editor 里整份粘贴 `migrations/001-guestbook.sql`，点 Run。**

之所以要手动跑：本地没有该项目的管理凭据（PAT 已失效，`GET /v1/projects` 返回 401），
`supabase db push` 那条路走不通。SQL 是幂等的，跑第二遍不会报错、也不会重复建。

跑完把文件末尾「跑完后的自检」那几条单独选中执行一遍 —— 那是验收，别跳过。

## 它建了什么

### 表 `guestbook_messages`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `bigserial` | 主键 |
| `email` | `text` | 留言人邮箱，服务端会 `btrim` |
| `content` | `text` | 留言正文 |
| `created_at` | `timestamptz` | **由服务端 `now()` 决定**，不接受客户端传时间 |
| `ip_hash` | `text` | 访客 IP 的 `md5`，只用于限流与滥用排查；拿不到 IP 时为 `null` |

索引三条，分别对应三条限流查询的过滤列。

### RLS：**开启，但一条策略都不建**

留言板只写不读，所以 `anon` 不需要任何权限。策略为空 ⇒ `anon` / `authenticated`
读不到 0 行、也写不进一条。

在此之上还有一道 `revoke all on table … from anon, authenticated`。
两道防线**互相独立**：造红测试里把 `enable row level security` 那行拿掉，
「anon 读不到 / 写不进」两条断言**依然是绿的** —— 因为 `revoke` 兜住了。
将来真要做「留言墙」，得同时改这两处（加 select 策略 + 恢复 select 授权），
并且**想清楚脱敏**：邮箱绝对不能露出来。

### 函数 `post_guestbook_message(p_email, p_content)`

唯一的写入口，`security definer` + `set search_path = public`。

- **校验**（常量与 `GuestbookView.vue` 逐字对齐，不一致会出现「前端放行、后端拒绝」）
  - 邮箱：非空、≤254 字符、匹配 `^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$`
  - 内容：trim 后 5 ~ 1000 字符
- **三重限流**

  | 维度 | 阈值 | 拦的是 |
  | --- | --- | --- |
  | 全站 | 10 条 / 1 分钟 | 洪水 |
  | 同一 IP | 5 条 / 1 小时 | 单机脚本 |
  | 同一邮箱 | 3 条 / 1 小时 | 换 IP 刷同一个人 |

  边界都是 `>=`：**第 3 条同邮箱留言放行，第 4 条被拦**。
  取不到 IP 时**跳过 IP 那一条**，不能因为取不到就一律拒绝（否则代理环境全员发不出）。

- **返回**
  - 成功：`{"ok": true}`
  - 失败：`{"ok": false, "code": "invalid_email" | "invalid_content" | "rate_limited"}`

> ⚠️ **Supabase 的 RPC 用 HTTP 200 表达业务失败。**
> 限流和校验不通过都返回 **200**，只是 body 里 `ok: false`。
> 前端只看 `res.ok` 会把「请求过于频繁」谎报成「发送成功」。
> `GuestbookView.vue` 里必须显式检查 `ok`，别删那段。

## 前端怎么接

`endpoint` 和请求头都从**构建期环境变量**来，不写死在源码里：

| 变量 | 用途 |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key（**公开的，进 bundle 是设计如此**） |

`src/data/site.js` 会拼成
`${VITE_SUPABASE_URL}/rest/v1/rpc/post_guestbook_message`，
请求头带 `apikey` 和 `Authorization: Bearer <anon key>`。

**两个变量都没配时 `endpoint` 为空 → 退回本地假成功**（方便直接预览），
但会在控制台打一条 `console.warn` 留痕 —— 静默的假成功会让人以为留言真发出去了。

- 本地：复制 `.env.example` 成 `.env.local` 填上（已被 `.gitignore` 忽略）。
- CI：在仓库 **Settings → Secrets and variables → Actions → Variables** 里配这两个
  （用 `vars` 不是 `secrets` —— anon key 本来就公开，`service_role` 绝不能进工作流）。
  `deploy.yml` 里有一个「核对 Supabase 配置是否已注入」的步骤，没配会 `::warning`，
  配了但产物里 grep 不到会 `::error` 直接失败。

## 本地怎么验

不需要连真 Supabase 就能验这份 SQL。`/tmp/jtools/run-guestbook-sql.mjs` 用
WASM 版真 PostgreSQL（`@electric-sql/pglite`）把迁移整份跑起来，断言 32 条：

```bash
cd /Users/jiepijiang/.workbuddy-ai/binaries/node/workspace
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs
# 造红（确认断言真的抓得住）
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=email-rate
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=ip-hash
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=rls
```

三个造红开关对应的报红条数分别是 2 / 2 / 1，**都能逐条解释**。
（`rls` 那个只红 1 条，是因为 `revoke` 那道防线独立生效 —— 见上文。）

⚠️ 它与真实 Supabase 的差异：没有 PostgREST（`request.headers` 要手动 `set_config`）、
没有 `anon` / `authenticated` 角色（脚本自己建）。**所以最后还是要在真项目上跑一遍自检语句。**
