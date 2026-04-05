import { Application, Container, Graphics, Sprite, Assets, ColorMatrixFilter } from 'pixi.js';

(async () => {
  function el(tag, css = '', html = '') {
    const d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (html) d.innerHTML = html;
    return d;
  }

  // ── Pixi setup ────────────────────────────────────────────────────
  const app = new Application();
  await app.init({ background: '#111', resizeTo: window });
  Object.assign(app.canvas.style, { position: 'absolute', top: '0', left: '0' });
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#111';
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
  document.body.appendChild(app.canvas);

  const NAV_H = 56;
  const BASE_SCALE = Math.min(
    1,
    (app.screen.width  - 16) / 640,
    (app.screen.height - NAV_H - 130) / 480
  );
  const BOX_W = Math.round(640 * BASE_SCALE);
  const BOX_H = Math.round(480 * BASE_SCALE);
  let BOX_X = (app.screen.width  - BOX_W) / 2;
  let BOX_Y = NAV_H + (app.screen.height - NAV_H - BOX_H) / 2;

  // ── Pixel scan ────────────────────────────────────────────────────
  const img = new Image();
  img.src = 'dvd.png';
  await new Promise(r => { img.onload = r; });
  const osc = document.createElement('canvas');
  osc.width = img.naturalWidth; osc.height = img.naturalHeight;
  const octx = osc.getContext('2d'); octx.drawImage(img, 0, 0);
  const { data } = octx.getImageData(0, 0, osc.width, osc.height);
  let minX = osc.width, maxX = 0, minY = osc.height, maxY = 0;
  for (let y = 0; y < osc.height; y++) for (let x = 0; x < osc.width; x++) {
    const i = (y * osc.width + x) * 4;
    if ((data[i]+data[i+1]+data[i+2])/3 < 200) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }

  // ── World container (for zoom) ────────────────────────────────────
  const world = new Container();
  app.stage.addChild(world);
  const boxG = new Graphics();
  boxG.rect(BOX_X, BOX_Y, BOX_W, BOX_H).fill({ color: 0x000000 }).stroke({ color: 0xffffff, width: 2 });
  world.addChild(boxG);

  const texture = await Assets.load('dvd.png');
  const dvd = new Sprite(texture);
  dvd.anchor.set(0.5); dvd.width = Math.round(120 * BASE_SCALE); dvd.height = Math.round(68 * BASE_SCALE);
  const cmf = new ColorMatrixFilter();
  dvd.filters = [cmf];
  function applyColor(hex) {
    const r=((hex>>16)&0xff)/255, g=((hex>>8)&0xff)/255, b=(hex&0xff)/255;
    cmf.matrix = [-r,0,0,0,r, 0,-g,0,0,g, 0,0,-b,0,b, 0,0,0,1,0];
  }
  const sx = dvd.width/osc.width, sy = dvd.height/osc.height;
  const tL=(minX-osc.width/2)*sx,  tR=(maxX-osc.width/2)*sx;
  const tT=(minY-osc.height/2)*sy, tB=(maxY-osc.height/2)*sy;
  const COLORS=[0xffffff,0xff0000,0x00ff00,0xffff00,0x0000ff,0xff00ff,0x00ffff];
  let ci=0; applyColor(COLORS[ci]);
  dvd.visible = false;
  world.addChild(dvd);

  // ── Physics ───────────────────────────────────────────────────────
  const BS = 3.5 * BASE_SCALE; // increased base speed

  const CORNERS = [
    { x:BOX_X-tL,       y:BOX_Y-tT,       vx: BS, vy: BS },
    { x:BOX_X+BOX_W-tR, y:BOX_Y-tT,       vx:-BS, vy: BS },
    { x:BOX_X-tL,       y:BOX_Y+BOX_H-tB, vx: BS, vy:-BS },
    { x:BOX_X+BOX_W-tR, y:BOX_Y+BOX_H-tB, vx:-BS, vy:-BS },
  ];

  function bounceState(s) {
    s.x+=s.vx; s.y+=s.vy;
    let hx=false, hy=false;
    if      (s.x+tL<=BOX_X)       { s.x=BOX_X-tL;       s.vx= Math.abs(s.vx); hx=true; }
    else if (s.x+tR>=BOX_X+BOX_W) { s.x=BOX_X+BOX_W-tR; s.vx=-Math.abs(s.vx); hx=true; }
    if      (s.y+tT<=BOX_Y)       { s.y=BOX_Y-tT;       s.vy= Math.abs(s.vy); hy=true; }
    else if (s.y+tB>=BOX_Y+BOX_H) { s.y=BOX_Y+BOX_H-tB; s.vy=-Math.abs(s.vy); hy=true; }
    return { hx, hy };
  }

  // ── computeStart ─────────────────────────────────────────────────
  function computeStart() {
    const N = Math.floor(Math.random()*50)+1;
    let corner = { ...CORNERS[Math.floor(Math.random()*4)] };
    const rev = { x:corner.x, y:corner.y, vx:-corner.vx, vy:-corner.vy };
    let count=0, safety=3000000;
    while (count < N-1 && --safety > 0) {
      const {hx,hy} = bounceState(rev);
      if (hx && hy) {
        corner = { x:rev.x, y:rev.y, vx:-rev.vx, vy:-rev.vy };
        count=0;
      } else if (hx||hy) {
        count++;
      }
    }
    const seg=[];
    const tmp={x:rev.x,y:rev.y,vx:rev.vx,vy:rev.vy};
    for (let i=0; i<300000; i++) {
      tmp.x+=tmp.vx; tmp.y+=tmp.vy;
      if (tmp.x+tL<=BOX_X||tmp.x+tR>=BOX_X+BOX_W||tmp.y+tT<=BOX_Y||tmp.y+tB>=BOX_Y+BOX_H) break;
      seg.push({x:tmp.x,y:tmp.y});
    }
    // Pick the point in the segment closest to the box center
    // Use the midpoint of the segment (closest to center along the path)
    const bcx=BOX_X+BOX_W/2, bcy=BOX_Y+BOX_H/2;
    let bestPick={x:rev.x,y:rev.y}, bestDist=Infinity;
    for(const p of seg){
      const d=(p.x-bcx)**2+(p.y-bcy)**2;
      if(d<bestDist){ bestDist=d; bestPick=p; }
    }
    const pick=seg.length>0?bestPick:{x:rev.x,y:rev.y};
    const scX=corner.x<BOX_X+BOX_W/2?BOX_X:BOX_X+BOX_W;
    const scY=corner.y<BOX_Y+BOX_H/2?BOX_Y:BOX_Y+BOX_H;
    return { x:pick.x, y:pick.y, vx:-rev.vx, vy:-rev.vy, N, scX, scY };
  }

  // ── Game state ────────────────────────────────────────────────────
  let budget=10, phase='betting', round=null;
  let bets={ edge:{top:0,left:0,right:0,bottom:0}, range:{'1-10':0,'11-20':0,'21-30':0,'31-40':0,'41-50':0} };
  let vx=BS, vy=BS, bouncesLeft=0;
  let edgeResolved=false, postCornerStart=0, roundStaked=0, roundWon=0;
  let fastSteps=1, isFfw=false;
  let zScale=1, zTarget=1, zPx=0, zPy=0;
  const ZOOM=2.5;

  // Slow/zoom state
  let slowUntil=0;

  // Track which wall was last hit on each axis (needed for lookahead corner calculation)
  let lastXWall='left', lastYWall='top';

  const GOAL = 30;

  // ── Budget + goal display ─────────────────────────────────────────
  const hudEl = el('div',
    'position:fixed;top:70px;left:50%;transform:translateX(-50%);' +
    'display:flex;flex-direction:column;align-items:center;gap:4px;' +
    'z-index:200;pointer-events:none'
  );
  const budgetEl = el('div',
    'color:#00ff88;font:bold 22px monospace;text-shadow:0 0 10px #00ff88'
  );
  budgetEl.textContent=`$${budget}`;
  const goalEl = el('div','color:#888;font:13px monospace');
  goalEl.textContent=`goal: $${GOAL}`;
  hudEl.appendChild(budgetEl);
  hudEl.appendChild(goalEl);
  document.body.appendChild(hudEl);
  function updateBudget(){ budgetEl.textContent=`$${budget}`; }

  // ── Bounce counter (slot-machine style, below the box) ───────────
  const DIGIT_H = Math.round(90 * Math.min(1, BASE_SCALE * 1.4));
  const DIGIT_FONT = Math.round(66 * Math.min(1, BASE_SCALE * 1.4));
  const REEL_W = Math.round(60 * Math.min(1, BASE_SCALE * 1.4));
  const bounceCounterEl = el('div',
    `position:fixed;left:50%;top:${BOX_Y+BOX_H+16}px;` +
    'transform:translateX(-50%);display:flex;gap:6px;z-index:200;pointer-events:none'
  );

  function makeReel() {
    const outer = el('div',
      `width:${REEL_W}px;height:${DIGIT_H}px;overflow:hidden;position:relative;` +
      'background:#000;border:2px solid #333;border-radius:4px'
    );
    const inner = el('div',
      `position:absolute;top:0;left:0;width:100%;transition:transform 0.12s ease;` +
      `font:bold ${DIGIT_FONT}px monospace;color:white;text-align:center`
    );
    for(let i=0;i<=9;i++){
      const d=el('div',`height:${DIGIT_H}px;line-height:${DIGIT_H}px`);
      d.textContent=i;
      inner.appendChild(d);
    }
    outer.appendChild(inner);
    return { outer, inner };
  }

  const tensReel=makeReel(), unitsReel=makeReel();
  bounceCounterEl.appendChild(tensReel.outer);
  bounceCounterEl.appendChild(unitsReel.outer);
  document.body.appendChild(bounceCounterEl);

  app.renderer.on('resize', () => {
    BOX_X = (app.screen.width  - BOX_W) / 2;
    BOX_Y = NAV_H + (app.screen.height - NAV_H - BOX_H) / 2;
    boxG.clear();
    boxG.rect(BOX_X, BOX_Y, BOX_W, BOX_H).fill({ color: 0x000000 }).stroke({ color: 0xffffff, width: 2 });
    bounceCounterEl.style.top = `${BOX_Y + BOX_H + 16}px`;
  });

  let bounceCount=0;
  function updateBounceCounter(){
    const t=Math.floor(bounceCount/10)%10, u=bounceCount%10;
    tensReel.inner.style.transform=`translateY(-${t*DIGIT_H}px)`;
    unitsReel.inner.style.transform=`translateY(-${u*DIGIT_H}px)`;
  }
  updateBounceCounter();

  // ── Developer box (hidden by default, right-side toggle) ─────────
  const devWrapper = el('div',
    'position:fixed;top:0;right:-240px;bottom:0;' +
    'display:flex;flex-direction:row;align-items:center;' +
    'transition:right .3s;z-index:100'
  );
  const devToggle = el('button',
    'background:rgba(0,0,0,.85);border:1px solid #444;border-right:none;' +
    'color:white;cursor:pointer;padding:12px 7px;font:16px monospace;' +
    'border-radius:6px 0 0 6px;flex-shrink:0',
    'DEV'
  );
  const devEl = el('div',
    'background:rgba(0,0,0,.85);border:1px solid #444;border-radius:0 0 0 8px;' +
    'padding:16px 20px;color:white;font:14px monospace;width:240px;box-sizing:border-box;user-select:none',
    `<div style="font-size:15px;font-weight:bold;margin-bottom:14px;color:#aaa;letter-spacing:1px">DEVELOPER BOX</div>
     <div style="margin-bottom:14px">Bounces to corner: <span id="cc" style="color:#00ffcc;font-weight:bold">---</span></div>
     <button id="ffwd" style="width:100%;padding:8px;background:#222;color:white;border:1px solid #555;border-radius:4px;cursor:pointer;font:13px monospace">Fast Forward</button>`
  );
  devWrapper.appendChild(devToggle);
  devWrapper.appendChild(devEl);
  document.body.appendChild(devWrapper);
  let devOpen=false;
  devToggle.addEventListener('click',()=>{
    devOpen=!devOpen;
    devWrapper.style.right=devOpen?'0':'-240px';
    devToggle.textContent=devOpen?'▶':'DEV';
  });
  document.getElementById('ffwd').addEventListener('click', function(){
    isFfw=!isFfw; fastSteps=isFfw?8:1;
    this.textContent=isFfw?'⏸ Normal Speed':'Fast Forward';
    this.style.background=isFfw?'#1a3a1a':'#222';
    this.style.borderColor=isFfw?'#0f0':'#555';
  });

  // ── Bet row helper ────────────────────────────────────────────────
  // Returns HTML for a +/- stepper row. id is the unique id for the value span.
  function betRow(label, id) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;text-transform:capitalize">${label}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <button data-dec="${id}" style="${btnStyle()}">▼</button>
          <span id="${id}" style="min-width:28px;text-align:center;font-size:14px;font-weight:bold">0</span>
          <button data-inc="${id}" style="${btnStyle()}">▲</button>
        </div>
      </div>`;
  }
  function btnStyle(){ return 'background:#1a1a2a;color:white;border:1px solid #333;border-radius:4px;width:28px;height:28px;cursor:pointer;font-size:13px;line-height:1'; }

  // ── Betting overlay ───────────────────────────────────────────────
  const betEl=el('div',
    `position:fixed;top:${NAV_H}px;left:0;right:0;bottom:0;background:rgba(0,0,0,.72);z-index:150;` +
    'display:flex;align-items:center;justify-content:center;font-family:monospace',
    `<div id="sidebar-wrapper" style="
        position:fixed;left:-280px;top:${NAV_H}px;bottom:0;
        display:flex;flex-direction:row;align-items:stretch;
        transition:transform .3s;z-index:161">
      <div id="sidebar" style="
          width:280px;box-sizing:border-box;background:rgba(8,8,18,.97);
          border-right:1px solid #2a2a2a;
          padding:20px;overflow-y:auto;color:white;flex-shrink:0">
        <div style="font-size:16px;font-weight:bold;color:#888;letter-spacing:1px;margin-bottom:20px">PLACE BETS</div>
        <div style="color:#555;font-size:11px;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px">First edge hit — pays 4×</div>
        ${['top','right','bottom','left'].map(e=>betRow(e,`be-${e}`)).join('')}
        <div style="color:#555;font-size:11px;margin:18px 0 12px;text-transform:uppercase;letter-spacing:1px">Bounces to corner — pays 5×</div>
        ${['1-10','11-20','21-30','31-40','41-50'].map(r=>betRow(r,`br-${r}`)).join('')}
        <div id="berr" style="color:#f55;font-size:12px;min-height:16px;margin-top:12px"></div>
      </div>
      <button id="stog" style="
        align-self:center;flex-shrink:0;
        background:rgba(8,8,18,.97);border:1px solid #2a2a2a;border-left:none;
        color:white;cursor:pointer;padding:12px 7px;font:14px monospace;
        border-radius:0 6px 6px 0">BETS</button>
    </div>

    <div style="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-align:center">
      <div id="spin" style="width:52px;height:52px;flex-shrink:0;border:5px solid #333;border-top:5px solid #00ffcc;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:20px"></div>
      <div style="font:bold 26px monospace;letter-spacing:2px;margin-bottom:30px;color:#00ffcc">PLACE YOUR BETS</div>
      <button id="startbtn" style="
        padding:14px 44px;background:#003300;color:white;
        border:2px solid #00aa00;border-radius:6px;cursor:pointer;
        font:bold 16px monospace;letter-spacing:1px">▶  START ROUND</button>
    </div>`
  );
  document.body.appendChild(betEl);


  // Stepper button logic — delegate from sidebar
  document.getElementById('sidebar').addEventListener('click', e => {
    const inc=e.target.dataset.inc, dec=e.target.dataset.dec;
    const id=inc||dec;
    if(!id) return;
    const span=document.getElementById(id);
    let v=parseInt(span.textContent)||0;
    if(inc) v++;
    if(dec) v=Math.max(0,v-1);
    span.textContent=v;
  });

  // Sidebar toggle — open by default on desktop, closed on mobile
  let sOpen = app.screen.width >= 640;
  if (sOpen) {
    document.getElementById('sidebar-wrapper').style.transform='translateX(280px)';
    document.getElementById('stog').textContent='◀';
  }
  document.getElementById('stog').addEventListener('click', function(){
    sOpen=!sOpen;
    document.getElementById('sidebar-wrapper').style.transform=sOpen?'translateX(280px)':'';
    this.textContent=sOpen?'◀':'BETS';
  });

  // Start round button
  document.getElementById('startbtn').addEventListener('click',()=>{
    const ek=['top','right','bottom','left'], rk=['1-10','11-20','21-30','31-40','41-50'];
    let total=0;
    const nb={edge:{},range:{}};
    for(const k of ek){ const v=parseInt(document.getElementById(`be-${k}`).textContent)||0; nb.edge[k]=v; total+=v; }
    for(const k of rk){ const v=parseInt(document.getElementById(`br-${k}`).textContent)||0; nb.range[k]=v; total+=v; }
    const err=document.getElementById('berr');
    if(total>budget){ err.textContent=`Bets ($${total}) exceed budget ($${budget})`; return; }
    err.textContent=''; bets=nb; budget-=total; roundStaked=total; roundWon=0; updateBudget();
    startRound();
  });

  const resetBtnHTML = `<button id="resetbtn" style="
    margin-top:40px;padding:14px 44px;background:#003300;color:white;
    border:2px solid #00aa00;border-radius:6px;cursor:pointer;
    font:bold 16px monospace;letter-spacing:1px">↺  RESET</button>`;

  // ── Game over ─────────────────────────────────────────────────────
  const goEl=el('div',
    'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:300;' +
    'display:none;flex-direction:column;align-items:center;justify-content:center',
    `<div style="color:#f00;font:bold 80px monospace;letter-spacing:4px;text-shadow:0 0 40px #f00,0 0 80px #800">GAME OVER</div>
     ${resetBtnHTML}`
  );
  document.body.appendChild(goEl);

  // ── You win ───────────────────────────────────────────────────────
  const winEl=el('div',
    'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:300;' +
    'display:none;flex-direction:column;align-items:center;justify-content:center',
    `<div style="color:#00ff88;font:bold 80px monospace;letter-spacing:4px;text-shadow:0 0 40px #00ff88,0 0 80px #00aa44">YOU WIN</div>
     ${resetBtnHTML}`
  );
  document.body.appendChild(winEl);

  function resetGame(){
    budget=10; updateBudget();
    goEl.style.display='none';
    winEl.style.display='none';
    dvd.visible=false;
    ['top','right','bottom','left'].forEach(k=>{ document.getElementById(`be-${k}`).textContent='0'; });
    ['1-10','11-20','21-30','31-40','41-50'].forEach(k=>{ document.getElementById(`br-${k}`).textContent='0'; });
    document.getElementById('berr').textContent='';
    document.getElementById('cc').textContent='---';
    betEl.style.display='flex';
    phase='betting';
  }
  document.addEventListener('click', e=>{ if(e.target.id==='resetbtn') resetGame(); });

  // ── Toast ─────────────────────────────────────────────────────────
  const toastEl=el('div',
    'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);' +
    'background:rgba(0,0,0,.92);color:white;font:16px monospace;' +
    'padding:14px 28px;border-radius:8px;border:1px solid #444;z-index:250;display:none;text-align:center'
  );
  document.body.appendChild(toastEl);
  let toastTimer;
  function toast(html,ms=3000){
    toastEl.innerHTML=html; toastEl.style.display='block';
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.style.display='none',ms);
  }

  // ── Lookahead: simulate up to 120 frames ahead to detect corner/close-hit ──
  // Returns null (nothing special) or {type:'corner'|'close', cx, cy, framesAway}
  const LOOKAHEAD = 120; // 2 seconds at 60fps — enough to see 1s before
  const CLOSE_FRAMES = 6; // 0.1s at 60fps

  function lookahead(px, py, pvx, pvy, bl) {
    let x=px, y=py, cvx=pvx, cvy=pvy, bounces=bl;
    let lastBounceFrame=-9999, lastXW=lastXWall, lastYW=lastYWall;
    for(let f=1; f<=LOOKAHEAD; f++){
      x+=cvx; y+=cvy;
      let hx=false, hy=false;
      if      (x+tL<=BOX_X)       { x=BOX_X-tL;       cvx= Math.abs(cvx); hx=true; }
      else if (x+tR>=BOX_X+BOX_W) { x=BOX_X+BOX_W-tR; cvx=-Math.abs(cvx); hx=true; }
      if      (y+tT<=BOX_Y)       { y=BOX_Y-tT;       cvy= Math.abs(cvy); hy=true; }
      else if (y+tB>=BOX_Y+BOX_H) { y=BOX_Y+BOX_H-tB; cvy=-Math.abs(cvy); hy=true; }
      if(hx) lastXW = cvx>0?'left':'right';
      if(hy) lastYW = cvy>0?'top':'bottom';
      if(hx||hy){
        bounces--;
        const cx = lastXW==='left'?BOX_X:BOX_X+BOX_W;
        const cy = lastYW==='top' ?BOX_Y:BOX_Y+BOX_H;
        if(bounces<=0){
          // Final corner hit
          return { type:'corner', cx:round.scX, cy:round.scY, framesAway:f };
        }
        if(f-lastBounceFrame <= CLOSE_FRAMES){
          // Close hit — corner is intersection of the two walls just hit
          return { type:'close', cx, cy, framesAway:f };
        }
        lastBounceFrame=f;
      }
    }
    return null;
  }

  // ── Round management ──────────────────────────────────────────────
  function startRound(){
    round=computeStart();
    dvd.x=round.x; dvd.y=round.y; dvd.visible=true;
    vx=round.vx; vy=round.vy;
    bouncesLeft=round.N;
    edgeResolved=false;
    ci=0; applyColor(COLORS[ci]);
    document.getElementById('cc').textContent=bouncesLeft;
    zScale=1; zTarget=1; slowUntil=0; bounceCount=0; updateBounceCounter();
    lastXWall='left'; lastYWall='top';
    zPx=0; zPy=0;
    world.scale.set(1); world.pivot.set(0,0); world.position.set(0,0);
    betEl.style.display='none';
    phase='playing';
  }

  function endRound(){
    phase='post_corner';
    postCornerStart=Date.now();
    const N=round.N;
    const range=N<=10?'1-10':N<=20?'11-20':N<=30?'21-30':N<=40?'31-40':'41-50';
    const rw=(bets.range[range]||0)*5;
    if(rw>0){ budget+=rw; roundWon+=rw; updateBudget(); }
    const net = roundWon - roundStaked;
    const sign = net >= 0 ? '+' : '-';
    const color = net >= 0 ? '#00ff88' : '#ff4444';
    const shadow = net >= 0 ? '0 0 10px #00ff88' : '0 0 10px #ff4444';
    toast(`<span style="font:bold 22px monospace;color:${color};text-shadow:${shadow}">${sign}$${Math.abs(net)}</span>`, 3000);
  }

  function afterPostCorner(){
    zTarget=1;
    if(budget>=GOAL){
      winEl.style.display='flex';
      phase='game_over';
      return;
    }
    if(budget<=0){
      goEl.style.display='flex';
      phase='game_over';
      return;
    }
    ['top','right','bottom','left'].forEach(k=>{ document.getElementById(`be-${k}`).textContent='0'; });
    ['1-10','11-20','21-30','31-40','41-50'].forEach(k=>{ document.getElementById(`br-${k}`).textContent='0'; });
    document.getElementById('berr').textContent='';
    document.getElementById('cc').textContent='---';
    betEl.style.display='flex';
    phase='betting';
  }

  // ── Physics step ──────────────────────────────────────────────────
  function step(mult=1){
    dvd.x+=vx*mult; dvd.y+=vy*mult;
    let hx=false, hy=false;
    if      (dvd.x+tL<=BOX_X)       { dvd.x=BOX_X-tL;       vx= Math.abs(vx); hx=true; }
    else if (dvd.x+tR>=BOX_X+BOX_W) { dvd.x=BOX_X+BOX_W-tR; vx=-Math.abs(vx); hx=true; }
    if      (dvd.y+tT<=BOX_Y)       { dvd.y=BOX_Y-tT;       vy= Math.abs(vy); hy=true; }
    else if (dvd.y+tB>=BOX_Y+BOX_H) { dvd.y=BOX_Y+BOX_H-tB; vy=-Math.abs(vy); hy=true; }

    if(hx||hy){ ci=(ci+1)%COLORS.length; applyColor(COLORS[ci]); }
    if(hx) lastXWall = vx>0?'left':'right';
    if(hy) lastYWall = vy>0?'top':'bottom';

    if((hx||hy) && phase==='playing'){
      if(!edgeResolved){
        edgeResolved=true;
        const edge=hx?(vx>0?'left':'right'):(vy>0?'top':'bottom');
        const ew=(bets.edge[edge]||0)*4;
        if(ew>0){ budget+=ew; roundWon+=ew; updateBudget(); }
      }
      bouncesLeft--;
      bounceCount++;
      updateBounceCounter();
      document.getElementById('cc').textContent=bouncesLeft;
      if(bouncesLeft<=0) endRound();
    }
  }

  // ── Ticker ────────────────────────────────────────────────────────
  app.ticker.add(()=>{
    const now = performance.now();

    if(phase==='playing'){
      // Lookahead every frame to see if slow+zoom should be active
      const ahead = lookahead(dvd.x, dvd.y, vx, vy, bouncesLeft);
      if(ahead && ahead.framesAway <= 60){
        // Event within 1 second — activate slow+zoom, keep for 1s past the event
        // framesAway frames at 60fps = framesAway/60 * 1000ms from now
        const msToEvent = (ahead.framesAway / 60) * 1000;
        slowUntil = now + msToEvent + 1000; // 1s after event
        zPx = ahead.cx; zPy = ahead.cy;
      }

      const shouldSlow = now < slowUntil;
      zTarget = shouldSlow ? ZOOM : 1;

      if(shouldSlow){
        step(0.5);
      } else {
        for(let i=0;i<fastSteps;i++) step();
      }
    } else if(phase==='post_corner'){
      // Keep zoomed in during post-corner, slow+zoom expires naturally
      if(now < slowUntil){ zTarget=ZOOM; }
      else { zTarget=1; }
      for(let i=0;i<fastSteps;i++) step();
      if(Date.now()-postCornerStart>=3000) afterPostCorner();
    }

    // Zoom lerp
    const lerpSpeed = zTarget<zScale ? 0.15 : 0.08;
    zScale+=(zTarget-zScale)*lerpSpeed;
    if(Math.abs(zScale-1)<0.002 && zTarget===1){
      zScale=1;
      world.scale.set(1); world.pivot.set(0,0); world.position.set(0,0);
    } else {
      world.pivot.set(zPx,zPy);
      world.position.set(zPx,zPy);
      world.scale.set(zScale);
    }
  });

  betEl.style.display='flex';
})();
