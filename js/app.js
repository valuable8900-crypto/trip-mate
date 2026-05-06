/**
 * 旅行伴侣 v7 - 精简版：行程+预算，修复删除Bug
 */
if (!localStorage.getItem('app_v7')) {
  ['trips','guides','favorites','app_v5','app_v6'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem('app_v7','1');
}

const DB = {
  getTrips() { return JSON.parse(localStorage.getItem('trips')||'[]'); },
  setTrips(t) { localStorage.setItem('trips',JSON.stringify(t)); },
  getTrip(id) { return this.getTrips().find(t=>t.id===id); },
  addTrip(t) { const ts=this.getTrips(); t.id=this._id(); ts.push(t); this.setTrips(ts); return t; },
  updateTrip(id,d) { const ts=this.getTrips(); const i=ts.findIndex(t=>t.id===id); if(i>-1){ts[i]={...ts[i],...d};this.setTrips(ts);return ts[i];} return null; },
  deleteTrip(id) { if(!id)return; this.setTrips(this.getTrips().filter(t=>t.id!==id)); },
  _id() { return Date.now().toString(36)+Math.random().toString(36).slice(2,10); }
};

// ===== 路由 =====
const PM = { home:'page-home', 'trip-editor':'page-trip-editor', 'activity-detail':'page-activity-detail', budget:'page-budget' };
let cp='home', ct=null, etId=null, eaIdx=null, edIdx=null, drag=null, actImgs=[], _detailTripId=null;

function nav(p,params) {
  const pid=PM[p]; if(!pid) return;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  const tp=document.getElementById(pid);
  if(tp) tp.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.page===p));
  document.getElementById('topNav').style.display='block'; cp=p;
  switch(p){
    case'home':renderHome();break;
    case'trip-editor':openEditor(params);break;
    case'activity-detail':renderActDetail(params);break;
    case'budget':renderBudget();break;
  }
  window.scrollTo(0,0);
}

// ===== 常量 =====
const TL={attraction:'景点',food:'餐饮',hotel:'住宿',transport:'交通',other:'其他'};
const TYI={attraction:'🏔',food:'🍜',hotel:'🏨',transport:'🚗',other:'📦'};
const TYC={attraction:'#2D9B6E',food:'#FF8C42',hotel:'#4ECDC4',transport:'#3498DB',other:'#6B7C8A'};
const TCM={attraction:'门票',food:'餐饮',hotel:'住宿',transport:'交通',other:'其他'};
const PIE=['#2D9B6E','#FF8C42','#4ECDC4','#3498DB','#9B59B6'];

function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);}
function fmtD(iso){if(!iso)return'';const p=iso.split('-');if(p.length!==3)return iso;return `${p[0]}年${p[1]}月${p[2]}日`;}
function fmtOff(sd,off){if(!sd)return'';const p=sd.split('-');const d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));d.setDate(d.getDate()+off);return `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`;}

// ===== 自定义日期/时间选择器 =====
function buildDatePicker(id){
  const el=document.getElementById(id); if(!el) return;
  const now=new Date(), y=now.getFullYear();
  let h='';
  h+=`<select class="dp-y">`; for(let i=y-1;i<=y+3;i++) h+=`<option value="${i}">${i}</option>`; h+=`</select><span class="unit">年</span>`;
  h+=`<select class="dp-m">`; for(let i=1;i<=12;i++) h+=`<option value="${String(i).padStart(2,'0')}">${i}</option>`; h+=`</select><span class="unit">月</span>`;
  h+=`<select class="dp-d">`; for(let i=1;i<=31;i++) h+=`<option value="${String(i).padStart(2,'0')}">${i}</option>`; h+=`</select><span class="unit">日</span>`;
  el.innerHTML=h;
  el.querySelector('.dp-m')?.addEventListener('change',()=>updateDays(el));
  el.querySelector('.dp-y')?.addEventListener('change',()=>updateDays(el));
}

