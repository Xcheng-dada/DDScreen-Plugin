/**
 * B站数据抓取（对齐 DDScreenGO service.go / render.go）
 */
import { BILI_COOKIE, readCookies } from './cookies.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

function biliFetch (url, { timeout = 15000, referer } = {}) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      Cookie: BILI_COOKIE(),
      ...(referer ? { Referer: referer } : {}),
    },
    signal: AbortSignal.timeout(timeout),
  })
}

/** 从链接提取动态 ID（对齐 SaveBiliDynamic1 正则） */
export function biliDynamicID (rawURL) {
  return rawURL.match(/(?:t\.bilibili\.com\/|opus\/|dynamic\/)(\d+)/)?.[1] || ''
}

/** 动态详情原始 JSON（render.go FetchBiliDynamicRaw） */
export async function fetchBiliDynamicRaw (id) {
  const res = await biliFetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?timezone_offset=-480&id=${id}`)
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error('动态接口返回异常响应（可能触发风控），请稍后重试') }
  if (data.code !== 0) throw new Error(`动态接口返回 ${data.code}: ${data.message}`)
  return data
}

/** opus 文章回退：desc 为空时从 opus 页面 __INITIAL_STATE__ 提取（render.go fetchOpusTitleAndDesc） */
export async function fetchOpusTitleAndDesc (id) {
  try {
    const res = await biliFetch(`https://www.bilibili.com/opus/${id}`, { timeout: 20000 })
    const html = await res.text()
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s)
    if (!m) return { title: '', desc: null }
    let detail
    try { detail = JSON.parse(m[1]).detail } catch { return { title: '', desc: null } }
    if (!detail?.modules) return { title: '', desc: null }
    let title = ''
    const richTextNodes = []
    for (const mod of detail.modules) {
      if (mod.module_type === 'MODULE_TYPE_TITLE' && mod.module_title?.text) {
        title = mod.module_title.text
      } else if (mod.module_type === 'MODULE_TYPE_CONTENT' && mod.module_content?.paragraphs) {
        const nodes = mod.module_content.paragraphs.flatMap(p => p.text?.nodes || [])
        nodes.forEach((n, ni) => {
          if (n.type === 'TEXT_NODE_TYPE_WORD' && n.word?.words) {
            let text = n.word.words
            const next = nodes[ni + 1]
            if (next?.type === 'TEXT_NODE_TYPE_RICH' && next.rich?.type === 'RICH_TEXT_NODE_TYPE_WEB') {
              text = text.replace(/[ \n\r\t]+$/, '')
            }
            richTextNodes.push({ type: 'RICH_TEXT_NODE_TYPE_TEXT', text })
          } else if (n.type === 'TEXT_NODE_TYPE_RICH' && n.rich) {
            const rich = n.rich
            const node = { type: rich.type, text: rich.text || '', jump_url: rich.jump_url || '' }
            if (rich.type === 'RICH_TEXT_NODE_TYPE_AT') {
              let rid = rich.rid || rich.oid || ''
              if (!rid) rid = (rich.jump_url || '').match(/space\.bilibili\.com\/(\d+)/)?.[1] || ''
              node.rid = rid
            }
            richTextNodes.push(node)
          }
        })
      }
    }
    return { title, desc: richTextNodes.length ? { rich_text_nodes: richTextNodes, text: '' } : null }
  } catch {
    return { title: '', desc: null }
  }
}

/** 投票选项（render.go fetchBiliVoteInfo） */
export async function fetchBiliVoteInfo (voteId) {
  try {
    const res = await biliFetch(`https://api.vc.bilibili.com/vote_svr/v1/vote_svr/vote_info?vote_id=${voteId}`, { timeout: 8000 })
    const root = await res.json()
    if (root.code !== 0) return null
    return root.data?.info || null
  } catch {
    return null
  }
}

/** @用户信息（render.go fetchBiliUserInfo） */
export async function fetchBiliUserInfo (mid) {
  try {
    const res = await biliFetch(`https://api.bilibili.com/x/space/app/index?mid=${mid}`, {
      timeout: 8000,
      referer: `https://space.bilibili.com/${mid}`,
    })
    const root = await res.json()
    if (root.code !== 0) return null
    return root.data?.info || null
  } catch {
    return null
  }
}

/** 直播间信息（service.go BiliLive） */
export async function biliLiveInfo (roomId) {
  roomId = String(roomId).match(/\d+/)?.[0] || ''
  if (!roomId) throw new Error('房间号不能为空')
  const headers = {
    'User-Agent': UA,
    Referer: 'https://www.bilibili.com/',
  }
  const ck = BILI_COOKIE()
  if (ck) headers.Cookie = ck

  const r1 = await fetch(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${roomId}`, { headers, signal: AbortSignal.timeout(25000) }).then(r => r.json())
  const data = r1?.data
  if (!data) throw new Error('Bilibili 房间数据为空')
  const uid = String(data.uid || '')
  const category = data.parent_area_name && data.area_name ? `${data.parent_area_name}-${data.area_name}` : (data.parent_area_name || data.area_name || '')
  const info = {
    Platform: 'Bilibili',
    RoomID: String(data.room_id || roomId),
    Title: data.title || '',
    Cover: data.user_cover || data.cover || '',
    IsLiving: String(data.live_status) === '1',
    LiveURL: `https://live.bilibili.com/${data.room_id || roomId}`,
    Category: category,
    Description: data.description || '',
    StartTime: data.live_time || '',
    FollowerNum: 0,
    GuardNum: 0,
    MedalName: '',
    VerifyType: -1, // 认证状态：-1 无 / 0 个人认证 / 1 机构认证
    Announce: '', // 直播间公告（Master/info 的 room_news.content）
  }
  if (uid) {
    try {
      const r2 = await fetch(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`, { headers: { ...headers, Referer: info.LiveURL }, signal: AbortSignal.timeout(25000) }).then(r => r.json())
      const ud = r2?.data
      if (ud) {
        info.Nickname = ud.info?.uname || ''
        info.Avatar = ud.info?.face || ''
        info.Announce = String(ud.room_news?.content || '').trim()
        if (!info.Description && info.Announce) info.Description = info.Announce
        if (typeof ud.follower_num === 'number') info.FollowerNum = ud.follower_num
        if (typeof ud.guard_num === 'number') info.GuardNum = ud.guard_num
        // 大航海实时总数
        try {
          const r3 = await fetch(`https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topListNew?roomid=${info.RoomID}&page=1&ruid=${uid}`, { headers: { ...headers, Referer: info.LiveURL }, signal: AbortSignal.timeout(25000) }).then(r => r.json())
          const num = r3?.data?.info?.num
          if (typeof num === 'number') info.GuardNum = num
        } catch {}
        info.MedalName = ud.medal_name || ud.medal?.medal_name || ''
      }
    } catch {}
    // 认证状态（个人认证黄闪电 / 机构认证蓝标）
    try {
      const r4 = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${uid}`, { headers: { ...headers, Referer: `https://space.bilibili.com/${uid}` }, signal: AbortSignal.timeout(25000) }).then(r => r.json())
      const type = r4?.data?.card?.official_verify?.type
      if (typeof type === 'number') info.VerifyType = type
    } catch {}
  }
  return info
}

/** 浏览器 cookie 列表（微博/动态真页面方案用） */
export const biliBrowserCookies = () => readCookies('Bili_Cookies.json')
