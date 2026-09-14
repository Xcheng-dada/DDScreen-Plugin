/**
 * 截图封装：复用 TRSS-Yunzai 的 puppeteer 浏览器实例，不额外开进程
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Renderer from '../../../lib/puppeteer/puppeteer.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const cacheDir = path.join(os.tmpdir(), 'ddscreen-plugin')
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })

/** 图片/CSS 背景加载等待 JS（逐字节对齐 render.go liveCardReadyJS） */
const imagesReadyJS = `(async () => {
const imgs = Array.from(document.querySelectorAll('img'));
for (const img of imgs) {
  try {
    img.loading = 'eager';
    img.decoding = 'sync';
    try { img.fetchPriority = 'high'; } catch (_) {}
  } catch (_) {}
}
const waitOne = (img) => new Promise(resolve => {
  if (img.complete && img.naturalWidth > 0) return resolve(true);
  const done = () => {
    img.removeEventListener('load', done);
    img.removeEventListener('error', done);
    resolve(true);
  };
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  setTimeout(() => resolve(false), 5000);
});
const waitForCSSBackground = () => new Promise(resolve => {
  const hasCanvas = !!document.querySelector('.canvas');
  const bodyBefore = getComputedStyle(document.body, '::before').backgroundImage;
  const coverSrc = getComputedStyle(document.body).getPropertyValue('--cover-src').trim();
  const needsWait = (coverSrc && coverSrc !== 'none') ||
                    (bodyBefore && bodyBefore !== 'none' && bodyBefore !== '') ||
                    hasCanvas;
  if (!needsWait) return resolve(true);

  let attempts = 0;
  const check = () => {
    attempts++;
    const curCoverSrc = getComputedStyle(document.body).getPropertyValue('--cover-src').trim();
    const curBodyBefore = getComputedStyle(document.body, '::before').backgroundImage;
    const canvas = document.querySelector('.canvas');
    const curCanvasBefore = canvas ? getComputedStyle(canvas, '::before').backgroundImage : 'none';
    if ((curCoverSrc && curCoverSrc !== 'none' && curCoverSrc.includes('url')) ||
        (curBodyBefore && curBodyBefore !== 'none') ||
        (curCanvasBefore && curCanvasBefore !== 'none')) {
      return setTimeout(() => resolve(true), 400);
    }
    if (attempts >= 15) return resolve(false);
    setTimeout(check, 200);
  };
  check();
});
await Promise.race([
  Promise.all([Promise.all(imgs.map(waitOne)), waitForCSSBackground(), new Promise(r => setTimeout(r, 400))]),
  new Promise(r => setTimeout(r, 15000))
]);
await new Promise(r => setTimeout(r, 400));
return true;
})()`

/** 简易反检测脚本（对齐 captureBiliDynamic 的 addScriptToEvaluateOnNewDocument） */
const stealthJS = `
Object.defineProperty(navigator, 'webdriver', { get: () => false });
window.navigator.chrome = { runtime: {} };
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN','zh','en'] });
`

async function getBrowser () {
  const browser = await Renderer.browserInit()
  if (!browser) throw new Error('puppeteer 浏览器启动失败')
  return browser
}

/**
 * 渲染 HTML 并整页截图（对齐 captureLiveHTML：785x1042 @2x，无 clip 整页）
 * @param {string} html
 * @param {object} opts { width, height, dsf, injects: string[], selector, omitBackground, timeout,
 *                        post: { crop:[l,t,r,b], radius } }  // 对齐 Go postProcessLivePNG：先裁设备像素边，再按 applyRoundedCorners 公式做透明圆角
 * @returns {Promise<Buffer>}
 */