function updateDays(el){
  const y=parseInt(el.querySelector('.dp-y').value), m=parseInt(el.querySelector('.dp-m').value);
  const maxD=new Date(y,m,0).getDate();
  const sel=el.querySelector('.dp-d');
  const cur=parseInt(sel.value);
  sel.innerHTML='';
  for(let i=1;i<=maxD;i++) sel.innerHTML+=`<option value="${String(i).padStart(2,'0')}" ${i===Math.min(cur,maxD)?'selected':''}>${i}</option>`;
}

function getDateISO(el){const y=el?.querySelector('.dp-y')?.value,m=el?.querySelector('.dp-m')?.value,d=el?.querySelector('.dp-d')?.value;return(y&&m&&d)?`${y}-${m}-${d}`:'';}
function setDateISO(el,iso){if(!iso||!el)return;const p=iso.split('-');if(p.length<3)return;const y=el.querySelector('.dp-y'),m=el.querySelector('.dp-m'),d=el.querySelector('.dp-d');if(y)y.value=p[0];if(m)m.value=p[1];if(d){updateDays(el);d.value=p[2];}}

// ===== 首页（行程管理 - 带滑动删除） =====
function renderHome(){
  const trips=DB.getTrips();
  const el=document.getElementById('homeTripList');
  if(!trips.length){el.innerHTML='<div class="empty-state"><p>还没有创建行程<br>点击上方按钮开始规划吧！</p></div>';return;}
  const s=[...trips].sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
  el.innerHTML=s.map(t=>{
    let c=0;if(t.days)t.days.forEach(d=>{if(d.activities)d.activities.forEach(a=>{c+=a.cost||0;})});
    return `<div class="swipe-container">
      <div class="swipe-delete-bg">
        <button class="swipe-delete-btn" onclick="delTripSwipe('${t.id}',this)">
          🗑<span>删除</span>
        </button>
      </div>
      <div class="swipe-content" data-id="${t.id}">
        <div class="trip-card-item" style="margin-bottom:0;border-radius:0">
          <div class="trip-card-icon" onclick="edTrip('${t.id}')">✈</div>
          <div class="trip-card-info" onclick="edTrip('${t.id}')">
            <h4>${esc(t.destination||'未命名行程')}</h4>
            <p>${fmtD(t.startDate)} → ${fmtD(t.endDate)} · ${t.days?t.days.length:0}天 · ¥${c}</p>
          </div>
          <button class="trip-card-btn edit" onclick="event.stopPropagation();edTrip('${t.id}')">✎</button>
        </div>
      </div>
    </div>`;
  }).join('');
  // 为每个滑动容器绑定触摸事件
  el.querySelectorAll('.swipe-container').forEach(initSwipe);
}

function createNewTrip(){etId=null;ct=null;nav('trip-editor');}
function edTrip(id){etId=id;nav('trip-editor',id);}

// ===== 滑动删除 =====
let _swipeState = null;

function initSwipe(container) {
  const content = container.querySelector('.swipe-content');
  if (!content) return;
  
  let startX = 0, currentX = 0, isDragging = false;
  
  const onStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    currentX = startX;
    isDragging = true;
    content.style.transition = 'none';
  };
  
  const onMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    currentX = touch.clientX;
    const diff = startX - currentX;
    
    if (diff > 0) {
      // 左滑
      const translate = Math.min(diff, 76);
      content.style.transform = `translateX(-${translate}px)`;
    } else if (content.classList.contains('swiped')) {
      // 右滑恢复
      const translate = Math.max(0, 76 + diff);
      content.style.transform = `translateX(-${translate}px)`;
    }
  };
  
  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    content.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
    
    const diff = startX - currentX;
    if (diff > 40) {
      // 滑开超过阈值，保持打开
      content.classList.add('swiped');
      content.style.transform = 'translateX(-76px)';
    } else {
      // 恢复
      content.classList.remove('swiped');
      content.style.transform = 'translateX(0)';
    }
    // 关闭其他打开的卡片
    document.querySelectorAll('.swipe-content.swiped').forEach(el => {
      if (el !== content) {
        el.classList.remove('swiped');
        el.style.transform = 'translateX(0)';
      }
    });
  };
  
  // 触屏事件
  content.addEventListener('touchstart', onStart, {passive: true});
  content.addEventListener('touchmove', onMove, {passive: true});
  content.addEventListener('touchend', onEnd);
  // 鼠标事件（用于桌面调试）
  content.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', (e) => { if (isDragging) onMove(e); });
  document.addEventListener('mouseup', onEnd);
}

