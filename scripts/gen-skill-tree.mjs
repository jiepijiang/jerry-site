/**
 * 生成技能树 SVG
 * ---------------------------------------------------------------------------
 * 原技能树（复刻对象 xywml.com 的）是一面 36 个图标的技术墙，里面混着
 * Go / Java / Qt / Kotlin / IntelliJ / Photoshop / 3ds Max / R 这些跟本站定位
 * 对不上的东西，所以整体重做。
 *
 * 现在的选型按 Jerry 自己的定位来：**前端技术栈（H5 / 小程序 / App / Electron），
 * 项目主要是做嵌入式设备，同时在学 AI 做全栈项目**。
 * 排列顺序 = 「前端 & 跨端」一行 + 「工程化 / 服务端 / 嵌入式 / AI」一行。
 *
 * 图标数据在 `scripts/skill-icons.json`（来源：simple-icons 官方品牌 SVG，CC0）。
 * 之所以把数据单独抽出来，是为了让这个脚本**零依赖** —— 不用为了重新生成
 * 一面图标墙去装一个几十 MB 的包，图标集也就跟着仓库一起被版本化固定住了。
 * 想换图标：改 JSON 里的数组（顺序 = 排列顺序），然后
 *
 *     node scripts/gen-skill-tree.mjs
 *
 * 版式**刻意与原版逐项一致**，这样渲染尺寸不变、页面总高不受影响：
 *   方块 256×256、圆角 rx=60、底色 #242938、间距 44（列距 300）
 *   PC  18 列 × 2 行 → viewBox 0 0 5356 556，外层 1004.25×104.25
 *   WAP  8 列 × 5 行 → viewBox 0 0 2356 1456，外层 441.75×273
 * 改这些参数会改变 <img> 的宽高比，进而影响首页总高，慎改。
 *
 * 注：JSON 里 `custom: true` 的那条是**自绘**的（simple-icons 没有 uni-app），
 * 形状是手写的 path，不是从任何地方扒的。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/static/svg')
const ICONS = JSON.parse(readFileSync(resolve(ROOT, 'scripts/skill-icons.json'), 'utf8'))

/** 方块与网格参数（照抄原版，别改） */
const TILE = 256
const GAP = 44
const PITCH = TILE + GAP
const RADIUS = 60
const BG = '#242938'
/** 图标在方块里的留白：两侧各 50，图标实占 156 */
const PAD = 50
/** simple-icons 的画布是 24×24 */
const SCALE = (TILE - PAD * 2) / 24
/** 原版外层尺寸 / viewBox 的比例，PC 与 WAP 都是 0.1875 */
const OUTER_K = 0.1875

const GRIDS = [
  { file: 'skillPc.svg', cols: 18 },
  { file: 'skillWap.svg', cols: 8 },
]

/**
 * 深色底上不够亮的图标统一提亮成白色。
 * 原版也是这么处理的（GitHub / Next.js / Vercel 在图上都是白的）。
 *
 * 判断依据是**相对亮度**，阈值 0.22 —— 只捞纯黑/近黑的 logo。
 * 注意别用「对比度」去卡：npm 的红 #CB3837 亮度 0.34、WCAG 对比度只有 2.87，
 * 比 MySQL 的 3.10 还低，但它是整块实心方块，读起来一点问题没有。
 * 真正决定可读性的是**填充面积**，不是颜色，所以细描边的图标单独列在下面。
 */
const toReadable = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum < 0.22 ? '#ffffff' : `#${hex}`
}

/**
 * 亮度过关、但因为是「细描边 / 深色实心块」而在深色底上糊掉的，逐个提亮。
 * 这两个都是放大 4 倍逐块看出来的，光看颜色值看不出来：
 *   - MySQL    #4479A1，细描边海豚 + 「MySQL」小字，线宽不到 2px
 *   - VitePress #5C73E7，深蓝实心书签，和底色 #242938 几乎连成一片
 */
const FORCE_WHITE = new Set([
  'siMysql',
  'siVitepress',
])

const tile = (icon, x, y) =>
  `<g transform="translate(${x}, ${y})">` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" fill="none" viewBox="0 0 ${TILE} ${TILE}">` +
  `<rect width="${TILE}" height="${TILE}" fill="${BG}" rx="${RADIUS}"/>` +
  `<path fill="${FORCE_WHITE.has(icon.key) ? '#ffffff' : toReadable(icon.hex)}" d="${icon.path}" ` +
  `transform="translate(${PAD}, ${PAD}) scale(${SCALE.toFixed(4)})"/>` +
  `</svg></g>`

const build = (cols) => {
  const rows = Math.ceil(ICONS.length / cols)
  const width = cols * TILE + (cols - 1) * GAP
  const height = rows * TILE + (rows - 1) * GAP
  const body = ICONS.map((icon, i) =>
    tile(icon, (i % cols) * PITCH, Math.floor(i / cols) * PITCH)
  ).join('\n')

  return {
    svg:
      `<svg width="${(width * OUTER_K).toFixed(2)}" height="${(height * OUTER_K).toFixed(2)}" ` +
      `viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">\n` +
      `${body}\n</svg>\n`,
    cols,
    rows,
    width,
    height,
  }
}

mkdirSync(OUT_DIR, { recursive: true })

for (const { file, cols } of GRIDS) {
  const r = build(cols)
  writeFileSync(resolve(OUT_DIR, file), r.svg, 'utf8')
  console.log(
    `${file}: ${ICONS.length} 个图标, ${r.cols}×${r.rows}, ` +
      `viewBox ${r.width}×${r.height}, 外层 ${(r.width * OUTER_K).toFixed(2)}×${(r.height * OUTER_K).toFixed(2)}`
  )
}
