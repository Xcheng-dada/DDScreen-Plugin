/**
 * 转图 HTTP 服务：兼容 DDBOT ddscreen（7000 端口服务）接口协议
 * - /api/Bili/Live ~ Live4   直播卡（roomid/live_state/timestamp/qr）
 * - /api/Bili/Dynamic[1]     B站动态（url/expand/atCard/linkQr）
 * - /api/Weibo/Dynamic       微博动态（url）
 * - /ScreenShotImg/*         渲染产物静态下载
 * 响应：成功 {"code":0,"pic":"http://<host>/ScreenShotImg/xxx.png"}
 *       失败 HTTP 200 + {"code":-1,"message":"发生错误：xxx"}
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderBiliLive } from './live.js'
import { renderBiliDynamic, renderBiliDynamicWeb } from './dynamic.js'
import { renderWeiboDynamic } from './weibo.js'
import { captureHTML } from './shot.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.join(dir, '..', 'data', 'ScreenShotImg')

/* ================= 配置 ================= */

const DEFAULT_CONFIG = { enabled: true, port: 5000, host: '127.0.0.1' }

function loadConfig () {
  try {
    const file = path.join(dir, '..', 'config', 'server.json')
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/* ================= 工具 ================= */

const imgName = prefix => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const rand = (BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))).toString()
  return `${prefix}_${ts}_${rand}.png`
}

