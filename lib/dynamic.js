/**
 * B站动态渲染总流程
 * - renderBiliDynamic   模板管线（对齐 render.go SaveBiliDynamic1，/api/Bili/Dynamic1）
 * - renderBiliDynamicWeb 真实页面截图管线（对齐 render.go SaveBiliDynamic/captureBiliDynamic，/api/Bili/Dynamic）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderGoTpl } from './gotpl.js'
import { captureHTML, openPage, roundCorners } from './shot.js'
import { biliDynamicID, fetchBiliDynamicRaw, fetchOpusTitleAndDesc, fetchBiliVoteInfo, fetchBiliUserInfo, biliBrowserCookies } from './bilibili.js'
import { BILI_TAG_YELLOW, BILI_TAG_BLUE } from './live.js'
import jsExpand from './inject/expand.js' // 该文件是 ESM 导出的字符串，readFileSync 会把 export 语句一并注入页面

const dir = path.dirname(fileURLToPath(import.meta.url))
const tplDynamic = fs.readFileSync(path.join(dir, 'templates/bilidynamic1.tmpl'), 'utf8')
const jsQrcode = fs.readFileSync(path.join(dir, 'inject/qrcode.js'), 'utf8')
const jsAtCard = fs.readFileSync(path.join(dir, 'inject/atcard.js'), 'utf8')
const jsLinkQr = fs.readFileSync(path.join(dir, 'inject/linkqr.js'), 'utf8')

/** 动态渲染地址记忆缓存（id → 上次成功的页面地址），持久化到 data/dyn-url-cache.json */
const dynURLCacheFile = path.join(dir, '..', 'data', 'dyn-url-cache.json')
let dynURLCache = {}
try { dynURLCache = JSON.parse(fs.readFileSync(dynURLCacheFile, 'utf8')) } catch {}
function saveDynURLCache () {
  try {
    fs.mkdirSync(path.dirname(dynURLCacheFile), { recursive: true })
    fs.writeFileSync(dynURLCacheFile, JSON.stringify(dynURLCache, null, 2))
  } catch {}
}

/** 对齐 render.go biliDynamicPrepareCSS（经 %q 注入 style 标签） */
const dynPrepareCSS = `
@font-face { font-family: 'PingFang SC'; src: local('Noto Sans CJK SC'), local('Noto Sans SC'), local('Source Han Sans SC'); }
@font-face { font-family: 'HarmonyOS_Regular'; src: local('Noto Sans CJK SC'), local('Noto Sans SC'), local('Source Han Sans SC'); }
@font-face { font-family: 'HarmonyOS Sans SC'; src: local('Noto Sans CJK SC'), local('Noto Sans SC'), local('Source Han Sans SC'); }
@font-face { font-family: 'Microsoft YaHei'; src: local('Noto Sans CJK SC'), local('Noto Sans SC'), local('Source Han Sans SC'); }
@font-face { font-family: 'Helvetica Neue'; src: local('Noto Sans CJK SC'), local('Noto Sans SC'), local('Source Han Sans SC'); }
* {
  font-family: 'Noto Sans CJK SC', 'Noto Sans SC', 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif !important;
}
#bili-header-container, .bili-mini-content-wp, .v-popover-content,
.login-tip, .bili-dyn-item__more, .opus-module-author__more,
.opus-module-extend, .opus-module-bottom, .bili-popup,
.bili-app-footer, .bili-report-wrap, .bgc, .bg {
  display: none !important;
  visibility: hidden !important;
}
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #f4f5f7 !important;
}
.__page, .__grid, .__tile { background: #ffffff !important; }
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
}
`

