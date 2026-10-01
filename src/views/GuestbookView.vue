<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { profile, guestbook, footer } from '@/data/site'
import { theme, toggleTheme } from '@/composables/useTheme'

/* 与原站一致的校验规则（原站写在 chat.html 内联脚本里，常量逐个对齐） */
const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/
const MIN_CONTENT_LENGTH = 5
/**
 * 上限是**本项目新加的**，原站没有。
 * 理由：服务端（`post_guestbook_message`）必须有个上限来防滥用，两边不一致的话
 * 会出现「前端让发、后端拒绝」这种最难解释的现象。所以这里同步加上，
 * 并在 textarea 上挂 `maxlength`，让用户在**打字时**就被挡住，而不是提交后才报错。
 * 见 README「已知差异」。
 */
const MAX_CONTENT_LENGTH = 1000
const MAX_EMAIL_LENGTH = 254
const MAX_LOCAL_LENGTH = 64
const MAX_DOMAIN_LENGTH = 255
/* 原站 config 里写 DEBOUNCE_DELAY: 300，但真正绑定 input 时传的是 200 —— 按实际值来 */
const INPUT_DEBOUNCE = 200
const TOAST_DURATION = 5000
/* 原站成功后 setTimeout(() => location.href = 'index.html', 3000) */
const SUCCESS_REDIRECT_DELAY = 3000

const router = useRouter()

const email = ref('')
const content = ref('')

/*
 * 原站把「提示文案」和「是否可见」拆成两份状态：
 *   showError  → textContent = msg; classList.add('show')
 *   clearError → classList.remove('show')      ← 注意不清 textContent
 * 所以这里也拆开：errorText 一旦写入就保留，errorShown 单独控制 .show。
 * 初始文案就是原站 HTML 里写死在节点内的兜底文字。
 */
const errorText = ref({
  email: '请输入有效的邮箱地址',
  content: '内容不能为空，至少需要5个字符',
})
const errorShown = ref({ email: false, content: false })

/* 用来重放 shake 动画（原站直接操作节点） */
const emailErrEl = ref(null)
const contentErrEl = ref(null)
const errEls = { email: emailErrEl, content: contentErrEl }

const loading = ref(false)
const toast = ref({ active: false, type: 'success', text: '' })

let toastTimer = null
let redirectTimer = null
/* 原站给每个字段各建了一个 debounce 闭包（互不干扰），这里也按字段分开存定时器 */
const inputTimers = { email: null, content: null }

const isDark = computed(() => theme.value === 'Dark')

function validateEmail(value) {
  if (!value || typeof value !== 'string') return { valid: false, message: '邮箱不能为空' }
  const v = value.trim()
  if (!EMAIL_REGEX.test(v)) return { valid: false, message: '邮箱格式不正确' }
  if (v.length > MAX_EMAIL_LENGTH) return { valid: false, message: '邮箱地址过长' }
  const [local, domain] = v.split('@')
  if (local.length > MAX_LOCAL_LENGTH) return { valid: false, message: '邮箱用户名部分过长' }
  if (domain.length > MAX_DOMAIN_LENGTH) return { valid: false, message: '邮箱域名部分过长' }
  return { valid: true }
}

function validateContent(value) {
  if (!value || typeof value !== 'string') return { valid: false, message: '留言内容不能为空' }
  const v = value.trim()
  if (v.length < MIN_CONTENT_LENGTH) return { valid: false, message: `留言内容至少需要${MIN_CONTENT_LENGTH}个字符` }
  if (v.length > MAX_CONTENT_LENGTH) return { valid: false, message: `留言内容最多${MAX_CONTENT_LENGTH}个字符` }
  return { valid: true }
}

/** 只摘掉 .show，不动文案 —— 与原站 clearError 行为一致 */
function clearError(field) {
  errorShown.value[field] = false
}

async function showError(field, message) {
  errorText.value[field] = message
  errorShown.value[field] = true

  await nextTick()
  const el = errEls[field]?.value
  if (!el) return
  /* 原站的重放方式：先置 animation:none → 读一次 offsetHeight 强制重排 → 再挂回动画。
     不用重建节点，aria-live 区域不会被反复销毁重建。 */
  el.style.animation = 'none'
  void el.offsetHeight
  el.style.animation = 'shake 0.5s ease-in-out'
}

