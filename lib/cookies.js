import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

/** 配置来源：config/server.json（可选字段 cookieDir / cookieCloud，远程服务器按需覆盖） */
let serverCfg = {}
try { serverCfg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'server.json'), 'utf8')) } catch {}

/** DD_Screen 的 Cookie 存放目录：cookieDir 配置优先，否则自动探测 F:/D: 盘的 DD Screen GO（本地 F 盘、远程 D 盘） */
const autoDirs = ['F:/DD Screen GO', 'D:/DD Screen GO'].filter(d => { try { return fs.existsSync(d) } catch { return false } })
export const DD_DIR = serverCfg.cookieDir || autoDirs[0] || ''

/** CookieCloud 配置：凭证只从 config/server.json 读取（不进仓库），未配置则跳过云端同步走本地 Cookie */
const CC = {
  endpoint: serverCfg.cookieCloud?.endpoint || 'http://127.0.0.1:8088',
  uuid: serverCfg.cookieCloud?.uuid || '',
  password: serverCfg.cookieCloud?.password || '',
  timeout: 10000,
  refreshMs: 5 * 60 * 1000,
}
const cloudEnabled = !!(CC.uuid && CC.password)

/**
 * CookieCloud 数据内存缓存（key 为文件名语义：Bili_Cookies.json / Weibo_Cookies.json）
 * 保持各调用点同步读取语义：模块加载即异步拉取，5 分钟自动刷新
 */
const cloudCache = { 'Bili_Cookies.json': [], 'Weibo_Cookies.json': [] }
let cloudOK = false

/** OpenSSL EVP_BytesToKey（MD5 摘要，CryptoJS passphrase 模式兼容） */
function evpBytesToKey (pass, salt, keyLen = 32, ivLen = 16) {
  const d = []
  let prev = Buffer.alloc(0)
  while (Buffer.concat(d).length < keyLen + ivLen) {
    prev = crypto.createHash('md5').update(Buffer.concat([prev, pass, salt])).digest()
    d.push(prev)
  }
  const all = Buffer.concat(d)
  return { key: all.subarray(0, keyLen), iv: all.subarray(keyLen, keyLen + ivLen) }
}

/** 解密 CryptoJS passphrase 模式（legacy：口令 = MD5(uuid-password) 前 16 位字符串，Salted__ + AES-256-CBC） */
function decryptLegacy (b64, uuid, pass) {
  const buf = Buffer.from(b64, 'base64')
  if (buf.subarray(0, 8).toString() !== 'Salted__') throw new Error('非 Salted__ 格式')
  const passphrase = crypto.createHash('md5').update(`${uuid}-${pass}`).digest('hex').substring(0, 16)
  const salt = buf.subarray(8, 16)
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, 'utf8'), salt)
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([d.update(buf.subarray(16)), d.final()]).toString('utf8')
}

/** 解密 aes-128-cbc-fixed（固定零 IV） */
function decryptFixedIv (b64, uuid, pass) {
  const key = crypto.createHash('md5').update(`${uuid}-${pass}`).digest('hex').substring(0, 16)
  const iv = Buffer.alloc(16, 0)
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), iv)
  return Buffer.concat([d.update(Buffer.from(b64, 'base64')), d.final()]).toString('utf8')
}

/** 从 CookieCloud 拉取并解密，转换为本插件 readCookies 的格式 */
async function fetchCloud () {
  const res = await fetch(`${CC.endpoint}/get/${CC.uuid}`, { signal: AbortSignal.timeout(CC.timeout) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { encrypted, crypto_type: cryptoType } = await res.json()
  const raw = cryptoType === 'aes-128-cbc-fixed'
    ? decryptFixedIv(encrypted, CC.uuid, CC.password)
    : decryptLegacy(encrypted, CC.uuid, CC.password)
  const cookieData = JSON.parse(raw).cookie_data || {}

  /** 按域名规则聚合（主域排前；不去重，保留各域同名 Cookie 以兼容按 Domain 过滤的调用点） */
  const pick = (mainDomain, re) => {
    const domains = Object.keys(cookieData).filter(k => re(k))
    domains.sort((a, b) => (a === mainDomain ? -1 : b === mainDomain ? 1 : 0))
    const out = []
    for (const d of domains) {
      for (const c of cookieData[d] || []) {
        if (!c.name || !c.value) continue
        out.push({
          Name: c.name,
          Value: c.value,
          Domain: c.domain || d,
          Path: c.path || '/',
          Expires: c.expires ?? c.expiration,
          HTTPOnly: !!c.httpOnly,
          Secure: !!c.secure,
        })
      }
    }
    return out
  }

  const bili = pick('.bilibili.com', k => /bilibili\.com$/.test(k))
  const weibo = pick('.weibo.com', k => /weibo\.(com|cn)|sina\.com\.cn$/.test(k))
  // 浏览器近期未访问 m.weibo.cn 时云端缺 XSRF-TOKEN，从本地文件补
  if (!weibo.some(c => c.Name.toLowerCase() === 'xsrf-token' && String(c.Domain).includes('weibo.cn'))) {
    const xsrf = readLocal('Weibo_Cookies.json').find(c => String(c.Name).toLowerCase() === 'xsrf-token' && String(c.Domain || '').includes('weibo.cn'))
    if (xsrf) weibo.push(xsrf)
  }

  cloudCache['Bili_Cookies.json'] = bili
  cloudCache['Weibo_Cookies.json'] = weibo
  if (!cloudOK) {
    cloudOK = true
    log.mark(`[DDScreen] CookieCloud 同步成功（bilibili:${bili.length} 项 / weibo:${weibo.length} 项）`)
  }
}

/** 日志：Yunzai 全局 logger，独立运行时静默 */
const log = typeof logger !== 'undefined' ? logger : { mark () {}, warn () {} }

/** 拉取失败必告警；成功且状态从失败恢复时提示；未配置凭证则静默跳过 */
async function refresh () {
  if (!cloudEnabled) return
  try {
    await fetchCloud()
  } catch (e) {
    log.warn(`[DDScreen] CookieCloud 同步失败${cloudOK ? '，回退本地文件' : ''}：${e.message}`)
  }
}

refresh()
setInterval(refresh, CC.refreshMs).unref()

/** 本地文件读取（回退）：DD_DIR → 插件 data/cookies */
const localCookieDirs = [DD_DIR, path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cookies')].filter(Boolean)
function readLocal (file) {
  for (const d of localCookieDirs) {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(d, file), 'utf8'))
      if (!Array.isArray(arr)) continue
      return arr.filter(c => c.Name && c.Value)
    } catch {}
  }
  return []
}

/** 读 Cookie 列表：优先 CookieCloud，异常时回退 DD_Screen 本地文件 */
export function readCookies (file) {
  const cloud = cloudCache[file]
  return cloud && cloud.length ? cloud : readLocal(file)
}

export function cookieHeader (file, domainFilter) {
  const cookies = readCookies(file)
  const list = domainFilter ? cookies.filter(c => String(c.Domain || '').includes(domainFilter)) : cookies
  return list.map(c => `${c.Name}=${c.Value}`).join('; ')
}

export const BILI_COOKIE = () => cookieHeader('Bili_Cookies.json')
export const WEIBO_COOKIE = () => cookieHeader('Weibo_Cookies.json')
/** 微博移动端仅使用 weibo.cn 域 cookie（对齐 DDScreenGO weiboMobile 行为） */
export const WEIBO_MOBILE_COOKIE = () => cookieHeader('Weibo_Cookies.json', 'weibo.cn')
