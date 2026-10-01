-- ============================================================================
-- 003 · 把「配飞书 webhook」从注释变成一条能执行的语句
-- ============================================================================
--
-- 为什么有这个文件
-- ----------------
-- 002 把配置步骤（`insert into public.app_config ...`）写在了**文件末尾的注释里**。
-- 结果：迁移本体跑了（`Success. No rows returned`），注释里的 insert 没人跑，
--       app_config 一直是空的 → `send_feishu_card` 一进来就早退、**一个请求都不发**，
--       而触发器里那句「通知失败不影响留言」的 exception 守卫又让错误彻底静默。
--       表现就是「飞书没收到 + net._http_response 0 行 + 看不出哪里错了」。
--
-- 教训（已写进 skill）：**迁移里的配置步骤不能只写成注释**。
-- 注释对执行者是隐形的 —— 它既不会被跑，也不会报错。
-- 配置必须是「一条可以整份粘贴、幂等、跑完有明确返回」的语句。
--
-- 本文件提供三件东西
-- ------------------
--   ① `guestbook_configure_feishu(url, secret)` —— 配一行就完事（幂等，可重复跑）
--   ② `guestbook_feishu_status()` —— **永远返回 1 行**的诊断，含「下一步该做什么」
--   ③ 文件末尾一段 `do $$ ... raise notice ... $$` 自检：没配就当场喊出来
--
-- ⚠️ 这三个函数都 revoke 掉了 anon/authenticated —— 只有 SQL Editor（postgres 角色）
--    能调。webhook URL 等于「谁拿到谁就能往你群里发消息」，绝不能暴露给前端。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ① 打码显示 —— 让人能确认「配的是哪一条」，又不至于把 token 印在屏幕上
-- ---------------------------------------------------------------------------
create or replace function public.mask_webhook_url(p_url text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(p_url), '') = '' then '(未配置)'
    when btrim(p_url) ~ '/hook/' then
      regexp_replace(btrim(p_url), '/hook/.*$', '/hook/****') || right(btrim(p_url), 4)
    else left(btrim(p_url), 12) || '****'
  end
$$;

revoke all on function public.mask_webhook_url(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- ② 配置（幂等）
-- ---------------------------------------------------------------------------
-- 用法（在 SQL Editor 里整行粘贴，把 URL 换成你自己的）：
--
--   select public.guestbook_configure_feishu(
--     'https://open.feishu.cn/open-apis/bot/v2/hook/你的TOKEN');
--
-- 用「签名校验」而不是「自定义关键词」的话，第二个参数填密钥：
--
--   select public.guestbook_configure_feishu(
--     'https://open.feishu.cn/open-apis/bot/v2/hook/你的TOKEN', '你的密钥');
--
-- 想清空配置（比如换了机器人）：
--   delete from public.app_config where key = 'feishu_webhook_url';
-- ---------------------------------------------------------------------------
create or replace function public.guestbook_configure_feishu(
  p_webhook_url text,
  p_secret text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 飞书 / Lark 自定义机器人的地址形如
  --   https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  --   https://open.larksuite.com/open-apis/bot/v2/hook/xxxxxxxx-...
  -- 末尾允许一个多余的斜杠（手抄地址时很常见），校验前先削掉。
  c_url_pattern constant text :=
    '^https://(open\.feishu\.cn|open\.larksuite\.com)/open-apis/bot/v2/hook/[A-Za-z0-9_-]{6,}$';
  v_url    text;
  v_secret text;
begin
  v_url    := btrim(coalesce(p_webhook_url, ''));
  v_secret := btrim(coalesce(p_secret, ''));

  -- 顺手削掉末尾斜杠，免得存进去一个「差一个字符」的地址
  if v_url like '%/' then
    v_url := rtrim(v_url, '/');
  end if;

  if v_url = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'empty_url',
      'hint', 'URL 是空的。飞书群 → 群设置 → 群机器人 → 添加机器人 → 自定义机器人，复制那条 hook 地址。'
    );
  end if;

  if v_url !~ c_url_pattern then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_url',
      'hint', '看起来不像飞书自定义机器人的地址。应当以 https://open.feishu.cn/open-apis/bot/v2/hook/ 开头。'
              || '（注意别把「签名密钥」当成 URL 填进来。）',
      'got', public.mask_webhook_url(v_url)
    );
  end if;

  insert into public.app_config (key, value) values
    ('feishu_webhook_url', v_url),
    ('feishu_secret',      v_secret)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'webhook_masked', public.mask_webhook_url(v_url),
    'secret_set', v_secret <> '',
    'next', '跑 select * from public.guestbook_feishu_status(); 确认 configured = true，'
            || '再跑 select public.guestbook_notify_test(); 看手机收不收得到。'
  );
end;
$$;