/** 对齐 render.go biliDynamicImagesReadyJS（%q = 截图选择器） */
const dynImagesReadyJS = selector => `(async () => {
const node = document.querySelector(${JSON.stringify(selector)});
if (!node) return false;
const allImgs = Array.from(node.querySelectorAll('img'));
allImgs.forEach(function(img) {
  try { img.loading = 'eager'; } catch(_) {}
  try { img.decoding = 'sync'; } catch(_) {}
  try { img.removeAttribute('loading'); } catch(_) {}
  try { img.removeAttribute('onload'); } catch(_) {}
  try { img.removeAttribute('onerror'); } catch(_) {}
  try { img.removeAttribute('data-onload'); } catch(_) {}
  try { img.removeAttribute('data-onerror'); } catch(_) {}
  const bImg = img.closest('.b-img');
  if (bImg && bImg.classList.contains('sleepy')) bImg.classList.remove('sleepy');
  let mask = null;
  const picImg = img.closest('.bili-dyn-pic__img');
  if (picImg && picImg.parentElement) mask = picImg.parentElement.querySelector('.bili-dyn-pic__mask');
  if (mask) mask.style.display = 'none';
  let curSrc = img.getAttribute('src') || '';
  if (curSrc.startsWith('//')) img.src = 'https:' + curSrc;
  let lazySrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
  if (lazySrc && (!img.src || img.src === 'about:blank' || img.src === window.location.href)) {
    if (lazySrc.startsWith('//')) lazySrc = 'https:' + lazySrc;
    img.src = lazySrc;
  }
});
const networkImgs = allImgs.filter(function(img) {
  if (img.complete && img.naturalWidth > 0) return false;
  const src = img.src || '';
  if (!src || src.startsWith('data:')) return false;
  return true;
});
if (!networkImgs.length) return true;
await Promise.race([
  Promise.all(networkImgs.map(function(img) {
    return new Promise(function(resolve) {
      if (img.complete) return resolve(true);
      const t = setTimeout(function() { resolve(false); }, 3500);
      img.onload = function() { clearTimeout(t); resolve(true); };
      img.onerror = function() { clearTimeout(t); resolve(false); };
    });
  })),
  new Promise(function(resolve) { setTimeout(resolve, 4500); })
]);
return true;
})()`

/** 对齐 render.go biliDynamicBeforeShotJS */
const dynBeforeShotJS = selector => `(() => {
const el = document.querySelector(${JSON.stringify(selector)});
if (!el) return false;

// 修复单张竖图/窄图时右侧大面积空白的问题
el.style.setProperty('width', 'fit-content', 'important');
el.style.setProperty('max-width', '632px', 'important');
el.style.setProperty('min-width', '400px', 'important');
el.style.setProperty('margin', '0 auto', 'important');

const addBottom = el.matches('.bili-dyn-item');
const rect = el.getBoundingClientRect();
const newHeight = rect.height + (addBottom ? 20 : 0);
if (addBottom) el.style.height = newHeight + 'px';

el.style.cssText += 'margin: 0 !important; overflow: hidden !important; background: #ffffff !important; border: none !important; box-shadow: none !important;';

document.querySelectorAll('.bgc, .bg').forEach(function(e) {
  e.style.setProperty('display', 'none', 'important');
});
return true;
})()`

/** 对齐 Go captureBiliDynamic 主体的错误页检测表达式 */
const dynWaitReadyJS = selector => `(() => {
	const t = document.title || '';
	if (t.includes('出错啦') || t.includes('404') || t.includes('412') || t.includes('验证码')) return true;
	const txt = document.body ? document.body.innerText : '';
	if (txt.includes('安全风控') || txt.includes('请求被拒绝')) return true;

	const el = document.querySelector(${JSON.stringify(selector)});
	if (!el) return false;
	const rect = el.getBoundingClientRect();
	return rect.width > 100 && rect.height > 50;
})()`

const dynErrorReasonJS = `(() => {
	const t = document.title || '';
	if (t.includes('出错啦') || t.includes('404') || t.includes('412') || t.includes('验证码')) return t;
	const txt = document.body ? document.body.innerText : '';
	if (txt.includes('安全风控') || txt.includes('请求被拒绝')) return '412风控拦截';
	return '';
})()`

const S = v => (v === undefined || v === null ? '' : typeof v === 'number' ? String(v) : String(v))

/** opus 回退注入（对齐 SaveBiliDynamic1 前半段） */
async function applyOpusFallback (rawData, origID) {
  const item = rawData?.data?.item
  if (!item) return
  const targets = [item]
  if (origID && item.orig) targets.push(item.orig)
  for (const target of targets) {
    const md = target?.modules?.module_dynamic
    if (!md || md.desc) continue
    const id = target === item ? origID : S(target.id_str || target.id)
    if (!id) continue
    const { title, desc } = await fetchOpusTitleAndDesc(id)
    if (!title && !desc) continue
    if (desc) md.desc = desc
    if (title) {
      if (md.major) {
        if (!md.major.article) md.major.article = { title }
      } else {
        md.major = { type: 'MAJOR_TYPE_ARTICLE', article: { title } }
      }
    }
  }
}

/** @节点文本归一：B站 AT 节点 text 自带 "@" 前缀，模板还会拼一个 "@"，先剥掉避免渲染出 @@ */
function normalizeAtNodes (rawData) {
  const item = rawData?.data?.item
  if (!item) return
  for (const dyn of [item, item.orig]) {
    const nodes = dyn?.modules?.module_dynamic?.desc?.rich_text_nodes
    if (!Array.isArray(nodes)) continue
    for (const n of nodes) {
      if (S(n?.type) === 'RICH_TEXT_NODE_TYPE_AT') n.text = S(n.text).replace(/^@+/, '')
    }
  }
}

