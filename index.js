import { startScreenServer } from './lib/server.js'

/**
 * DDScreen 插件（DDBOT 轻量版专用渲染端）
 * - HTTP 转图接口：协议兼容 DDBOT ddscreen（见 lib/server.js），DDBOT 模板经 httpGet 取图
 * - 订阅推送全部由 DDBOT 负责，本插件只管截图转图
 */
startScreenServer()
