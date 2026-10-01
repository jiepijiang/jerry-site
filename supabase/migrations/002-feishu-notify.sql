-- ============================================================================
-- jerry-site · 留言飞书通知（Supabase）
-- ============================================================================
-- 前置：先跑过 `001-guestbook.sql`。
-- 用法：在 Supabase 控制台 → SQL Editor 里**整份粘贴执行**。幂等，可重复跑。
--
-- 效果：每来一条新留言，你的飞书群机器人立刻推一张卡片（邮箱 / 时间 / 正文）。
--
-- ⚠️ **没配 webhook 时整个功能是「静默 no-op」**，留言照常入库、只是不通知。
--    所以跑完这份 SQL 之后，请务必按文件末尾的步骤把 webhook 填进去 + 发一条测试。
--
-- 为什么走数据库而不是前端
-- ----------------------------------------------------------------------------
-- 前端也能直连飞书（parking-notice 就是那么做的，飞书 webhook 放开了 CORS）。
-- 但那样 **webhook URL 会进前端 bundle**，谁都能扒出来往你群里灌消息。
-- 留言板是公开站点，这个风险不能接受 —— 所以放在数据库里，只在服务端发。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 扩展
-- ---------------------------------------------------------------------------
-- pg_net：让 Postgres 能发 HTTP（异步，事务提交后才真正发出）
-- pgcrypto：算飞书签名用的 HMAC-SHA256（不开签名校验的话用不到，但留着无害）
--
-- 如果这两句报 "extension ... is not available"，去 Dashboard → Database → Extensions
-- 里手动打开，再重跑本文件。
create schema if not exists extensions;
create extension if not exists pg_net    with schema extensions;
create extension if not exists pgcrypto  with schema extensions;


