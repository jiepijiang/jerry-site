# Jerry Site

基于 **Vue 3 + Vite** 的个人主页门户。

> **定位**
>
> 前端技术栈：**H5 / 小程序 / App / Electron**；主要项目方向是**嵌入式设备**；
> 同时在学 AI、做全栈相关的项目。主力技术栈 Vue、React、原生 JS、uni-app、
> Electron、Node.js（App 先用 uni-app，之后用 AI 重构到 Flutter）。

> **参考来源**
>
> 本项目参考 [**https://xywml.com/**](https://xywml.com/) 实现 —— 除文案内容
> （站名、简介、卡片标题等）外，**UI、动效、布局均按该站点 1:1 复刻**。
> 复刻保真度已用 Playwright 做像素级比对验证，见下方「复刻保真度」。

> **当前进度：第三版**
>
> 视觉与交互与原站对齐；**内容已全部换成自己的** —— 文案、时间轴、技能树、
> 首屏的「最近在做什么」（原站那里是复刻对象的 GitHub 贡献图）。
> 仍在用原站资源的只剩头像 / 背景 / 项目卡片配图（`public/static/img/`）。

> **仓库名沿革**
>
> 原名 `jerry-blog`，2026-09 改名为 **`jerry-site`** —— 本站定位为个人门户，
> 博客部分后续会拆成独立仓库并新增独立入口。改名的连带改动见下方「在线预览」。

---

## 快速开始

```bash
npm install
npm run dev      # 开发预览 http://127.0.0.1:5173
npm run build    # 产出 dist/
npm run preview  # 预览构建产物
```

---

## 在线预览

推送到 `main` 分支后会自动构建并发布到 GitHub Pages（见 `.github/workflows/deploy.yml`）：

**https://jiepijiang.github.io/jerry-site/**

几个和部署相关的点：

- 站点挂在 `/<仓库名>/` 子路径下，所以 `vite.config.js` 顶部的 `REPO_NAME` 必须和仓库名一致。
  换仓库名、或之后改用自定义域名 / 用户主页仓库（`<用户名>.github.io`），改那一行即可。
- 资源路径不能写死成 `/static/...`。Vite 只会重写 `index.html` 和 CSS 里的绝对路径，
  JS 字符串得用 `src/data/site.js` 里那个 `asset()` 助手包一层。
- 构建时会额外产出一份 `404.html`（内容同 `index.html`）。GitHub Pages 没有 SPA fallback，
  直接打开或刷新 `/jerry-site/chat` 时靠它回退，前端路由再接管。
  这种回退的 HTTP 状态码仍是 404，属于该方案的固有代价；站内点击链接是前端跳转，不受影响。
- 首次部署后如果页面 404，去仓库 **Settings → Pages** 确认 Source 选的是
  **GitHub Actions**（而不是 "Deploy from a branch"）。

> **改名的连带影响（`jerry-blog` → `jerry-site`）**
>
> 1. 旧地址 `https://jiepijiang.github.io/jerry-blog/` **会失效**。
>    GitHub 只对仓库页做重定向，**Pages 站点地址不重定向**，必须用新地址。
> 2. `vite.config.js` 的 `REPO_NAME`、`package.json` / `package-lock.json` 的 `name`、
>    `index.html` 的标题与 meta、README 里的地址都已同步。
> 3. 音乐播放器的偏好键由 `jerry-blog:music-prefs` 改为 `jerry-site:music-prefs`，
>    旧键不再读取 —— 音量 / 播放模式会回到默认值，一次性。
> 4. 姊妹项目 **jerry-tools** 里指向本站的链接已一并更新。

---

## 参考来源与声明

- **复刻对象**：[https://xywml.com/](https://xywml.com/)（原站站长 Miyako）
- 本项目仅用于学习与个人使用，**未获得原站作者的明确授权**。
- `public/static/` 下的素材（头像、背景图、项目图标、贡献图 SVG、技能树 SVG、
  字体）均来自原站，版权归原作者所有，**请在正式使用前替换成你自己的资源**
  （替换方法见文末）。
- 复刻过程中发现的「原站写了但没生效的规则」，逐条记录在下方「与原站的已知差异」中。

---

## 目录结构

```
.
├── index.html                  # 入口（含首屏 body 内联样式，与原站一致）
├── vite.config.js
├── public/static/
│   ├── fonts/                  # Ubuntu（正文）、Pacifico（渐变标题）
│   ├── img/                    # 头像、背景、项目卡片图标
│   ├── music/                  # 歌单音频与封面（《夜航》为原创纯音乐）
│   └── svg/                    # 技能树（由脚本生成；原站的贪吃蛇已移除）
├── scripts/
│   ├── gen-skill-tree.mjs      # 技能树 SVG 生成器（零依赖）
│   └── skill-icons.json        # 图标数据（simple-icons 导出的品牌 path）
└── src/
    ├── main.js
    ├── App.vue                 # 全局壳：加载动画 / 路由 / 音乐幕帘 / 灯箱
    ├── router/index.js
    ├── data/site.js            # ★ 全部文案与卡片配置都在这里
    ├── styles/
    │   ├── root.css            # 主题 CSS 变量
    │   ├── base.css            # reset / 字体 / body / 通用动画
    │   ├── loader.css          # 星云加载动画
    │   ├── music-curtain.css   # 音乐幕帘
    │   └── chat.css            # 留言板
    ├── composables/
    │   ├── useTheme.js         # 主题（localStorage → 系统偏好，见「已知差异」）
    │   ├── useFps.js           # FPS 计数器
    │   ├── useTyping.js        # 打字机
    │   └── useLightbox.js      # 图片灯箱状态
    ├── components/
    │   ├── StarLoader.vue      # 星云加载层（星点 / 流星 / 行星 / 陨石坑）
    │   ├── LeftSidebar.vue     # 头像 / 信息 / 标签 / 时间轴
    │   ├── ProfileHeader.vue   # 渐变标题 / 打字简介 / 图标条 / FPS / 最近在做什么
    │   ├── SectionTitle.vue
    │   ├── ProjectList.vue
    │   ├── ProjectCard.vue     # 悬停展开动效 + 按下反馈
    │   ├── SkillTree.vue
    │   ├── SiteFooter.vue
    │   ├── ImageLightbox.vue
    │   ├── MusicCurtain.vue
    │   ├── MusicPlayer.vue
    │   └── AppIcon.vue         # 内联图标集
    └── views/
        ├── HomeView.vue        # /
        └── GuestbookView.vue   # /chat
```

---

## 改内容

打开 `src/data/site.js`，所有可见文案、卡片、标签、时间轴、歌单都在里面：

| 导出 | 作用 |
| --- | --- |
| `profile` | 站名、头像、`Hello I'm` 前缀、两行简介（第二行走打字机） |
| `locations` / `tags` / `timeline` | 左侧三块卡片 |
| `socials` | 图标条（`action: 'music'` 表示点击打开音乐幕帘） |
| `siteProjects` / `toolProjects` | 两组项目卡片 |
| `github` | 首屏「最近在做什么」：显示最近推送的仓库。数据**构建期**生成，见下（原站这里是贪吃蛇贡献图） |
| `skills` | 技能树 SVG（桌面 / 移动两版）。**由脚本生成**，见下 |
| `footer` | 备案号（默认留空，见下）与版权 |

> **关于 `footer.icp`**：这里原先是复刻对象 xywml.com 的备案号
> （`蜀ICP备2023008720号-2`），已清空 —— 备案号绑定具体域名与主体，
> 挂别人的号属于冒用；本站托管在 GitHub Pages（境外），本来也不需要备案。
> 将来迁回国内主机时把自己的号填回去即可，`SiteFooter.vue` 会处理空值。
| `guestbook.endpoint` | 留言板接口；留空则走本地成功流程（成功后 3 秒跳回首页，与原站一致） |
| `playlist` | 播放器歌单（`cover` / `src` 填上即可真实播放） |

### 时间轴的日期

`timeline` 里的日期尽量用**可查证的事实**（`src/data/site.js` 顶部注释列了每条的出处）：

| 条目 | 日期 | 依据 |
| --- | --- | --- |
| 自建知识库与导航站 | 2026.9 | jerry-site / jerry-tools / jerry-notes 创建于 2026-09 |
| 扫码 H5 · 停车码 | 2025.10 | `scanCode-demo`（H5 调摄像头扫码）创建于 2025-10-29 |
| 折腾 Next.js 博客 | 2022.3 | `nextjs-blog-theme` 创建于 2022-03-10 |
| 微信小程序 | 2020.5 | `yougoushop` 创建于 2020-05-15 |
| 注册 GitHub | 2019.1 | 账号创建于 2019-01-02 |

> ⚠️ **`前端 + 嵌入式前端 2023.1` 这一条的日期是推断的，不是查到的。**
> 公开仓库在 2023.1 之后断了近三年，据此推断这段时间在做嵌入式前端。
> 请改成真实时间，或者直接删掉这条。

原先那版里的 `购置域名 2022.8` / `购买服务器 2021.3` / `开始折腾 2016.7`
是从复刻对象继承来的（基本可以确定是原站站长的日期），已全部换掉。

### 技能树是生成的，不要手改 SVG

`public/static/svg/skillPc.svg` / `skillWap.svg` 由脚本产出。原来的那面图标墙是
复刻对象的（混着 Go / Java / Qt / Kotlin / IntelliJ / Photoshop / 3ds Max），
跟本站的定位对不上，已整体重做。

现在的 36 个图标按**前端技术栈（H5 / 小程序 / App / Electron）+ 嵌入式设备 + AI 全栈**
来选，分两行：

| 行 | 内容 |
| --- | --- |
| 1 | Vue · React · JavaScript · TypeScript · HTML5 · CSS · Vite · Node.js · uni-app · Electron · Flutter · 微信小程序 · Android · iOS · Tailwind CSS · Sass · Git · GitHub |
| 2 | npm · pnpm · ESLint · GitHub Copilot · GitHub Actions · Express · MySQL · SQLite · Redis · Docker · NGINX · Linux · Arduino · Raspberry Pi · MQTT · Python · LangChain · Ollama |

> **uni-app 那个图标是自绘的**（JSON 里标了 `custom: true`）——
> simple-icons 里没有它，这里用一个几何化的 U 字形代替官方 logo，
> 既避开商标/授权问题，形状也和这面墙的几何风格一致。
> 其余 35 个都来自 simple-icons（官方品牌 SVG，CC0）。
> 注：simple-icons 已下架 OpenAI 和 VS Code，所以这两个用不了。

改图标清单 → 编辑 `scripts/skill-icons.json`（顺序即排列顺序）→ 然后：

```bash
node scripts/gen-skill-tree.mjs
```
数据单独放在 JSON 里是为了让生成器**零依赖** —— 不用为了重新生成一面图标墙
去装一个几十 MB 的包，图标集也跟着仓库一起被版本化固定住。

**版式参数与原版逐项一致**（方块 256、圆角 60、底色 `#242938`、列距 300），
所以渲染尺寸不变、首页总高不受影响：

| 文件 | 网格 | viewBox | 外层尺寸 |
| --- | --- | --- | --- |
| `skillPc.svg` | 18 列 × 2 行 | `0 0 5356 556` | 1004.25 × 104.25 |
| `skillWap.svg` | 8 列 × 5 行 | `0 0 2356 1456` | 441.75 × 273 |

改这些参数会改变 `<img>` 的宽高比，进而影响页面总高（基准见下节），慎改。

> 深色底上不够亮的图标会被自动提亮成白色（阈值：相对亮度 < 0.22）。
> 另外有两个「亮度过关但因为是细描边而糊掉」的，在脚本的 `FORCE_WHITE`
> 里单独列了：**MySQL**（深蓝细描边海豚 + 小字）和 **VitePress**（深蓝实心书签）。
> 别用 WCAG 对比度去卡这件事 —— npm 的红对比度只有 2.87，比 MySQL 的 3.10 还低，
> 但它是整块实心方块，读起来毫无问题。**决定可读性的是填充面积，不是颜色。**

### 「最近在做什么」的数据也是构建期生成的

`public/static/data/recent.json` 由 `scripts/gen-recent.mjs` 产出，**前端不再直连
`api.github.com`**：

```bash
GITHUB_TOKEN=xxx node scripts/gen-recent.mjs   # 不带 token 也能跑，只是限额低
```

> ⚠️ **别把这段改回运行时请求。** 一开始就是在浏览器里 fetch 公开 API 的，
> 本地调试一切正常，线上却整块显示「暂时取不到 GitHub 数据」——
> 未登录 API 限额是 **60 次/小时/出口 IP**，走代理时这个 IP 是**所有访客共享**的，
> 所以只有真实访客会踩到，本地开发机（直连、独立 IP）永远复现不出来。
> 改成构建期生成后，运行时对 GitHub 的请求数是 **0**。

几个刻意的设计：

- **失败时绝不覆盖已有文件**（`existsSync(OUT)` 直接退出 0）。CI 偶发抖动时
  宁可线上继续用昨天的数据，也不能把页面刷成空白。
- 存的是**绝对时间戳**（`pushedAt`），「1 小时前」这类相对时间由前端实时算，
  所以一份静态数据放多久都不会显示成「0 分钟前」。
- 本地没有 `GITHUB_TOKEN` 时用未登录接口；GitHub Actions 里注入 `secrets.GITHUB_TOKEN`
  （限额 5000/小时）。
- 工作流里加了每日定时（`cron: '17 21 * * *'`，UTC 21:17 = 北京 05:17），
  即使不推代码也会刷新一次数据。

---

## 复刻保真度

比对方法：用 Playwright 分别加载原站与本地项目，
① 对比关键元素的 `getBoundingClientRect()` 与关键计算样式；
② 冻结动画后逐像素比对。

**结果**

> 下表是**文案还沿用原站时**测的，记录的是「布局 / 动效 / 交互」的还原度。
> 2026-09-19 起内容逐步换成自己的（文案、技能树、首屏那一块），凡是含内容的区域
> 必然出现差异，**结构性骨架不受影响**。
>
> 已知的两处由「内容替换」带来的高度变化，都不是回归：
>
> - 页脚清掉冒用的备案号后，`footer` 由 1440×38 变成 **1440×34**。
>   因为 `line-height: normal` 下纯拉丁文案的行盒（14px）比含中文的（18px）矮；
>   页脚是 `absolute + bottom:0` 不参与文档流，所以当时页面总高没变。
> - 首屏贪吃蛇换成「最近在做什么」后，页面总高 **1118 → 1115**。
>   原站那张 `<img>` 是行内元素，底部有约 3px 的基线间隙；新块是 flex 容器没有这个间隙。
>   新块的容器保留了原图 `880 / 192` 的宽高比，所以盒子本身没动，只是少了那 3px。
> - 窄屏（≤800px）下这一块改成**上下两行**（仓库名一行、`语言 · 时间` 一行），
>   所以 700 / 375 两档各 **+24px**（2137 → 2161、1745 → 1769）。
>   原先单行排布会把 `scanCode-demo` 截成 `scanCode-` —— 而且**没有省略号**，
>   因为 `text-overflow: ellipsis` 对 flex 容器不生效，必须套在真正包着文字的块级元素上
>   （见 `ProfileHeader.vue` 的 `.recent-label`）。

| 检查项 | 结果 |
| --- | --- |
| 首页关键元素盒模型（坐标 / 宽高 / 字号 / 字重 / 颜色） | 22 项全部 0px 偏差 |
| 留言板关键元素盒模型（卡片 / 输入框 / 按钮 / 页脚等 17 项） | Light、Dark 两套主题下均 0px 偏差 |
| 留言板图标上色（6 个 SVG 的 `fill`） | 与原站完全一致 |
| 页面总高（1440 宽） | 原站 1118px；本站 1115px（差值见上方说明） |
| 响应式 1000×900 / 700×900 / 375×812 | 原站 1327 / 2160 / 1697；本站 1324 / 2161 / 1769（差值见上方说明） |
| 左侧栏 / 卡片区 / 技能树 / 页脚 像素差异 | 0 差异像素 |
| 首页整页像素差异 | 0.57%，全部来自「站名文字不同」与「动画帧不同」 |
| 留言板整页像素差异（Light / Dark） | 0.36% / 0.35%，仅站名与版权两行文字 |
| 卡片悬停（图标收起 35→0、标题 16→18px） | 一致 |
| 灯箱开 / 关（`visibility`、`body.overflow`） | 一致 |
| 音乐幕帘开 / 关 / Esc（`-1000 → 0 → -1000`） | 一致 |
| `/chat` 加载层变体（`chat-variant` 深色背景） | 一致 |
| 表单校验（空表单 / 非法输入 / 成功提交） | 文案、`.show`、红框数、shake 动画、3 秒跳转 全部一致 |
| 主题真值表（cookie × localStorage × 系统偏好 8 种组合） | 与原站逐条一致 |
| 生产构建 | 无控制台报错、无 404 资源 |

---

## 与原站的已知差异

复刻过程中发现原站有几处「写了但没生效」的规则，处理方式如下：

1. **主题变量**：原站 `root.css` 把 5 套主题塞进同一个 `html{}` 规则，后者覆盖前者，
   最终恒定为主题 5（深色毛玻璃），`data-theme` 实际只影响贪吃蛇配色与加载动画场景。
   本项目如实保留该行为，并把其余主题以注释形式留在 `src/styles/root.css` 备用。
2. **主题逻辑（三套互相打架）**：原站首页 `script.js`、留言板内联脚本、以及两页都加载的
   `loader.bundle.js` 各写了一套主题逻辑。实测真值表后确认**最终由 `loader.bundle.js` 胜出**：

   ```
   data-theme = localStorage('theme') || (系统深色 ? 'Dark' : 'Light')
   ```

   而首页写的是 `cookie('themeState')`，那个 cookie 只写不读、且改写它的 `#myonoffswitch`
   在 DOM 里根本不存在 → 是死代码。本项目按真值表实现，不再写这个 cookie
   （详见 `src/composables/useTheme.js` 顶部注释）。
3. **主题开关滑块位置**：原站在「系统深色 + 从未手动切换过」时，页面已经是 Dark，
   但滑块停在左侧（`checked` 只按 `localStorage` 算），要点两下才切到 Light。
   本项目让滑块反映真实主题，点一下即可切换。
4. **首屏的贪吃蛇贡献图 → 已整体移除**，换成「最近在做什么」（数据构建期生成，见上文）。
   原站那张是 [Platane/snk](https://github.com/Platane/snk) 生成的**复刻对象站长的**
   GitHub 贡献图，属于「挂着别人的数据」。而换成自己的也走不通 —— 实测
   53 周 371 天里只有 6 天有提交（1.6%），一条蛇爬在 98.4% 空白的灰格子上像坏了。
   顺带说明：原站 `snake-Dark.svg` 本来就是死资源（唯一会换图的 `script.js` 读的是
   那个只写不读的 cookie），所以两个 SVG 文件都已从仓库移除。
5. **时间轴脉冲点**：原站写了 `animation: focus 1.8s ease infinite` 却没定义 `@keyframes focus`，
   实际是静态绿点。本项目补上了这个明显的脉冲意图（`LeftSidebar.vue`，注释已标明，
   删掉 `@keyframes focus` 即可回到原站状态）。
6. **图片灯箱**：原站实现了 `.tc` 组件但页面里没有任何触发点。
   本项目把它挂到了技能树图片上（点击放大），样式与过渡完全沿用原站。
7. **播放器渐隐遮罩**：原站歌词区挂了 `bg-gradient-to-b`，但 Tailwind v4 已改名为
   `bg-linear-to-b`，实际渲染为 `none`。本项目同样不加遮罩。
8. **音乐播放器**：原站是独立子应用，歌单来自远程接口。
   本项目用 Vue 组件重写了视觉与交互（尺寸/字号/颜色按原站实测值还原），
   歌单改为本地配置。原站这块本身没做完，本项目补了三件事：
   - **歌词支持 LRC**：`[mm:ss.xx] 一行` 的写法会按播放进度跟唱滚动，点某行可跳转；
     不写时间轴时退回静态展示（作词/编曲这类信息），两种写法在 `site.js` 里都能填。
   - **没有音源的曲目不再「点了没反应」**：明确显示「未配置音源」，
     并给一个「选择本地音频」入口（也支持把音频拖进播放器），选完立刻能放。
   - 音量 / 播放模式记到 localStorage；封面留空时按标题生成渐变封面，不再是死板占位块。
   顺带修了歌词居中的偏差：字号是 0.3s 过渡，切换瞬间量到的 `offsetTop` 还是旧的，
   按那时的布局居中会差几十像素，现在等 `transitionend` 落定后再量一次。
9. **留言板接口**：原站提交到 `https://bit.inthesea.top/api/submit-comment`（站长自己的服务）。
   本项目 `guestbook.endpoint` 默认留空，走本地成功流程，便于直接预览。
10. **Service Worker**：原站注册了 `sw.js`，本项目未引入（Vite 构建下意义不大）。
11. **Pacifico 字体换成完整子集**：仓库里原先那份 `Pacifico-Regular.ttf` 只有 13 KB，
    是照着原站用到的字符裁的子集，**缺 J 等一大批字形**（`ABCDEFGIJKLMNPQRTUVXYZ…`）。
    原站标题里恰好没有这些字母所以看不出问题，但本项目标题是「Jerry」，
    J 会回退成无衬线体，和后面的 `erry` 明显不是一个字体。
    现已换成从 Google Fonts 取的完整版按可打印 ASCII 重新裁的子集（42 KB，SIL OFL 1.1）。
12. **页脚备案号已清空**：原站页脚写的是 `蜀ICP备2023008720号-2`，本项目复刻时
    连同它一起抄了过来。但备案号绑定具体域名与主体，**挂别人的号属于冒用**，
    而且本站托管在 GitHub Pages（境外）本来也不需要备案 —— 现已清空。
    将来迁回国内主机时，把自己的号填进 `site.js` 的 `footer.icp` 即可
    （`SiteFooter.vue` 会自动处理空 / 非空两种渲染）。

---

## 换成你自己的资源

> 仓库里现在带的素材都来自原站，正式使用前请按下面几条替换掉。

- **文案**：改 `src/data/site.js`（站名、简介、标签、时间轴、卡片、歌单都在这里）
- **音乐**：`public/static/music/` 里是原创纯音乐《夜航》（`night-sail.mp3` + 封面），
  自己合成、没有版权问题，直接替换成你自己的歌即可。
  换歌三步：把音频丢进 `public/static/music/` → 在 `site.js` 的 `playlist` 里填
  `src` / `cover` / `lyric`（LRC 格式）→ 重新部署。
  不想部署也能听：播放器里「选择本地音频播放」，或直接把音频文件拖进去。
- **头像 / 背景**：替换 `public/static/img/logo.jpg`、`background.jpg`
- **技能树**：改 `scripts/skill-icons.json` 后跑 `node scripts/gen-skill-tree.mjs`
  （不要手改 SVG，见上文「技能树是生成的」）
- **首屏 GitHub 动态**：`site.js` 的 `github.username` 与 `scripts/gen-recent.mjs`
  顶部的 `USERNAME` 是同一个值，两处都要改；改完跑 `npm run recent` 重新取数
- **项目图标**：替换 `public/static/img/i1~i6.png`（建议 200×200 透明 PNG）
- **字体**：`public/static/fonts/`（Ubuntu 正文、Pacifico 渐变标题），换成自己的或改 `base.css` 里的 `@font-face`