/** 收集 @ 用户 mid（正文 + 转发原动态作者） */
function collectAtMids (rawData) {
  const mids = new Set()
  const item = rawData?.data?.item
  if (!item) return mids
  const scan = dyn => {
    const nodes = dyn?.modules?.module_dynamic?.desc?.rich_text_nodes
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        if (S(n?.type) === 'RICH_TEXT_NODE_TYPE_AT' && S(n?.rid)) mids.add(S(n.rid))
      }
    }
  }
  scan(item)
  const authorMid = S(item?.orig?.modules?.module_author?.mid)
  if (authorMid) mids.add(authorMid)
  scan(item?.orig)
  return mids
}

/** 投票选项预取注入 */
async function prefetchVote (rawData) {
  const vote = rawData?.data?.item?.modules?.module_dynamic?.additional?.vote
  const vid = Number(vote?.vote_id)
  if (!vid || vid <= 0) return
  const info = await fetchBiliVoteInfo(vid)
  if (info && Array.isArray(info.options) && info.options.length) vote.options = info.options
}

/**
 * 渲染 B站动态卡片
 * @param {string} rawURL 动态链接
 * @param {object} opts { expand, atCard, linkQr }
 * @returns {Promise<Buffer>}
 */
export async function renderBiliDynamic (rawURL, opts = {}) {
  const { expand = false, atCard = false, linkQr = false } = opts
  const id = biliDynamicID(rawURL)
  if (!id) throw new Error('无法从链接提取动态ID: ' + rawURL)

  const rawData = await fetchBiliDynamicRaw(id)
  await applyOpusFallback(rawData, id)
  normalizeAtNodes(rawData)
  if (atCard) {
    // 预取前先确保 opus 回退已补全 rich_text_nodes
    const mids = collectAtMids(rawData)
    if (mids.size) {
      const map = {}
      for (const mid of mids) {
        const info = await fetchBiliUserInfo(mid)
        if (info) map[mid] = info
      }
      var atUserDataJSON = JSON.stringify(map)
    }
  }
  await prefetchVote(rawData)

  const html = renderGoTpl(tplDynamic, {
    Platform: 'bili',
    RawURL: rawURL,
    ImageBase64: '',
    RawData: rawData,
    Timestamp: new Date().toTimeString().slice(0, 8),
    GeneratedAt: formatDate(new Date()),
    Expand: expand,
    AtCard: atCard,
    LinkQr: linkQr,
  })

  const injects = []
  if (atCard || linkQr) injects.push(jsQrcode)
  if (atUserDataJSON) {
    const b64 = Buffer.from(atUserDataJSON, 'utf8').toString('base64')
    injects.push(`window.__AT_USER_DATA__ = JSON.parse(decodeURIComponent(escape(atob('${b64}'))));`)
  }
  if (atCard) injects.push(jsAtCard)
  if (linkQr) injects.push(jsLinkQr)

  // 对齐 7000 captureLiveHTML(view=0, selector="", variant=1)：视口 785x1042 dsf2 全页截图（保留 body 灰边距）
  // 作者认证角标：official_verify type 0=个人黄闪电 / 1=机构蓝闪电，骑在头像下缘圆弧上
  const vType = Number(rawData?.data?.item?.modules?.module_author?.official_verify?.type)
  if (vType === 0 || vType === 1) {
    const src = vType === 0 ? BILI_TAG_YELLOW : BILI_TAG_BLUE
    injects.push(`(function(){var s=document.createElement('style');s.textContent='.avatar-wrap{position:relative}.avatar-wrap .dyn-vtag{position:absolute;right:-4%;bottom:-6%;width:32%;height:32%;z-index:3;pointer-events:none}';document.head.appendChild(s);var w=document.querySelector('.header .avatar-wrap');if(w){var i=document.createElement('img');i.className='dyn-vtag';i.src='${src}';w.appendChild(i)}})()`)
  }
  return captureHTML(html, { width: 785, height: 1042, dsf: 2, goFullPage: true, injects })
}

/**
 * B站动态真实页面截图管线（逐字节对齐 render.go SaveBiliDynamic → BiliDynamic → captureBiliDynamic）
 * - isOpus 判定复用 detail API（Go biliDynamicIsOpusArticle 同接口），DYNAMIC_TYPE_ARTICLE 先走 opus 页
 * - 双目标回退：primary 失败尝试 secondary，选择器均为 '.bili-opus-view, .bili-dyn-item'
 * - 截图后圆角：radius = round(短边*0.018) clamp 12-50（applyRoundedCorners）
 * @param {string} rawURL 动态链接
 * @param {object} opts { expand, atCard, linkQr }
 * @returns {Promise<Buffer>}
 */
