-- ============================================================================
-- jerry-site · 留言板后端（Supabase）
-- ============================================================================
-- 用法：在 Supabase 控制台 → SQL Editor 里**整份粘贴执行**。
--       幂等，可以重复跑（create … if not exists / create or replace）。
--
-- 设计要点
-- ----------------------------------------------------------------------------
-- ① **只写不读**。留言板是个纯提交表单，页面上没有留言列表 ——
--    所以 anon 角色**不需要任何读权限**：表开 RLS 且**一条策略都不建**。
--    将来真要做「留言墙」，再单独加一条 select 策略，并想清楚脱敏（邮箱绝不能露）。
-- ② **写入只走 SECURITY DEFINER 函数**，不给 anon 直接的 insert 权限。
--    校验、限流、时间戳全在服务端定，客户端改不了。
-- ③ **RPC 用 HTTP 200 表达业务失败**（PostgREST 的行为）——
--    返回 {ok:false, code:'…'}。前端**必须显式检查** ok，
--    否则会把「请求过于频繁」谎报成「发送成功」。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 表
-- ---------------------------------------------------------------------------
create table if not exists public.guestbook_messages (
  id          bigserial   primary key,
  email       text        not null,
  content     text        not null,
  -- 由服务端 now() 决定，不接受客户端传时间
  created_at  timestamptz not null default now(),
  -- 访客 IP 的摘要，只用于限流与滥用排查。
  -- ⚠️ md5 不是「加密」—— IPv4 只有 2^32 种，枚举得动。
  --    这里要的是「同一来源能对上、又不直接存明文 IP」，不是保密。
  ip_hash     text
);

comment on table public.guestbook_messages is
  '留言板留言。只写不读：anon 无任何策略，写入仅通过 post_guestbook_message()。';


-- ---------------------------------------------------------------------------
-- 索引：三条限流查询各自的过滤列
-- ---------------------------------------------------------------------------
create index if not exists guestbook_messages_email_created_idx
  on public.guestbook_messages (email, created_at desc);
create index if not exists guestbook_messages_ip_created_idx
  on public.guestbook_messages (ip_hash, created_at desc);
create index if not exists guestbook_messages_created_idx
  on public.guestbook_messages (created_at desc);


-- ---------------------------------------------------------------------------
-- RLS：**开启，但一条策略都不建** → anon / authenticated 读写全被拒
-- ---------------------------------------------------------------------------
alter table public.guestbook_messages enable row level security;