function sendJSON (res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const fail = (res, msg) => sendJSON(res, { code: -1, message: '发生错误：' + msg })
const ok = (res, host, file) => sendJSON(res, { code: 0, pic: `http://${host}/ScreenShotImg/${file}` })

/** 渲染 -> 落盘 -> 返回 pic */
async function renderAndSave (res, host, prefix, renderer) {
  const buf = await renderer()
  const file = imgName(prefix)
  fs.mkdirSync(IMG_DIR, { recursive: true })
  fs.writeFileSync(path.join(IMG_DIR, file), buf)
  ok(res, host, file)
}

const isTrue = v => !['0', 'false', 'off', 'no'].includes(String(v ?? '').toLowerCase())

/* ================= 订阅列表（/api/Bili/List，DDBOT command.group.list.tmpl 调用） ================= */

const escList = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 订阅数据分组（对齐 render.go groupSubscriptionData：平台→首字母组→用户，组内按名称排序） */
export function groupSubscriptionData (raw) {
  const out = {}
  for (const [platformName, platformValue] of Object.entries(raw || {})) {
    const ids = platformValue && Array.isArray(platformValue.Ids) ? platformValue.Ids : []
    if (!ids.length) continue
    const groups = {}
    for (const item of ids) {
      if (!item || typeof item !== 'object') continue
      const name = String(item.Name ?? '')
      const u = {
        Name: name,
        UID: String(item.Uid ?? ''),
        Pic: String(item.Pic ?? ''),
        WatchType: String(item.WatchType ?? '').split('live').join('直播').split('news').join('动态'),
      }
      // 首字母分组：ASCII 字母取大写，其余归 #
      let group = '#'
      const r = [...name][0]
      if (r && ((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'))) group = r.toUpperCase()
      ;(groups[group] = groups[group] || []).push(u)
    }
    if (Object.keys(groups).length) out[platformName] = groups
  }
  for (const groups of Object.values(out)) {
    for (const users of Object.values(groups)) users.sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0))
  }
  return out
}

/** 订阅列表 HTML（对齐 render.go subscriptionListHTML：视口 1180 dsf2 全页截图） */
export function subscriptionListHTML (data, bg, textChar) {
  let body = ''
  for (const p of Object.keys(data).sort()) {
    const groups = data[p]
    const total = Object.values(groups).reduce((n, us) => n + us.length, 0)
    body += `<div class="platform"><h2>${escList(p)} <span>${total}</span></h2><div class="user-list">`
    for (const k of Object.keys(groups).sort()) {
      for (const u of groups[k]) {
        const pic = u.Pic ? `<img src="${escList(u.Pic)}" referrerpolicy="no-referrer">` : ''
        const nameClass = 'name' + (textChar ? ' ellipsis' : '')
        let uidText = ''
        if (u.UID) {
          let uidStr = u.UID
          if (!uidStr.toUpperCase().startsWith('UID') && !uidStr.includes('(')) uidStr = 'UID: ' + uidStr
          uidText = `<div class="uid">${escList(uidStr)}</div>`
        }
        body += `<div class="user">
<div class="user-info">
${pic}
<div class="name-uid">
<div class="${nameClass}">${escList(u.Name)}</div>
${uidText}
</div>
</div>
<div class="user-meta">
<div class="letter">${escList(k)}</div>
<div class="watch-type">${escList(u.WatchType)}</div>
</div>
</div>`
      }
    }
    body += '</div></div>'
  }
  let bgCSS = ''
  if (/^(https?:\/\/|data:)/.test(bg)) {
    bgCSS = `background-image:linear-gradient(rgba(255,255,255,0.9),rgba(255,255,255,0.9)),url("${bg}");background-size:cover;background-position:center;`
  }
  const d = new Date()
  const p2 = n => String(n).padStart(2, '0')
  const footer = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
/* 用户要求：边距收紧、宽度随内容自适应（原版 padding 60/80、title 60、cols 100、footer 80、min-width:100%） */
body{margin:0;font-family:"Microsoft YaHei",Arial,sans-serif;background:#ffffff;color:#333;width:fit-content;${bgCSS}}
.wrap{padding:28px 40px;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;width:fit-content}
.title{text-align:center;font-size:32px;color:#555;margin-bottom:28px}
.cols{display:flex;flex-wrap:nowrap;gap:60px;justify-content:center;align-items:flex-start}
.platform{display:flex;flex-direction:column;min-width:280px}
h2{font-size:54px;font-style:italic;color:#f39c12;margin:0 0 30px 0;display:flex;justify-content:flex-start;align-items:baseline;gap:15px;font-weight:800}
h2 span{font-size:28px;color:#e74c3c;font-style:italic;font-weight:600}
.user-list{display:flex;flex-direction:column;gap:30px}
.user{display:flex;justify-content:space-between;align-items:center;gap:40px}
.user-info{display:flex;align-items:center;gap:15px}
.user-info img{width:48px;height:48px;border-radius:50%;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.name-uid{display:flex;flex-direction:column}
.name{font-size:18px;font-weight:bold;color:#333}
.uid{font-size:14px;color:#888;margin-top:4px}
.ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.user-meta{display:flex;flex-direction:column;align-items:center;gap:8px}
.letter{font-size:32px;font-style:italic;color:#2ecc71;line-height:1;font-weight:800}
.watch-type{font-size:15px;color:#3498db;white-space:nowrap}
.footer{text-align:center;margin-top:36px;color:#aaa;font-size:16px}
</style></head><body><div class="wrap"><div class="title">DDBOT 订阅列表</div><div class="cols">${body}</div><div class="footer">DDScreen-Plugin By 小橙c | ${footer}</div></div></body></html>`
}

/* ================= 订阅列表头像补齐（DDBOT Lite 的 list 数据缺 Pic，仅 B站按 UID 自取；微博接口不稳定不做） ================= */

const UA_LIST = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const avatarCache = new Map() // bilibili:uid → { url, ts }
const AVATAR_TTL = 24 * 3600 * 1000

/** B站头像：web-interface/card 免登录返回 face */
async function fetchBiliFace (uid) {
  const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(uid)}&photo=false`, {
    headers: { 'User-Agent': UA_LIST, Referer: 'https://space.bilibili.com/' },
    signal: AbortSignal.timeout(6000),
  })
  const j = await res.json()
  return String(j?.data?.card?.face || '')
}

/** 为 Pic 为空的 B站订阅者补头像（内存缓存 24h），失败置空走无图样式；其他平台不做 */
async function enrichListAvatars (data) {
  const now = Date.now()
  const jobs = []
  for (const [platform, groups] of Object.entries(data)) {
    if (!platform.toLowerCase().includes('bilibili')) continue
    for (const users of Object.values(groups)) {
      for (const u of users) {
        if (u.Pic) continue
        const key = `bilibili:${u.UID}`
        const hit = avatarCache.get(key)
        if (hit && now - hit.ts < AVATAR_TTL) { u.Pic = hit.url; continue }
        jobs.push((async () => {
          const url = await fetchBiliFace(u.UID).catch(() => '')
          avatarCache.set(key, { url, ts: now })
          u.Pic = url
        })())
      }
    }
  }
  await Promise.all(jobs)
}

/** 订阅列表接口（对齐 httpapi server.go biliList：POST body / form 参数，PNG 字节直出） */
async function handleBiliList (req, res, q) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 8 << 20) return failList(res, '请求体过大')
    chunks.push(c)
  }
  let body = Buffer.concat(chunks).toString('utf8')
  if (!body.trim()) body = String(q.get('form') || '')
  // 临时调试：留存真实 payload 便于复现（验收后删除）
  try { fs.writeFileSync(path.join(IMG_DIR, '..', 'last_list_payload.json'), body) } catch {}
  let raw
  try {
    raw = JSON.parse(body)
  } catch (e) {
    return failList(res, 'JSON 数据不合法: ' + e.message)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failList(res, 'JSON 数据不合法: json: cannot unmarshal into map')
  const data = groupSubscriptionData(raw)
  if (!Object.keys(data).length) return failList(res, '暂无任何订阅')
  await enrichListAvatars(data).catch(() => {})
  const buf = await captureHTML(subscriptionListHTML(data, String(q.get('bg') || ''), isTrue(q.get('text_char'))), {
    width: 1180,
    height: 100,
    dsf: 2,
    goFullPage: true,
  })
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length })
  res.end(req.method === 'HEAD' ? undefined : buf)
}

const failList = (res, msg) => {
  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify({ code: -1, msg }))
}

/** 路由表：B站+微博转图（与 7000 协议对齐，GET/POST 均从 query 取参） */
const ROUTES = {
  '/api/Bili/Live': q => ({
    prefix: 'bili_live',
    run: () => renderBiliLive(String(q.get('roomid') || '').match(/\d+/)?.[0] || '', {
      liveState: [0, 1, 2].includes(Number(q.get('live_state') ?? 0)) ? Number(q.get('live_state')) : 0,
      timestamp: String(q.get('timestamp') || ''),
      qr: isTrue(q.get('qr') ?? 'false'),
      modelOrder: String(q.get('model_order') || ''),
      content: isTrue(q.get('content') ?? 'true'),
      tips: String(q.get('tips') || ''),
      template: 'live1',
    }),
  }),
  '/api/Bili/Live2': q => liveRoute(q, 'live2'),
  '/api/Bili/Live3': q => liveRoute(q, 'live3'),
  '/api/Bili/Live4': q => liveRoute(q, 'live4'),
  '/api/Bili/Dynamic': q => ({
    prefix: 'bili_dynamic',
    run: () => renderBiliDynamicWeb(String(q.get('url') || ''), {
      expand: isTrue(q.get('expand') ?? 'false'),
      atCard: isTrue(q.get('atCard') ?? 'false'),
      linkQr: isTrue(q.get('linkQr') ?? 'false'),
    }),
  }),
  '/api/Bili/Dynamic1': q => ({
    prefix: 'bili_dynamic1',
    run: () => renderBiliDynamic(String(q.get('url') || ''), {
      expand: isTrue(q.get('expand') ?? 'false'),
      atCard: isTrue(q.get('atCard') ?? 'false'),
      linkQr: isTrue(q.get('linkQr') ?? 'false'),
    }),
  }),
  '/api/Weibo/Dynamic': q => ({
    prefix: 'weibo_dynamic',
    run: () => renderWeiboDynamic(String(q.get('url') || '')),
  }),
}

function liveRoute (q, template) {
  return {
    prefix: `bili_${template}`,
    run: () => renderBiliLive(String(q.get('roomid') || '').match(/\d+/)?.[0] || '', {
      liveState: [0, 1, 2].includes(Number(q.get('live_state') ?? 0)) ? Number(q.get('live_state')) : 0,
      timestamp: String(q.get('timestamp') || ''),
      qr: isTrue(q.get('qr') ?? 'false'),
      content: isTrue(q.get('content') ?? 'true'),
      tips: String(q.get('tips') || ''),
      modelOrder: String(q.get('model_order') || ''),
      view: Number(q.get('view')) === 1 ? 1 : 0,
      template,
    }),
  }
}

/** 静态图片下载（仅 ScreenShotImg 下白名单扩展名，防目录穿越；DDBOT httpHead 会发 HEAD 预热） */
function serveImage (req, res, name) {
  if (!/^[\w.-]+$/.test(name) || name.includes('..') || !/\.(png|jpe?g|webp|gif)$/i.test(name)) {
    res.writeHead(404)
    return res.end('Not Found')
  }
  const file = path.join(IMG_DIR, name)
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404)
      return res.end('Not Found')
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length })
    res.end(req.method === 'HEAD' ? undefined : buf)
  })
}

/* ================= 渲染产物自动清理 ================= */

/** 渲染图保留时长（毫秒）：DDBOT 取图在渲染后几秒内完成，1 小时绰绰有余 */
const IMG_TTL = 60 * 60 * 1000

function cleanupIMG () {
  fs.readdir(IMG_DIR, (err, files) => {
    if (err) return
    const now = Date.now()
    for (const f of files) {
      if (!/\.(png|jpe?g|webp|gif)$/i.test(f)) continue
      const file = path.join(IMG_DIR, f)
      fs.stat(file, (e, st) => {
        if (!e && now - st.mtimeMs > IMG_TTL) fs.unlink(file, () => {})
      })
    }
  })
}

/* ================= 服务启动 ================= */

export function startScreenServer () {
  // 防止模块重载导致重复监听
  if (globalThis.__ddscreenServer) return globalThis.__ddscreenServer
  const config = loadConfig()
  if (!config.enabled) {
    logger.mark('[DDScreen] 转图接口未启用（config/server.json: enabled=false）')
    return null
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/api/Bili/List') {
      // 订阅列表：POST body PNG 直出（DDBOT command.group.list.tmpl 直接 | pic）
      handleBiliList(req, res, url.searchParams).catch(e => {
        logger.error(`[DDScreen] 订阅列表渲染失败: ${e.stack || e.message}`)
        if (!res.headersSent) failList(res, e.message)
      })
      return
    }
    const route = ROUTES[url.pathname]
    if (route) {
      const { prefix, run } = route(url.searchParams)
      renderAndSave(res, req.headers.host || `127.0.0.1:${config.port}`, prefix, run)
        .catch(e => {
          logger.error(`[DDScreen] 转图接口渲染失败 ${url.pathname}: ${e.stack || e.message}`)
          if (!res.headersSent) fail(res, e.message)
        })
      return
    }
    if (url.pathname.startsWith('/ScreenShotImg/')) {
      return serveImage(req, res, url.pathname.slice('/ScreenShotImg/'.length))
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: -1, message: '发生错误：接口不存在' }))
  })

  server.on('error', e => {
    logger.error(`[DDScreen] 转图接口启动失败: ${e.message}（端口 ${config.port} 可能被占用，可在 config/server.json 修改）`)
  })

  server.listen(config.port, config.host, () => {
    logger.mark(`[DDScreen] 转图接口已启动: http://127.0.0.1:${config.port} （B站直播/动态、微博动态，协议兼容 DDBOT ddscreen）`)
  })
  cleanupIMG()
  setInterval(cleanupIMG, 10 * 60 * 1000) // 每 10 分钟清理超过 1 小时的渲染图

  globalThis.__ddscreenServer = server
  return server
}