function delTripSwipe(id, btn) {
  // 高亮反馈
  const bg = btn.closest('.swipe-delete-bg');
  if (bg) bg.style.background = '#c0392b';
  
  const trips = DB.getTrips();
  const before = trips.length;
  DB.setTrips(trips.filter(t => t.id !== id));
  
  if (DB.getTrips().length >= before) {
    showToast('删除失败','error');
    return;
  }
  
  if(etId===id){etId=null;ct=null;}
  renderHome();
  showToast('已删除','success');
}

// ===== 编辑器 =====
function openEditor(tripId){
  eaIdx=null;edIdx=null;
  buildDatePicker('startPicker');buildDatePicker('endPicker');
  document.getElementById('tripDestination').value='';
  document.getElementById('daysVerticalContainer').innerHTML='<div class="empty-state"><p>请先选择出行日期</p></div>';
  document.getElementById('tripPreview').style.display='none';ct=null;

  if(tripId){
    etId=tripId;const trip=DB.getTrip(tripId);
    if(trip){
      ct=JSON.parse(JSON.stringify(trip));
      document.getElementById('editorTitle').textContent='编辑行程';
      document.getElementById('editorBannerText').textContent=`✈ ${trip.destination||'未命名行程'}`;
      document.getElementById('tripDestination').value=trip.destination||'';
      setDateISO(document.getElementById('startPicker'),trip.startDate||'');
      setDateISO(document.getElementById('endPicker'),trip.endDate||'');
      renderDays();updatePreview();
    }
  }else{
    etId=null;document.getElementById('editorTitle').textContent='新行程';document.getElementById('editorBannerText').textContent='创建新行程';
  }
  ['startPicker','endPicker'].forEach(id=>{const el=document.getElementById(id);el.querySelectorAll('select').forEach(s=>{s.addEventListener('change',syncDays);});});
}

function getPickerDate(id){return getDateISO(document.getElementById(id));}

function syncDays(){
  const s=getPickerDate('startPicker'),e=getPickerDate('endPicker');
  if(!s||!e){document.getElementById('daysVerticalContainer').innerHTML='<div class="empty-state"><p>请先选择出行日期</p></div>';document.getElementById('tripPreview').style.display='none';return;}
  const st=parseDate(s),etd=parseDate(e);
  if(etd<st){showToast('结束日期不能早于出发日期','error');return;}
  const cnt=Math.floor((etd-st)/86400000)+1;
  if(!ct) ct={destination:'',startDate:s,endDate:e,days:[],totalEstimatedCost:0};
  ct.startDate=s;ct.endDate=e;
  while(ct.days.length<cnt)ct.days.push({day:ct.days.length+1,activities:[]});
  while(ct.days.length>cnt)ct.days.pop();
  renderDays();updatePreview();autoSave();
}

function parseDate(str){const p=str.split('-');return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));}

function renderDays(){
  const c=document.getElementById('daysVerticalContainer');
  if(!ct||!ct.days||!ct.days.length){c.innerHTML='<div class="empty-state"><p>请先选择出行日期</p></div>';return;}
  c.innerHTML=ct.days.map((d,di)=>{
    const ds=ct.startDate?fmtOff(ct.startDate,di):'';
    return `<div class="day-block"><div class="day-block-header"><div class="day-block-title">第${d.day}天 <span class="day-block-date">${ds}</span></div><div class="day-block-actions"><button onclick="showAddAct(${di})">+ 活动</button></div></div>${d.activities.map((a,ai)=>renderAct(a,di,ai)).join('')||'<div class="empty-state" style="padding:var(--space-lg)"><p>暂无活动</p></div>'}</div>`;
  }).join('');
}