function validateField(field) {
  const value = field === 'email' ? email.value : content.value
  const result = field === 'email' ? validateEmail(value) : validateContent(value)
  if (result.valid) {
    clearError(field)
    return true
  }
  showError(field, result.message)
  return false
}

function onInput(field) {
  clearTimeout(inputTimers[field])
  inputTimers[field] = setTimeout(() => {
    clearTimeout(inputTimers[field])
    clearError(field)
  }, INPUT_DEBOUNCE)
}

function showToast(text, type = 'success') {
  toast.value = { active: true, type, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value.active = false
  }, TOAST_DURATION)
}

function resetForm() {
  email.value = ''
  content.value = ''
  clearError('email')
  clearError('content')
}

/** 两个字段都要校验，不能短路 —— 否则第一个字段失败时第二个字段不显示错误 */
function validateForm() {
  const emailOk = validateField('email')
  const contentOk = validateField('content')
  return emailOk && contentOk
}

/**
 * 业务失败。**必须和网络错误分开** ——
 * Supabase 的 RPC 用 HTTP 200 表达业务失败，所以「限流」根本不会抛 fetch 异常，
 * 只能靠 body 里的 `ok:false` 认出来。用一个自定义 Error 把 code 带出去，
 * 下面的文案映射就能按 code 查表，而不是去字符串里 includes('429') 那种脆匹配。
 */
class GuestbookError extends Error {
  constructor(code) {
    super(code)
    this.name = 'GuestbookError'
    this.code = code
  }
}

/** 与 supabase/migrations/001-guestbook.sql 里返回的 code 一一对应 */
const ERROR_TEXT = {
  rate_limited: '请求过于频繁，请稍后再试！',
  invalid_email: '邮箱格式不正确，请检查后重试！',
  invalid_content: `留言内容不合规，请检查后重试（${MIN_CONTENT_LENGTH}~${MAX_CONTENT_LENGTH} 字）！`,
  network: '网络连接失败，请检查网络后重试！',
  server: '服务器开小差了，请稍后重试！',
}

function mapError(e) {
  if (e instanceof GuestbookError) return ERROR_TEXT[e.code] || ERROR_TEXT.server
  const m = String(e?.message || '')
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return ERROR_TEXT.network
  if (m.includes('429')) return ERROR_TEXT.rate_limited
  if (m.includes('400')) return '请求格式错误，请检查输入内容！'
  return '发送失败，请稍后重试！'
}

function finishSuccess() {
  showToast('留言发送成功！🎉', 'success')
  resetForm()
  /* 原站成功后 3 秒跳回首页 */
  redirectTimer = setTimeout(() => router.push('/'), SUCCESS_REDIRECT_DELAY)
}

async function onSubmit() {
  if (!validateForm()) return

  loading.value = true
  try {
    if (!guestbook.endpoint) {
      /* 未配置后端：走本地成功流程，方便直接预览。
         但**必须在控制台留痕** —— 静默的假成功会让人以为留言真发出去了，
         这种「看着好了」比直接报错更坑。 */
      console.warn(
        '[guestbook] 未配置 Supabase（VITE_SUPABASE_URL 为空），' +
          '本次提交**没有真的发出去**，只走了本地假成功流程。',
      )
      await new Promise((r) => setTimeout(r, 600))
      finishSuccess()
      return
    }

    const res = await fetch(guestbook.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestbook.headers },
      /* 参数名要和 SQL 里的函数签名一致（p_email / p_content），
         PostgREST 是按名字匹配的，写错会 404 而不是 400。 */
      body: JSON.stringify({
        p_email: email.value.trim(),
        p_content: content.value.trim(),
      }),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

    /* ⚠️ 这一行是整段的关键，而且**判据方向不能反**。
        PostgREST 用 200 表达业务失败：`{ok:false, code:'rate_limited'}` 也是 200。
        少了检查 → 被限流时页面显示「留言发送成功！🎉」。

        为什么写成 `ok !== true` 而不是 `ok === false`：
        后者是「只有明确说失败才算失败」，那么 **200 + 解析不出的 body**
        （body 为空、或中间设备塞了一页 HTML）会被判成成功 —— 又是一次谎报。
        反过来写就是**失败关闭**：只有后端**明确说 ok:true** 才算成功。 */
    if (!data || data.ok !== true) throw new GuestbookError(data?.code || 'server')

    finishSuccess()
  } catch (e) {
    showToast(mapError(e), 'error')
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  clearTimeout(redirectTimer)
  clearTimeout(inputTimers.email)
  clearTimeout(inputTimers.content)
})
</script>

