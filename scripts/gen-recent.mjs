/**
 * 生成「最近在做什么」的数据
 * ---------------------------------------------------------------------------
 * 为什么不在浏览器里直接请求 GitHub API：
 *   未登录的 api.github.com 限流是 **60 次/小时/IP**，而且是**按出口 IP** 算的。
 *   走代理上网时出口 IP 是共享的，很容易被别人用光 —— 实测浏览器请求直接吃 403，
 *   首页那一块就只剩一句「暂时取不到 GitHub 数据」。
 *   直连反而没事，所以这个坑只有真实访客会踩到，本地调试看不出来。
 *
 * 所以改成**构建期拉一次**，把结果落到 `public/static/data/recent.json`：
 *   - 运行时零外部依赖，永远不会空
 *   - CI 里带 GITHUB_TOKEN 跑，额度 5000/小时，不会限流
 *   - 存的是**绝对时间戳**（pushedAt），相对时间由前端渲染时算，
 *     所以哪怕数据是昨天生成的，「3 小时前」也依然准确
 *
 * 用法：
 *     node scripts/gen-recent.mjs              # 未登录（本地够用）
 *     GITHUB_TOKEN=xxx node scripts/gen-recent.mjs   # CI 里用
 *
 * **拉取失败时不会覆盖已有文件** —— CI 里一次网络抖动不该把线上数据清空。
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/static/data/recent.json')

/** 与 src/data/site.js 的 github 保持一致 */
const USERNAME = 'jiepijiang'
const LIMIT = 4

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const url = `https://api.github.com/users/${USERNAME}/repos?sort=pushed&per_page=100`

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'jerry-site-build',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
}

console.log(`拉取 ${USERNAME} 的仓库…${token ? '（带 token）' : '（未登录）'}`)

let list
try {
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText} ${body.slice(0, 160)}`)
  }
  list = await res.json()
} catch (err) {
  console.error(`✗ 拉取失败：${err.message}`)
  if (existsSync(OUT)) {
    console.error('  已保留现有 recent.json，不覆盖。')
    process.exit(0)
  }
  console.error('  且本地没有可用的 recent.json，写入一个空结构兜底。')
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ username: USERNAME, generatedAt: null, repos: [] }, null, 2) + '\n')
  process.exit(0)
}

const repos = list
  .filter((r) => !r.fork) // fork 只代表兴趣，不算「我在做什么」
  .slice(0, LIMIT)
  .map((r) => ({
    name: r.name,
    url: r.html_url,
    description: r.description || '',
    language: r.language || '',
    /** 绝对时间戳 —— 相对时间交给前端算，避免数据放一天就过期 */
    pushedAt: r.pushed_at,
  }))

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({ username: USERNAME, generatedAt: new Date().toISOString(), repos }, null, 2) + '\n'
)

console.log(`✓ 写入 ${repos.length} 个仓库 → public/static/data/recent.json`)
for (const r of repos) {
  const lang = (r.language || '-').padEnd(12)
  console.log(`    ${r.name.padEnd(16)} ${lang} ${r.pushedAt}`)
}