function renderAct(a,di,ai){
  const dur=calcDur(ct.days[di].activities,ai);
  return `<div class="activity-card" draggable="true" data-day="${di}" data-act="${ai}" onclick="showActDet('${etId||ct?.id}',${di},${ai})" ondragstart="onDrag(event,${di},${ai})" ondragover="onDragOver(event)" ondrop="onDrop(event,${di},${ai})" ondragend="onDragEnd(event)">
    <div class="activity-type-icon" style="background:${(TYC[a.type]||'#6B7C8A')}20">${TYI[a.type]||'📍'}</div>
    <div class="activity-info"><h5>${esc(a.name)}</h5>
      <div class="activity-time-row">${a.startTime?`🕐 ${a.startTime}`:''}${dur?`<span class="duration">${dur}</span>`:''}</div>
      ${a.location?`<div class="activity-location">📍 ${esc(a.location)}</div>`:''}
      <p><span>${TL[a.type]||'其他'}</span>${a.cost?`<span class="activity-cost">¥${a.cost}</span>`:''}</p>
    </div>
    <div class="activity-actions"><button class="activity-btn-icon edit" onclick="event.stopPropagation();showEditAct(${di},${ai})">✎</button><button class="activity-btn-icon delete" onclick="event.stopPropagation();delAct(${di},${ai})">✕</button></div>
  </div>`;
}

function calcDur(acts,idx){
  if(!acts[idx]||!acts[idx].startTime||idx>=acts.length-1)return'';
  const n=acts[idx+1];if(!n||!n.startTime)return'';
  const [h1,m1]=acts[idx].startTime.split(':').map(Number),[h2,m2]=n.startTime.split(':').map(Number);
  let diff=(h2*60+m2)-(h1*60+m1);if(diff<=0)diff+=1440;
  const h=Math.floor(diff/60),m=diff%60;
  return h>0?`${h}小时${m>0?m+'分钟':''}`:`${m}分钟`;
}

function onDrag(e,d,a){drag={d,a};e.dataTransfer.setData('text/plain',`${d}-${a}`);e.target.classList.add('dragging');}
function onDragOver(e){e.preventDefault();e.target.closest('.activity-card')?.classList.add('drag-over');}
function onDrop(e,td,ta){
  e.preventDefault();e.target.closest('.activity-card')?.classList.remove('drag-over');
  if(!drag)return;
  const {d:sd,a:sa}=drag;if(sd===td&&sa===ta)return;
  const [m]=ct.days[sd].activities.splice(sa,1);
  if(sd===td&&ta>sa)ct.days[td].activities.splice(ta-1,0,m);else ct.days[td].activities.splice(ta,0,m);
  renderDays();updatePreview();autoSave();drag=null;
}
function onDragEnd(e){document.querySelectorAll('.activity-card').forEach(c=>c.classList.remove('dragging','drag-over'));drag=null;}

