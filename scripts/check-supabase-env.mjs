#!/usr/bin/env node
/**
 * 构建期核对 Supabase 的两个环境变量。
 * ---------------------------------------------------------------------------
 * ## 为什么需要一个真脚本
 *
 * 这一步原来是这么写的（`.github/workflows/deploy.yml`）：
 *
 *     echo "✅ 已注入 Supabase：$VITE_SUPABASE_URL（anon key 长度 ${#KEY}）"
 *
 * 那只是**打印**，不是**判断**。
 *
 * 2026-10-01 的实际经过：Jerry 从剪贴板粘 anon key 时，尾巴上带了 CRLF
 * （208 字符 → 210 字符）。这行老老实实把 `长度 210` 打了出来 —— 然后放行。
 * 真正的检查是零。后面两条 `grep` 只查 URL 和 RPC 路径，**密钥本身一个字都没查**。
 * 结果是线上 bundle 里烧进去一个带尾随换行的 key。
 *
 * （那次没出事，是因为 Fetch 规范要求 header 值先做归一化、剥掉首尾 HTTP 空白，
 *   浏览器替我们擦了屁股。但这是运气，不是设计。）
 *
 * ## 判断分两档，不要混
 *
 *   **致命** —— 会真的坏掉，或者会泄漏权限，必须让构建红：
 *     · key 里**中间**夹了空白
 *     · role 不是 `anon`
 *     · key 的 ref 和 URL 的 ref 不是同一个项目
 *     · key 已过期
 *     · URL / key 形状根本不对
 *
 *   **警告** —— 只是不干净，功能不受影响，不该挡发布：
 *     · 首尾有空白（`site.js` 会 `.trim()` 兜住）
 *
 * 之所以要分开，是因为「为了一个不影响功能的问题把构建搞红」会训练人忽略红灯 ——
 * 那比不检查还糟。但**中间**夹空白不一样，它 `trim()` 救不了，见下。
 *
 * ## 为什么「中间有空白」是致命的
 *
 * `src/data/site.js` 里那句 `.trim()` 只剥首尾。中间夹一个换行的话：
 *
 *     new Headers({ apikey: 'eyJ…\n…' })
 *     → TypeError: Failed to construct 'Headers': Invalid value
 *
 * 每次提交都抛，留言板等于废掉；而且**本地变量是干净的，永远复现不出来**
 * —— 跟「未登录直连 api.github.com 限流」是同一类坑：只有真实访客看得见。
 *
 * ## 用法
 *
 *   npm run check:env                  # 读 process.env
 *   node scripts/check-supabase-env.mjs
 *
 * 退出码：0 = 可以发布；1 = 有问题（CI 里直接红）。
 */

const inCI = process.env.GITHUB_ACTIONS === 'true'

const errors = []
const warnings = []

/** GitHub Actions 的注解在本地跑时没有意义，所以只在 CI 里用 */
const warn = (title, msg) => {
  warnings.push(`${title}：${msg}`)
  console.log(inCI ? `::warning title=${title}::${msg}` : `⚠️  ${title}\n   ${msg}`)
}
const error = (title, msg) => {
  errors.push(`${title}：${msg}`)
  console.log(inCI ? `::error title=${title}::${msg}` : `❌ ${title}\n   ${msg}`)
}

const okLine = (msg) => console.log(`✅ ${msg}`)

/* ------------------------------------------------------------------ */
/* 取值                                                                */
/* ------------------------------------------------------------------ */

const rawUrl = process.env.VITE_SUPABASE_URL ?? ''
const rawKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''

/*
 * 两个都缺 = 「这个项目就是没接后端」，不是错误。
 * site.js 里 endpoint 为空 → 留言板走本地假成功（控制台留痕）。
 * 这是**有意支持**的状态（本地开发、fork 出去的人），不能报红。
 */
if (!rawUrl && !rawKey) {
  warn(
    '未注入 Supabase 配置',
    '留言板将退回本地假成功（不会真正写入）。要接上的话，在 Settings → Secrets and variables → Actions → Variables 里配 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。',
  )
  console.log('\n· 跳过其余检查（本来就没配）')
  process.exit(0)
}

/* 只配一个 = 配置错了。两个都配才算配置好（site.js 里也是这么判的）。 */
if (!rawUrl || !rawKey) {
  const missing = !rawUrl ? 'VITE_SUPABASE_URL' : 'VITE_SUPABASE_ANON_KEY'
  error(
    'Supabase 只配了一半',
    `缺 ${missing}。两个都要有才算配置好 —— 只配一个的话请求会 401，还不如当作「没配」，至少行为可预期。`,
  )
}

/* ------------------------------------------------------------------ */
/* 空白：先判，因为后面所有解析都建立在「去掉首尾空白」之上            */
/* ------------------------------------------------------------------ */

const url = rawUrl.trim()
const key = rawKey.trim()

