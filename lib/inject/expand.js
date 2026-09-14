/**
 * 动态图片强制展开脚本（逐字节对齐 render.go biliDynamicExpandJS）
 */
export default `(async () => {
    var log = [];
    var expanded = 0;

    // ========== 策略1: viewpic spans ==========
    var spans = Array.from(document.querySelectorAll('span[data-type="viewpic"]'));
    log.push('viewpic spans: ' + spans.length);
    for (var s = 0; s < spans.length; s++) {
        var span = spans[s];
        var pics;
        try { pics = JSON.parse(span.getAttribute('data-pics') || '[]'); }
        catch (_) { continue; }
        if (!pics.length) continue;

        var container = document.createElement('div');
        container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;margin:12px 0;';
        for (var p = 0; p < pics.length; p++) {
            var src = (pics[p].src || '').trim();
            if (!src) continue;
            if (src.startsWith('//')) src = 'https:' + src;
            if (src.startsWith('http://')) src = src.replace('http://', 'https://');
            var img = document.createElement('img');
            img.src = src;
            img.referrerPolicy = 'no-referrer';
            img.style.cssText = 'max-width:100%;width:auto;height:auto;display:block;border-radius:8px;object-fit:contain;';
            container.appendChild(img);
            expanded++;
        }
        span.parentNode.insertBefore(container, span.nextSibling);
        span.remove();
    }

    // ========== 策略2: 通用图片展开 (只在底部追加长图) ==========
    var root = document.querySelector('.bili-opus-view') || document.querySelector('.bili-dyn-item') || document;
    log.push('root: ' + (root === document ? 'document' : root.className));

    var containerSelectors = [
        '.dyn-card-opus__pics',
        '.bili-album__preview',
        '.bili-album__watch',
        '.bili-dyn-gallery',
        '.bili-dyn-pic__pics',
        '.horizontal-scroll-album',
        '.opus-module-top__album',
        '.bili-opus-view .opus-module-top'
    ];
    var gridContainers = new Set();
    for (var ci = 0; ci < containerSelectors.length; ci++) {
        var found = root.querySelectorAll(containerSelectors[ci]);
        for (var fi = 0; fi < found.length; fi++) {
            gridContainers.add(found[fi]);
        }
        if (found.length > 0) log.push('found ' + containerSelectors[ci] + ': ' + found.length);
    }

    var allImgs = Array.from(root.querySelectorAll('img'));
    var contentImgs = allImgs.filter(function(img) {
        var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src || src.startsWith('data:')) return false;
        var parent = img.closest('.opus-module-author, .bili-dyn-item__avatar, .bili-comment, .bili-avatar, .opus-module-bottom, .opus-module-extend');
        if (parent) return false;
        var inContent = img.closest('.opus-module-content, .dyn-card-opus, .bili-dyn-item__main, .bili-rich-text-module, .opus-module-top');
        return !!inContent;
    });
    log.push('content imgs: ' + contentImgs.length);

    if (contentImgs.length > 0 || gridContainers.size > 0) {
        contentImgs.forEach(function(img) {
            var p = img.parentElement;
            for (var d = 0; d < 8 && p && p !== root; d++) {
                var style = window.getComputedStyle(p);
                var display = style.display || '';
                if (display.includes('grid') || (display.includes('flex') && p.children.length > 1)) {
                    gridContainers.add(p);
                    break;
                }
                p = p.parentElement;
            }
        });
        log.push('grid containers: ' + gridContainers.size);

        var gridPromises = Array.from(gridContainers).map(async function(grid) {
            // 防止父子容器重复处理
            var isChild = false;
            var checkP = grid.parentElement;
            while(checkP && checkP !== root) {
                if (gridContainers.has(checkP)) { isChild = true; break; }
                checkP = checkP.parentElement;
            }
            if (isChild) return;

            var rawUrls = [];

            // 1. 提取 img 标签
            Array.from(grid.querySelectorAll('img')).forEach(function(img) {
                var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                if (src && !src.startsWith('data:')) rawUrls.push(src);
            });

            // 2. 提取带有 background-image 的元素 (B站相册缩略图)
            Array.from(grid.querySelectorAll('*')).forEach(function(el) {
                var bg = window.getComputedStyle(el).backgroundImage;
                if (bg && bg !== 'none' && bg.includes('url(')) {
                    var m = bg.match(/url\\(['"]?(.*?)['"]?\\)/);
                    if (m && m[1] && !m[1].startsWith('data:')) {
                        rawUrls.push(m[1]);
                    }
                }
            });

            // 清洗和去重 URL
            var urlMap = {};
            var cleanUrls = [];
            rawUrls.forEach(function(src) {
                if (src.startsWith('//')) src = 'https:' + src;
                if (src.startsWith('http://')) src = src.replace('http://', 'https://');
                var atIdx = src.indexOf('@');
                var baseSrc = atIdx !== -1 ? src.substring(0, atIdx) : src;

                // 提取文件名用于去重（忽略CDN域名的不同）
                var parts = baseSrc.split('/');
                var filename = parts[parts.length - 1];

                if (baseSrc && filename && !urlMap[filename]) {
                    urlMap[filename] = true;
                    cleanUrls.push(baseSrc);
                }
            });

            if (cleanUrls.length === 0) return;
            log.push('processing grid with ' + cleanUrls.length + ' unique imgs, class=' + (grid.className || 'none'));

            var imgUrls = cleanUrls;

            // 预加载原图，获取真实尺寸
            var preloaded = await Promise.all(imgUrls.map(function(src) {
                return new Promise(function(res) {
                    var im = new Image();
                    im.referrerPolicy = 'no-referrer';
                    var resolved = false;
                    var check = function() {
                        if (resolved) return;
                        if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                            resolved = true;
                            res({ src: src, w: im.naturalWidth, h: im.naturalHeight });
                        }
                    };
                    var t = setInterval(check, 50);
                    var failT = setTimeout(function() {
                        if (!resolved) {
                            resolved = true;
                            clearInterval(t);
                            res({ src: src, w: 1, h: 1 });
                        }
                    }, 3000);
                    im.onload = function() { check(); if (!resolved) { resolved = true; clearInterval(t); clearTimeout(failT); res({ src: src, w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); } };
                    im.onerror = function() { if (!resolved) { resolved = true; clearInterval(t); clearTimeout(failT); res({ src: src, w: 1, h: 1 }); } };
                    im.src = src;
                });
            }));

            // 过滤掉已经在全局展开过的图片，避免重复处理（针对多层嵌套或不同CDN域名）
            window.__globalExpandedUrls = window.__globalExpandedUrls || new Set();
            var actualPreloaded = [];
            preloaded.forEach(function(d) {
                var parts = d.src.split('/');
                var filename = parts[parts.length - 1];
                if (!window.__globalExpandedUrls.has(filename)) {
                    window.__globalExpandedUrls.add(filename);
                    actualPreloaded.push(d);
                }
            });

            if (actualPreloaded.length === 0) return;

            // 决定如何展开
            var imgsToExpand = [];
            var expandTitle = '';

            if (actualPreloaded.length === 1) {
                imgsToExpand = actualPreloaded.filter(function(d) {
                    return (d.h / d.w) >= 1.5; // 单张图只有是长图才展开
                });
                expandTitle = '👇 以下为长图展开 👇';
            } else if (actualPreloaded.length <= 3) {
                imgsToExpand = actualPreloaded; // 2~3张因为有裁剪所以全量展开
                expandTitle = '👇 以下为完整图片展开 👇';
            } else {
                imgsToExpand = actualPreloaded; // 4张及以上同样全量展开（网格裁剪看不清，用户要求全部展开）
                expandTitle = '👇 以下为完整图片展开 👇';
            }

            log.push('found ' + imgsToExpand.length + ' images to expand');

            if (imgsToExpand.length > 0) {
                // 原网格/相册保留不隐藏（恢复图四的样式）

                var newContainer = document.createElement('div');
                newContainer.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;margin:16px 0;border-top:1px dashed #e3e5e7;padding-top:16px;';

                var title = document.createElement('div');
                title.textContent = expandTitle;
                title.style.cssText = 'font-size:14px;color:#9499a0;margin-bottom:8px;font-weight:bold;';
                newContainer.appendChild(title);

                imgsToExpand.forEach(function(d) {
                    var newImg = document.createElement('img');
                    newImg.src = d.src;
                    newImg.referrerPolicy = 'no-referrer';
                    newImg.loading = 'eager';
                    newImg.decoding = 'sync';
                    newImg.style.cssText = 'max-width:100%;width:auto;height:auto;display:block;border-radius:8px;object-fit:contain;';
                    newContainer.appendChild(newImg);
                    expanded++;
                });

                // 决定插入的位置：尽量放在整篇内容的最后（文字下方）
                var insertTarget = null;
                if (root.classList.contains('bili-opus-view')) {
                    var contentNode = root.querySelector('.opus-module-content');
                    if (contentNode) insertTarget = contentNode;
                } else if (root.classList.contains('bili-dyn-item')) {
                    var mainNode = root.querySelector('.bili-dyn-item__main');
                    if (mainNode) insertTarget = mainNode;
                }

                if (insertTarget) {
                    insertTarget.appendChild(newContainer);
                } else {
                    grid.parentNode.insertBefore(newContainer, grid.nextSibling);
                }
            }
        });

        await Promise.all(gridPromises);
    }

    log.push('total expanded: ' + expanded);
    return log.join(' | ');
})()`
