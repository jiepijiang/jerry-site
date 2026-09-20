/**
 * 站点内容配置
 * ---------------------------------------------------------------------------
 * 页面里所有文案、卡片、标签、时间轴都在这里改，组件本身不需要动。
 * 布局结构（卡片数量、栏位数）保持与原站一致，因此增删条目不会破坏版式。
 */

/**
 * 静态资源路径前缀。
 *
 * GitHub Pages 把站点挂在 /<仓库名>/ 子路径下，写死的 '/static/...' 会 404。
 * Vite 只会重写 index.html 和 CSS 里的绝对路径，JS 里的字符串得自己加前缀。
 * 本地 dev 时 BASE_URL 就是 '/'，所以两种环境写法统一，不用改。
 *
 * 新增资源照抄这个写法即可：asset('static/img/xxx.png')
 */
const asset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`

export const profile = {
  name: 'Jerry',
  avatar: asset('static/img/logo.jpg'),
  /** 首屏大标题前缀 */
  hello: "Hello I'm",
  /**
   * 第一行简介。highlight 那段会套紫色高亮样式，其余照常。
   * 注意是单行显示（.description 20px），太长在窄屏会换行。
   */
  role: { icon: '💻', highlight: 'H5 · 小程序 · App', rest: ' · Electron' },
  /**
   * 第二行简介：会以打字机效果逐字出现。
   * 长度控制在 20 字上下 —— 太长打字动画会拖很久。
   */
  motto: '🔧 喜欢把东西拆开，看它到底怎么跑起来的',
}

/** 左侧信息卡 */
export const locations = [
  { key: 'china', text: 'China' },
  { key: 'city', text: 'SiChuan' },
]

/**
 * 左侧标签
 * 技能方向 + 爱好混在一排，和原站的设计一致（原站也是「计算机/物理/天文/电影」混着放）。
 * 容器是 flex-wrap，多了会自己换行；左侧栏本身可滚动（.Miyako-left 是 100vh + overflow-y），
 * 所以条数不是硬约束，但太长会把时间轴挤到折叠线以下，控制在 12 条左右。
 *
 * 前半段是技术栈（按 Jerry 自述：Vue / React / 原生 JS / UniApp / Electron / Node.js，
 * App 用 uni-app，之后用 AI 重构到 Flutter），后半段是爱好。
 */
export const tags = [
  'Vue',
  'React',
  'UniApp',
  'Electron',
  'Node.js',
  'Flutter',
  '微信小程序',
  '嵌入式设备',
  'AI 全栈',
  '音乐',
  '电影',
  '摄影',
]

/**
 * 左侧时间轴（第一条会高亮脉冲）
 * 容器 #line 是固定 200px 高的滚动列表，条目多一条少一条都不会撑破版式。
 * 第一条放「当前状态」，往下按时间倒序。
 *
 * **日期依据**（尽量用可查证的事实，别编）：
 *   - 2026.9   自建知识库与导航站 —— jerry-site / jerry-tools / jerry-notes 创建于 2026-09
 *   - 2025.10  扫码 H5 · 停车码 —— scanCode-demo（H5 调摄像头扫码）创建于 2025-10-29
 *   - 2022.3   折腾 Next.js 博客 —— nextjs-blog-theme 创建于 2022-03-10
 *   - 2020.5   微信小程序 —— yougoushop 创建于 2020-05-15
 *   - 2019.1   注册 GitHub —— 账号创建于 2019-01-02（API 查得）
 * 之前那版里「购置域名 2022.8 / 购买服务器 2021.3 / 开始折腾 2016.7」
 * 是从复刻对象继承来的，基本可以确定是原站站长的日期，已全部换掉。
 *
 * 注意 2022.3 那条**仍然叫「博客」是对的** —— 那会儿确实是 `nextjs-blog-theme`，
 * 是真博客。2026.9 这条改叫「知识库」是因为博客部分已重做成知识库看板。
 * 时间轴记的是「当时做了什么」，不是「现在叫什么」，别一刀切。
 */
export const timeline = [
  { title: '未完待续', date: '2026.9' },
  { title: '自建知识库与导航站', date: '2026.9' },
  { title: '扫码 H5 · 停车码', date: '2025.10' },
  /**
   * ⚠️ 这条的日期是**推断的**，不是查到的 —— 公开仓库在 2023.1 之后断了近三年，
   * 推断这段时间在做嵌入式前端。**等 Jerry 确认或改成真实时间。**
   */
  { title: '前端 + 嵌入式前端', date: '2023.1' },
  { title: '折腾 Next.js 博客', date: '2022.3' },
  { title: '微信小程序', date: '2020.5' },
  { title: '注册 GitHub', date: '2019.1' },
]

/** 社交 / 功能入口（iconTip 为悬停展开后显示的文案） */
export const socials = [
  { key: 'github', tip: 'Github', href: 'https://github.com/jiepijiang' },
  { key: 'mail', tip: 'Mail', href: 'mailto:jiepijiang@gmail.com' },
  { key: 'message', tip: '留言', href: '/chat' },
  { key: 'music', tip: '音乐', action: 'music' },
]

/**
 * site 区卡片（第一组：4 列小卡片，悬停时右侧图标收起、标题放大）
 *
 * 这里放「站内 / 个人入口」。href 用 http 开头会自动 target=_blank，
 * 站内相对路径（如 /chat）走 SPA 路由。action: 'music' 表示不跳转、改成打开音乐幕帘。
 *
 * 文案长度：标题 ≤ 8 个汉字，desc ≤ 12 个汉字，超了会换行把 100px 的卡片撑高。
 */
export const siteProjects = [
  /**
   * 「知识库」= 原先的「博客」。
   *
   * 博客部分已拆成独立仓库 jiepijiang/jerry-notes —— 那里不是按时间倒序的
   * 流水账，而是把笔记按「状态 × 分类」组织起来的分析看板（四视图 +
   * 本地目录挂载）。标题和 desc 都跟着改成「知识库」的说法，
   * **不留「博客」这个旧词** —— 半改不改比不改更让人困惑。
   */
  {
    title: '知识库',
    desc: '笔记、踩坑与决策记录',
    img: asset('static/img/i1.png'),
    href: 'https://jiepijiang.github.io/jerry-notes/',
  },
  {
    title: '工具导航',
    desc: '网址导航与书签管理',
    img: asset('static/img/i2.png'),
    href: 'https://jiepijiang.github.io/jerry-tools/',
  },
  { title: 'GitHub', desc: '代码与开源', img: asset('static/img/i6.png'), href: 'https://github.com/jiepijiang' },
  { title: '音乐站', desc: '来点音乐吧', img: asset('static/img/i4.png'), action: 'music' },
]

/**
 * project 区卡片（第二组：同为 4 列，窄屏时变整行卡片）
 *
 * 这里放「工具集合」：自己的 + 常用外部工具。
 * 原站的四张卡（2FA / 串口助手 / 画板 / 流程图）之前 href 全指向 example.com，
 * 现在换成真实地址；串口助手因为找不到稳定可用的在线实现已经移除。
 */
export const toolProjects = [
  {
    title: '停车码',
    desc: '临时停车，扫码通知车主',
    img: asset('static/img/i3.png'),
    href: 'https://scnrhostplnc.feishuapp.com/app/app_17cw6j1xyk0',
  },
  { title: '2FA', desc: '在线 TOTP 验证码', img: asset('static/img/i1.png'), href: 'https://2fa.cn/' },
  { title: '画板', desc: 'Powered by Excalidraw', img: asset('static/img/i4.png'), href: 'https://excalidraw.com/' },
  { title: '流程图', desc: 'Powered by Draw.io', img: asset('static/img/i2.png'), href: 'https://app.diagrams.net/' },
]

/**
 * 「最近在做什么」—— 首页首屏那一块，原站放的是贪吃蛇贡献图
 * ---------------------------------------------------------------------------
 * 为什么换掉贪吃蛇：那张图是复刻对象 xywml.com 站长的 **GitHub 贡献图**
 * （Platane/snk 生成），属于「挂着别人的数据」。
 *
 * 那为什么不换成 Jerry 自己的贡献图？查了一下，**换不了**：
 *   53 周 371 天里只有 6 天有提交（1.6%），全年 20 次，单日最高 7 次。
 *   一条蛇爬在 98.4% 空白的灰格子上，看起来像坏了。
 *
 * 所以改成显示最近推送的仓库。**数据是构建期生成的，不直连 GitHub API** ——
 * 未登录的 api.github.com 限流是 60 次/小时/**出口 IP**，走代理时出口 IP 共享，
 * 实测浏览器请求直接吃 403，那一块就只剩一句「取不到数据」。
 * 由 `scripts/gen-recent.mjs` 生成 `public/static/data/recent.json`，
 * CI 里带 token 跑（额度 5000/小时），另外每天定时重新生成一次。
 */
export const github = {
  username: 'jiepijiang',
  /** 最多显示几个仓库（2×2 网格，改成别的数字要同步调 CSS 高度） */
  limit: 4,
  title: '最近在做什么',
  /** 语言色点，取 GitHub 官方配色 */
  languageColors: {
    Vue: '#41B883',
    JavaScript: '#F1E05A',
    TypeScript: '#3178C6',
    HTML: '#E34C26',
    CSS: '#563D7C',
    SCSS: '#C6538C',
    Python: '#3572A5',
    Java: '#B07219',
    Dart: '#00B4AB',
    'C++': '#F34B7D',
    C: '#555555',
  },
}

/** 技能树 */
export const skills = {
  pc: asset('static/svg/skillPc.svg'),
  wap: asset('static/svg/skillWap.svg'),
}

export const footer = {
  /**
   * 备案号。**留空**。
   *
   * 原来这里写的是 `蜀ICP备2023008720号-2` —— 那是复刻对象 xywml.com 的备案号，
   * 和原站页脚一字不差。备案号是绑定具体域名和主体的，挂别人的号属于冒用，
   * 而且本站托管在 GitHub Pages（境外），本来也不需要备案，所以直接清掉。
   *
   * 以后如果本站迁回国内主机，把自己的备案号填在这里即可，
   * `SiteFooter.vue` 会自动处理「空 / 非空」两种渲染。
   */
  icp: '',
  copyright: 'Jerry © 2026',
}

/**
 * 留言板
 * endpoint 留空时，提交会走本地成功流程（方便直接预览）；填上你的接口地址即可真正发送。
 * 原站填的是 `https://bit.inthesea.top/api/submit-comment`（站长自己的服务，不适用本项目）。
 * 提交成功后统一等 3 秒跳回首页 —— 与原站一致。
 */