// ===== 活动详情 =====
function showActDet(tripId,di,ai){_detailTripId=tripId;nav('activity-detail',{tripId,dayIdx:di,actIdx:ai});}
function renderActDetail(params){
  if(!params||!params.tripId){showToast('无法加载活动详情','error');nav('home');return;}
  const trip=DB.getTrip(params.tripId);
  if(!trip||!trip.days||!trip.days[params.dayIdx]){showToast('活动数据不存在','error');nav('home');return;}
  const a=trip.days[params.dayIdx].activities[params.actIdx];if(!a){showToast('活动数据不存在','error');nav('home');return;}
  const backBtn=document.getElementById('actBackBtn');
  backBtn.onclick=()=>{if(_detailTripId){etId=_detailTripId;nav('trip-editor',_detailTripId);}else nav('home');};
  document.getElementById('actDetailTitle').textContent=a.name;
  document.getElementById('actDetailName').textContent=a.name;
  document.getElementById('actDetailType').textContent=TYI[a.type]||'📍';
  document.getElementById('actDetailMeta').textContent=`${TL[a.type]||'其他'} · ${trip.destination||'未知行程'}`;
  document.getElementById('actDetailTime').textContent=a.startTime||'未设置';
  document.getElementById('actDetailLoc').textContent=a.location||'未设置';
  document.getElementById('actDetailCost').textContent=a.cost?`¥${a.cost}`:'未设置';
  document.getElementById('actDetailTypeLabel').textContent=TL[a.type]||'其他';
  document.getElementById('actDetailHero').style.background=`linear-gradient(135deg,${TYC[a.type]||'#2D9B6E'},${adj(TYC[a.type]||'#2D9B6E',40)})`;
  const imgs=a.images&&a.images.length?a.images:(a.image?[a.image]:[]);
  document.getElementById('actDetailImages').innerHTML=imgs.length?imgs.map(img=>`<img src="${img}" onclick="openFS('${img}')" alt="">`).join(''):'<div class="empty-state"><p>暂无图片</p></div>';
}

// ===== 活动CRUD =====
function showAddAct(di){if(!ct||!ct.days||!ct.days.length){showToast('请先设置出行日期','warning');return;}eaIdx=null;edIdx=di;resetActForm();document.getElementById('activityModalTitle').textContent='添加活动';document.querySelector('#activityModal .btn-primary').textContent='添加';document.getElementById('activityModal').style.display='flex';}
function showEditAct(di,ai){
  if(!ct||!ct.days[di])return;
  const a=ct.days[di].activities[ai];if(!a)return;
  eaIdx=ai;edIdx=di;
  document.getElementById('activityModalTitle').textContent='编辑活动';document.querySelector('#activityModal .btn-primary').textContent='保存';
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===a.type));
  document.getElementById('activityName').value=a.name||'';
  document.getElementById('activityStartTime').value=a.startTime||'';
  document.getElementById('activityLocation').value=a.location||'';
  document.getElementById('activityCost').value=a.cost||'';
  actImgs=a.images&&a.images.length?[...a.images]:(a.image?[a.image]:[]);
  renderActPrevs();
  document.getElementById('activityModal').style.display='flex';
}
function resetActForm(){document.getElementById('activityName').value='';document.getElementById('activityStartTime').value='';document.getElementById('activityLocation').value='';document.getElementById('activityCost').value='';actImgs=[];renderActPrevs();document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));document.querySelector('.type-btn').classList.add('active');}
function selType(b){document.querySelectorAll('.type-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');}
function previewActivityImages(e){
  const files=Array.from(e.target.files);
  const rem=5-actImgs.length;if(rem<=0){showToast('最多上传5张图片','warning');return;}
  const tp=files.slice(0,rem);let done=0;
  tp.forEach(f=>{const r=new FileReader();r.onload=function(ev){actImgs.push(ev.target.result);done++;if(done===tp.length)renderActPrevs();};r.readAsDataURL(f);});
}
function rmActImg(i){actImgs.splice(i,1);renderActPrevs();}
function renderActPrevs(){
  const c=document.getElementById('activityImagePreviews');
  c.innerHTML=actImgs.map((img,i)=>`<span class="multi-image-preview-wrap"><img src="${img}" onclick="openFS('${img}')" alt=""><button class="remove-multi" onclick="rmActImg(${i})">✕</button></span>`).join('');
  let ce=c.parentElement.querySelector('.multi-image-count');if(!ce){ce=document.createElement('div');ce.className='multi-image-count';c.parentElement.appendChild(ce);}
  ce.textContent=actImgs.length?`${actImgs.length}/5 张图片`:'';
}
function confirmAddActivity(){
  const type=document.querySelector('.type-btn.active')?.dataset.type||'attraction';
  const name=document.getElementById('activityName').value.trim();
  const startTime=document.getElementById('activityStartTime').value;
  const location=document.getElementById('activityLocation').value.trim();
  const cost=parseFloat(document.getElementById('activityCost').value)||0;
  if(!name){showToast('请输入活动名称','warning');return;}
  if(!startTime){showToast('请输入开始时间','warning');return;}
  if(!location){showToast('请输入活动地点','warning');return;}
  const act={id:DB._id(),type,name,startTime,location,cost,images:actImgs.length?[...actImgs]:[]};
  if(eaIdx!==null&&edIdx!==null){ct.days[edIdx].activities[eaIdx]=act;showToast('活动已更新','success');}
  else{ct.days[edIdx].activities.push(act);showToast('已添加活动','success');}
  eaIdx=null;edIdx=null;renderDays();updatePreview();autoSave();closeModalDirect('activityModal');
}
function delAct(di,ai){if(!ct||!ct.days[di])return;ct.days[di].activities.splice(ai,1);renderDays();updatePreview();autoSave();}