-- 纵深防御：Supabase 对 public schema 的新表默认 grant 了 anon/authenticated，
-- 虽然 RLS 已经挡住，这里再显式收回一次（RLS 忘了开也不会裸奔）。
revoke all on table    public.guestbook_messages       from anon, authenticated;
revoke all on sequence public.guestbook_messages_id_seq from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 唯一写入口
-- ---------------------------------------------------------------------------
create or replace function public.post_guestbook_message(
  p_email   text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- ⚠️ 这些常量要和前端 GuestbookView.vue 的**逐字对齐**。
  --    两边不一致时会出现「前端放行、后端拒绝」——最难解释的一类现象。
  c_email_regex   constant text := '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$';
  c_max_email_len constant int  := 254;
  c_min_content   constant int  := 5;
  c_max_content   constant int  := 1000;
  -- 三重限流：全站挡洪水、IP 挡单机、邮箱挡换 IP 刷同一个人
  c_rate_global   constant int  := 10;  -- 全站 / 1 分钟
  c_rate_ip       constant int  := 5;   -- 同一 IP   / 1 小时
  c_rate_email    constant int  := 3;   -- 同一邮箱 / 1 小时

  v_email   text;
  v_content text;
  v_ip      text;
  v_ip_hash text;
  v_n       int;
begin
  -- PostgREST 里缺字段就是 null，先归一成空串
  v_email   := btrim(coalesce(p_email, ''));
  v_content := btrim(coalesce(p_content, ''));

  -- ---- 校验（顺序：邮箱 → 内容）----
  if v_email = ''
     or length(v_email) > c_max_email_len
     or v_email !~ c_email_regex then
    return jsonb_build_object('ok', false, 'code', 'invalid_email');
  end if;

  if length(v_content) < c_min_content
     or length(v_content) > c_max_content then
    return jsonb_build_object('ok', false, 'code', 'invalid_content');
  end if;

  -- ---- 访客 IP：PostgREST 把请求头塞在 request.headers 里 ----
  -- missing_ok = true：非 HTTP 环境（比如在 SQL Editor 里手调）不会抛错。
  -- 整个块再包一层 exception，防的是 header 不是合法 JSON 的情况。
  begin
    v_ip := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1  -- x-forwarded-for 是逗号分隔链，第一个才是原始客户端
    );
  exception when others then
    v_ip := null;
  end;
  v_ip := nullif(btrim(coalesce(v_ip, '')), '');
  if v_ip is not null then
    v_ip_hash := md5(v_ip);
  end if;

  -- ---- 限流 ①：全站（防洪水）----
  select count(*) into v_n
    from public.guestbook_messages
   where created_at > now() - interval '1 minute';
  if v_n >= c_rate_global then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- ---- 限流 ②：同一邮箱 ----
  select count(*) into v_n
    from public.guestbook_messages
   where email = v_email
     and created_at > now() - interval '1 hour';
  if v_n >= c_rate_email then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- ---- 限流 ③：同一 IP ----
  -- 取不到 IP 就跳过这条，**不能因为取不到就一律拒绝**（否则线上代理环境下全员发不出）。
  if v_ip_hash is not null then
    select count(*) into v_n
      from public.guestbook_messages
     where ip_hash = v_ip_hash
       and created_at > now() - interval '1 hour';
    if v_n >= c_rate_ip then
      return jsonb_build_object('ok', false, 'code', 'rate_limited');
    end if;
  end if;

  insert into public.guestbook_messages (email, content, ip_hash)
  values (v_email, v_content, v_ip_hash);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.post_guestbook_message(text, text) is
  '留言板唯一写入口。服务端校验 + 三重限流（全站/邮箱/IP），返回 {ok:true} 或 {ok:false, code}。';

-- 只给匿名调用权；默认授予 public 的执行权收回
revoke all on function public.post_guestbook_message(text, text) from public;
grant execute on function public.post_guestbook_message(text, text) to anon, authenticated;


-- ============================================================================
-- 跑完后的自检（把这几条单独选中执行，看输出对不对）
-- ============================================================================
-- ① 表在、RLS 开着、策略数必须是 0
--    select relrowsecurity as rls_on,
--           (select count(*) from pg_policies
--             where schemaname='public' and tablename='guestbook_messages') as policies
--      from pg_class where oid = 'public.guestbook_messages'::regclass;
--    期望：rls_on = true，policies = 0
--
-- ② anon 对表不能有表级权限（期望：0 行）
--    select grantee, privilege_type
--      from information_schema.role_table_grants
--     where table_name = 'guestbook_messages' and grantee in ('anon','authenticated');
--
-- ③ 函数存在且 anon 可执行（期望：1 行）
--    select has_function_privilege('anon',
--             'public.post_guestbook_message(text,text)', 'execute') as anon_can_execute;
--
-- ④ 真发一条（会写入！只在你确定要留这条时跑）
--    select public.post_guestbook_message('test@example.com', '这是一条来自 SQL Editor 的测试留言');
--    期望：{"ok": true}
--
-- ⑤ 连发 4 条同邮箱 → 第 4 条应当是 {"ok": false, "code": "rate_limited"}
--    （配合 ④ 的 1 条，共 4 条）
--    select public.post_guestbook_message('test@example.com', '限流测试 2');
--    select public.post_guestbook_message('test@example.com', '限流测试 3');
--    select public.post_guestbook_message('test@example.com', '限流测试 4');  -- ← 这条被限流
--
-- ⑥ 清掉测试数据
--    delete from public.guestbook_messages where email = 'test@example.com';
