<script setup>
import { onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useTyping } from '@/composables/useTyping'
import { useFps } from '@/composables/useFps'
import { profile, socials, github } from '@/data/site'

const emit = defineEmits(['open-music'])

const typingEl = ref(null)
const { display, isTyping, isMask } = useTyping(typingEl, profile.motto)

const { fps } = useFps()

/* 原站用第一个 .iconItem 的宽度算出 FPS 字号（0.35 × 49px） */
const firstIcon = ref(null)
const sliderStyle = ref({})
onMounted(() => {
  const w = firstIcon.value?.offsetWidth || 49
  sliderStyle.value = {
    fontSize: `${0.35 * w}px`,
    fontWeight: 'bold',
    fontFamily: '"b", sans-serif',
    color: '#fff',
    minWidth: '80px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  }
})

/* ---------------------------------------------------------------------------
 * 「最近在做什么」—— 替换原站的贪吃蛇贡献图（那是复刻对象站长的数据，
 * 换成 Jerry 自己的又几乎全空，原因见 site.js 的注释）。
 *
 * **读的是构建期生成的本地 JSON，不直连 GitHub API。** 原因：
 * 未登录的 api.github.com 限流是 60 次/小时/**出口 IP**，走代理时出口 IP 是共享的，
 * 很容易被别人用光 —— 实测浏览器请求直接吃 403，那一块就只剩一句「取不到数据」。
 * 数据由 `scripts/gen-recent.mjs` 在构建时生成（CI 里带 token），见 README。
 *
 * JSON 里存的是**绝对时间戳**，相对时间在这里现算，
 * 所以哪怕数据是昨天生成的，「3 小时前」也依然准确。
 * ------------------------------------------------------------------------- */
const repos = ref([])
const state = ref('loading') // loading | ready | error

/** 相对时间，中文。够用就行，不引第三方库 */
function relativeTime(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(min)) return '' // 缺 pushedAt 时别渲染出「NaN 年前」
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo} 个月前` : `${Math.floor(mo / 12)} 年前`
}

onMounted(async () => {
  try {
    // BASE_URL 在 dev 下是 '/'、生产是 '/jerry-site/'，两边都对
    const res = await fetch(`${import.meta.env.BASE_URL}static/data/recent.json`)
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    repos.value = (data.repos || []).slice(0, github.limit).map((r) => ({
      name: r.name,
      url: r.url,
      color: github.languageColors[r.language] || '#8b949e',
      meta: [r.language, relativeTime(r.pushedAt)].filter(Boolean).join(' · '),
    }))
    state.value = repos.value.length ? 'ready' : 'error'
  } catch {
    state.value = 'error'
  }
})

function onSocialClick(item) {
  if (item.action === 'music') emit('open-music')
}
</script>

<template>
  <header>
    <div
      class="index-logo"
      :style="{ backgroundImage: `url(${profile.avatar})` }"
      role="img"
      aria-label="头像"
    />

    <div class="welcome">{{ profile.hello }} <span class="gradientText">{{ profile.name }}</span></div>

    <div class="description">
      {{ profile.role.icon }} <span class="purpleText">{{ profile.role.highlight }}</span>{{ profile.role.rest }}
    </div>

    <div
      ref="typingEl"
      class="description"
      :class="{ typing: isTyping, 'typing-mask': isMask }"
    >{{ display }}</div>

    <div class="iconContainer">
      <template v-for="(item, i) in socials" :key="item.key">
        <router-link
          v-if="item.href && item.href.startsWith('/')"
          :ref="(el) => { if (i === 0) firstIcon = el?.$el ?? el }"
          class="iconItem"
          :to="item.href"
          :aria-label="item.tip"
        >
          <AppIcon :name="item.key" :size="22" />
          <div class="iconTip">{{ item.tip }}</div>
        </router-link>

        <a
          v-else
          :ref="(el) => { if (i === 0) firstIcon = el }"
          class="iconItem"
          :href="item.href || '#'"
          :target="item.href && item.href.startsWith('http') ? '_blank' : undefined"
          :rel="item.href && item.href.startsWith('http') ? 'noopener noreferrer' : undefined"
          :aria-label="item.tip"
          @click="onSocialClick(item)"
        >
          <AppIcon :name="item.key" :size="22" />
          <div class="iconTip">{{ item.tip }}</div>
        </a>
      </template>

      <a class="switch">
        <span class="slider round" :style="sliderStyle">FPS: {{ fps ?? '--' }}</span>
      </a>
    </div>

    <div class="recent">
      <div class="recent-head">
        <span class="recent-title">{{ github.title }}</span>
        <a
          class="recent-tag"
          :href="`https://github.com/${github.username}`"
          target="_blank"
          rel="noopener noreferrer"
        >GitHub</a>
      </div>

      <ul v-if="repos.length" class="recent-list">
        <li v-for="r in repos" :key="r.name">
          <a :href="r.url" target="_blank" rel="noopener noreferrer">
            <span class="recent-name">
              <i class="recent-dot" :style="{ background: r.color }" />
              <span class="recent-label">{{ r.name }}</span>
            </span>
            <span class="recent-time">{{ r.meta }}</span>
          </a>
        </li>
      </ul>

      <p v-else class="recent-empty">
        {{ state === 'loading' ? '正在读取…' : '暂时取不到 GitHub 数据' }}
      </p>
    </div>
  </header>
</template>

<style scoped>
.index-logo {
  aspect-ratio: 1 / 1;
  background-size: cover;
  border: 0.5px solid #fff;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 30px;
  max-width: 200px;
  position: relative;
  width: 40%;
}

.welcome {
  font-size: 65px;
  font-weight: 800;
  margin: 20px 0;
}