// 自动保存
function autoSave(){
  const dest=document.getElementById('tripDestination').value.trim();
  const sd=getPickerDate('startPicker'),ed=getPickerDate('endPicker');
  if(!dest||!sd||!ed||!ct)return;
  if(!ct.days)ct.days=[];
  ct.destination=dest;ct.startDate=sd;ct.endDate=ed;
  let tc=0;if(ct.days)ct.days.forEach(d=>{if(d.activities)d.activities.forEach(a=>{tc+=a.cost||0;})});
  ct.totalEstimatedCost=tc;
  if(etId)DB.updateTrip(etId,ct);else{const s=DB.addTrip(ct);etId=s.id;}
}

function saveAndGoHome(){
  const dest=document.getElementById('tripDestination').value.trim();
  const sd=getPickerDate('startPicker'),ed=getPickerDate('endPicker');
  if(!dest){showToast('请输入目的地','warning');return;}
  if(!sd||!ed){showToast('请选择出行日期','warning');return;}
  if(!ct) ct={destination:dest,startDate:sd,endDate:ed,days:[],totalEstimatedCost:0};
  else ct.destination=dest;
  ct.startDate=sd;ct.endDate=ed;
  let tc=0;if(ct.days)ct.days.forEach(d=>{if(d.activities)d.activities.forEach(a=>{tc+=a.cost||0;})});
  ct.totalEstimatedCost=tc;
  if(etId)DB.updateTrip(etId,ct);else{const s=DB.addTrip(ct);etId=s.id;}
  showToast('已保存','success');
  nav('home');
}

function updatePreview(){
  if(!ct||!ct.days){document.getElementById('tripPreview').style.display='none';return;}
  let tc=0,ta=0;ct.days.forEach(d=>{d.activities.forEach(a=>{tc+=a.cost||0;ta++;})});
  ct.totalEstimatedCost=tc;
  if(!ta){document.getElementById('tripPreview').style.display='none';return;}
  document.getElementById('tripPreview').style.display='block';
  document.getElementById('tripPreviewContent').innerHTML=`<p>📅 共${ct.days.length}天·📍${ta}个活动</p><p>💰预计总支出：<strong style="color:var(--accent)">¥${tc}</strong></p>`;
}