<template>
  <div class="chat-page">
    <div class="background-animation">
      <div class="circle circle1" />
      <div class="circle circle2" />
      <div class="circle circle3" />
    </div>

    <main class="card">
      <header class="header">
        <router-link to="/" class="back-btn" aria-label="返回首页">
          <AppIcon name="arrowBack" :size="24" fill="currentColor" /> 返回首页
        </router-link>

        <div class="theme-toggle">
          <input
            id="theme-switch"
            class="theme-switch"
            type="checkbox"
            aria-label="切换主题"
            :checked="isDark"
            @change="toggleTheme"
          />
          <label for="theme-switch" class="switch-label">
            <span class="toggle-icon" aria-hidden="true">🌙</span>
          </label>
        </div>
      </header>

      <section class="logo-container">
        <div
          class="logo"
          :style="{ backgroundImage: `url(${profile.avatar})` }"
          role="img"
          aria-label="头像"
        />
      </section>

      <h1 class="card-title">给 <span class="gradient-text">{{ profile.name }}</span> 留言</h1>
      <p class="card-subtitle">很高兴收到你的消息 💫</p>

      <form class="message-form" novalidate @submit.prevent="onSubmit">
        <div class="input-group">
          <label for="email">您的邮箱 <span class="required" aria-hidden="true">*</span></label>
          <div class="input-container" :class="{ error: errorShown.email }">
            <AppIcon name="mailLine" :size="20" fill="currentColor" />
            <input
              id="email"
              v-model="email"
              type="email"
              name="email"
              placeholder="请输入有效的邮箱地址"
              autocomplete="email"
              required
              aria-describedby="email-error"
              @input="onInput('email')"
              @blur="validateField('email')"
            />
          </div>
          <!-- 原站节点上只有 .error-message，.show 由脚本动态增删 -->
          <div
            id="email-error"
            ref="emailErrEl"
            class="error-message"
            :class="{ show: errorShown.email }"
            role="alert"
            aria-live="polite"
          >{{ errorText.email }}</div>
        </div>

        <div class="input-group">
          <label for="content">您想说的话 <span class="required" aria-hidden="true">*</span></label>
          <div class="input-container textarea-container" :class="{ error: errorShown.content }">
            <AppIcon name="messageLine" :size="20" fill="currentColor" />
            <textarea
              id="content"
              v-model="content"
              name="content"
              placeholder="请输入您想对站长说的话，至少5个字符"
              minlength="5"
              :maxlength="MAX_CONTENT_LENGTH"
              required
              aria-describedby="content-error"
              @input="onInput('content')"
              @blur="validateField('content')"
            />
          </div>
          <div
            id="content-error"
            ref="contentErrEl"
            class="error-message"
            :class="{ show: errorShown.content }"
            role="alert"
            aria-live="polite"
          >{{ errorText.content }}</div>
        </div>

        <button
          type="submit"
          class="submit-btn"
          :class="{ loading }"
          :disabled="loading"
          aria-describedby="submit-status"
        >
          <span class="btn-text">发送留言</span>
          <AppIcon class="btn-icon" name="send" :size="20" fill="currentColor" />
        </button>
        <div id="submit-status" class="sr-only" aria-live="assertive">{{ loading ? '正在发送...' : '' }}</div>
      </form>

      <footer class="footer">
        <router-link to="/">返回首页</router-link>
        <span class="separator" aria-hidden="true">|</span>
        <span>{{ footer.copyright }}</span>
      </footer>
    </main>

    <div class="toast" :class="[toast.type, { active: toast.active }]" role="alert" aria-live="assertive">
      <div class="toast-icon success" aria-hidden="true"><AppIcon name="check" :size="24" fill="currentColor" /></div>
      <div class="toast-icon error" aria-hidden="true"><AppIcon name="close" :size="24" fill="currentColor" /></div>
      <div class="toast-content">{{ toast.text }}</div>
    </div>
  </div>
</template>