export async function captureHTML (html, opts = {}) {
  const { width = 785, height = 1042, dsf = 2, injects = [], selector = '', omitBackground = false, timeout = 45000, post = null } = opts
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: dsf })
    await page.evaluateOnNewDocument(stealthJS)
    // 对齐原版：写临时文件走 file:// 加载
    const file = path.join(cacheDir, `page-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    await fs.promises.writeFile(file, html)
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'networkidle2', timeout }).catch(() => {})
    // fonts ready
    await page.evaluate(() => document.fonts ? document.fonts.ready : true).catch(() => {})
    // 注入（二维码库 / @卡片 / 链接二维码）
    for (const js of injects) await page.evaluate(js).catch(e => logger.warn('[DDScreen] 注入JS失败: ' + e.message))
    // 等待图片加载
    await page.evaluate(imagesReadyJS).catch(() => {})
    let buf
    if (selector) {
      const el = await page.$(selector)
      if (el) {
        buf = await el.screenshot({ type: 'png', omitBackground, captureBeyondViewport: true })
      } else {
        buf = await page.screenshot({ type: 'png', omitBackground, fullPage: true })
      }
    } else if (opts.goFullPage) {
      // 对齐 Go browser.Screenshot(selector=="")：扫描 body 子元素取最大 bottom，clip 截取（而非 fullPage 的 scrollHeight）
      const clip = await page.evaluate(() => {
        let maxB = 0
        const bodyRect = document.body.getBoundingClientRect()
        maxB = bodyRect.bottom
        document.body.querySelectorAll('*').forEach(el => {
          const s = getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return
          const r = el.getBoundingClientRect()
          if (r.height === 0 && r.width === 0) return
          if (r.bottom > maxB) maxB = r.bottom
        })
        return { x: 0, y: 0, width: document.body.scrollWidth, height: Math.ceil(maxB) }
      })
      buf = await page.screenshot({ type: 'png', omitBackground, clip, captureBeyondViewport: true })
    } else {
      buf = await page.screenshot({ type: 'png', omitBackground, fullPage: true })
    }
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    // Go postProcessLivePNG 等效：裁边 + applyRoundedCorners（页面内 canvas 逐像素处理）
    if (post) {
      const crop = post.crop || [0, 0, 0, 0]
      const radius = post.radius || 0
      const dataUrl = await page.evaluate(async (b64, cr, rd) => {
        const img = new Image()
        await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = 'data:image/png;base64,' + b64 })
        const w = img.naturalWidth - cr[0] - cr[2]
        const h = img.naturalHeight - cr[1] - cr[3]
        if (w <= 0 || h <= 0) return null
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, -cr[0], -cr[1])
        if (rd > 0) {
          let r = rd
          if (r * 2 > w) r = Math.floor(w / 2)
          if (r * 2 > h) r = Math.floor(h / 2)
          const id = ctx.getImageData(0, 0, w, h)
          const d = id.data
          const fr = r
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let dx = 0
              let dy = 0
              let inCorner = false
              if (x < r) { dx = r - 0.5 - x; inCorner = true } else if (x >= w - r) { dx = x - (w - r - 0.5); inCorner = true }
              if (y < r) { dy = r - 0.5 - y; inCorner = true } else if (y >= h - r) { dy = y - (h - r - 0.5); inCorner = true }
              if (!inCorner || dx === 0 || dy === 0) continue
              const dist = Math.hypot(dx, dy)
              const i = (y * w + x) * 4 + 3
              if (dist >= fr) { d[i] = 0; continue }
              if (dist > fr - 1) d[i] = d[i] * (fr - dist)
            }
          }
          ctx.putImageData(id, 0, 0)
        }
        return cv.toDataURL('image/png')
      }, buf.toString('base64'), crop, radius).catch(() => null)
      if (dataUrl) buf = Buffer.from(dataUrl.split(',')[1], 'base64')
    }
    return buf
  } finally {
    page.close().catch(() => {})
  }
}

/**
 * 打开真实页面并截图（对齐 captureBiliDynamic / WeiboDynamic）
 * @param {string} url
 * @param {object} opts { cookies: [{Name,Value,Domain}], referer, viewport:[w,h,dsf], waitFn, selector, timeout }
 */
export async function capturePage (url, opts = {}) {
  const { cookies = [], referer = '', viewport = [2048, 2048, 2], waitFn = null, waitTimeout = 20000, selector = '', timeout = 30000 } = opts
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: viewport[0], height: viewport[1], deviceScaleFactor: viewport[2] })
    await page.evaluateOnNewDocument(stealthJS)
    if (referer) await page.setExtraHTTPHeaders({ Referer: referer, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' })
    await page.setUserAgent(UA)
    if (cookies.length) {
      for (const c of cookies) {
        await page.setCookie({ name: c.Name, value: c.Value, domain: c.Domain, path: c.Path || '/' }).catch(() => {})
      }
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForFunction('!!document.body', { timeout: 10000 }).catch(() => {})
    if (waitFn) await page.waitForFunction(waitFn, { timeout: waitTimeout, polling: 300 })
    await page.evaluate(imagesReadyJS).catch(() => {})
    let buf
    if (selector) {
      const el = await page.$(selector)
      if (!el) throw new Error('未找到截图目标元素: ' + selector)
      buf = await el.screenshot({ type: 'png', captureBeyondViewport: true })
    } else {
      buf = await page.screenshot({ type: 'png', fullPage: true })
    }
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  } finally {
    page.close().catch(() => {})
  }
}

/** 打开真实页面但不自动截图，返回 { page, close } 供调用方分步驱动（对齐 captureBiliDynamic 的会话流程） */
export async function openPage (url, opts = {}) {
  const { cookies = [], referer = '', viewport = [2048, 2048, 2], blocked = [], timeout = 30000 } = opts
  const browser = await getBrowser()
  const page = await browser.newPage()
  const close = () => page.close().catch(() => {})
  try {
    await page.setViewport({ width: viewport[0], height: viewport[1], deviceScaleFactor: viewport[2] })
    await page.evaluateOnNewDocument(stealthJS)
    // 对齐 Go 动态管线的 permissions 反检测附加段
    await page.evaluateOnNewDocument(`
if (navigator.permissions && navigator.permissions.query) {
  const origQuery = navigator.permissions.query;
  navigator.permissions.query = (p) => p && p.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : origQuery(p);
}
`).catch(() => {})
    if (blocked.length) {
      // 对齐 Go Network.setBlockedURLs 的通配模式（去 * 后做子串匹配）
      const keys = blocked.map(p => String(p).replace(/\*/g, ''))
      await page.setRequestInterception(true)
      page.on('request', req => {
        if (keys.some(k => req.url().includes(k))) req.abort().catch(() => {})
        else req.continue().catch(() => {})
      })
    }
    const headers = { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 'Sec-Ch-Ua': '"Google Chrome";v="148", "Chromium";v="148", "Not?A_Brand";v="24"', 'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"Windows"' }
    if (referer) headers.Referer = referer
    await page.setExtraHTTPHeaders(headers)
    await page.setUserAgent(UA)
    for (const c of cookies) {
      await page.setCookie({ name: c.Name, value: c.Value, domain: c.Domain, url: 'https://www.bilibili.com/' }).catch(() => {})
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    return { page, close }
  } catch (e) {
    close()
    throw e
  }
}

/** 透明圆角后处理（对齐 Go applyRoundedCorners：radius = round(短边*0.018) clamp 12-50，在设备像素上处理） */
export async function roundCorners (buf, radius) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    const dataUrl = await page.evaluate(async (b64, rd) => {
      const img = new Image()
      await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = 'data:image/png;base64,' + b64 })
      const w = img.naturalWidth
      const h = img.naturalHeight
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      let r = rd
      if (r * 2 > w) r = Math.floor(w / 2)
      if (r * 2 > h) r = Math.floor(h / 2)
      const id = ctx.getImageData(0, 0, w, h)
      const d = id.data
      const fr = r
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let dx = 0
          let dy = 0
          let inCorner = false
          if (x < r) { dx = r - 0.5 - x; inCorner = true } else if (x >= w - r) { dx = x - (w - r - 0.5); inCorner = true }
          if (y < r) { dy = r - 0.5 - y; inCorner = true } else if (y >= h - r) { dy = y - (h - r - 0.5); inCorner = true }
          if (!inCorner || dx === 0 || dy === 0) continue
          const dist = Math.hypot(dx, dy)
          const i = (y * w + x) * 4 + 3
          if (dist >= fr) { d[i] = 0; continue }
          if (dist > fr - 1) d[i] = d[i] * (fr - dist)
        }
      }
      ctx.putImageData(id, 0, 0)
      return cv.toDataURL('image/png')
    }, buf.toString('base64'), radius).catch(() => null)
    return dataUrl ? Buffer.from(dataUrl.split(',')[1], 'base64') : buf
  } finally {
    page.close().catch(() => {})
  }
}