// ===== 预算 =====
function renderBudget(){
  const trips=DB.getTrips();
  const c=document.getElementById('budgetTripCards');
  if(!trips.length){c.innerHTML='<div class="empty-state"><p>暂无行程数据</p></div>';document.getElementById('budgetCategoryDetail').innerHTML='';document.getElementById('budgetDayDetail').innerHTML='';clearPie();return;}
  const s=[...trips].sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||''));
  c.innerHTML=s.map(t=>{let co=0;if(t.days)t.days.forEach(d=>{if(d.activities)d.activities.forEach(a=>{co+=a.cost||0;})});return `<div class="budget-trip-card" onclick="selBud('${t.id}')" data-id="${t.id}"><div class="bt-icon">💰</div><div class="bt-info"><h5>${esc(t.destination||'未命名行程')}</h5><p>${fmtD(t.startDate)}→${fmtD(t.endDate)}·${t.days?t.days.length:0}天</p></div><span class="bt-amount">¥${co}</span></div>`;}).join('');
  const f=s[0];document.querySelectorAll('.budget-trip-card').forEach(c=>c.classList.toggle('active',c.dataset.id===f.id));renderBudFor(f.id);
}
function selBud(id){document.querySelectorAll('.budget-trip-card').forEach(c=>c.classList.toggle('active',c.dataset.id===id));renderBudFor(id);}
function renderBudFor(tid){
  const t=DB.getTrip(tid);
  if(!t||!t.days){clearPie();document.getElementById('budgetCategoryDetail').innerHTML='<div class="empty-state"><p>该行程暂无数据</p></div>';document.getElementById('budgetDayDetail').innerHTML='';return;}
  const ct={},co=['交通','住宿','餐饮','门票','其他'];co.forEach(c=>ct[c]=0);
  t.days.forEach(d=>{if(d.activities)d.activities.forEach(a=>{const c=TCM[a.type]||'其他';ct[c]+=a.cost||0;})});
  const total=Object.values(ct).reduce((a,b)=>a+b,0);
  drawPie(ct,total);
  document.getElementById('pieCenterLabel').innerHTML=`总预算<br><span id="pieTotal">¥${total}</span>`;
  document.getElementById('pieLegend').innerHTML=co.map((c,i)=>`<div class="pie-legend-item"><span class="pie-legend-dot" style="background:${PIE[i]}"></span>${c}<span class="amount">¥${(ct[c]||0)}</span></div>`).join('');
  const cm=Math.max(...Object.values(ct),1);
  document.getElementById('budgetCategoryDetail').innerHTML=co.map(c=>{const a=ct[c]||0;return `<div class="budget-category-item"><div class="budget-cat-header"><span class="budget-cat-name">${c}</span><span class="budget-cat-amount">¥${a}</span></div><div class="budget-cat-bar"><div class="budget-cat-bar-fill" style="width:${cm>0?(a/cm)*100:0}%;background:${PIE[co.indexOf(c)]}"></div></div><div class="budget-cat-percent">${total>0?((a/total)*100).toFixed(1):0}%</div></div>`;}).join('');
  document.getElementById('budgetDayDetail').innerHTML=t.days.map(d=>{let dt=0;const acts=(d.activities||[]).map(a=>{dt+=a.cost||0;return `<div class="budget-day-activity"><span>${TYI[a.type]||'📍'}${esc(a.name)}</span><span class="cost">¥${a.cost||0}</span></div>`;}).join('');return `<div class="budget-day-item"><div class="budget-day-header"><h5>第${d.day}天${t.startDate?fmtOff(t.startDate,d.day-1):''}</h5><span class="budget-day-total">¥${dt}</span></div><div class="budget-day-activities">${acts||'<p style="text-align:center;color:var(--text-secondary);padding:8px 0">暂无活动</p>'}</div></div>`;}).join('');
}
function clearPie(){const c=document.getElementById('budgetPieChart');c.getContext('2d').clearRect(0,0,c.width,c.height);document.getElementById('pieTotal').textContent='¥0';document.getElementById('pieLegend').innerHTML='';}
function drawPie(ct,total){
  const cv=document.getElementById('budgetPieChart'),ctx=cv.getContext('2d'),w=cv.width,h=cv.height;
  ctx.clearRect(0,0,w,h);
  if(total===0){ctx.beginPath();ctx.arc(w/2,h/2,100,0,Math.PI*2);ctx.fillStyle='var(--border)';ctx.fill();return;}
  const co=['交通','住宿','餐饮','门票','其他'],cx=w/2,cy=h/2,r=100;let sa=-Math.PI/2;
  co.forEach((c,i)=>{const a=ct[c]||0;if(a===0)return;const s=(a/total)*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,sa,sa+s);ctx.closePath();ctx.fillStyle=PIE[i];ctx.fill();ctx.strokeStyle='var(--surface)';ctx.lineWidth=2;ctx.stroke();sa+=s;});
}