export const guestbook = {
  endpoint: '',
}

/**
 * 音乐幕帘中的播放列表
 * ---------------------------------------------------------------------------
 * src    音频地址。留空 = 这首没接音源，播放器会显示「未配置音源」，
 *        并给一个「选择本地音频」的入口（选完立刻能放，不用重新部署）。
 * cover  封面图。留空 = 用标题首字 + 渐变自动生成一张，不会是死板的占位块。
 * lyric  歌词，两种写法都认：
 *          · 字符串 / 字符串数组            → 静态展示（作词、编曲这类信息）
 *          · LRC 文本（`[mm:ss.xx] 一行`）  → 按播放进度自动跟唱滚动，点某行可跳转
 *
 * 换歌：把 mp3 丢进 public/static/music/，然后照着下面第一首的写法填 src 即可。
 */
export const playlist = [
  {
    title: '夜航',
    artist: 'Jerry · 原创纯音乐',
    album: 'Nocturne',
    cover: asset('static/music/night-sail.jpg'),
    src: asset('static/music/night-sail.mp3'),
    duration: 91,
    /**
     * 这首是纯音乐，所以「歌词」写的是一段配合乐句出现的意境字幕。
     * 时间点对齐的是曲子的乐句（每 2 小节一句，7.5 秒），不是随口写的。
     * 想换成有词的歌，把它的 LRC 贴进来就行，格式完全一样。
     */
    lyric: `[00:00.00]夜航 · Nocturne
[00:07.50]夜色落下来
[00:15.00]灯一盏一盏亮起
[00:22.50]城市开始呼吸
[00:30.00]我沿着光的方向走
[00:37.50]风把白天的声音收走
[00:45.00]只剩心跳，和很远的船鸣
[00:52.50]别急，夜还很长
[01:00.00]潮水把脚印一遍遍抹平
[01:07.50]星光落在肩上
[01:15.00]那就再坐一会儿
[01:22.50]晚安`,
  },
  {
    // 这首还没接音源：留在这里当模板，也是「无音源」状态的活例子。
    // 把 mp3 放进 public/static/music/ 并填上 src，它就能播。
    title: '故人泪',
    artist: '冷鸢yousa / KBShinya',
    album: '翻唱作品集 2019',
    cover: '',
    lyric: {
      '作词/作曲': '景子谦',
      编曲: '高都邦',
      原唱: '音小尧 / Kent王健',
      翻唱: '冷鸢yousa / KBShinya',
    },
    duration: 209,
    src: '',
  },
]
