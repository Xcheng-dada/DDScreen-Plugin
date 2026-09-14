(
            async () => {
                if (typeof qrcode !== 'function') return;

                var style = document.createElement('style');
                style.textContent =
                    '.__at-card{display:flex;align-items:center;gap:10px;margin:10px 0;padding:10px 14px;' +
                    'background:#f6f7f8;border-radius:10px;border:1px solid #e3e5e7;' +
                    'box-sizing:border-box;width:100%;white-space:normal;}' +
                    '.__at-card .__at-symbol{flex-shrink:0;font-size:28px;font-weight:700;color:#00aeec;' +
                    'line-height:1;user-select:none;}' +
                    '.__at-card .__at-avatar{flex-shrink:0;width:48px;height:48px;border-radius:50%;' +
                    'object-fit:cover;border:2px solid #e3e5e7;background:#fff;}' +
                    '.__at-card .__at-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}' +
                    '.__at-card .__at-name{font-size:14px;font-weight:600;color:#18191c;' +
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
                    '.__at-card .__at-desc{font-size:11px;color:#9499a0;line-height:1.3;' +
                    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
                    '.__at-card .__at-qr-wrap{flex-shrink:0;width:72px;height:72px;background:#fff;' +
                    'border-radius:8px;border:1px solid #e3e5e7;padding:5px;box-sizing:border-box;' +
                    'display:flex;align-items:center;justify-content:center;}' +
                    '.__at-card .__at-qr-wrap img{display:block;width:100%;height:100%;image-rendering:pixelated;}';
                document.head.appendChild(style);

                var atLinks = Array.from(document.querySelectorAll('a.opus-text-rich-hl.at[href*="space.bilibili.com"]'));
                var atSpans = Array.from(document.querySelectorAll('span.bili-rich-text-module.at[data-oid]'));
                var atFwdNames = Array.from(document.querySelectorAll('div.forward-name[data-mid]'));
                var atNodes = [...atLinks, ...atSpans, ...atFwdNames];
                if (!atNodes.length) return;

                var processed = new Set();

                for (var i = 0; i < atNodes.length; i++) {
                    var link = atNodes[i];
                    var mid;

                    if (link.tagName === 'A') {
                        var href = (link.getAttribute('href') || '').trim();
                        if (!href) continue;

                        var midMatch = href.match(/space\.bilibili\.com\/(\d+)/);
                        if (!midMatch) continue;

                        mid = midMatch[1];
                    } else if (link.tagName === 'SPAN') {
                        mid = (link.getAttribute('data-oid') || '').trim();
                        if (!mid) continue;
                    } else if (link.tagName === 'DIV' && link.classList.contains('forward-name')) {
                        mid = (link.getAttribute('data-mid') || '').trim();
                        if (!mid) continue;
                    } else {
                        continue;
                    }

                    if (processed.has(mid) && !window.__AT_USER_DATA__) continue;

                    // 请求间隔，避免限流
                    if (i > 0 && !window.__AT_USER_DATA__) {
                        await new Promise(function(r) { setTimeout(r, 150); });
                    }

                    var info = null;
                    // 优先使用 Go 端预取的用户数据
                    if (window.__AT_USER_DATA__ && window.__AT_USER_DATA__[mid]) {
                        info = window.__AT_USER_DATA__[mid];
                    } else {
                        // Fallback: 从 B站 API 获取（可能因无 cookies 被限流）
                        for (var retry = 0; retry < 3; retry++) {
                            try {
                                var resp = await fetch(
                                    'https://api.bilibili.com/x/space/app/index?mid=' + mid,
                                    { headers: { 'Referer': 'https://space.bilibili.com/' + mid }, credentials: 'include' }
                                );
                                var json = await resp.json();
                                if (json && json.code === 0 && json.data && json.data.info) {
                                    info = json.data.info;
                                    processed.add(mid);
                                    break;
                                }
                                // 非成功响应，等待后重试
                                await new Promise(function(r) { setTimeout(r, 300 * (retry + 1)); });
                            } catch(e) {
                                await new Promise(function(r) { setTimeout(r, 300 * (retry + 1)); });
                            }
                        }
                    }

                    if (!info) continue;

                    var spaceUrl = 'https://space.bilibili.com/' + mid;
                    var qr = qrcode(0, 'M');
                    qr.addData(spaceUrl);
                    qr.make();
                    var qrDataUrl = qr.createDataURL(3, 1);

                    var faceUrl = (info.face || '').trim();
                    if (!faceUrl) faceUrl = (link.getAttribute('data-face') || '').trim();
                    if (faceUrl.startsWith('//')) faceUrl = 'https:' + faceUrl;
                    if (faceUrl.startsWith('http://')) faceUrl = faceUrl.replace('http://', 'https://');

                    var card = document.createElement('div');
                    card.className = '__at-card';

                    var atSymbol = document.createElement('span');
                    atSymbol.className = '__at-symbol';
                    atSymbol.textContent = '@';
                    card.appendChild(atSymbol);

                    var avatar = document.createElement('img');
                    avatar.className = '__at-avatar';
                    avatar.src = faceUrl;
                    avatar.referrerPolicy = 'no-referrer';
                    avatar.loading = 'eager';
                    avatar.decoding = 'sync';
                    card.appendChild(avatar);

                    var infoDiv = document.createElement('div');
                    infoDiv.className = '__at-info';

                    var nameEl = document.createElement('div');
                    nameEl.className = '__at-name';
                    nameEl.textContent = info.name || '';
                    infoDiv.appendChild(nameEl);

                    var descParts = [];
                    if (info.official_info && info.official_info.desc) descParts.push(info.official_info.desc);
                    if (info.vip && info.vip.label && info.vip.label.text) descParts.push(info.vip.label.text);
                    var follower = info.follower;
                    if (typeof follower === 'number') {
                        descParts.push(follower >= 10000
                            ? (follower / 10000).toFixed(1).replace(/\.0$/, '') + '\u4E07\u7C89\u4E1D'
                            : follower + '\u7C89\u4E1D');
                    }

                    if (descParts.length) {
                        var descEl = document.createElement('div');
                        descEl.className = '__at-desc';
                        descEl.textContent = descParts.join(' \u00B7 ');
                        infoDiv.appendChild(descEl);
                    }

                    if (info.sign) {
                        var signEl = document.createElement('div');
                        signEl.className = '__at-desc';
                        signEl.textContent = info.sign.replace(/[\r\n]+/g, ' ').substring(0, 50);
                        infoDiv.appendChild(signEl);
                    }

                    card.appendChild(infoDiv);

                    var qrWrap = document.createElement('div');
                    qrWrap.className = '__at-qr-wrap';
                    var qrImg = document.createElement('img');
                    qrImg.src = qrDataUrl;
                    qrImg.loading = 'eager';
                    qrImg.decoding = 'sync';
                    qrWrap.appendChild(qrImg);
                    card.appendChild(qrWrap);

                    var insertRef = link;
                    var blockTags = new Set(['DIV','P','SECTION','ARTICLE','BLOCKQUOTE','LI','FIGCAPTION','FIGURE']);
                    var parent = link.parentElement;
                    while (parent && !blockTags.has(parent.tagName)) {
                        insertRef = parent;
                        parent = parent.parentElement;
                    }
                    // Skip whitespace-only text nodes after the link to avoid extra line breaks
                    var nextNode = insertRef.nextSibling;
                    while (nextNode && nextNode.nodeType === 3 && /^\s*$/.test(nextNode.textContent)) {
                        nextNode = nextNode.nextSibling;
                    }
                    if (parent) {
                        parent.insertBefore(card, nextNode);
                    } else {
                        link.parentNode.insertBefore(card, nextNode);
                    }
                    link.remove();
                }
            }
        )();