/**
 * 微博动态图片强制展开脚本（对齐 B 站 expand.js 的行为与观感）
 *
 * 微博 9 宫格是把原图用 object-fit:cover + 内联百分比宽高裁成方块的，
 * 这里按「原图比例」把完整图片竖排追加到正文末尾，与 B 站动态卡片一致：
 *   - 单图：只有长图（h/w >= 1.5）才展开，避免普通图重复一遍
 *   - 2 张及以上：全部展开（网格裁剪看不清）
 *   - 原网格保留不隐藏（和 B 站一致）
 *
 * 图片质量：微博网格里是 orj360（360px 宽），直接放大会糊。
 * 这里按 orj1080 → large → 原地址 的顺序挑第一个能加载的尺寸
 * （orj1080 约 1440px 宽，对 604 CSS px 宽 @2x 的卡片足够清晰，且体积远小于 large）。
 */
export default `(async () => {
  const log = []
  const body = document.querySelector("[data-dd-weibo-card-body='1']") || document.querySelector('article')
  if (!body) return 'weibo-expand: no body'

  // 正文大图只认微博图片 CDN（wx*.sinaimg.cn），排除头像(tva*)、VIP 图标(h5.sinaimg.cn)、表情
  const isContentSrc = (src) => /^https?:\\/\\/wx\\d+\\.sinaimg\\.cn\\//.test(src)

  // 网格图是懒加载的：滚动到图片区之前，个别格子还是 data:image/svg 占位图。
  // 先滚到图片区触发加载，再轮询等占位图换成真实地址（最多 8 秒），否则会漏图。
  const grids = Array.from(body.querySelectorAll('div.picture'))
  if (grids.length) {
    grids[grids.length - 1].scrollIntoView({ block: 'center' })
    window.dispatchEvent(new Event('scroll'))
  }
  const deadline = Date.now() + 8000
  let imgs = []
  for (;;) {
    imgs = Array.from(body.querySelectorAll('img')).filter(img => isContentSrc(img.currentSrc || img.src || ''))
    const pending = Array.from(body.querySelectorAll('div.picture img')).filter(img => !isContentSrc(img.currentSrc || img.src || ''))
    if (imgs.length && !pending.length) break
    if (Date.now() > deadline) break
    await new Promise(r => setTimeout(r, 250))
  }
  // 兜底：仍是占位图的格子，若带 data-src/data-original 就用备用地址补上
  for (const img of body.querySelectorAll('div.picture img')) {
    if (isContentSrc(img.currentSrc || img.src || '')) continue
    const alt = img.getAttribute('data-src') || img.getAttribute('data-original') || ''
    if (isContentSrc(alt)) imgs.push({ currentSrc: alt, src: alt })
  }
  if (!imgs.length) return 'weibo-expand: no content imgs'

  // 去重（同一张图可能在网格里出现多次）+ 生成候选尺寸
  const seen = new Set()
  const candidates = []
  for (const img of imgs) {
    let src = img.currentSrc || img.src
    const file = src.split('/').pop().split('?')[0]
    if (!file || seen.has(file)) continue
    seen.add(file)
    const origin = src.replace(/\\?.*$/, '')
    const list = []
    if (/\\/(orj360|orj480|orj960|orj1080|mw690|mw1024|bmiddle|small|thumbnail|thumb150|thumb300|woriginal|large)\\//.test(origin)) {
      list.push(origin.replace(/\\/(orj360|orj480|orj960|orj1080|mw690|mw1024|bmiddle|small|thumbnail|thumb150|thumb300|woriginal|large)\\//, '/orj1080/'))
      list.push(origin.replace(/\\/(orj360|orj480|orj960|orj1080|mw690|mw1024|bmiddle|small|thumbnail|thumb150|thumb300|woriginal|large)\\//, '/large/'))
    }
    list.push(origin)
    candidates.push({ file, list: Array.from(new Set(list)) })
  }
  log.push('candidates: ' + candidates.length)

  // 依次尝试候选尺寸，拿到第一张能加载的图与真实尺寸
  const probe = (src) => new Promise(resolve => {
    const im = new Image()
    im.referrerPolicy = 'no-referrer'
    let done = false
    const fin = (w, h) => {
      if (done) return
      done = true
      resolve(w > 0 && h > 0 ? { src, w, h } : null)
    }
    im.onload = () => fin(im.naturalWidth || 0, im.naturalHeight || 0)
    im.onerror = () => fin(0, 0)
    setTimeout(() => fin(im.naturalWidth || 0, im.naturalHeight || 0), 6000)
    im.src = src
  })

  const loaded = await Promise.all(candidates.map(async (c) => {
    for (const src of c.list) {
      const hit = await probe(src)
      if (hit) return hit
    }
    return null
  }))
  const ok = loaded.filter(Boolean)
  log.push('loaded: ' + ok.length)
  if (!ok.length) return 'weibo-expand: preload failed'

  // 与 B 站同规则：单图只在长图时展开，2 张及以上全量展开
  const needExpand = ok.length === 1 ? (ok[0].h / ok[0].w) >= 1.5 : true
  if (!needExpand) return 'weibo-expand: skip single normal image'

  const content = body.querySelector('.wbpro-feed-content') || body
  const wrap = document.createElement('div')
  wrap.setAttribute('data-dd-weibo-expand', '1')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;margin:16px 0;border-top:1px dashed rgba(128,128,128,.45);padding-top:16px;box-sizing:border-box;'

  const title = document.createElement('div')
  title.textContent = ok.length === 1 ? '👇 以下为长图展开 👇' : '👇 以下为完整图片展开 👇'
  title.style.cssText = 'font-size:14px;color:#9aa0a6;margin-bottom:8px;font-weight:bold;'
  wrap.appendChild(title)

  for (const d of ok) {
    const im = document.createElement('img')
    im.src = d.src
    im.referrerPolicy = 'no-referrer'
    im.loading = 'eager'
    im.decoding = 'sync'
    im.style.cssText = 'max-width:100%;width:auto;height:auto;display:block;border-radius:8px;object-fit:contain;'
    wrap.appendChild(im)
  }
  content.appendChild(wrap)

  // 等展开图真正加载完，避免截图时空白
  await Promise.all(Array.from(wrap.querySelectorAll('img')).map(im => new Promise(res => {
    if (im.complete && im.naturalWidth > 0) return res()
    im.addEventListener('load', () => res(), { once: true })
    im.addEventListener('error', () => res(), { once: true })
    setTimeout(res, 8000)
  })))

  return 'weibo-expand: expanded ' + ok.length + ' (' + log.join(', ') + ')'
})()`
