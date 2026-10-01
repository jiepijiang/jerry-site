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
  migrations/001-guestbook.sql      ← 表 + RLS + 写入函数（幂等，可重复执行）
  migrations/002-feishu-notify.sql  ← 新留言 → 飞书群机器人通知（可选，不配就是 no-op）
  README.md                         ← 本文件
```

## 怎么跑

**在 Supabase 控制台 → SQL Editor 里，按序号整份粘贴执行。**

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

## 飞书通知（`002-feishu-notify.sql`）

新留言进来时，往你的飞书群机器人推一张卡片（邮箱 / 时间 / 正文）。

### 为什么是飞书，不是邮件

- **邮件要另配一整套东西**：Supabase 自带的邮件只用于 auth（注册确认、重置密码），
  不能拿来发业务通知。要发邮件得接 Resend / SendGrid 之类的服务，
  还要配发信域名、SPF/DKIM，否则大概率进垃圾箱。
- **飞书一个 webhook URL 就够了**，免费、即时、手机能收到推送。
  这个项目里 `parking-notice` 已经在用同一套东西，你熟。

### 🔴 为什么放在数据库，不放在前端

前端也能直连飞书 —— 飞书 webhook 放开了 CORS，`parking-notice` 就是纯前端发的。
但那样 **webhook URL 会进前端 bundle**，谁都能扒出来往你群里灌消息。
留言板是公开站点，这个风险不能接受。

所以：webhook URL 存在 `app_config` 表里（RLS + 零策略 + revoke，**anon 读不到**），
由数据库触发器在服务端发。

### 它建了什么

| 对象 | 作用 |
| --- | --- |
| 表 `app_config` | 存 `feishu_webhook_url` / `feishu_secret`。anon 无任何权限 |
| `build_guestbook_card(email, content, at)` | 组装飞书卡片 JSON |
| `send_feishu_card(card)` | POST 出去。**没配就静默返回 null** |
| `notify_guestbook_message()` + 触发器 | `after insert` 自动发 |
| `guestbook_notify_test()` | 发一条测试卡片（配好之后先跑这个） |
| `guestbook_notify_status()` | 看最近 10 次通知的结果 |

### 三步接上

1. **建机器人**：飞书 → 新建一个群（可以只有你自己）→ 群设置 → 群机器人 →
   添加机器人 → **自定义机器人**。
   安全设置推荐 **「自定义关键词」** 填 `留言`（卡片标题是「💬 新的留言」，必然命中）——
   这样**不需要签名**，最省事。想用签名校验也行，把密钥填进 `feishu_secret`。
2. **填 URL**：
   ```sql
   insert into public.app_config (key, value) values
     ('feishu_webhook_url', '<你的URL>'),
     ('feishu_secret', '')          -- 用「关键词」方式就留空
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```
3. **发测试**：
   ```sql
   select public.guestbook_notify_test();     -- 期望 {"ok": true, "request_id": ...}
   -- 等 3 秒（pg_net 是异步的，事务提交后才真发）
   select * from public.guestbook_notify_status();
   ```
   `status_code = 200` 且 `error_msg` 为 null 才算真的到了。
   400 且 content 里有 `sign` / `keyword` 字样 = 安全设置和配置对不上。

### 两个刻意的设计

- **通知失败绝不拖垮留言。** 触发器里整段发送包在 `exception when others` 里，
  只 `raise warning`。pg_net 没装、webhook 填错、网络不通……
  任何一种都不该让「按下发送留言」失败。**用户看到的成败只该由留言本身决定。**
  代价是「静默不通知」，所以配了 `guestbook_notify_status()` 来兜底排查。
- **没配 = 静默 no-op。** 留言照常入库，只是不通知。
  这样这份迁移对「暂时不想开通知」是完全无害的。

### 两个只有真跑才会发现的坑

1. 🔴 **`'\n'` 不是换行。** Postgres 默认 `standard_conforming_strings = on`，
   普通单引号里的 `\n` 会原样存成「反斜杠 + n」两个字符，
   卡片上于是显示一行字面的 `\n`。**必须写 `E'...\n'`。**
   肉眼审 SQL 看不出来（`\n` 看着就该是换行），是把字段码点打出来才发现的
   （拿到 `92,110` 而不是 `10`）。所以断言要用**全等**，不能只用 `includes()`。
2. 🔴 **`set search_path = public` 会让 `hmac()` 找不到。**
   `hmac` 属于 pgcrypto、装在 `extensions` schema。收窄 search_path 后，
   **开了签名校验的项目会在运行时炸**，而没配 secret 的项目永远发现不了。
   所以这里写的是 `set search_path = public, extensions`。
   （本地测试也差点漏掉 —— 桩函数原本建在默认 schema，把这个差异掩盖了；
   现在桩也挪进 `extensions`，两边一致。）

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

不需要连真 Supabase 就能验这两份 SQL。

**① 留言板（`001`）** —— 用 WASM 版真 PostgreSQL（`@electric-sql/pglite`）把迁移整份跑起来，断言 32 条：

```bash
cd /Users/jiepijiang/.workbuddy-ai/binaries/node/workspace
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs
# 造红（确认断言真的抓得住）
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=email-rate   # 红 2
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=ip-hash      # 红 2
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-guestbook-sql.mjs --break=rls          # 红 1
```

**② 飞书通知（`002`）** —— `net.http_post` 和 `hmac` 用桩函数替掉（PGlite 没有这两个扩展），
桩会把每次调用的 url / body / headers 记下来，断言 31 条：

```bash
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-feishu-sql.mjs
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-feishu-sql.mjs --break=no-exception         # 红 2
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-feishu-sql.mjs --break=no-config            # 红 2
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-feishu-sql.mjs --break=sign-key             # 红 1
NODE_PATH=$PWD/node_modules node /tmp/jtools/run-feishu-sql.mjs --break=narrow-search-path   # 红 3
```

⚠️ **桩函数的位置要和真环境一致**：`hmac` 桩故意建在 `extensions` schema，
就是为了让「search_path 收窄导致找不到 hmac」这个坑能被测出来。
第一版桩建在默认 schema，于是测了个假的。

**③ 对真 Supabase 打一遍**（需要 `.env.local`）：

```bash
node /tmp/jtools/probe-rpc-live.mjs           # 只读：函数在不在、校验分支对不对、anon 能不能直连
node /tmp/jtools/probe-rpc-live.mjs --write   # 含真实写入 + 限流（会留下测试数据，见文件里的清理语句）
```

⚠️ PGlite 与真实 Supabase 的差异：没有 PostgREST（`request.headers` 要手动 `set_config`）、
没有 `anon` / `authenticated` 角色（脚本自己建）、没有 `pg_net` / `pgcrypto`（用桩）。
**所以最后还是要在真项目上跑一遍自检语句。**