-- ---------------------------------------------------------------------------
-- 配置表
-- ---------------------------------------------------------------------------
-- 用一张表而不是把 URL 写死在函数里：换 webhook 只要 update 一行，
-- 不用重跑整份迁移。
--
-- 权限和留言表同一套路：开 RLS、零策略、再 revoke —— **anon 永远读不到**。
-- 这很重要：webhook URL 就是凭据，拿到它就能往你群里发消息。
create table if not exists public.app_config (
  key        text        primary key,
  value      text        not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  '服务端配置（如飞书 webhook）。只给 SECURITY DEFINER 函数读，anon 无任何权限。';

alter table public.app_config enable row level security;
revoke all on table public.app_config from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 组装飞书卡片
-- ---------------------------------------------------------------------------
-- 单独抽出来，是为了让「发测试消息」和「真留言」共用同一份格式 ——
-- 否则测试发出来的是另一种卡片，「测试通过」就证明不了真留言也能发。
--
-- 🔴 下面那些换行必须写 `E'...\n'`，**不能写 `'...\n'`**。
--    Postgres 默认 `standard_conforming_strings = on`，普通单引号里的 `\n` **不是转义**，
--    会原样存成「反斜杠 + n」两个字符 —— 卡片上于是显示一行字面的 `\n` 而不是换行。
--    这个坑**肉眼看 SQL 是看不出来的**（`\n` 看着就该是换行），
--    是把字段的码点打出来才发现的（拿到 `92,110` 而不是 `10`）。
create or replace function public.build_guestbook_card(
  p_email   text,
  p_content text,
  p_at      timestamptz
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'msg_type', 'interactive',
    'card', jsonb_build_object(
      'config', jsonb_build_object('wide_screen_mode', true),
      'header', jsonb_build_object(
        'template', 'blue',
        'title', jsonb_build_object('tag', 'plain_text', 'content', '💬 新的留言')
      ),
      'elements', jsonb_build_array(
        jsonb_build_object(
          'tag', 'div',
          'fields', jsonb_build_array(
            jsonb_build_object(
              'is_short', true,
              'text', jsonb_build_object('tag', 'lark_md', 'content', E'**来自**\n' || p_email)
            ),
            jsonb_build_object(
              'is_short', true,
              'text', jsonb_build_object(
                'tag', 'lark_md',
                'content', E'**时间**\n' ||
                  to_char(p_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
              )
            )
          )
        ),
        jsonb_build_object('tag', 'hr'),
        jsonb_build_object(
          'tag', 'div',
          'text', jsonb_build_object('tag', 'lark_md', 'content', p_content)
        ),
        jsonb_build_object(
          'tag', 'note',
          'elements', jsonb_build_array(
            jsonb_build_object('tag', 'plain_text', 'content', 'jerry-site · 留言板')
          )
        )
      )
    )
  );
$$;


-- ---------------------------------------------------------------------------
-- 真正发出去
-- ---------------------------------------------------------------------------
create or replace function public.send_feishu_card(p_card jsonb)
returns bigint
language plpgsql
security definer
-- 🔴 这里**必须**带上 `extensions`，不能只写 `public`。
--    因为 `hmac()` 是 pgcrypto 的、装在 `extensions` schema 里；
--    `set search_path = public` 会把默认路径整个换掉，
--    于是开了签名校验的项目会在**运行时**报 "function hmac(...) does not exist" ——
--    而且只在「配了 secret」时才触发，没配的项目永远发现不了。
--    （这个坑本地测试也差点漏掉：桩函数默认建在 public，把差异掩盖了。
--      现在桩也挪进 extensions，两边一致。）
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
  v_body   jsonb := p_card;
  v_ts     text;
  v_id     bigint;
begin
  select value into v_url    from public.app_config where key = 'feishu_webhook_url';
  select value into v_secret from public.app_config where key = 'feishu_secret';

  v_url := btrim(coalesce(v_url, ''));
  if v_url = '' then
    -- 没配就什么都不做。**不能抛异常** —— 通知发不出去不该影响留言本身。
    return null;
  end if;

  -- 飞书开启「签名校验」时才需要这两个字段
  if btrim(coalesce(v_secret, '')) <> '' then
    v_ts := floor(extract(epoch from now()))::bigint::text;
    -- 飞书自定义机器人的算法：base64(HMAC-SHA256(key = "<timestamp>\n<secret>", msg = ""))
    -- ⚠️ key 是「时间戳 + 换行 + secret」，msg 是**空串** —— 这两点最容易写反。
    v_body := v_body || jsonb_build_object(
      'timestamp', v_ts,
      'sign', encode(hmac('', v_ts || E'\n' || btrim(v_secret), 'sha256'), 'base64')
    );
  end if;

  v_id := net.http_post(
    url     := v_url,
    body    := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return v_id;
end;
$$;

comment on function public.send_feishu_card(jsonb) is
  '把飞书卡片 POST 到 app_config.feishu_webhook_url。没配则静默返回 null。';

-- 只有服务端（SECURITY DEFINER 函数 / SQL Editor）能调，anon 不行
revoke all on function public.send_feishu_card(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 触发器：新留言 → 通知
-- ---------------------------------------------------------------------------
create or replace function public.notify_guestbook_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 🔴 整个发送过程包在 exception 里，**这是有意的**：
  --    pg_net 没装、webhook 填错、网络不通……任何一种都不该让**留言写不进去**。
  --    用户按下「发送留言」，成败只该由留言本身决定。
  --    但也不能完全静默 —— 所以 raise warning（在 Dashboard → Logs 里能看到），
  --    另外 `guestbook_notify_status()` 可以事后查。
  begin
    perform public.send_feishu_card(
      public.build_guestbook_card(new.email, new.content, new.created_at)
    );
  exception when others then
    raise warning '留言已入库，但飞书通知发送失败：% (%)', sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

drop trigger if exists guestbook_message_notify on public.guestbook_messages;
create trigger guestbook_message_notify
  after insert on public.guestbook_messages
  for each row
  execute function public.notify_guestbook_message();


-- ---------------------------------------------------------------------------
-- 两个自检用的小工具
-- ---------------------------------------------------------------------------
-- ① 发一条测试卡片 —— 配好 webhook 后**先跑这个**，手机上应该几秒内收到。
--    用的是和真留言完全相同的卡片格式，所以它通过 = 真留言也能发出去。
create or replace function public.guestbook_notify_test()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  v_id := public.send_feishu_card(
    public.build_guestbook_card(
      'test@example.com',
      '这是一条**测试**消息，用来确认留言通知打通了。',
      now()
    )
  );

  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_configured',
      'hint', '还没配 app_config.feishu_webhook_url，见文件末尾的步骤');
  end if;

  return jsonb_build_object('ok', true, 'request_id', v_id,
    'hint', '请求已排队，事务提交后发出。等 3 秒跑 guestbook_notify_status() 看结果。');
end;
$$;

revoke all on function public.guestbook_notify_test() from public, anon, authenticated;

-- ② 看最近 10 次通知的结果
--    ⚠️ pg_net 是**异步**的：函数只负责把请求排进队列，响应事后才写进 net._http_response。
--       而且那张表是 unlogged、**只保留 6 小时** —— 想排查就趁早。
--       这就是「webhook 填错了却完全看不出来」的解药。
create or replace function public.guestbook_notify_status()
returns table (
  request_id  bigint,
  http_status int,
  error_msg   text,
  content     text,
  created_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.status_code, r.error_msg, left(r.content, 300), r.created
    from net._http_response r
   order by r.created desc
   limit 10;
$$;

revoke all on function public.guestbook_notify_status() from public, anon, authenticated;

-- ============================================================================
-- ⚠️ 配 webhook 不在这个文件里 —— 请跑 003-feishu-config.sql
-- ============================================================================
--
-- 这个文件的第一版把「配置步骤」写成了下面这样的注释：
--
--     -- 【2】把 URL 填进来（在 SQL Editor 里执行，把 <你的URL> 换掉）
--     --     insert into public.app_config (key, value) values
--     --       ('feishu_webhook_url', '<你的URL>'), ...
--
-- 结果：迁移本体跑了（`Success. No rows returned`），注释里的 insert 没人跑 ——
-- 注释对执行者是隐形的，它既不会被跑、也不会报错。
-- app_config 因此一直是空的 → send_feishu_card 一进来就早退、一个请求都不发，
-- 而上面那句「通知失败不影响留言」的 exception 守卫又让错误彻底静默。
-- 表现就是：飞书没收到 + net._http_response 0 行 + 看不出哪里错了。
--
-- 所以配置改成了**可执行的**，在 003-feishu-config.sql 里：
--
--   -- ① 配一行（幂等，可重复跑）
--   select public.guestbook_configure_feishu(
--     'https://open.feishu.cn/open-apis/bot/v2/hook/你的TOKEN');
--
--   -- ② 确认配置生效（永远返回 1 行，含「下一步该做什么」）
--   select * from public.guestbook_feishu_status();
--
--   -- ③ 发一条测试，手机上确认收到
--   select public.guestbook_notify_test();
--   -- 等 3 秒看结果（HTTP 200 且 last_error 为 null 才算真的到了）
--   select * from public.guestbook_notify_status();
--
-- 建机器人那步（在飞书里操作，SQL 代替不了）：
--   · 手机/电脑飞书 → 新建一个群 → 群设置 → 群机器人 → 添加机器人 → 自定义机器人
--   · 安全设置推荐「自定义关键词」，填「留言」两个字（卡片标题里有「新的留言」，
--     所以一定含关键词）—— 这样不需要签名，配置最简单。
--     想用「签名校验」的话，把密钥作为第二个参数传给 guestbook_configure_feishu。
--   · 复制那条 https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx 的地址
--
-- 排查顺序（**先跑这个，别猜**）：
--   select * from public.guestbook_feishu_status();
--   · configured = false                  → 就是没配，按上面 ① 配一行
--   · configured 但 response_rows = 0     → 配了但还没发过，跑 ③
--   · last_http_status = 400              → 看 last_content（飞书原话，sign/keyword 相关）
--   · last_error 有值、last_http_status 为空 → 传输层失败（出网/代理），不是飞书拒收
--   ⚠️ pg_net 的 error_msg **只在传输层失败时**才有值；飞书返回 400 时它是 null，
--      原因在 content 列里。这两列 003 都给你了。
-- ============================================================================