.gradientText {
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: backgroundSizeAnimation 10s ease-in-out infinite;
  background-image: var(--gradient);
  background-position: 0;
  background-size: 200%;
  font-family: title;
}

.purpleText {
  color: var(--purple_text_color);
  font-weight: 800;
}

.description {
  font-size: 20px;
  line-height: 1.6;
  margin-top: 7px;
}

.iconContainer {
  align-items: center;
  display: flex;
  height: 60px;
  margin-top: 20px;
  overflow-x: scroll;
  width: 100%;
}

.iconContainer::-webkit-scrollbar {
  display: none;
}

.iconItem {
  align-items: center;
  backdrop-filter: blur(var(--card_filter));
  -webkit-backdrop-filter: blur(var(--card_filter));
  background: var(--item_bg_color);
  border-radius: 7px;
  box-sizing: border-box;
  display: flex;
  flex-shrink: 0;
  height: 43px;
  justify-content: center;
  margin-left: 10px;
  transition:
    width 0.3s ease,
    opacity 0.3s ease,
    transform 0.3s ease;
  width: 49px;
}

.iconItem :deep(svg) {
  fill: var(--fill);
  font-size: 22px;
  height: 22px;
  margin-right: 3px;
  width: 22px;
}

.iconTip {
  display: none;
  white-space: nowrap;
}

.iconItem:hover {
  background: var(--item_hover_color);
  transform: translateY(-2px);
  width: 95px;
}

.iconItem:hover .iconTip {
  display: block;
}

.switch {
  align-items: center;
  backdrop-filter: blur(var(--card_filter));
  -webkit-backdrop-filter: blur(var(--card_filter));
  background: var(--item_bg_color);
  border-radius: 7px;
  box-sizing: border-box;
  display: flex;
  flex-shrink: 0;
  height: 43px;
  justify-content: center;
  margin-left: 10px;
  transition:
    width 1s ease,
    opacity 1s ease,
    transform 1s ease;
  width: 80px;
}

.switch .slider {
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-align: center;
  white-space: nowrap;
}

.switch:hover {
  background: var(--item_hover_color);
  width: 80px;
}

/* ---------------------------------------------------------------------------
 * 「最近在做什么」—— 原站这里是贪吃蛇贡献图（.tanChiShe）。
 *
 * **容器保留原图的 880/192 宽高比**，所以桌面端首屏的占位完全没变，
 * 页面总高仍是 1118px。内容换掉而已，盒子没动。
 * ------------------------------------------------------------------------- */
.recent {
  aspect-ratio: 880 / 192;
  display: flex;
  flex-direction: column;
  width: 85%;
}

.recent-head {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
  padding: 0 2px 8px;
}

.recent-title {
  color: var(--fill);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.recent-tag {
  color: var(--fill);
  font-size: 11px;
  opacity: 0.55;
  text-decoration: none;
}

.recent-tag:hover {
  opacity: 1;
}

.recent-list {
  display: grid;
  flex: 1;
  gap: 8px;
  grid-template-columns: 1fr 1fr;
  list-style: none;
  margin: 0;
  min-height: 0;
  padding: 0;
}

.recent-list li {
  min-width: 0;
}

.recent-list a {
  align-items: center;
  backdrop-filter: blur(var(--card_filter));
  -webkit-backdrop-filter: blur(var(--card_filter));
  background: var(--item_bg_color);
  border-radius: 7px;
  box-sizing: border-box;
  display: flex;
  height: 100%;
  justify-content: space-between;
  padding: 0 12px;
  text-decoration: none;
  transition:
    background 0.3s ease,
    transform 0.3s ease;
}

.recent-list a:hover {
  background: var(--item_hover_color);
  transform: translateY(-2px);
}

.recent-name {
  align-items: center;
  color: var(--fill);
  display: flex;
  font-size: 14px;
  font-weight: 600;
  gap: 7px;
  min-width: 0;
}

/* 省略号必须挂在**真正包着文字的那个元素**上。
   `.recent-name` 是 flex 容器，`text-overflow` 对 flex 容器不生效 ——
   文字会直接被裁掉、连省略号都没有（窄屏上 `scanCode-demo` 就是这么被截成
   `scanCode-` 的）。所以文字外面单独套一层。 */
.recent-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-dot {
  border-radius: 50%;
  flex-shrink: 0;
  height: 9px;
  width: 9px;
}

.recent-time {
  color: var(--fill);
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.6;
  padding-left: 10px;
}

.recent-empty {
  color: var(--fill);
  flex: 1;
  font-size: 13px;
  margin: 0;
  opacity: 0.55;
  padding-top: 4px;
}

@media (min-width: 800px) {
  .index-logo {
    display: none;
  }
}

@media (max-width: 800px) {
  /* 窄屏下 880/192 的比例只剩 60 来像素高，装不下 2×2 的列表，
     所以这里放开比例、让它按内容自然撑开。 */
  .recent {
    aspect-ratio: auto;
    width: 100%;
  }

  .recent-list li {
    min-height: 56px;
  }

  /* 窄屏下每个格子只有 150 来像素宽，横向排「名字 + 语言 + 时间」会把名字挤成
     `sca…` / `ne…`（实测溢出 57px），根本认不出是哪个仓库。
     所以这里改成上下两行：名字一行、语言·时间一行。 */
  .recent-list a {
    align-items: stretch;
    flex-direction: column;
    gap: 3px;
    justify-content: center;
    padding: 8px 10px;
  }

  .recent-name {
    font-size: 13px;
  }

  .recent-time {
    font-size: 11px;
    padding-left: 0;
  }

  .description {
    font-size: 4vw;
  }

  .welcome {
    font-size: 10vw;
    margin: 2vw 0;
  }

  .iconContainer {
    margin-top: 4vw;
  }
}
</style>