// ===== 分享 =====
function shareTrip(){
  const trip=etId?DB.getTrip(etId):ct;
  if(!trip){showToast('请先创建行程','warning');return;}
  document.getElementById('shareTripName').textContent=`✈${trip.destination||'我的旅行'}`;
  let info='';if(trip.startDate)info+=`<p>📅${fmtD(trip.startDate)}→${fmtD(trip.endDate)}</p>`;if(trip.days)info+=`<p>📆共${trip.days.length}天行程</p>`;
  document.getElementById('shareInfo').innerHTML=info;
  let s='<h4 style="margin-bottom:8px;font-size:14px">行程安排</h4>';
  if(trip.days)trip.days.forEach(d=>{if(d.activities&&d.activities.length)s+=`<p><strong>第${d.day}天</strong>：${d.activities.map(a=>a.name).join('、')}</p>`;});
  if(trip.totalEstimatedCost)s+=`<p style="margin-top:8px"><strong>预计总支出：¥${trip.totalEstimatedCost}</strong></p>`;
  document.getElementById('shareSummary').innerHTML=s;document.getElementById('shareModal').style.display='flex';
}
function downloadShareCard(){showToast('分享图片已生成，长按保存','success');}
function copyShareLink(){const l=`旅行伴侣-行程分享：${document.getElementById('shareTripName').textContent}`;if(navigator.clipboard)navigator.clipboard.writeText(l).then(()=>showToast('分享链接已复制','success'));else showToast('分享链接已生成','success');}

// ===== 工具 =====
function openFS(s){document.getElementById('fullscreenImage').src=s;document.getElementById('fullscreenViewer').style.display='flex';}
function closeFS(){document.getElementById('fullscreenViewer').style.display='none';}
function closeFullscreenViewer(){closeFS();}
function showToast(m,t='success'){const c=document.getElementById('toastContainer'),ic={success:'✓',error:'✕',warning:'⚠'};const o=document.createElement('div');o.className=`toast ${t}`;o.innerHTML=`<span>${ic[t]||'✓'}</span><span>${m}</span>`;c.appendChild(o);setTimeout(()=>{if(o.parentNode)o.remove();},3000);}
function closeModal(e,id){if(e.target===e.currentTarget)document.getElementById(id).style.display='none';}
function closeModalDirect(id){document.getElementById(id).style.display='none';}
function adj(h,a){const n=parseInt(h.replace('#',''),16);const r=Math.min(255,Math.max(0,(n>>16)+a));const g=Math.min(255,Math.max(0,((n>>8)&0x00FF)+a));const b=Math.min(255,Math.max(0,(n&0x0000FF)+a));return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,'0')}`;}

// ===== 主题 & 启动 =====
function initTheme(){const s=localStorage.getItem('theme')||'light';if(s==='dark')document.body.classList.add('dark');document.getElementById('themeToggle').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('theme',document.body.classList.contains('dark')?'dark':'light');});}
function initApp(){initTheme();nav('home');console.log('✈ v7');
  // PWA 独立模式检测
  if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
    document.body.classList.add('pwa-mode');
    console.log('[PWA] 应用以独立模式运行');
  }
  // URL 参数快捷导航（从主屏快捷方式进入）
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  if (action === 'new-trip') setTimeout(() => nav('trip-editor'), 500);
  else if (action === 'budget') setTimeout(() => nav('budget'), 500);
}
document.addEventListener('DOMContentLoaded',initApp);

// HTML兼容包装
function navigateTo(p,params){nav(p,params);}