const checkWhitespace = (label, raw, trimmed) => {
  if (raw !== trimmed) {
    warn(
      `${label} 首尾有空白`,
      `变量里存的是 ${raw.length} 个字符，去掉首尾空白后是 ${trimmed.length} 个。` +
        `site.js 会 .trim() 兜住，所以不影响功能；但请把它重新贴一遍 —— ` +
        `贴的时候注意别把换行一起复制进去。`,
    )
  }
  if (/\s/.test(trimmed)) {
    const idx = [...trimmed].findIndex((c) => /\s/.test(c))
    error(
      `${label} 中间有空白`,
      `第 ${idx} 个字符是空白（码点 ${trimmed.codePointAt(idx)}）。` +
        `这个 .trim() 救不了：\`new Headers({...})\` 会抛 ` +
        `\`TypeError: Failed to construct 'Headers': Invalid value\`，每次提交都失败，` +
        `而本地变量是干净的、永远复现不出来。**必须重新贴一遍变量值。**`,
    )
  }
}

checkWhitespace('VITE_SUPABASE_URL', rawUrl, url)
checkWhitespace('VITE_SUPABASE_ANON_KEY', rawKey, key)

/* ------------------------------------------------------------------ */
/* URL 形状                                                            */
/* ------------------------------------------------------------------ */

const urlMatch = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/.exec(url)
if (!urlMatch) {
  error(
    'VITE_SUPABASE_URL 形状不对',
    `期望 https://<ref>.supabase.co，实际是 ${JSON.stringify(url)}。` +
      `注意别把 /rest/v1 之类的路径带上。`,
  )
}
const urlRef = urlMatch ? urlMatch[1] : null

/* ------------------------------------------------------------------ */
/* anon key：必须是 JWT，且必须是 anon 角色                             */
/* ------------------------------------------------------------------ */

let payload = null

if (key) {
  const parts = key.split('.')
  if (parts.length !== 3) {
    error(
      'VITE_SUPABASE_ANON_KEY 不是 JWT',
      `按 '.' 切成 ${parts.length} 段（应该是 3 段）。` +
        `多半是复制的时候少了一段或者多带了别的字符。长度 ${key.length}。`,
    )
  } else {
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    } catch (e) {
      error('VITE_SUPABASE_ANON_KEY 的 payload 解不出来', `base64url 解码后不是合法 JSON：${e.message}`)
    }
  }
}

if (payload) {
  /*
   * 这条是这个脚本里**最值钱**的一条断言。
   *
   * 把 service_role key 贴进一个 `VITE_` 变量，它就会被静态替换进 bundle、
   * 发给每一个访客 —— 而 service_role 是**绕过 RLS** 的。等于把全库的读写权限
   * 公开出去。这个错误以前没有任何地方会拦。
   */
  if (payload.role !== 'anon') {
    error(
      'VITE_SUPABASE_ANON_KEY 的 role 不是 anon',
      `实际是 ${JSON.stringify(payload.role)}。` +
        `如果是 service_role，它会绕过 RLS 并被公开进 bundle —— ` +
        `立刻去 Supabase 后台把这个 key 轮换掉，然后换成 anon key。`,
    )
  }

  if (urlRef && payload.ref && payload.ref !== urlRef) {
    error(
      'URL 和 anon key 不是同一个 Supabase 项目',
      `URL 的 ref 是 ${urlRef}，key 的 ref 是 ${payload.ref}。` +
        `两个变量多半是从不同项目分别复制的 —— 这样请求会 401。`,
    )
  }

  if (typeof payload.exp === 'number') {
    const exp = new Date(payload.exp * 1000)
    if (exp.getTime() < Date.now()) {
      error('VITE_SUPABASE_ANON_KEY 已过期', `过期时间 ${exp.toISOString()}。去 Supabase 后台重新取一个。`)
    }
  } else {
    warn('anon key 里没有 exp', '读不到过期时间，无法判断有没有过期（老的 legacy key 可能没有这个字段）。')
  }
}

/* ------------------------------------------------------------------ */
/* 汇总                                                                */
/* ------------------------------------------------------------------ */

if (errors.length === 0) {
  const exp = payload?.exp ? new Date(payload.exp * 1000).toISOString().slice(0, 10) : '未知'
  okLine(`Supabase 配置可用：${url}`)
  okLine(`anon key 长度 ${key.length}，role=${payload?.role ?? '未知'}，ref=${payload?.ref ?? '未知'}，过期 ${exp}`)
  if (warnings.length) {
    console.log(`· 有 ${warnings.length} 条警告（不影响发布，但建议清掉）`)
  }
  process.exit(0)
}

console.log(`\n❌ Supabase 配置有 ${errors.length} 处问题，已拦下这次发布。`)
for (const e of errors) console.log(`   · ${e}`)
process.exit(1)