revoke all on function public.guestbook_configure_feishu(text, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- ③ 诊断 —— 排查飞书通知**第一件事**就是跑它
-- ---------------------------------------------------------------------------
--   select * from public.guestbook_feishu_status();
--
-- 与 `guestbook_notify_status()`（002 里那个）的分工：
--   · guestbook_notify_status()      —— 看「发出去之后的结果」，**没发过就是 0 行**
--   · guestbook_feishu_status()      —— 看「现在到底能不能发」，**永远有 1 行**
--
-- 本轮就是栽在「只有前者」上：0 行既可能是「没配所以没发」，也可能是「发了被拒」，
-- 两种完全不同的原因长得一模一样。后者恒有 1 行，`configured` 一眼分得开。
--
-- ⚠️ 一个容易白跑一趟的细节：pg_net 的 `error_msg` **只在传输层失败时**才有值
--    （DNS 解析不了 / 连不上 / 超时）。**飞书返回 400 时 `error_msg` 是 null**，
--    真正的原因（`sign match fail` 之类）在 `content` 里 —— 所以下面两列都给你。
-- ---------------------------------------------------------------------------
create or replace function public.guestbook_feishu_status()
returns table (
  configured       boolean,      -- app_config 里有没有 webhook URL
  webhook_masked   text,         -- 打码后的 URL（用来确认配的是哪一条）
  secret_set       boolean,      -- 有没有配签名密钥
  pg_net_installed boolean,      -- pg_net 扩展在不在
  response_rows    int,          -- net._http_response 里还有几条（unlogged，只留 6 小时）
  last_request_id  bigint,
  last_http_status int,
  last_error       text,         -- ⚠️ 只在**传输层**失败时才有值（DNS / 连不上 / 超时）
  last_content     text,         -- ⚠️ 飞书拒收时，原因在**这一列**（error_msg 会是 null）
  last_sent_at     timestamptz,
  hint             text          -- 「下一步该做什么」，未配置时就是那句配置语句
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from public.app_config where key = 'feishu_webhook_url';
  select value into v_secret from public.app_config where key = 'feishu_secret';
  v_url    := coalesce(v_url, '');
  v_secret := coalesce(v_secret, '');

  configured       := v_url <> '';
  webhook_masked   := public.mask_webhook_url(v_url);
  secret_set       := v_secret <> '';
  pg_net_installed := exists (select 1 from pg_extension where extname = 'pg_net');

  -- 用 to_regclass 兜一下：万一 pg_net 没装成，这个诊断函数本身不能跟着炸 ——
  -- 否则「最需要它的时候它不在」。
  if to_regclass('net._http_response') is not null then
    execute 'select count(*)::int from net._http_response' into response_rows;
    execute 'select r.id, r.status_code, r.error_msg, left(r.content, 300), r.created
               from net._http_response r order by r.created desc limit 1'
      into last_request_id, last_http_status, last_error, last_content, last_sent_at;
  else
    response_rows := 0;
  end if;

  hint := case
    when not configured then
      '⚠️  飞书通知还没配 —— 留言能正常入库，但不会推送。配一行就好：'
      || ' select public.guestbook_configure_feishu(''https://open.feishu.cn/open-apis/bot/v2/hook/你的TOKEN'');'
    when not pg_net_installed then
      '⚠️  URL 配了，但 pg_net 扩展没装 —— 请求发不出去。跑 002-feishu-notify.sql 补上。'
    when response_rows = 0 then
      'ℹ️  已配置，但还没发出过任何请求。跑 select public.guestbook_notify_test(); 试一条。'
    when last_http_status = 200 then
      '✅ 已配置，最近一次发送 HTTP 200（飞书收下了）。'
    when last_error is not null then
      '❌ 已配置，但请求在传输层就失败了 —— 看 last_error（多半是出网 / 代理问题，不是飞书拒收）。'
    else
      '❌ 已配置，但最近一次发送 HTTP ' || coalesce(last_http_status::text, 'null')
      || ' —— 原因在 last_content（飞书返回的原文）：'
      || '提到 sign / keyword 说明安全设置和配置对不上；403 / 404 说明 webhook 被删或地址不对。'
  end;

  return next;
end;
$$;

revoke all on function public.guestbook_feishu_status() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 自检：跑完这个文件，没配就当场喊一句
-- ---------------------------------------------------------------------------
-- `raise notice` 在 Supabase SQL Editor 的结果面板里会显示。
-- 哪怕它被吞掉，用户手跑一句 `select * from public.guestbook_feishu_status();`
-- 也能拿到同一句话 —— 所以这句提示同时挂在 hint 列上，不依赖 notice 被看见。
do $$
declare
  v_hint text;
begin
  select s.hint into v_hint from public.guestbook_feishu_status() s;
  raise notice '%', v_hint;
end $$;
