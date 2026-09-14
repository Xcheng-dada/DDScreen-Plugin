<h1 align = "center">DDScreen-Plugin</h1>
<h4 align = "center">✨ 基于 <a href="https://github.com/TimeRainStarSky/Yunzai" target="_blank">TRSS-Yunzai</a> 的截图转图渲染插件 ✨ </h4>
<div align = "center">
        <a href="#前言插件简介">说明文档</a> &nbsp; · &nbsp;
        <a href="#功能一览">功能一览</a> &nbsp; · &nbsp;
        <a href="#安装">安装</a> &nbsp; · &nbsp;
        <a href="#常见问题-qa">常见问题</a>
</div>
<h4 align = "center"></h4>
<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="version">
</div>
<div align="center">
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node.js-18%2B-green?logo=node.js&logoColor=white" alt="Node.js">
  </a>
  <a href="https://github.com/TimeRainStarSky/Yunzai">
    <img src="https://img.shields.io/badge/TRSS--Yunzai-Plugin-success" alt="TRSS-Yunzai">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blueviolet" alt="LICENSE">
  </a>
</div>

<a id="前言插件简介"></a>

## **丨前言&插件简介**
一个 DDBOT 轻量版专用的**截图转图渲染端**插件。DDBOT 负责订阅和推送，本插件只负责一件事：把 B 站直播卡片、B 站动态、微博动态渲染成图片，供 DDBOT 模板取图发送。

项目地址：https://github.com/Xcheng-dada/DDScreen-Plugin

> [!TIP]
> 与原 DD Screen GO（7000 端口服务）接口协议完全兼容，DDBOT 模板把地址从 `7000` 改成 `5000` 即可无缝切换。

> [!IMPORTANT]
> **与 DDScreenGO 的差异**
> - 本项目不是 DDScreenGO 的 Go 代码重构，也不是官方分支。
> - 它是在 TRSS-Yunzai 插件体系内，用 JavaScript 重新实现的兼容渲染端。
> - 无需额外部署独立 Go 服务，放入 `plugins/` 目录即可随 Yunzai 启动。
>
> **模板修复**
> - 修复 `/api/Bili/Dynamic1`：@ 用户重复显示两个 `@` 的问题。
> - 修复 `/api/Bili/Live4`：排版异常、文字出框或被截断的问题。
> - 修复竖版直播模板不生效的问题。
> - 修复动态卡片中 4 宫格 / 9 宫格图片仅展开特定高度的问题，现统一强制展开全部图片，避免横图显示不全或未展开。
>
> **功能增强**
> - B 站直播卡片新增已认证主播的小闪电标识。

| 项目 | 语言 | 形态 | 默认端口 | 适用场景 |
| --- | --- | --- | --- | --- |
| DDScreenGO | Go | 独立 HTTP 服务 | 7000 | 通用 / DDBOT |
| DDScreen-Plugin | JavaScript | TRSS-Yunzai 插件 | 5000 | TRSS-Yunzai / DDBOT 轻量版 |

<a id="功能一览"></a>

## 丨功能一览

| 接口 | 说明 |
| --- | --- |
| `/api/Bili/Live` ~ `/api/Bili/Live4` | B 站直播卡 1~4 号样式，开播 / 下播自动适配 |
| `/api/Bili/Dynamic` | B 站动态网页截图，支持展开长图、@用户卡片、链接二维码 |
| `/api/Bili/Dynamic1` | B 站动态 1 号模板样式 |
| `/api/Weibo/Dynamic` | 微博动态网页截图 |
| `/api/Bili/List` | DDBOT 订阅列表渲染（B 站订阅自动补头像） |
| `/ScreenShotImg/*` | 渲染产物下载，图片 1 小时后自动清理，不占空间 |

<a id="安装"></a>

## 丨安装

1.  在 TRSS-Yunzai 根目录下使用以下命令拉取本项目（建议加 `--depth 1` 仅克隆最新提交，减少下载体积）

    ```bash
    git clone --depth 1 https://github.com/Xcheng-dada/DDScreen-Plugin.git ./plugins/ddscreen-plugin
    ```

2.  安装依赖（请确保当前位于 TRSS-Yunzai 根目录，`pnpm install` 会自动识别并安装本插件的依赖）

    ```bash
    pnpm install
    ```

3.  重启 TRSS-Yunzai，看到下面的日志即启动成功：

    ```text
    [DDScreen] 转图服务已启动 http://127.0.0.1:5000
    ```

4.  修改 DDBOT 轻量版 `template/` 里的模板，将取图地址改为 `http://127.0.0.1:5000`。

<a id="登录态配置"></a>

## 丨登录态配置

渲染 B 站动态、微博动态需要登录 Cookie，插件按以下顺序自动获取（任选其一即可）：

1.  **CookieCloud**（推荐）：在 `config/server.json` 中配置 CookieCloud 地址和凭证：

    ```json
    {
      "enabled": true,
      "port": 5000,
      "host": "127.0.0.1",
      "cookieCloud": {
        "endpoint": "http://127.0.0.1:8088",
        "uuid": "你的uuid",
        "password": "你的password"
      }
    }
    ```

2.  **本地 Cookie 文件**：把 `Bili_Cookies.json` / `Weibo_Cookies.json` 放到任意一个能被识别的目录：
    - 本机的 `DD Screen GO` 常见安装目录（例如 Windows 下的 F 盘 / D 盘）
    - 插件的 `data/cookies/` 目录

> [!NOTE]
> B 站 Cookie 可通过浏览器登录 bilibili.com 后使用 Cookie 导出插件获取，也可以直接复用 DD Screen GO 已有的 Cookie 文件。  
> 非 Windows 用户建议直接放到插件的 `data/cookies/` 目录。

<a id="常见问题-qa"></a>

## 丨常见问题 Q&A

### 丨端口被占用 / 想改端口？
编辑 `config/server.json` 的 `port` 字段，然后重启 Yunzai。DDBOT 模板里的地址也要同步修改。

### 丨B 站动态渲染失败，提示"出错啦"？
多为 Cookie 失效导致的风控。请更新 CookieCloud 中的 B 站登录态，或重新导出本地 Cookie 文件。

### 丨微博动态打不开？
微博是强制登录的，请确认 `Weibo_Cookies.json`（或 CookieCloud 中的微博登录态）有效。

### 丨会泄露我的 Cookie 吗？
不会。`config/server.json` 已被 git 忽略，不会被提交到任何仓库；插件也不会向任何第三方上传数据。

### 丨能和 DDScreenGO 同时运行吗？
可以。DDScreenGO 默认 `7000`，本插件默认 `5000`，端口不同即可共存。

### 丨安装后插件没有启动 / 没有日志？
1.  **确保依赖已安装**：在 TRSS-Yunzai 根目录内执行 `pnpm install`。
2.  **检查 Node.js 版本**：确保版本为 **18** 或以上。
3.  **重启 Yunzai**：安装依赖或修改配置后，请重启机器人。
4.  **查看详细日志**：错误信息通常会在控制台输出，根据日志排查问题。

<a id="感谢"></a>

## 丨感谢
-   [rock8526652 / DDScreenGO](https://github.com/rock8526652/DDScreenGO) ：本项目接口协议兼容的上游服务，DDBOT 模板可直接复用。
-   [TimeRainStarSky / Yunzai](https://github.com/TimeRainStarSky/Yunzai) ：本项目运行所依赖的框架。