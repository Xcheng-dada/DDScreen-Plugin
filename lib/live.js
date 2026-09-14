/**
 * B站直播海报卡
 * 模板资产逐字节取自 DDScreenGO 源码（lib/templates/*，由 extract_src_templates.mjs 生成），
 * 渲染逻辑对齐 internal/render/render.go：live1=livePosterHTML、live2=liveOtherHTML、
 * live3=liveCuteHTML、live4=template/bililive4.tmpl。
 * 语义差异（按部署版 7000 与用户要求保留）：页脚署名统一 DDScreen-Plugin By 小橙c、
 * 公告模块取直播间公告、四模板头像认证角标、输出 PNG 四角圆角透明。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureHTML } from './shot.js'
import { biliLiveInfo } from './bilibili.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const T = name => path.join(dir, 'templates', name)
const liveCSS = fs.readFileSync(T('live.css'), 'utf8')
const offLiveCSS = fs.readFileSync(T('offlive.css'), 'utf8')
const live2CSS = fs.readFileSync(T('live2.css'), 'utf8')
const live2JS = fs.readFileSync(T('live2.js'), 'utf8')
const live3TPL = fs.readFileSync(T('live3.html'), 'utf8')
const live4TPL = fs.readFileSync(T('live4.html'), 'utf8')
const noCover = fs.readFileSync(T('nocover.txt'), 'utf8').trim()

/** live2 个人认证角标（黄闪电，30x30 data URL） */
export const BILI_TAG_YELLOW = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAAXNSR0IArs4c6QAAA6NJREFUSA29V89LVUEU/p5KCKlElsYjkX4oVFgLaSMEQbQIWgga1ar/IDBJ+k2USRuzfZuiRUQZ1iYiCipyU0E/F1kJZbzQUkulrMzb9925786dq+8Hkn1w3j1z5sz5ZuaeO2deAnnA87wCujVQGin1lGQgfCAVyBM+eyi9iURims+5g4TFlDbKICVfyFdjiufEzIFNlA+U2fH7m+dJMkNjmzKRJ+IddJatnXLI6Rt/BgzfAb4+ACY/At4v051YABQvBxZtAsq3AKUbnGFsdFCOcPu9aIdDHJBeosPO0GniFfC+Cxh7FJqyKmUbgeoWoGRd1O0yG7uj5HHiU3SwK01dMKRwJhsNmEFnWJEn90T7O0h8OG0IiYP3cTXdgX7u9uCVsDknpXIHsPJIdGgzybtl0GcCkioDuZ8BUufzI00UAZXNgJ6zQRPXrll0BVyGmPa9lCq/33+nZ61rJk1ktZ1c0VGgsDSTl3lVimkgDnGhgDPQqlvV8KFEyvlOC4Ga08DizczwAWBq1Iyd9Zf54ccMO1vFmT6RKnyzPpmc2cshNczB8q0m0vjzMGJGRTEV20BcDSLWMWig7zQrmIurTwJLtlmviRdWz6a5sRtFrLPXQIdDNqw6Dizd7nrks2KNcGPXKx114BvoRMoEJVGF3RzfzfvDjOb7XrgmMorv9PtbpslUxEbVjZ20xFNj9hh0hwArDprPJm4Xad3FuBXoa+Pxesu164gVR1GZ7EltdXYoiZbtyu4T7R28NpM02m90TytWPa31Z6IDP334p51H7gEvdfTpkOM2Clrp2nPmaSzmd+gG0H8iarG6YpvVyvbJEqupKvOjX5qFJjL+1Lal6Z2KPIovN4F3x2gJJhftk67YFilttW4OBipt+aCkzvUavg28UW3JQCpvN/ZjEffI7kP1NB9EiUfukvQAR+W47bixr4u4lzLk86mIq57mQul64zF6nxm8nwuNfTrx8YppLwji6i1gmdJUedoHUB31EyltiD1VEIqreSA8BF7vy02qWH7MME6nOJWq6bLYR7XK7/YvAGd8deYPh6gUfmYGT/+c2R23VHNy9kIwwO5aEk9qqyGFDy3VQI4q4rOCCaQ6mw+pYlhSRWsJuMJ6LPJudnSEXLo55Nr20DmuaHu5Uvf2oauPOHz4W51usE6q/f8ve5pAQN5OVR+mxT++3trAMY0TmNcLfYzObZJ83v7COO/YpbUtTkDZ30BRQdbFIRkIH3P70/YXnZ4S0cfP9ikAAAAASUVORK5CYII='
/** live2 机构认证角标（蓝闪电，30x30 data URL） */
export const BILI_TAG_BLUE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAAAXNSR0IArs4c6QAAA5hJREFUSA29l0tIVVEUhtdVA8GM6ClCUab2IJpIEBYEQVDQQDKIpjUKpBCjyBqqRCAOaloNI8iwUTQIgsLo4SQCKytIQXsXGiRp3v7vPO7d59zXQbIf1j37sdb692PtvfZNWQKk0+kyqTVLWiRNktpA9LHxQIb0HZAMplKpOX3nDxFWSk5LPkqSAl1sKufFLMNWyagkLyZn0mmkCLBtLUSeindImbYuSafbNzylNfxm9vSH2Ydps5m037tI2jWa2/al2otlZpurXSuv3KPf81r+wMLvjxAHpNfVddjvNhv5aXZ11Oz5ZNhS/LttidnRtWYNiyN6N1Q74pLHibulkJnpLYUNpJGhRvzlr+AU8oOEYBY9Ij4XVjPEwX7cDDsuvzO78ymsze+7f5VZW13E9pDI+2nhmJhIicA+yqBfM01CWqFh47w8M3zfPvzFB6vmoC/g8onVcUKyBgX29JqWtxQgO9vgz6iqvLA2W4XPAHDAZWUaAbPuoAKS7CkGZ+rNdiiKJxThk7Oead4f4gOfDjrgxEezRAtmxpEpFb0YnBLpzuVYmL3MzsZvyPOLT3wHgKsZP1yDHjinxcBWtm8w270iq/Uq6zDbmKcU890CcVOox+VQDCfrzPasjGokmTEWMd9NFWrLnDZupEJoW2+219uQrMYfbSBBVl+VbUur7f0vs9nY4Y/5rs0QTylAwmsw68YvHV+nY7M63uqT9m7Nbb8wYvbga7Qd33BUw6jJstRFsUuRe6CmqEqk867Obpw0ouBX0vBzxBsZCRd+fNaPvyuKX5il1McyApa3Z0vuxXHvs9kl3Xj5gO9gtnRPZIipkWXGtD8uGMhw7Miwp/Hb6v4XXX1vC9/r+HYwzlLzcvBAakuCjdHMYw+1n71vCpPiM+b7GcQDIRn5NAlc4kc6+xdFOlfCMOb7NsSDEi8PkcTJp6WwKZjxE+0/EcyxKgZ8Og8EuAbLlKYYbG9oSB5VHBQECaFW+zWky6b7de55jRviC58OeuH0OIJUJTd+hiKVXRl1VJ0iBvt0kRDBv0vMFLNjInUeBGNqahTxNEuto5LizmqnDFAkz+YDXOTZJKT4cEhx1x5wZfIx5P3q6KEX8HIotey+Zu4vq8JMY68Pnj5wePCWOqxoyan//8ceAwjIu1TspB7iXz9vQ785Xw1gQR/0OYRuA9EuWZC/MJE9dkndssiJ/mZJi4SHg+I+k8dJMsiQhFsw0Z+2v+3/FLJohAIhAAAAAElFTkSuQmCC'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