export async function renderBiliDynamicWeb (rawURL, opts = {}) {
  const { expand = false, atCard = false, linkQr = false } = opts
  const id = biliDynamicID(rawURL)
  if (!id) throw new Error('无法从链接提取动态ID: ' + rawURL)

  const cookies = biliBrowserCookies()
  const selector = '.bili-opus-view, .bili-dyn-item'
  const tURL = 'https://t.bilibili.com/' + id
  const opusURL = 'https://www.bilibili.com/opus/' + id

  // 地址记忆：某条动态首次渲染成功用的地址持久化，之后直达
  let cachedURL = dynURLCache[id]
  if (cachedURL !== tURL && cachedURL !== opusURL) cachedURL = null

  // 恒 opus 优先：普通动态 opus 会 302 回 t 页（实测登录态下两入口渲染字节一致），
  // 文章/受限动态 t 页报"出错啦"而 opus 可直接出图——首次即成功，无多余回退
  const order = cachedURL ? [cachedURL] : [opusURL, tURL]

  let lastErr = null
  for (const url of order) {
    try {
      const buf = await captureBiliDynamicPage(url, { cookies, selector, expand, atCard, linkQr })
      if (!cachedURL) {
        dynURLCache[id] = url
        saveDynURLCache()
      }
      return buf
    } catch (e) {
      logger.info(`[DDScreen] ${url} 渲染失败，尝试备用地址: ${e.message}`)
      lastErr = e
    }
  }
  logger.warn(`[DDScreen] B站动态 ${id} 两跳均失败: ${lastErr?.message}`)
  throw lastErr || new Error('动态地址不合法')
}

/** 对齐 Go captureBiliDynamic 单次会话流程 */
async function captureBiliDynamicPage (url, { cookies, selector, expand, atCard, linkQr }) {
  const { page, close } = await openPage(url, {
    cookies,
    referer: url,
    viewport: [2048, 2048, 2],
    blocked: ['*googletagmanager.com*', '*google-analytics.com*', '*doubleclick.net*', '*cm.bilibili.com*', '*beacon*', '*track*'],
    timeout: 15000,
  })
  try {
    await page.waitForFunction('!!document.body', { timeout: 10000 }).catch(() => {})
    const currentURL = await page.evaluate('window.location.href').catch(() => '')
    if (String(currentURL).includes('passport.bilibili.com')) throw new Error('被重定向到登录页面')

    // 注入准备 CSS（对齐 biliDynamicPrepareJS）
    await page.evaluate((css) => {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      return true
    }, dynPrepareCSS).catch(() => {})

    await page.waitForFunction(dynWaitReadyJS(selector), { timeout: 20000, polling: 300 })

    const errReason = await page.evaluate(dynErrorReasonJS).catch(() => '')
    if (errReason) throw new Error('检测到错误页面，快速失败拦截 (原因: ' + errReason + ')')

    // 先等待原始页面图片加载（确保 Vue 渲染完富文本 @ 标签）
    await page.evaluate(dynImagesReadyJS(selector)).catch(() => {})

    if (expand) {
      await page.evaluate(jsExpand).catch(e => logger.warn('[DDScreen] 展开JS执行失败: ' + e.message))
    }

    if (atCard || linkQr) await page.evaluate(jsQrcode).catch(() => {})
    if (atCard) await page.evaluate(jsAtCard).catch(e => logger.warn('[DDScreen] 注入用户卡片失败: ' + e.message))
    if (linkQr) await page.evaluate(jsLinkQr).catch(e => logger.warn('[DDScreen] 注入链接二维码失败: ' + e.message))

    // 注入后新增图片（头像/二维码）再等一次
    await page.evaluate(dynImagesReadyJS(selector)).catch(() => {})

    await page.evaluate(dynBeforeShotJS(selector)).catch(() => {})
    await page.evaluate(dynBeforeShotJS(selector)).catch(() => {})

    const el = await page.$(selector)
    if (!el) throw new Error('未找到截图目标元素: ' + selector)
    let buf = await el.screenshot({ type: 'png', captureBeyondViewport: true })
    buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)

    // 对齐 Go 圆角后处理：radius = round(短边*0.018) clamp 12-50
    const radius = pngRadius(buf)
    return await roundCorners(buf, radius)
  } finally {
    close()
  }
}

/** 解析 PNG IHDR 取宽高并计算圆角半径（Go: shortSide*0.018, clamp 12-50） */
function pngRadius (buf) {
  if (buf.length < 24) return 12
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  const shortSide = Math.min(w, h)
  let radius = Math.round(shortSide * 0.018)
  if (radius < 12) radius = 12
  if (radius > 50) radius = 50
  return radius
}

function formatDate (d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
