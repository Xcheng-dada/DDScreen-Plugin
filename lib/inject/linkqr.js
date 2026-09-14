(
            () => {
                if (typeof qrcode !== 'function') return;

                var links = [];
                var seen = new Set();

                document.querySelectorAll(
                    'a.opus-text-rich-hl.link, a.jump-link.opus-text-rich-hl'
                ).forEach(function(a) { links.push(a); });

                if (links.length === 0) {
                    document.querySelectorAll('a[href]').forEach(function(a) {
                        var text = (a.textContent || '').trim();
                        if (text.includes('\u7F51\u9875\u94FE\u63A5') && a.querySelector('svg')) {
                            links.push(a);
                        }
                    });
                }

                if (links.length === 0) return;

                var style = document.createElement('style');
                style.textContent =
                    '.__qr-block{display:flex;align-items:center;gap:14px;margin:14px 0;padding:14px 18px;' +
                    'background:#f6f7f8;border-radius:12px;border:1px solid #e3e5e7;white-space:normal;}' +
                    '.__qr-block .__qr-img-wrap{flex-shrink:0;width:110px;height:110px;background:#fff;' +
                    'border-radius:10px;border:1px solid #e3e5e7;display:flex;align-items:center;' +
                    'justify-content:center;padding:8px;box-sizing:border-box;}' +
                    '.__qr-block .__qr-img-wrap img{display:block;width:100%;height:100%;image-rendering:pixelated;}' +
                    '.__qr-block .__qr-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}' +
                    '.__qr-block .__qr-info .__qr-title{font-size:14px;font-weight:600;color:#18191c;' +
                    'line-height:1.4;display:flex;align-items:center;gap:6px;}' +
                    '.__qr-block .__qr-info .__qr-title svg{flex-shrink:0;}' +
                    '.__qr-block .__qr-info .__qr-url{font-size:12px;color:#9499a0;line-height:1.4;' +
                    'word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;' +
                    '-webkit-box-orient:vertical;overflow:hidden;}' +
                    '.__qr-block .__qr-info .__qr-hint{font-size:11px;color:#b0b4b8;line-height:1.3;margin-top:2px;}';
                document.head.appendChild(style);

                var svgIcon = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M6.67 9.33a3.33 3.33 0 004.71 0l2-2a3.33 3.33 0 00-4.71-4.71l-1.15 1.14" ' +
                    'stroke="#18191c" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/>' +
                    '<path d="M9.33 6.67a3.33 3.33 0 00-4.71 0l-2 2a3.33 3.33 0 004.71 4.71l1.14-1.14" ' +
                    'stroke="#18191c" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"/></svg>';

                for (var i = 0; i < links.length; i++) {
                    var link = links[i];
                    var href = (link.getAttribute('href') || '').trim();
                    if (!href || href === '#' || seen.has(href)) continue;
                    seen.add(href);

                    try {
                        var qr = qrcode(0, 'M');
                        qr.addData(href);
                        qr.make();
                        var qrDataUrl = qr.createDataURL(4, 2);

                        var block = document.createElement('div');
                        block.className = '__qr-block';

                        var qrWrap = document.createElement('div');
                        qrWrap.className = '__qr-img-wrap';
                        var qrImg = document.createElement('img');
                        qrImg.src = qrDataUrl;
                        qrImg.loading = 'eager';
                        qrImg.decoding = 'sync';
                        qrWrap.appendChild(qrImg);
                        block.appendChild(qrWrap);

                        var info = document.createElement('div');
                        info.className = '__qr-info';

                        var title = document.createElement('div');
                        title.className = '__qr-title';
                        title.innerHTML = svgIcon + '<span>\u626B\u7801\u8BBF\u95EE\u94FE\u63A5</span>';
                        info.appendChild(title);

                        var urlLabel = document.createElement('div');
                        urlLabel.className = '__qr-url';
                        urlLabel.textContent = href;
                        info.appendChild(urlLabel);

                        var hint = document.createElement('div');
                        hint.className = '__qr-hint';
                        hint.textContent = '\u4F7F\u7528\u624B\u673A\u626B\u63CF\u4E8C\u7EF4\u7801\u6253\u5F00';
                        info.appendChild(hint);

                        block.appendChild(info);

                        var insertRef = link;
                        var blockTags = new Set(['DIV','P','SECTION','ARTICLE','BLOCKQUOTE','LI','FIGCAPTION','FIGURE']);
                        var parent = link.parentElement;
                        while (parent && !blockTags.has(parent.tagName)) {
                            insertRef = parent;
                            parent = parent.parentElement;
                        }
                        // Skip whitespace-only text nodes after the link to avoid extra line breaks
                        // caused by white-space: pre-wrap on the parent container
                        var nextNode = insertRef.nextSibling;
                        while (nextNode && nextNode.nodeType === 3 && /^\s*$/.test(nextNode.textContent)) {
                            nextNode = nextNode.nextSibling;
                        }
                        if (parent) {
                            parent.insertBefore(block, nextNode);
                        } else {
                            link.parentNode.insertBefore(block, nextNode);
                        }
                    } catch(e) {}
                }
            }
        )();