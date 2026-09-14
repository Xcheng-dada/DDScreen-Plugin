/**
 * 微博动态截图（对齐 render.go WeiboDynamic：真实页面 + 元素截图）
 */
import { capturePage } from './shot.js'
import { readCookies } from './cookies.js'

/** 等待目标微博卡片就绪并注入截图标记（对齐 Go 版 waitJS） */
const weiboWaitFn = targetUid => `(async () => {
const targetUid = '${targetUid}'
await new Promise((resolve, reject) => {
  let attempts = 0, prevImgCount = 0, stableCount = 0
  const findAndLoad = () => {
    attempts++
    let article = null
    const link = document.querySelector("a[href*='/u/" + targetUid + "']")
    if (link) article = link.closest('article')
    if (!article) {
      const usercard = document.querySelector('[usercard*="id=' + targetUid + '"], [action-data*="uid=' + targetUid + '"]')
      if (usercard) article = usercard.closest('article')
    }
    if (!article) article = document.querySelector('article')
    if (!article) {
      if (attempts > 40) return reject(new Error('找不到博主链接或微博卡片，请确认是否登录成功'))
      return setTimeout(findAndLoad, 500)
    }
    const currentImgs = article.querySelectorAll('img')
    if (currentImgs.length !== prevImgCount) {
      prevImgCount = currentImgs.length; stableCount = 0
      return setTimeout(findAndLoad, 100)
    }
    if (stableCount < 3) { stableCount++; return setTimeout(findAndLoad, 100) }
    const body = article.querySelector('div[class*="_body_"]')
    if (body) {
      body.setAttribute('data-dd-weibo-card-body', '1')
      body.style.setProperty('padding-bottom', '20px', 'important')
    } else {
      article.setAttribute('data-dd-weibo-card-body', '1')
      article.style.setProperty('padding-bottom', '20px', 'important')
    }
    const followBtn = article.querySelector('button[class*="_followbtn_"]')
    if (followBtn) {
      const container = followBtn.closest('div.woo-box-flex')
      if (container) container.remove()
    }
    article.scrollIntoView({ block: 'center' })
    window.dispatchEvent(new Event('scroll'))
    const imgs = Array.from(article.querySelectorAll('img'))
    for (const img of imgs) {
      if (img.loading) img.loading = 'eager'
      img.decoding = 'sync'
    }
    const waitImg = (img) => new Promise(res => {
      let checks = 0
      const check = () => {
        checks++
        const src = img.src || ''
        if (src.startsWith('http') || src.startsWith('//')) {
          if (img.complete && img.naturalWidth > 0) return res()
          img.addEventListener('load', () => res(), { once: true })
          img.addEventListener('error', () => res(), { once: true })
          if (img.complete && img.naturalWidth > 0) return res()
          return
        }
        if (checks > 30) return res()
        setTimeout(check, 100)
      }
      check()
    })
    Promise.all(imgs.map(waitImg)).then(() => setTimeout(resolve, 1200))
  }
  findAndLoad()
})
return true
})()`

/**
 * 渲染微博动态
 * @param {string} rawURL 形如 https://weibo.com/uid/mid
 * @returns {Promise<Buffer>}
 */
export async function renderWeiboDynamic (rawURL) {
  const m = rawURL.match(/https?:\/\/weibo\.com\/(\d+)\/([A-Za-z0-9]+)/)
  if (!m) throw new Error('微博地址不合法')
  const [, uid, mid] = m
  const cookies = readCookies('Weibo_Cookies.json')
    .filter(c => !String(c.Domain || '').includes('weibo.cn'))
  return capturePage(`https://weibo.com/${uid}/${mid}`, {
    cookies,
    referer: 'https://weibo.com/',
    viewport: [2048, 2048, 2],
    waitFn: weiboWaitFn(uid),
    waitTimeout: 30000,
    selector: "[data-dd-weibo-card-body='1']",
    timeout: 20000,
  })
}
