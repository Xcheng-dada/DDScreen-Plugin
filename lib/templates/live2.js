(function(){
  const body = document.body;
  const coverImg = document.getElementById('cover');

  /* ===== 基础色彩工具 ===== */
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const m=Math.max(r,g,b),n=Math.min(r,g,b);let h,s,l=(m+n)/2;if(m===n){h=s=0}else{const d=m-n;s=l>0.5?d/(2-m-n):d/(m+n);switch(m){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break}h/=6}return[h*360,s,l]}
  function hslToRgb(h,s,l){h/=360;let r,g,b;if(s===0){r=g=b=l}else{const u=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r=u(p,q,h+1/3);g=u(p,q,h);b=u(p,q,h-1/3)}return[Math.round(r*255),Math.round(g*255),Math.round(b*255)]}
  function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
  function relLum([r,g,b]){const a=[r,g,b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}
  function contrast(fg,bg){const L1=relLum(fg)+0.05;const L2=relLum(bg)+0.05;return L1>L2?L1/L2:L2/L1}
  function toRGBcss([r,g,b],a){return a==null?`rgb(${r} ${g} ${b})`:`rgba(${r},${g},${b},${a})`}

  /* ===== 从封面提取调色板 ===== */
  function getPaletteFromImage(img){
    try{
      const c=document.createElement('canvas');
      const x=c.getContext('2d',{willReadFrequently:true});
      const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
      if(!w||!h)return null;
      const max=200,scale=Math.min(1,max/Math.max(w,h));
      c.width=Math.max(1,Math.floor(w*scale));
      c.height=Math.max(1,Math.floor(h*scale));
      x.drawImage(img,0,0,c.width,c.height);
      const d=x.getImageData(0,0,c.width,c.height).data;
      let r=0,g=0,b=0,cnt=0,satMax=0,accent=[249,115,22];
      const step=8;
      for(let y=0;y<c.height;y+=step){
        for(let i=y*c.width*4,xp=0;xp<c.width;xp+=step,i+=step*4){
          const rr=d[i],gg=d[i+1],bb=d[i+2],aa=d[i+3];
          if(aa<180)continue;
          r+=rr;g+=gg;b+=bb;cnt++;
          const [hh,ss,ll]=rgbToHsl(rr,gg,bb);
          if(ss>satMax&&ll>0.2&&ll<0.8){satMax=ss;accent=[rr,gg,bb]}
        }
      }
      if(!cnt)return null;
      return{avg:[Math.round(r/cnt),Math.round(g/cnt),Math.round(b/cnt)],accent};
    }catch(e){return null}
  }

  /* ===== 文本对比增强（不动下播滤镜等） ===== */
  function ensureContrast(fgRGB,bgRGB,target){
    let [h,s,l]=rgbToHsl(...fgRGB),rgb=fgRGB.slice(),tries=0,bgL=relLum(bgRGB);
    while(contrast(rgb,bgRGB)<target&&tries<64){
      if(bgL>0.5)l-=0.02;else l+=0.02;
      l=clamp(l,0,1);rgb=hslToRgb(h,s,l);tries++;
    }
    return rgb;
  }

  function deriveTheme(mode, palCover){
    const bgRef = mode==='live' ? [245,247,250] : [16,20,28];
    const seed  = palCover ? palCover.avg    : [200,210,220];
    const acc   = palCover ? palCover.accent : [249,115,22];
    const [h,s]=rgbToHsl(...seed);
    const strongBase=hslToRgb(h,Math.min(Math.max(s*0.32,0),0.55),mode==='live'?0.30:0.92);
    const textBase  =hslToRgb(h,Math.min(Math.max(s*0.28,0),0.45),mode==='live'?0.42:0.86);
    const mutedBase =hslToRgb(h,0.18,                               mode==='live'?0.58:0.72);
    const [ah,as]=rgbToHsl(...acc);
    const linkBase  =hslToRgb(ah, Math.min(Math.max(as*0.85,0),1), mode==='live'?0.40:0.80);
    const cStrong=ensureContrast(strongBase,bgRef, mode==='live'?5.0:6.0);
    const cText  =ensureContrast(textBase,  bgRef, mode==='live'?4.2:4.8);
    const cMuted =ensureContrast(mutedBase, bgRef, mode==='live'?2.6:3.0);
    const cLink  =ensureContrast(linkBase,  bgRef, 4.0);
    return {cStrong:toRGBcss(cStrong),cText:toRGBcss(cText),cMuted:toRGBcss(cMuted),cLink:toRGBcss(cLink)};
  }

  function applyTheme(v){
    const b=document.body;
    b.style.setProperty('--c-text-strong',v.cStrong);
    b.style.setProperty('--c-text',v.cText);
    b.style.setProperty('--c-text-muted',v.cMuted);
    b.style.setProperty('--c-link',v.cLink);
  }

  function syncBadgeLabel(){
    const el = document.querySelector('.badge .badge-text');
    if(!el) return;
    el.textContent = document.body.classList.contains('off') ? '直播已结束' : '正在直播~';
  }

  function updateCoverVar(){
    if(!coverImg) return;
    const url = coverImg.getAttribute('src') || '';
    document.body.style.setProperty('--cover-src', `url("${url}")`);
  }

  /* ===============================
     根据 .badge .dot 颜色自适应文字色
     - dot 偏暗：徽标文字用偏白
     - dot 偏亮（接近白）：徽标文字用偏暗
     不改你现有的下播滤镜逻辑
     =============================== */
  function parseRGB(str){
    // 支持 rgb()/rgba() 以及 "r g b" 这样的空格语法
    if(!str) return null;
    const nums = str.match(/\d+(\.\d+)?/g);
    if(!nums || nums.length < 3) return null;
    return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
  }

  function pickToneByLuma(rgb){
    if(!rgb) return 'light'; // 容错：默认深色文字
    // 亮度阈值可调；0.55 偏严，只有更亮才算 light（用深色字）
    return relLum(rgb) < 0.55 ? 'dark' : 'light';
  }

  function setBadgeTone(badge, tone){
    // 用内联样式仅覆盖文字颜色，不动你的描边/柔光/滤镜
    // dark => 浅色字；light => 深色字
    if(tone === 'dark'){
      badge.style.color = '#F8FAFC'; // 近白
      badge.dataset.tone = 'dark';
    }else{
      badge.style.color = '#0F172A'; // 深蓝灰
      badge.dataset.tone = 'light';
    }
  }

  function updateOneBadgeTone(badge){
    const dot = badge.querySelector('.dot');
    if(!dot) return;
    const bg = getComputedStyle(dot).backgroundColor;
    const rgb = parseRGB(bg);
    const tone = pickToneByLuma(rgb);
    setBadgeTone(badge, tone);
  }

  function updateBadgeToneAll(){
    document.querySelectorAll('.badge').forEach(updateOneBadgeTone);
  }

  /* ===== 主题/封面联动 ===== */
  function updateTheme(){
    const mode = body.classList.contains('off') ? 'off' : 'live';
    let palCover=null;
    try{ if(coverImg && coverImg.complete) palCover=getPaletteFromImage(coverImg) }catch(e){}
    applyTheme(deriveTheme(mode, palCover));
    syncBadgeLabel();
    // 主题色变更后（--c-link 可能变），同步计算徽标文字对比
    updateBadgeToneAll();
  }

  /* ===== 观察模式切换（live/off） ===== */
  const mo=new MutationObserver(()=>{updateCoverVar();updateTheme();});
  mo.observe(body,{attributes:true,attributeFilter:['class']});

  /* ===== 首次与封面加载时机 ===== */
  if(coverImg){
    coverImg.addEventListener('load',()=>{updateCoverVar();updateTheme();});
    if(coverImg.complete){updateCoverVar();updateTheme();}
  }
  window.addEventListener('load',()=>{updateCoverVar();updateTheme();});

  /* ===== 若外部动态改了 dot 颜色（例如切换 --c-link），也可手动触发 ===== */
  window.refreshBadgeTone = updateBadgeToneAll;
})();