/** 统一页脚署名（tips 追加在后） */
const CREDITS = 'DDScreen-Plugin By 小橙c'

/** 图片转 data URL（对齐 render.go imageDataURL） */
export async function imageDataURL (rawURL, fallback = '') {
  rawURL = String(rawURL || '').trim()
  if (!rawURL) return fallback
  if (rawURL.startsWith('data:')) return rawURL
  if (rawURL.startsWith('//')) rawURL = 'https:' + rawURL
  if (!/^https?:\/\//.test(rawURL)) return fallback
  try {
    const res = await fetch(rawURL, {
      headers: {
        'User-Agent': UA,
        Referer: rawURL,
        Accept: 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return fallback
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) return fallback
    let type = (res.headers.get('content-type') || '').split(';')[0].trim()
    if (!type.startsWith('image/')) type = 'image/png'
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return fallback
  }
}

/** 二维码 data URL（对齐 Go qrDataURLPlain 黑字白底带边框） */
export function qrDataURL (text) {
  if (!text) return ''
  const lib = loadQrcodeLib()
  const qr = lib(0, 'H')
  qr.addData(text)
  qr.make()
  return qr.createDataURL(4, 16)
}

let _qrLib = null
function loadQrcodeLib () {
  if (_qrLib) return _qrLib
  const code = fs.readFileSync(path.join(dir, 'inject/qrcode.js'), 'utf8')
  const sandbox = {}
  new Function('sandbox', code.replace(/\(function\s*\(\)\s*\{\s*return\s*qrcode\s*\}\)\s*\)?\s*;?\s*$/, '').replace(/typeof define[^;]+;/g, '').replace(/"object"==typeof exports[^;]+;/g, '') + '; sandbox.qrcode = qrcode')(sandbox)
  _qrLib = sandbox.qrcode
  if (typeof _qrLib !== 'function') throw new Error('qrcode 库加载失败')
  return _qrLib
}

/** 透明二维码（对齐 Go qrDataURLTransparent：灰模块 #A9A9A9 + 透明底 + 无边框） */
export function qrDataURLTransparent (text) {
  if (!text) return ''
  const lib = loadQrcodeLib()
  const qr = lib(0, 'H')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  let cells = ''
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) cells += `M${c} ${r}h1v1h-1z`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} ${count}"><path d="${cells}" fill="#A9A9A9"/></svg>`
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

/** 时间戳差格式化（对齐 formatSinceUnixTimestamp） */
export function formatSinceUnixTimestamp (ts) {
  ts = String(ts || '').trim()
  if (!ts) return ''
  const raw = parseInt(ts)
  if (!raw || raw <= 0) return ''
  const ms = ts.length === 10 ? raw * 1000 : raw
  const delta = Date.now() - ms
  if (delta < 0) return ''
  let minutes = Math.floor(delta / 60000) % 60
  const hours = Math.floor(delta / 3600000)
  if (minutes === 0) minutes = 1
  if (hours < 1) return `${minutes} 分钟`
  return `${hours} 小时 ${minutes} 分钟`
}

/** 直播时长（对齐 calculateLiveDuration；endTime 为空则用当前时间） */
export function calculateLiveDuration (startTimeStr, endTimeStr = '') {
  startTimeStr = String(startTimeStr || '').trim()
  if (!startTimeStr) return ''
  let start = new Date(startTimeStr.replace(/-/g, '/'))
  if (Number.isNaN(start.getTime()) && /^\d{2}:\d{2}:\d{2}$/.test(startTimeStr)) {
    const today = new Date()
    start = new Date(`${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()} ${startTimeStr}`)
    if (start.getTime() > Date.now()) start = new Date(start.getTime() - 86400000)
  }
  if (Number.isNaN(start.getTime())) return ''
  let end = Date.now()
  if (endTimeStr) {
    const ts = parseInt(endTimeStr)
    if (ts) end = ts > 9999999999 ? ts : ts * 1000
  }
  const delta = end - start.getTime()
  if (delta < 0) return ''
  let minutes = Math.floor(delta / 60000) % 60
  const hours = Math.floor(delta / 3600000)
  if (minutes === 0 && hours === 0) minutes = 1
  if (hours < 1) return `${minutes} 分钟`
  return `${hours} 小时 ${minutes} 分钟`
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Go strings.ReplaceAll 等效 */
const rep = (s, find, val) => String(s ?? '').split(find).join(String(val ?? ''))
const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}
/** 当前时间 "YYYY-MM-DD HH:mm"（对齐 Go time.Now().Format("2006-01-02 15:04")） */
const nowMin = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** model_order 解析（对齐 render.go parseOrder，1-4 去重） */
function parseOrder (s, fallback) {
  const seen = new Set()
  const out = []
  for (const part of String(s || '').split(',')) {
    const n = parseInt(String(part).trim(), 10)
    if (n >= 1 && n <= 4 && !seen.has(n)) {
      out.push(n)
      seen.add(n)
    }
  }
  return out.length ? out : fallback
}

/** 剥离 HTML 标签（对齐 render.go stripHTMLTags + 空白压缩） */
function stripHTMLTags (s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/** 认证角标 HTML（个人认证黄闪电 / 机构认证蓝闪电 / 未认证空） */
function verifyTagHTML (info) {
  if (info.VerifyType === 0) return `<span class="vtag"><img src="${BILI_TAG_YELLOW}" alt="" /></span>`
  if (info.VerifyType === 1) return `<span class="vtag"><img src="${BILI_TAG_BLUE}" alt="" /></span>`
  return ''
}

/** 认证角标样式（放头像容器右下角；圆形由图片自持） */
const verifyTagCSS = `.vtag{position:absolute;right:0;bottom:0;width:22px;height:22px;border-radius:50%;overflow:hidden;border:2px solid #fff;box-sizing:border-box;z-index:3;background:#fff}.vtag img{display:block;width:100%;height:100%;object-fit:cover}.name-avatar,.avatar-box,.l4-awrap{overflow:visible}.l4-awrap{position:relative;width:64px;height:64px;flex-shrink:0}.name-avatar img,.avatar-img,.l4-awrap .avatar{border-radius:50%}.avatar-box .vtag{right:-3px;bottom:-3px}.l4-awrap .vtag{right:-5px;bottom:-5px}`

/** 粉丝数格式化（对齐 Go liveCuteHTML：>=1万 -> %.1f万 去尾 .0，>0 -> 整数，否则 "0"） */
function cuteFollowerStr (n) {
  n = Number(n) || 0
  if (n >= 10000) return ((n / 10000).toFixed(1)).replace(/\.0$/, '') + '万'
  if (n > 0) return String(n)
  return '0'
}

/** 公共数据准备（模板共用） */
async function prepareLiveRender (roomId, opts) {
  const { liveState = 0, timestamp = '', qr = true } = opts
  const content = opts.content !== false
  const info = await biliLiveInfo(roomId)
  const isLive = liveState === 0
  const cover = firstNonEmpty(info.Cover, info.Avatar)
  const coverData = await imageDataURL(cover, noCover)
  const avatarData = await imageDataURL(firstNonEmpty(info.Avatar, cover), coverData)
  const title = firstNonEmpty(info.Title, '直播间')
  const nickname = firstNonEmpty(info.Nickname, info.Author, info.RoomID, info.Platform)
  const liveURL = firstNonEmpty(info.LiveURL, info.SourceURL, info.RoomID)
  // 7000 语义：时长仅下播（state=1）计算显示；优先 StartTime→timestamp
  const duration = liveState === 1 ? (calculateLiveDuration(info.StartTime, timestamp) || formatSinceUnixTimestamp(timestamp)) : ''
  const qrData = qr && liveURL ? qrDataURL(liveURL) : ''
  return { info, isLive, coverData, avatarData, title, nickname, liveURL, duration, qrData, content }
}

/** 二维码 meta 模块（live1 case4 / Go 非B站 case3 共用结构） */
const qrMetaSection = qr => `<section class="mod mod-meta"><div class="meta card-glass"><div class="qr"><img src="${esc(qr)}" alt="扫码二维码" /></div><div class="meta-txt"><div class="cta" contenteditable="true">扫码进入直播间~</div><div class="time">时间：${nowMin()}</div></div></div></section>`

/**
 * live1 海报卡：逐字节对齐 render.go livePosterHTML
 * （model_order：1封面横幅 2信息卡 3公告 4二维码；badge 文本由 live/off CSS ::after 提供）
 * model_order 默认对齐 DDBOT 轻量版 notify.group.bilibili.live.tmpl：恒为 2,1,3,4（简介/信息在前）；显式传参覆盖
 */
function livePosterHTML ({ isLive, coverData, avatarData, nickname, title, info, qr, duration, durationLabel, tips = '', modelOrder = '', content }) {
  const order = parseOrder(modelOrder, [2, 1, 3, 4])
  const sections = []
  for (const code of order) {
    if (code === 1) {
      let s = `<section class="mod mod-hero"><div class="hero"><div class="right"><figure class="banner-card"><img src="${esc(coverData)}" alt="活动横幅" />`
      if (!isLive && duration) {
        s += `<div class="banner-ribbon" aria-label="本场直播时长"><span class="ribbon-txt">${esc(durationLabel)}${esc(duration)}</span></div>`
      }
      s += `</figure></div></div></section>`
      sections.push(s)
    } else if (code === 2) {
      sections.push(`<section class="mod mod-info"><div class="info-card card-glass"><div class="name-row"><div class="name-avatar"><img src="${esc(avatarData)}" alt="avatar" />${verifyTagHTML(info)}</div><div class="nickname">${esc(nickname)}</div><div class="live-badge"><span class="dot"></span><span>占位文字</span></div></div><div class="headline">${esc(title)}</div></div></section>`)
    } else if (code === 3) {
      // 对齐 7000 实测：显示简介/公告文本（B站简介，content=false 隐藏）
      const text = stripHTMLTags(content ? info.Description : '')
      if (text) sections.push(`<section class="mod mod-details"><div class="details card-glass">${esc(text)}</div></section>`)
    } else if (code === 4) {
      if (isLive && qr) sections.push(qrMetaSection(qr))
    }
  }

  const css = isLive ? liveCSS : offLiveCSS
  const background = coverData.replace(/'/g, "\\'")
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>直播海报</title>
<style>${css}</style>
<style>${verifyTagCSS}</style>
<style id="__canvas_bg">.canvas::before{background-image:url('${background}') !important;}</style>
</head>
<body>
<div class="canvas"><div class="stack">${sections.join('')}<section class="mod mod-credits"><div class="credits">${esc(CREDITS)}${tips ? ' ' + esc(tips) : ''}</div></section></div></div>
</body>
</html>`
}

/**
 * live2 卡片：逐字节对齐 render.go liveOtherHTML（originalStyleCSS + originalScriptJS）
 * badge 文本按源码写死"直播已结束"，页面内 originalScriptJS.syncBadgeLabel 依 body class 切换
 */
function live2HTML ({ isLive, coverData, avatarData, nickname, title, info, duration, qr, tips = '', modelOrder = '' }) {
  // 对齐 DDBOT 轻量版 tmpl：默认 2,1,3（信息在前；live2 无 4 号模块）
  const order = parseOrder(modelOrder, [2, 1, 3])
  const body = []
  for (const code of order) {
    if (code === 1) {
      body.push(`<div class="cover"><div class="badge"><span class="dot" aria-hidden="true"></span><span class="badge-text">直播已结束</span></div>`)
      if (!isLive && duration) {
        body.push(`<div class="duration">${esc('直播时长：')}${esc(duration)}</div>`)
      }
      body.push(`<img id="cover" alt="封面" src="${esc(coverData)}" /></div>`)
    } else if (code === 2) {
      // 认证角标（live2.css 自带 .tag tag-yellow/tag-blue 样式）
      const tag = info.VerifyType === 0
        ? `<div class="tag tag-yellow"><img src="${BILI_TAG_YELLOW}" alt="" /></div>`
        : info.VerifyType === 1 ? `<div class="tag tag-blue"><img src="${BILI_TAG_BLUE}" alt="" /></div>` : ''
      body.push(`<div class="left"><h2 class="title">${esc(title)}</h2><div class="meta"><div class="avatar-wrap"><div class="avatar"><img id="avatar" alt="头像" src="${esc(avatarData)}" /></div>${tag}</div><div class="text"><div class="up">${esc(nickname)}</div>`)
      if (info.Category) {
        body.push(`<div class="actions"><a href="#">${esc(info.Category)}</a></div>`)
      }
      body.push(`</div></div></div>`)
    } else if (code === 3) {
      if (isLive && qr) {
        body.push(`<div class="qr"><div class="qr-tip">扫描二维码进入直播间~</div><div class="side"><img id="qr" alt="二维码" src="${esc(qr)}" /></div></div>`)
      }
    }
  }

  body.push(`<div class="signature">${esc(CREDITS)}${tips ? ' ' + esc(tips) : ''}</div>`)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>直播卡片</title>
<style>${live2CSS}</style>
<!-- 用户要求：认证角标不随下播降饱和（live2.css 的 body.off .tag/.tag>img 带 !important，覆盖须同权重）；
     角标定位目标"头像圆边从角标中间穿过"（-15% 时角标中心恰好落在头像圆弧上） -->
<style>body.off .tag,body.off .tag>img{filter:none !important}:root{--tag-shift-x:-15%;--tag-shift-y:-15%}</style>
</head>
<body class="${isLive ? 'live' : 'off'}">
<div class="wrap"><div class="card layout-a">${body.join('')}</div></div>
<script>${live2JS}</script>
</body>
</html>`
}

/**
 * live3 可爱卡：对齐 render.go liveCuteHTML 的逐项字符串替换（模板 lib/templates/live3.html）
 */
function live3HTML ({ isLive, coverData, avatarData, nickname, title, info, areas, duration, durationLabel, tips = '' }) {
  let html = live3TPL

  const followerStr = cuteFollowerStr(info.FollowerNum)
  const guardStr = String(info.GuardNum ?? 0)

  // 时间胶囊（对齐 Go liveCuteHTML timeLabel/timeVal）
  let timeLabel = ''
  let timeVal = ''
  if (isLive) {
    timeLabel = '开播时间'
    timeVal = String(info.StartTime || '').slice(0, 16)
    if (!timeVal) timeVal = nowMin()
  } else if (duration) {
    timeLabel = durationLabel === '下播时间：' ? '下播时间' : '本场时长'
    timeVal = duration
  } else {
    timeLabel = '本场时长'
    timeVal = '已结束'
  }

  // 状态 class
  html = rep(html, `class="{% if live_status != 1 %}is-offline{% endif %}"`, isLive ? `class=""` : `class="is-offline"`)
  html = rep(html, `class="live-badge {% if live_status != 1 %}is-offline{% endif %}"`, isLive ? `class="live-badge"` : `class="live-badge is-offline"`)

  // 封面（\r\n / \n 两种风格都对齐 Go）
  const coverImg = `<img src="${coverData}" class="cover-image" id="coverImg" alt="Cover" crossorigin="anonymous">`
  const noCoverDiv = `<div style="width:100%;height:100%;background:#e1e1e1;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:40px;">NO COVER</div>`
  for (const eol of ['\r\n', '\n']) {
    const block = `{% if cover_url %}${eol}                <img src="{{ cover_url }}" class="cover-image" id="coverImg" alt="Cover" crossorigin="anonymous">${eol}            {% else %}${eol}                ${noCoverDiv}${eol}            {% endif %}`
    html = rep(html, block, coverData ? coverImg : noCoverDiv)
  }

  // 直播状态文本
  html = rep(html, `{% if live_status == 1 %}正在直播{% else %}直播已结束{% endif %}`, isLive ? '正在直播' : '直播已结束')

  // 时间胶囊块（\r\n / \n）
  const timePill = `<span>${timeLabel}</span>
                    <span style="opacity: 0.7; margin: 0 8px;">|</span>
                    <span>${timeVal}</span>`
  for (const eol of ['\r\n', '\n']) {
    const lines = [
      '            {% if live_status == 1 or live_status == 0 %}',
      '            <div class="time-pill">',
      '                {% if live_status == 1 %}',
      '                    <span>开播时间</span>',
      '                    <span style="opacity: 0.7; margin: 0 8px;">|</span>',
      '                    <!-- 修正：只使用后端传入的 safe 函数 -->',
      '                    <span>{{ getTime(live_time, "") }}</span>',
      '                {% else %}',
      '                    <span>本场时长</span>',
      '                    <span style="opacity: 0.7; margin: 0 8px;">|</span>',
      '                    <span>{{ getTime(live_time, "elapsed") }}</span>',
      '                {% endif %}',
      '            </div>',
      '            {% endif %}',
    ]
    html = rep(html, lines.join(eol), `            <div class="time-pill">
                ${timePill}
            </div>`)
  }

  // 头像（\r\n / \n；认证角标随用户要求注入）
  const avatarImg = `<img src="${avatarData}" class="avatar-img">${verifyTagHTML(info)}`
  const noFaceImg = `<img src="https://i0.hdslb.com/bfs/face/member/noface.jpg" class="avatar-img">`
  for (const eol of ['\r\n', '\n']) {
    const block = `{% if face_url %}${eol}            <img src="{{ face_url }}" class="avatar-img">${eol}            {% else %}${eol}            ${noFaceImg}${eol}            {% endif %}`
    html = rep(html, block, avatarData ? avatarImg : noFaceImg)
  }

  // cover 占位标记全局清理（剩余的取色脚本块）
  if (coverData) {
    html = rep(html, '{% if cover_url %}', '')
    html = rep(html, '{% endif %}', '')
  } else {
    html = rep(html, '{% if cover_url %}', '<!--')
    html = rep(html, '{% endif %}', '-->')
  }

  // 数据面板（B站分支）
  const statsHTML = `            <div class="stat-item">
                <div class="stat-label">粉丝</div>
                <div class="stat-val">${followerStr}</div>
            </div>
            <div class="divider"></div>
            <div class="stat-item">
                <div class="stat-label">粉丝牌</div>
                <div class="stat-val text-pink">${firstNonEmpty(info.MedalName, '-')}</div>
            </div>
            <div class="divider"></div>
            <div class="stat-item">
                <div class="stat-label">舰长</div>
                <div class="stat-val text-blue">${guardStr}</div>
            </div>`

  const areaHTML = areas ? `<div class="area-subtitle">${areas}</div>` : ''

  // 变量表（对齐 Go replacer 顺序）
  const pairs = [
    [`{{ theme_primary or '#FF7EB3' }}`, '#FF7EB3'],
    [`{{ theme_primary_light or '#FFC2D1' }}`, '#FFC2D1'],
    [`{{ theme_primary_dark or '#FF5E83' }}`, '#FF5E83'],
    [`{{ theme_secondary or '#7EC2FF' }}`, '#7EC2FF'],
    [`{{ cover_url }}`, coverData],
    [`{{ title }}`, title],
    [`{{ area_html }}`, areaHTML],
    [`{{ stats_html }}`, statsHTML],
    [`{{ uname }}`, nickname],
    [`{{ description if description else title }}`, firstNonEmpty(stripHTMLTags(info.Description), title)],
    [`{% if tips %}`, ''],
    [`{% endif %}`, ''],
    [`{{ tips }}`, tips],
  ]
  for (const [a, b] of pairs) html = rep(html, a, b)

  // 认证角标样式注入（.vtag 定位依赖 .avatar-box 的 position:relative，模板自带）
  html = rep(html, '</head>', `<style>${verifyTagCSS}</style></head>`)

  return html
}

/** live4 部署版模板（7000 实际加载的 DD Screen GO/template/bililive4.tmpl）：双端 CSS（View=0 桌面 / View=1 移动）+ 取色脚本 */
const live4CSS = (() => {
  const style = live4TPL.match(/<style>([\s\S]*?)<\/style>/)[1]
  // 顺序状态机解析 View=1 条件块（样式内各 View-if 平铺不嵌套；块内掺对的 {{if}}/{{else}}/{{end}} 无 - 号，不参与切分）
  const segs = style.split(/(\{\{-\s*if eq \.Options\.View 1\s*\}\}|\{\{-\s*else\s*\}\}|\{\{-\s*end\s*\}\})/)
  // View 条件分支嵌在 CSS 规则内部，须逐段交错拼接：desk 取 else 分支，mob 取 View=1 分支
  let desk = ''
  let mob = ''
  let inView = false
  let elseSeen = false
  for (const seg of segs) {
    if (seg === undefined) continue
    if (/^\{\{-\s*if eq \.Options\.View 1\s*\}\}$/.test(seg)) { inView = true; elseSeen = false; continue }
    if (inView && seg === '{{- else}}') { elseSeen = true; continue }
    if (inView && seg === '{{- end}}') { inView = false; elseSeen = false; continue }
    if (inView) { if (elseSeen) desk += seg; else mob += seg; continue }
    desk += seg
    mob += seg
  }
  // 用户要求：信息与二维码合并为一组（桌面端复用模板移动端的 .info-qr-row/.qr-inline 规则，取自 View=1 分支）
  desk += mob.substring(mob.indexOf('.info-qr-row'))
  // 容器宽度随二维码变化（桌面 带码1050/无码850；移动 带码600/无码500）；毛玻璃背景占位符（CSS 里的 {{.CoverBase64}}）
  const repl = s => s
    .replace('{{if .QRBase64}}1050px{{else}}850px{{end}}', '__L4W__')
    .replace('{{if .QRBase64}}600px{{else}}500px{{end}}', '__L4W__')
    .replace('{{.CoverBase64}}', '__L4COVER__')
  return { desktop: repl(desk), mobile: repl(mob) }
})()
const live4ColorJS = (live4TPL.match(/<script>[\s\S]*?<\/script>/) || [''])[0].replace('{{.CoverBase64}}', '__L4COVER__')

/**
 * live4 卡：对齐部署版 bililive4.tmpl，view=0 桌面横版（默认）/ view=1 移动竖版
 * model_order：1封面 2信息 3二维码（默认 1,2,3）；横版二维码为裸码（用户要求：去文字），紧跟房间号之后，
 * 容器宽度随内容自适应；移动端保持模板原样（码带文字在信息右侧，info-qr-row 一组），容器 带码600/无码500；
 * 独立 3 号仅在无 2 号时生效；不转义
 */
function live4HTML ({ isLive, coverData, avatarData, nickname, title, info, duration, durationLabel, tips = '', modelOrder = '', qr, view = 0 }) {
  const now = new Date()
  const p = n => String(n).padStart(2, '0')
  const generatedAt = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  // View=1 移动端竖版（对齐模板）：单列居中、封面 16:9 通栏，容器 带码600/无码500
  const l4css = view === 1 ? live4CSS.mobile : live4CSS.desktop
  const l4w = (view === 1 ? (qr ? 600 : 500) : (qr ? 1050 : 850)) + 'px'

  const qrInlineHTML = qr ? `<div class="qr-inline"><img class="qr-img" src="${qr}" /><div class="qr-text">扫码直达<br>直播间</div></div>` : ''
  // 下播统计条固定两行（分区一行、时长一行，用户要求不随容器宽度并排）；上播单行
  const statsHTML = isLive
    ? `<div class="stats-row"><div class="stat-item">分区: <span>${info.Category || ''}</span></div><div class="stat-item">人气/粉丝: <span>${info.FollowerNum ?? 0}</span></div></div>`
    : `<div class="stats-row stats-col"><div class="stat-item">分区: <span>${info.Category || ''}</span></div><div class="stat-item">${durationLabel} <span>${duration || ''}</span></div></div>`
  // 认证角标：给头像 img 包 wrapper（用户要求，样式见 verifyTagCSS）；
  // 横版二维码为裸码（用户要求：去文字降高度），紧跟房间号之后；移动端保持模板原样（码带文字在信息右侧）
  const authorHTML = `<div class="author-box"><div class="l4-awrap"><img class="avatar" src="${avatarData}" />${verifyTagHTML(info)}</div><div class="author-info"><div class="author-name">${nickname || info.Author || ''}</div><div class="room-id">Bilibili 房间号: ${info.RoomID || ''}</div></div>${view !== 1 && qr ? `<img class="qr-img l4-qr" src="${qr}" />` : ''}</div>`
  const infoBoxHTML = `<div class="info-main"><h2 class="title">${title}</h2>${authorHTML}${statsHTML}</div>`

  const parts = []
  const codes = parseOrder(modelOrder, [1, 2, 3])
  for (const code of codes) {
    if (code === 1) {
      parts.push(`<div class="cover-box${isLive ? '' : ' is-offline'}"><img class="cover-img" src="${coverData}" />${isLive ? '<div class="live-badge-overlay">正在直播</div>' : '<div class="live-badge-overlay" style="background: #555; box-shadow: none;">直播已结束</div>'}</div>`)
    } else if (code === 2) {
      parts.push(view === 1 && qr
        ? `<div class="info-qr-row">${infoBoxHTML}${qrInlineHTML}</div>`
        : infoBoxHTML)
    } else if (code === 3 && qr && !codes.includes(2)) {
      parts.push(`<div class="qr-section"><img class="qr-img" src="${qr}" /><div class="qr-text">扫码直达直播间</div></div>`)
    }
  }

  const footerTips = tips ? ` <span class="tips-text">${tips}</span>` : ''
  const l4Cover = coverData.replace(/'/g, "\\'")
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${l4css.replace('__L4W__', l4w).replace('__L4COVER__', l4Cover)}</style>
<!-- 用户要求：下播统计条固定两行 -->
<style>.stats-row{flex-wrap:wrap;row-gap:8px}.stats-col{flex-direction:column;align-items:flex-start;gap:8px}</style>
${view !== 1 ? '<!-- 用户要求：内容垂直居中、信息块收紧（标题/作者行与统计条间距收紧）、容器宽度随内容自适应（消除右侧空白；标题超宽时 520px 封顶换行） --><style>.container{width:max-content}.content{align-items:center}.info-main{flex:0 1 auto;width:fit-content;max-width:520px}.info-main .title{margin-bottom:12px}.info-main .author-box{margin-bottom:8px}.l4-qr{width:72px;height:72px;border-radius:8px;flex-shrink:0}</style>' : ''}
<style>${verifyTagCSS}</style>
</head>
<body>
<div class="container"><div class="bg-blur"></div><div class="content">${parts.join('\n')}</div></div>
<div class="footer" style="text-align:center">${CREDITS}${footerTips} | ${generatedAt}</div>
${live4ColorJS.replace('__L4COVER__', l4Cover)}
</body>
</html>`
}

/**
 * 渲染 B站直播卡
 * @param {string} roomId 房间号
 * @param {object} opts { liveState: 0上播/1下播, timestamp: 下播时间戳, qr: boolean, template: 'live1'|'live2'|'live3'|'live4' }
 * @returns {Promise<Buffer>}
 */
export async function renderBiliLive (roomId, opts = {}) {
  const { template = 'live1', tips = '', modelOrder = '', view = 0 } = opts
  const { info, isLive, coverData, avatarData, title, nickname, liveURL, duration, qrData, content } = await prepareLiveRender(roomId, opts)
  const shared = { isLive, coverData, avatarData, nickname, title, info, duration, durationLabel: '直播时长：', tips, modelOrder, view, content }

  if (template === 'live2') {
    // live2 对齐原版：透明二维码（灰模块 + 透明底）；页面按源码原样渲染（body::before 幕布垫底），
    // 直接截 .card（白底合成），再走 Go postProcessLivePNG：x=2,y=5,w-4,h-8 裁边 + 28 物理像素圆角
    const qr2 = qrData ? qrDataURLTransparent(liveURL) : ''
    const html = live2HTML({ ...shared, qr: qr2 })
    return captureHTML(html, { width: 785, height: 1042, dsf: 2, selector: '.card', post: { crop: [2, 5, 2, 3], radius: 28 } })
  }

  if (template === 'live3') {
    const html = live3HTML({ ...shared, areas: info.Category })
    return captureHTML(html, { width: 1080, height: 1080, dsf: 2, selector: 'body' })
  }

  if (template === 'live4') {
    // 对齐 Go liveCardHTML：QRBase64 仅由 opt.QR 决定，与上下播无关（模板内 {{if .QRBase64}} 控制）
    const qr2 = qrData
    const html = live4HTML({ ...shared, qr: qr2 })
    // 对齐 captureLiveHTML default viewport + Go 全页测量截取 + postProcessLivePNG（y=2/h-4 裁边 + 28 圆角）；
    // 竖版按实际内容宽收视口（容器 600/500 + body 左右 padding 40*2）；横版容器 max-content 自适应，
    // 视口给小值让全页宽度=内容宽度（用户要求消除右侧空白）
    const vpW = view === 1 ? (qr2 ? 680 : 580) : 360
    return captureHTML(html, { width: vpW, height: 1042, dsf: 2, selector: '', goFullPage: true, post: { crop: [0, 2, 0, 2], radius: 28 } })
  }

  // live1：页面按源码原样渲染，截 .canvas（白底合成）+ Go postProcessLivePNG（y=2/h-4 裁边 + 28 圆角）
  const html = livePosterHTML({ ...shared, qr: qrData })
  return captureHTML(html, { width: 785, height: 1042, dsf: 2, selector: '.canvas', post: { crop: [0, 2, 0, 2], radius: 28 } })
}
