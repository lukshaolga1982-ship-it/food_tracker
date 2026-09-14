window.FOOD_APP = window.FOOD_APP || {};

(function(){
  const C = FOOD_APP;
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
  let Service=null, profile=null, settings=null, classes=[], currentRoute="dashboard";
  let currentClassId=null, classTab="today", selectedDate=todayKey(), selectedMonth=todayKey().slice(0,7);

  function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
  function todayKey(){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:window.APP_CONFIG.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const o={};parts.forEach(p=>o[p.type]=p.value);return `${o.year}-${o.month}-${o.day}`;
  }
  function nowParts(){
    const parts=new Intl.DateTimeFormat("en-GB",{timeZone:window.APP_CONFIG.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
    const o={};parts.forEach(p=>o[p.type]=p.value);return {year:+o.year,month:+o.month,day:+o.day,hour:+o.hour,minute:+o.minute,dateKey:`${o.year}-${o.month}-${o.day}`};
  }
  function canEditDate(dateKey){
    if(profile?.role==="admin") return true;
    if(profile?.role!=="teacher") return false;
    const n=nowParts();
    if(dateKey!==n.dateKey) return false;
    const [h,m]=(settings?.editDeadline||"09:00").split(":").map(Number);
    return n.hour<h || (n.hour===h && n.minute<m);
  }
  function roleLabel(){return C.ROLE_LABELS[profile?.role]||profile?.role||"—";}
  function catName(code){return C.categoryByCode(code)?.name||"Не получает";}
  function catShort(code){return C.categoryByCode(code)?.short||"—";}
  function catNumber(code){return C.categoryByCode(code)?.number||"";}
  function classById(id){return classes.find(x=>x.id===id);}
  function setTitle(title,subtitle=""){ $("#pageTitle").textContent=title;$("#pageSubtitle").textContent=subtitle; }
  function toast(msg,type="ok"){const el=document.createElement("div");el.className="toast"+(type==="error"?" error":"");el.textContent=msg;$("#toastRoot").appendChild(el);setTimeout(()=>el.remove(),3200);}
  function fmtDate(k){if(!k)return"";const [y,m,d]=k.split("-");return `${d}.${m}.${y}`;}
  function monthLabel(v){const [y,m]=v.split("-").map(Number);return new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric"}).format(new Date(y,m-1,1));}
  function dayCount(y,m){return new Date(y,m,0).getDate();}
  function monthBounds(v){const [y,m]=v.split("-").map(Number);return {y,m,days:dayCount(y,m)};}
  function isWeekend(y,m,d){const w=new Date(y,m-1,d).getDay();return w===0||w===6;}
  function defaultStatuses(student,record){
    return {
      lunch: record?.lunchStatus || (student.lunchCategory ? "eating":"none"),
      snack: record?.snackStatus || (student.snackCategory ? "eating":"none")
    };
  }

  async function boot(){
    const demo = new URLSearchParams(location.search).get("demo")==="1";
    if(demo){
      Service=new C.services.DemoService();
      $("#loginScreen").classList.add("hidden");
      await enterApp({uid:"demo-admin"});
      return;
    }
    if(!C.services.configured()){
      showSetup();
      return;
    }
    try{
      Service=new C.services.FirebaseService();
      $("#loginScreen").classList.remove("hidden");
      bindLogin();
      Service.authListener(async user=>{
        if(user) await enterApp(user);
        else {
          $("#appShell").classList.add("hidden");
          $("#loginScreen").classList.remove("hidden");
        }
      });
    }catch(e){showSetup(e.message)}
  }

  function showSetup(error=""){
    $("#setupScreen").classList.remove("hidden");
    $("#setupScreen").innerHTML=`<div class="setup-wrap"><div class="setup-card">
      <img src="assets/logo.png" alt="" style="width:72px;height:72px;object-fit:contain;float:right">
      <h1>Сайт готов к подключению Firebase</h1>
      <p>Сейчас в <b>js/firebase-config.js</b> стоят заглушки. Вставь конфигурацию Web App из Firebase Console — и сайт начнёт работать с твоей базой.</p>
      ${error?`<div class="notice danger">${esc(error)}</div>`:""}
      <h3>Где взять конфигурацию</h3>
      <p class="muted">Firebase Console → Project settings → General → Your apps → Web app → SDK setup and configuration.</p>
      <div class="code">window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};</div>
      <div class="page-actions" style="margin-top:18px">
        <a class="btn btn-primary" href="?demo=1" style="text-decoration:none">Открыть демо-режим</a>
      </div>
      <hr>
      <p class="muted">Полная инструкция находится в README.md внутри архива.</p>
    </div></div>`;
  }

  function bindLogin(){
    $("#loginForm").addEventListener("submit",async e=>{
      e.preventDefault();$("#loginError").classList.add("hidden");
      try{
        await Service.signIn($("#loginUsername").value,$("#loginPassword").value);
      }catch(err){
        $("#loginError").textContent="Не удалось войти. Проверь логин и пароль.";
        $("#loginError").classList.remove("hidden");
      }
    });
  }

  async function enterApp(user){
    profile=await Service.getProfile(user.uid);
    if(!profile){
      if(Service.isDemo()) profile=Service.currentProfile;
      else{
        $("#loginError").textContent="Для этого аккаунта не создан профиль в коллекции users.";
        $("#loginError").classList.remove("hidden");
        await Service.signOut(); return;
      }
    }
    settings=await Service.getSettings();
    classes=await Service.getClasses();
    $("#setupScreen").classList.add("hidden");
    $("#loginScreen").classList.add("hidden");
    $("#appShell").classList.remove("hidden");
    $("#userName").textContent=profile.displayName||profile.username||"Пользователь";
    $("#userRole").textContent=roleLabel();
    $("#userAvatar").textContent=(profile.displayName||profile.username||"А").trim()[0].toUpperCase();
    applyRoleVisibility();
    bindShell();
    route("dashboard");
  }

  function applyRoleVisibility(){
    $$(".role-admin").forEach(el=>el.classList.toggle("hidden",profile.role!=="admin"));
    $$(".role-admin-food").forEach(el=>el.classList.toggle("hidden",!["admin","food"].includes(profile.role)));
  }
  let shellBound=false;
  function bindShell(){
    if(shellBound)return;shellBound=true;
    $("#logoutBtn").addEventListener("click",()=>Service.signOut());
    $("#refreshBtn").addEventListener("click",()=>route(currentRoute,true));
    $("#mainNav").addEventListener("click",e=>{
      const b=e.target.closest("[data-route]");if(b)route(b.dataset.route);
    });
  }
  async function route(r,refresh=false){
    currentRoute=r;
    $$("#mainNav .nav-item").forEach(x=>x.classList.toggle("active",x.dataset.route===r));
    $("#content").innerHTML=`<div class="card"><div class="empty">Загрузка…</div></div>`;
    try{
      if(r==="dashboard") await renderDashboard();
      else if(r==="classes") await renderClasses();
      else if(r==="summary" && ["admin","food"].includes(profile.role)) await renderSummary();
      else if(r==="reports" && ["admin","food"].includes(profile.role)) await renderReports();
      else if(r==="import" && profile.role==="admin") await renderImport();
      else if(r==="admin" && profile.role==="admin") await renderAdmin();
      else if(r==="class") await renderClassPage();
      else await renderDashboard();
    }catch(e){
      console.error(e);
      $("#content").innerHTML=`<div class="notice danger"><b>Ошибка загрузки:</b> ${esc(e.message)}</div>`;
    }
  }

  function accessibleClasses(){
    if(profile.role==="teacher"){
      const ids=profile.classIds||[];
      return classes.filter(c=>ids.includes(c.id));
    }
    return classes;
  }

  async function dashboardData(dateKey){
    const ac=accessibleClasses();
    const students=profile.role==="teacher"
      ? (await Promise.all(ac.map(c=>Service.getStudents(c.id)))).flat()
      : await Service.getAllStudents();
    const records=profile.role==="teacher"
      ? (await Promise.all(ac.map(c=>Service.getDailyRecords(dateKey,c.id)))).flat()
      : await Service.getDailyRecords(dateKey);
    const submissions=profile.role==="teacher" ? (await Promise.all(ac.map(c=>Service.getSubmissions(dateKey,c.id)))).flat() : await Service.getSubmissions(dateKey);
    const map=new Map(records.map(r=>[r.studentId,r]));
    let absent=0,notEating=0,lunch=0,snack=0,feedingStudents=0;
    for(const s of students){
      const st=defaultStatuses(s,map.get(s.id));
      if(st.lunch==="absent"||st.snack==="absent") absent++;
      if(st.lunch==="not_eating"||st.snack==="not_eating") notEating++;
      if(st.lunch==="eating")lunch++;
      if(st.snack==="eating")snack++;
      if(st.lunch==="eating"||st.snack==="eating")feedingStudents++;
    }
    return {ac,students,records,submissions,total:students.length,absent,notEating,lunch,snack,feedingStudents,map};
  }

  async function renderDashboard(){
    setTitle("Главная","Ежедневный контроль питания");
    const d=await dashboardData(selectedDate);
    const subMap=new Map(d.submissions.map(x=>[x.classId,x]));
    $("#content").innerHTML=`
      <div class="page-actions">
        <div class="field compact"><span>Дата</span><input id="dashboardDate" type="date" value="${selectedDate}"></div>
        <button id="todayBtn" class="btn btn-secondary">Сегодня</button>
      </div>
      <div class="grid-kpi">
        ${kpi("Всего учащихся",d.total)}
        ${kpi("Питаются",d.feedingStudents,"green")}
        ${kpi("Отсутствуют",d.absent)}
        ${kpi("Не питаются",d.notEating)}
        ${kpi("Обеды",d.lunch,"cream")}
        ${kpi("Полдники",d.snack,"green")}
      </div>
      ${["admin","food"].includes(profile.role)?submissionProgress(d.ac,d.submissions):""}
      <div class="card">
        <div class="card-header"><h3>Классы — ${fmtDate(selectedDate)}</h3><span class="muted">${d.ac.length} классов</span></div>
        <div class="table-wrap">
          <table><thead><tr><th>Класс</th><th class="text-right">Всего</th><th class="text-right">Обеды</th><th class="text-right">Полдники</th><th class="text-right">Отсутствуют</th><th>Сведения</th></tr></thead>
          <tbody>${d.ac.map(c=>dashboardClassRow(c,d.students,d.map,subMap.get(c.id))).join("")}</tbody></table>
        </div>
      </div>`;
    $("#dashboardDate").onchange=e=>{selectedDate=e.target.value;renderDashboard()};
    $("#todayBtn").onclick=()=>{selectedDate=todayKey();renderDashboard()};
    $$("[data-open-class]").forEach(b=>b.onclick=()=>openClass(b.dataset.openClass,"today"));
  }
  function kpi(label,val,kind=""){return `<div class="kpi ${kind}"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div></div>`}
  function submissionProgress(ac,subs){
    const done=new Set(subs.map(x=>x.classId)).size, total=ac.length, pct=total?Math.round(done/total*100):0;
    return `<div class="notice success"><div class="progress-row"><strong>Сведения передали ${done} из ${total} классов</strong><div class="progress"><div style="width:${pct}%"></div></div><b>${pct}%</b></div></div>`;
  }
  function dashboardClassRow(c,students,recMap,submission){
    const ss=students.filter(s=>s.classId===c.id);let l=0,p=0,a=0;
    ss.forEach(s=>{const st=defaultStatuses(s,recMap.get(s.id));if(st.lunch==="eating")l++;if(st.snack==="eating")p++;if(st.lunch==="absent"||st.snack==="absent")a++});
    return `<tr><td><button class="link-btn" data-open-class="${c.id}">${esc(c.name)}</button></td><td class="text-right">${ss.length}</td><td class="text-right">${l}</td><td class="text-right">${p}</td><td class="text-right">${a}</td><td>${submission?`<span class="status ok">✓ Передано</span>`:`<span class="status pending">Не передано</span>`}</td></tr>`;
  }

  async function renderClasses(){
    setTitle("Классы","Выберите класс для работы");
    const ac=accessibleClasses();
    const counts={};await Promise.all(ac.map(async c=>counts[c.id]=(await Service.getStudents(c.id)).length));
    $("#content").innerHTML=`<div class="class-grid">${ac.map(c=>`<button class="class-card" data-open-class="${c.id}"><strong>${esc(c.name)}</strong><small>${counts[c.id]||0} учащихся</small></button>`).join("")}</div>`;
    $$("[data-open-class]").forEach(b=>b.onclick=()=>openClass(b.dataset.openClass,"today"));
  }
  function openClass(id,tab="today"){currentClassId=id;classTab=tab;currentRoute="class";route("class")}
  async function renderClassPage(){
    const cls=classById(currentClassId);if(!cls){route("classes");return}
    setTitle(`${cls.name} класс`,`${settings?.academicYear||window.APP_CONFIG.academicYear}`);
    $("#content").innerHTML=`
      <div class="page-actions">
        <button id="backClasses" class="btn btn-secondary">← К классам</button>
        <div class="field compact"><span>Дата</span><input id="classDate" type="date" value="${selectedDate}"></div>
      </div>
      <div class="tabs">
        <button class="tab ${classTab==="today"?"active":""}" data-tab="today">Сегодня</button>
        <button class="tab ${classTab==="month"?"active":""}" data-tab="month">Месяц</button>
        <button class="tab ${classTab==="students"?"active":""}" data-tab="students">Учащиеся</button>
      </div>
      <div id="classTabBody"></div>`;
    $("#backClasses").onclick=()=>route("classes");
    $("#classDate").onchange=e=>{selectedDate=e.target.value;if(classTab==="month")selectedMonth=e.target.value.slice(0,7);renderClassTab()};
    $$("[data-tab]").forEach(b=>b.onclick=()=>{classTab=b.dataset.tab;renderClassPage()});
    await renderClassTab();
  }
  async function renderClassTab(){
    if(classTab==="today")await renderClassToday();
    else if(classTab==="month")await renderClassMonth();
    else await renderClassStudents();
  }

  async function renderClassToday(){
    const cls=classById(currentClassId), body=$("#classTabBody");
    const students=await Service.getStudents(currentClassId);
    const records=await Service.getDailyRecords(selectedDate,currentClassId);
    const subs=await Service.getSubmissions(selectedDate, profile.role==="teacher" ? currentClassId : null);
    const submitted=subs.find(x=>x.classId===currentClassId);
    const map=new Map(records.map(r=>[r.studentId,r]));
    const editable=canEditDate(selectedDate);
    const n=nowParts(), deadline=settings?.editDeadline||"09:00";
    let banner;
    if(profile.role==="teacher"){
      banner=editable?`<div class="deadline-banner open"><div><b>Редактирование открыто до ${deadline}</b><div class="muted">Текущий день: ${fmtDate(selectedDate)}</div></div>${submitted?`<span class="status ok">✓ Сведения переданы</span>`:""}</div>`
        :`<div class="deadline-banner locked"><div><b>🔒 Редактирование закрыто</b><div class="muted">Классный руководитель может изменять текущий день только до ${deadline}.</div></div></div>`;
    }else{
      banner=`<div class="deadline-banner ${profile.role==="admin"?"open":"locked"}"><div><b>${profile.role==="admin"?"Режим администратора":"Режим просмотра"}</b><div class="muted">${profile.role==="admin"?"Администратор может исправлять данные после дедлайна; изменение попадёт в журнал.":"Ответственный за питание просматривает сведения без изменения."}</div></div></div>`;
    }
    body.innerHTML=`${banner}
      ${editable?`<div class="bulk-bar"><input id="selectAllStudents" class="checkbox" type="checkbox"><b>Массово:</b><button class="btn btn-sm btn-secondary" data-bulk="eating">✓ Питаются</button><button class="btn btn-sm btn-secondary" data-bulk="absent">Н Отсутствуют</button><button class="btn btn-sm btn-secondary" data-bulk="not_eating">– Не питаются</button></div>`:""}
      <div class="student-list">${students.map(s=>studentDailyRow(s,map.get(s.id),editable)).join("")||`<div class="empty"><strong>Нет учащихся</strong>Добавьте учащихся во вкладке «Учащиеся».</div>`}</div>
      ${profile.role==="teacher"&&editable?`<div style="margin-top:16px;display:flex;justify-content:flex-end"><button id="submitClassBtn" class="btn btn-primary">✓ Сведения переданы</button></div>`:""}`;
    bindDailyControls(students,map,editable);
    if($("#submitClassBtn"))$("#submitClassBtn").onclick=async()=>{await Service.submitClass(selectedDate,currentClassId,profile);toast("Сведения класса переданы");renderClassToday()};
  }
  function studentDailyRow(s,r,editable){
    const st=defaultStatuses(s,r);
    return `<div class="student-row" data-student="${s.id}">
      <div class="student-main"><div style="display:flex;gap:9px;align-items:center"><input class="checkbox row-check ${editable?"":"hidden"}" type="checkbox"><div><div class="student-name">${esc(s.fullName)}</div><div class="student-meta">${esc(classById(s.classId)?.name||"")}</div></div></div></div>
      ${mealControl("Обед",s.lunchCategory,st.lunch,"lunch",editable)}
      ${mealControl("Полдник",s.snackCategory,st.snack,"snack",editable)}
    </div>`;
  }
  function mealControl(title,category,status,meal,editable){
    const disabled=!category;
    return `<div class="meal-cell"><div class="meal-head"><b>${title}</b><span class="badge ${meal==="lunch"?"cream":""}">${disabled?"Не получает":esc(catShort(category)+" · "+catName(category))}</span></div>
      <div class="segment ${disabled||!editable?"disabled":""}" data-meal="${meal}">
        <button data-status="eating" class="${status==="eating"?"active":""}">✓</button>
        <button data-status="absent" class="${status==="absent"?"active":""}">Н</button>
        <button data-status="not_eating" class="${status==="not_eating"?"active":""}">–</button>
      </div></div>`;
  }
  function bindDailyControls(students,map,editable){
    if(!editable)return;
    const state=new Map(students.map(s=>[s.id,defaultStatuses(s,map.get(s.id))]));
    $$(".segment button").forEach(btn=>btn.onclick=async()=>{
      const row=btn.closest("[data-student]"),sid=row.dataset.student,meal=btn.closest(".segment").dataset.meal,status=btn.dataset.status,s=students.find(x=>x.id===sid);
      state.get(sid)[meal]=status;
      btn.parentElement.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===btn));
      try{await Service.saveDailyRecord(s,selectedDate,state.get(sid).lunch,state.get(sid).snack,profile)}catch(e){toast(e.message,"error")}
    });
    if($("#selectAllStudents"))$("#selectAllStudents").onchange=e=>$$(".row-check").forEach(x=>x.checked=e.target.checked);
    $$("[data-bulk]").forEach(b=>b.onclick=async()=>{
      const selected=$$(".student-row").filter(r=>$(".row-check",r)?.checked);
      if(!selected.length){toast("Сначала выберите учащихся","error");return}
      b.disabled=true;
      for(const row of selected){
        const sid=row.dataset.student,s=students.find(x=>x.id===sid),status=b.dataset.bulk;
        const st=state.get(sid);
        if(s.lunchCategory)st.lunch=status;if(s.snackCategory)st.snack=status;
        await Service.saveDailyRecord(s,selectedDate,st.lunch,st.snack,profile);
      }
      b.disabled=false;toast(`Изменено: ${selected.length}`);renderClassToday();
    });
  }

  async function renderClassMonth(){
    const body=$("#classTabBody"), students=await Service.getStudents(currentClassId);
    selectedMonth=selectedDate.slice(0,7);
    const {y,m,days}=monthBounds(selectedMonth), records=await Service.getMonthlyRecords(currentClassId,y,m);
    const byStudentDay=new Map(records.map(r=>[`${r.studentId}_${r.day}`,r]));
    body.innerHTML=`<div class="page-actions"><div class="field compact"><span>Месяц</span><input id="monthPick" type="month" value="${selectedMonth}"></div><button id="exportClassMonth" class="btn btn-secondary">⇩ Excel класса</button></div>
    <div class="card"><div class="table-wrap"><table class="table-month"><thead><tr><th class="sticky-col">Учащийся</th>${Array.from({length:days},(_,i)=>`<th class="day-head ${isWeekend(y,m,i+1)?"muted":""}">${i+1}<div class="subcols"><small>О</small><small>П</small></div></th>`).join("")}</tr></thead>
    <tbody>${students.map(s=>`<tr><td class="sticky-col"><b>${esc(s.fullName)}</b><div class="student-meta">${esc(catShort(s.lunchCategory))} / ${esc(catShort(s.snackCategory))}</div></td>${Array.from({length:days},(_,i)=>monthStudentCell(s,byStudentDay.get(`${s.id}_${i+1}`))).join("")}</tr>`).join("")}</tbody></table></div></div>`;
    $("#monthPick").onchange=e=>{selectedMonth=e.target.value;selectedDate=e.target.value+"-01";renderClassMonth()};
    $("#exportClassMonth").onclick=()=>exportClassMonthWorkbook(classById(currentClassId),students,records,y,m,days);
  }
  function valForMeal(s,record,meal){
    const cat=s[meal+"Category"],status=record?.[meal+"Status"]||(cat?"eating":"none");
    if(!cat||status==="none")return "";
    if(status==="absent")return "Н";
    if(status==="not_eating")return "–";
    return catNumber(record?.[meal+"Category"]||cat);
  }
  function monthStudentCell(s,r){return `<td class="day-cell"><div class="subcols"><span class="mini-cell lunch">${esc(valForMeal(s,r,"lunch"))}</span><span class="mini-cell snack">${esc(valForMeal(s,r,"snack"))}</span></div></td>`}

  async function renderClassStudents(){
    const body=$("#classTabBody"), students=await Service.getStudents(currentClassId,true);
    const canManage=profile.role==="admin" || profile.role==="teacher";
    body.innerHTML=`<div class="search-row"><div class="field grow"><span>Поиск по фамилии</span><input id="studentSearch" placeholder="Введите фамилию или имя"></div>${canManage?`<button id="addStudentBtn" class="btn btn-primary">+ Добавить учащегося</button>`:""}</div>
      <div class="card" style="margin-top:14px"><div class="table-wrap"><table><thead><tr><th>ФИО</th><th>Обед</th><th>Полдник</th><th>Статус</th><th></th></tr></thead><tbody id="studentTableBody">${studentRows(students,canManage)}</tbody></table></div></div>`;
    $("#studentSearch").oninput=e=>{$("#studentTableBody").innerHTML=studentRows(students.filter(s=>s.fullName.toLowerCase().includes(e.target.value.toLowerCase())),canManage);bindStudentActions(students,canManage)};
    if($("#addStudentBtn"))$("#addStudentBtn").onclick=()=>studentModal(null);
    bindStudentActions(students,canManage);
  }
  function studentRows(students,canManage){
    return students.map(s=>`<tr><td><b>${esc(s.fullName)}</b></td><td>${esc(catShort(s.lunchCategory))}<div class="student-meta">${esc(catName(s.lunchCategory))}</div></td><td>${s.snackCategory?esc(catShort(s.snackCategory)):"—"}<div class="student-meta">${esc(catName(s.snackCategory))}</div></td><td>${s.status==="withdrawn"?`<span class="status off">Выбыл</span>`:`<span class="status ok">Активен</span>`}</td><td><div class="actions">${canManage?`<button class="btn btn-sm btn-secondary" data-edit-student="${s.id}">Изменить</button>${profile.role==="admin"?`<button class="btn btn-sm btn-secondary" data-transfer="${s.id}">Перевести</button>`:""}${s.status!=="withdrawn"?`<button class="btn btn-sm btn-danger" data-withdraw="${s.id}">Выбыл</button>`:""}`:""}</div></td></tr>`).join("")||`<tr><td colspan="5"><div class="empty">Нет учащихся</div></td></tr>`;
  }
  function bindStudentActions(students,canManage){
    if(!canManage)return;
    $$("[data-edit-student]").forEach(b=>b.onclick=()=>studentModal(students.find(s=>s.id===b.dataset.editStudent)));
    $$("[data-withdraw]").forEach(b=>b.onclick=async()=>{const s=students.find(x=>x.id===b.dataset.withdraw);if(confirm(`Отметить "${s.fullName}" как выбывшего?`)){await Service.withdrawStudent(s,profile);toast("Учащийся перемещён в архив");renderClassStudents()}});
    $$("[data-transfer]").forEach(b=>b.onclick=()=>transferModal(students.find(s=>s.id===b.dataset.transfer)));
  }
  function categoryOptions(list,value,none=true){return `${none?`<option value="">Не получает</option>`:""}${list.map(c=>`<option value="${c.code}" ${value===c.code?"selected":""}>${esc(c.short)} — ${esc(c.name)}</option>`).join("")}`}
  function studentModal(s){
    showModal(s?"Редактировать учащегося":"Добавить учащегося",`
      <div class="form-grid">
        <label class="full"><span>ФИО</span><input id="mFullName" value="${esc(s?.fullName||"")}" placeholder="Фамилия Имя" required></label>
        <label><span>Категория обеда</span><select id="mLunch">${categoryOptions(C.LUNCH_CATEGORIES,s?.lunchCategory)}</select></label>
        <label><span>Категория полдника</span><select id="mSnack">${categoryOptions(C.SNACK_CATEGORIES,s?.snackCategory)}</select></label>
      </div>`,
      async()=>{
        const fullName=$("#mFullName").value.trim();if(!fullName){toast("Введите ФИО","error");return false}
        await Service.saveStudent({...(s||{}),fullName,classId:currentClassId,lunchCategory:$("#mLunch").value||null,snackCategory:$("#mSnack").value||null,status:s?.status||"active"},profile);
        toast(s?"Данные обновлены":"Учащийся добавлен");await renderClassStudents();return true;
      });
  }
  function transferModal(s){
    showModal("Перевести в другой класс",`<p><b>${esc(s.fullName)}</b></p><label><span>Новый класс</span><select id="mTransfer">${classes.filter(c=>c.id!==s.classId).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>`,async()=>{await Service.transferStudent(s,$("#mTransfer").value,profile);toast("Учащийся переведён");await renderClassStudents();return true});
  }

  async function renderSummary(){
    setTitle("Сводная ведомость","Автоматический подсчёт по категориям");
    const {y,m,days}=monthBounds(selectedMonth);
    const records=await Service.getMonthAllRecords(y,m);
    const ac=classes;
    $("#content").innerHTML=`<div class="page-actions"><div class="field compact"><span>Месяц</span><input id="summaryMonth" type="month" value="${selectedMonth}"></div><button id="exportSummary" class="btn btn-primary">⇩ Скачать Excel</button></div>
      <div id="summaryBlocks">${ac.map(c=>summaryBlock(c,records,y,m,days)).join("")}</div>`;
    $("#summaryMonth").onchange=e=>{selectedMonth=e.target.value;renderSummary()};
    $("#exportSummary").onclick=()=>exportSummaryWorkbook(ac,records,y,m,days);
  }
  function summaryBlock(cls,records,y,m,days){
    const cr=records.filter(r=>r.classId===cls.id);
    const rows=[...C.LUNCH_CATEGORIES.map(c=>({meal:"lunch",cat:c})),...C.SNACK_CATEGORIES.map(c=>({meal:"snack",cat:c}))];
    return `<section class="summary-block"><div class="summary-title"><h3>${esc(cls.name)} класс</h3></div><div class="card"><div class="table-wrap"><table class="summary-table"><thead><tr><th>Категория</th>${Array.from({length:days},(_,i)=>`<th class="day">${i+1}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(r=>`<tr>${`<td class="${r.meal==="lunch"?"lunch-row":"snack-row"}">${esc(r.cat.short)}</td>`}${Array.from({length:days},(_,i)=>`<td class="num ${r.meal==="lunch"?"lunch-row":"snack-row"}">${countCategory(cr,i+1,r.meal,r.cat.code)}</td>`).join("")}</tr>`).join("")}
      <tr><td class="total-lunch">Итого Обед</td>${Array.from({length:days},(_,i)=>`<td class="num total-lunch">${countTotal(cr,i+1,"lunch")}</td>`).join("")}</tr>
      <tr><td class="total-snack">Итого Полдник</td>${Array.from({length:days},(_,i)=>`<td class="num total-snack">${countTotal(cr,i+1,"snack")}</td>`).join("")}</tr>
      </tbody></table></div></div></section>`;
  }
  function countCategory(records,day,meal,code){return records.filter(r=>r.day===day&&r[meal+"Status"]==="eating"&&r[meal+"Category"]===code).length}
  function countTotal(records,day,meal){return records.filter(r=>r.day===day&&r[meal+"Status"]==="eating").length}

  async function renderReports(){
    setTitle("Отчёты","Экспорт данных в Excel");
    $("#content").innerHTML=`<div class="two-col">
      <div class="card"><div class="card-header"><h3>Сводная ведомость за месяц</h3></div><div class="card-body"><div class="field"><span>Месяц</span><input id="reportMonth" type="month" value="${selectedMonth}"></div><p class="muted" style="margin:12px 0">По каждому классу: категории обеда и полдника, дни месяца и итоговые строки.</p><button id="reportSummaryBtn" class="btn btn-primary">Скачать .xlsx</button></div></div>
      <div class="card"><div class="card-header"><h3>База учащихся</h3></div><div class="card-body"><p class="muted" style="margin-bottom:14px">ФИО, класс, категории обеда и полдника, статус.</p><button id="reportStudentsBtn" class="btn btn-secondary">Скачать базу .xlsx</button></div></div>
      <div class="card"><div class="card-header"><h3>Сводная за день</h3></div><div class="card-body"><div class="field"><span>Дата</span><input id="reportDay" type="date" value="${selectedDate}"></div><p class="muted" style="margin:12px 0">Количество по категориям и классам на выбранную дату.</p><button id="reportDayBtn" class="btn btn-secondary">Скачать .xlsx</button></div></div>
    </div>`;
    $("#reportSummaryBtn").onclick=async()=>{selectedMonth=$("#reportMonth").value;const {y,m,days}=monthBounds(selectedMonth);const r=await Service.getMonthAllRecords(y,m);exportSummaryWorkbook(classes,r,y,m,days)};
    $("#reportStudentsBtn").onclick=async()=>exportStudentsWorkbook(await Service.getAllStudents(true));
    $("#reportDayBtn").onclick=async()=>exportDayWorkbook($("#reportDay").value,await Service.getDailyRecords($("#reportDay").value));
  }

  async function renderImport(){
    setTitle("Импорт данных","Учащиеся и перенос заполненной истории");
    $("#content").innerHTML=`
      <div class="card"><div class="card-header"><h3>Импорт учащихся</h3></div><div class="card-body">
        <div class="notice"><b>Ожидаемые колонки:</b> ФИО, Класс, Обед, Полдник. Можно указывать полное название категории, короткий код (например, «О МН (2)») или номер.</div>
        <div class="page-actions"><input id="importFile" type="file" accept=".xlsx,.xls,.csv"><button id="downloadTemplate" class="btn btn-secondary">Скачать шаблон</button></div>
        <div id="importPreview"></div>
      </div></div>
      <div class="card"><div class="card-header"><h3>Перенос данных из старых таблиц</h3></div><div class="card-body">
        <div class="notice success"><b>Одноразовая миграция:</b> файл переноса может сразу создать/обновить учащихся, перенести категории и уже заполненные дни в месячную ведомость и сводную.</div>
        <div class="notice warning">Старые таблицы не различают «отсутствует» и «не питается». Пустая ячейка за прошедший учебный день переносится как <b>«не питается»</b>.</div>
        <div class="page-actions"><input id="historyImportFile" type="file" accept=".json"></div>
        <div id="historyImportPreview"></div>
      </div></div>`;
    $("#downloadTemplate").onclick=downloadImportTemplate;
    $("#importFile").onchange=handleImportFile;
    $("#historyImportFile").onchange=handleHistoryImportFile;
  }
  let importRows=[];
  async function handleImportFile(e){
    const f=e.target.files[0];if(!f)return;
    await Service.seedDefaultClasses();
    classes=await Service.getClasses();
    const data=await f.arrayBuffer(), wb=XLSX.read(data,{type:"array"}), ws=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(ws,{defval:""});
    importRows=[];const errors=[];
    rows.forEach((r,i)=>{
      const fullName=String(r["ФИО"]||r["фио"]||"").trim(), className=String(r["Класс"]||r["класс"]||"").trim();
      const cls=classes.find(c=>c.name.toLowerCase()===className.toLowerCase());
      const lunch=normalizeCategory(r["Обед"]||r["обед"],C.LUNCH_CATEGORIES);
      const snack=normalizeCategory(r["Полдник"]||r["полдник"],C.SNACK_CATEGORIES);
      if(!fullName||!cls) errors.push(`Строка ${i+2}: ${!fullName?"нет ФИО":"не найден класс "+className}`);
      else importRows.push({fullName,classId:cls.id,lunchCategory:lunch,snackCategory:snack});
    });
    $("#importPreview").innerHTML=`${errors.length?`<div class="notice warning"><b>Предупреждения:</b><br>${errors.slice(0,10).map(esc).join("<br>")}${errors.length>10?"<br>…":""}</div>`:""}
      <div class="notice success">Готово к импорту: <b>${importRows.length}</b> учащихся.</div>
      ${importRows.length?`<div class="table-wrap"><table><thead><tr><th>ФИО</th><th>Класс</th><th>Обед</th><th>Полдник</th></tr></thead><tbody>${importRows.slice(0,20).map(r=>`<tr><td>${esc(r.fullName)}</td><td>${esc(classById(r.classId)?.name)}</td><td>${esc(catShort(r.lunchCategory))}</td><td>${esc(catShort(r.snackCategory))}</td></tr>`).join("")}</tbody></table></div><button id="confirmImport" class="btn btn-primary" style="margin-top:14px">Импортировать ${importRows.length}</button>`:""}`;
    if($("#confirmImport"))$("#confirmImport").onclick=async()=>{if(!confirm(`Добавить ${importRows.length} учащихся в базу?`))return;await Service.importStudents(importRows,profile);toast("Импорт завершён");$("#importPreview").innerHTML=`<div class="notice success">Импортировано: ${importRows.length}</div>`};
  }

  async function handleHistoryImportFile(e){
    const f=e.target.files[0];if(!f)return;
    const box=$("#historyImportPreview");
    try{
      const text=await f.text(), data=JSON.parse(text);
      if(!data || data.version!==1 || !Array.isArray(data.students) || !Array.isArray(data.records)){
        throw new Error("Это не файл миграции питания.");
      }
      const classSet=new Set((data.students||[]).map(x=>x.className));
      const dates=(data.records||[]).map(x=>x.dateKey).sort();
      box.innerHTML=`<div class="notice">
        <b>Файл готов к переносу.</b><br>
        Учащихся: <b>${data.students.length}</b><br>
        Классов: <b>${classSet.size}</b><br>
        Дневных записей: <b>${data.records.length}</b><br>
        Период: <b>${esc(data.period?.from||dates[0]||"—")} — ${esc(data.period?.to||dates[dates.length-1]||"—")}</b>
      </div>
      <button id="confirmHistoryImport" class="btn btn-primary">Перенести данные в Firebase</button>`;
      $("#confirmHistoryImport").onclick=async()=>{
        if(!confirm(`Перенести ${data.students.length} учащихся и ${data.records.length} дневных записей? Повторный запуск безопасен: записи обновятся, а не продублируются.`))return;
        const btn=$("#confirmHistoryImport");btn.disabled=true;btn.textContent="Переносим данные…";
        try{
          const result=await Service.importMigration(data,profile);
          classes=await Service.getClasses();
          box.innerHTML=`<div class="notice success"><b>Готово.</b> Учащиеся: ${result.students}. Дневные записи: ${result.records}. Данные уже доступны в «Месяц» и «Сводная».</div>`;
          toast("История питания перенесена");
        }catch(err){
          console.error(err);
          box.innerHTML=`<div class="notice danger"><b>Ошибка переноса:</b> ${esc(err.message)}</div>`;
        }
      };
    }catch(err){
      box.innerHTML=`<div class="notice danger"><b>Не удалось прочитать файл:</b> ${esc(err.message)}</div>`;
    }
  }

  function normalizeCategory(v,list){
    const s=String(v??"").trim().toLowerCase();if(!s||s==="не получает"||s==="нет")return null;
    for(const c of list){
      if(s===c.code.toLowerCase()||s===String(c.number)||s===c.short.toLowerCase()||s===c.name.toLowerCase())return c.code;
      if(s.includes(`(${c.number})`))return c.code;
    }return null;
  }

  async function renderAdmin(){
    setTitle("Настройки","Классы, пользователи и параметры");
    const allClasses=await Service.getAllClasses(), users=await Service.getUserProfiles();
    $("#content").innerHTML=`
      <div class="two-col">
        <div class="card"><div class="card-header"><h3>Общие настройки</h3></div><div class="card-body"><div class="form-grid">
          <label><span>Учебный год</span><input id="setYear" value="${esc(settings?.academicYear||"")}"></label>
          <label><span>Дедлайн редактирования</span><input id="setDeadline" type="time" value="${esc(settings?.editDeadline||"09:00")}"></label>
        </div><button id="saveSettingsBtn" class="btn btn-primary" style="margin-top:14px">Сохранить</button></div></div>

        <div class="card"><div class="card-header"><h3>Классы</h3><button id="addClassBtn" class="btn btn-sm btn-primary">+ Класс</button></div>
          <div class="table-wrap"><table><thead><tr><th>Класс</th><th>Порядок</th><th>Статус</th><th></th></tr></thead><tbody>${allClasses.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${c.order||""}</td><td>${c.active!==false?"Активен":"Скрыт"}</td><td><button class="btn btn-sm btn-secondary" data-edit-class="${c.id}">Изменить</button></td></tr>`).join("")}</tbody></table></div>
          ${allClasses.length?``:`<div class="card-body"><button id="seedClassesBtn" class="btn btn-secondary">Создать стандартные классы 5А–11</button></div>`}
        </div>
      </div>

      <div class="card"><div class="card-header"><h3>Профили пользователей</h3><button id="addProfileBtn" class="btn btn-sm btn-primary">+ Профиль</button></div>
        <div class="card-body"><div class="notice warning"><b>Важно:</b> аккаунт с логином и паролем сначала создаётся в Firebase Authentication. Здесь к его UID привязываются роль и классы.</div></div>
        <div class="table-wrap"><table><thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Классы</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.displayName||"")}</td><td>${esc(u.username||"")}</td><td>${esc(C.ROLE_LABELS[u.role]||u.role)}</td><td>${(u.classIds||[]).map(id=>esc(classById(id)?.name||id)).join(", ")||"—"}</td><td><button class="btn btn-sm btn-secondary" data-edit-user="${u.id}">Изменить</button></td></tr>`).join("")}</tbody></table></div>
      </div>`;
    $("#saveSettingsBtn").onclick=async()=>{await Service.saveSettings({academicYear:$("#setYear").value.trim(),editDeadline:$("#setDeadline").value,timezone:window.APP_CONFIG.timezone});settings=await Service.getSettings();toast("Настройки сохранены")};
    if($("#seedClassesBtn"))$("#seedClassesBtn").onclick=async()=>{await Service.seedDefaultClasses();classes=await Service.getClasses();toast("Классы созданы");renderAdmin()};
    $("#addClassBtn").onclick=()=>classModal(null);
    $$("[data-edit-class]").forEach(b=>b.onclick=()=>classModal(allClasses.find(c=>c.id===b.dataset.editClass)));
    $("#addProfileBtn").onclick=()=>userProfileModal(null);
    $$("[data-edit-user]").forEach(b=>b.onclick=()=>userProfileModal(users.find(u=>u.id===b.dataset.editUser)));
  }
  function classModal(c){
    showModal(c?"Редактировать класс":"Добавить класс",`<div class="form-grid"><label><span>ID класса (латиницей)</span><input id="mClassId" value="${esc(c?.id||"")}" ${c?"disabled":""} placeholder="например, 5a"></label><label><span>Название</span><input id="mClassName" value="${esc(c?.name||"")}" placeholder="5А"></label><label><span>Порядок</span><input id="mClassOrder" type="number" value="${c?.order||0}"></label><label><span>Статус</span><select id="mClassActive"><option value="1" ${c?.active!==false?"selected":""}>Активен</option><option value="0" ${c?.active===false?"selected":""}>Скрыт</option></select></label></div>`,async()=>{
      const idv=(c?.id||$("#mClassId").value.trim().toLowerCase());if(!idv||!$("#mClassName").value.trim()){toast("Заполните ID и название","error");return false}
      await Service.saveClass({id:idv,name:$("#mClassName").value.trim(),order:+$("#mClassOrder").value||0,active:$("#mClassActive").value==="1"});classes=await Service.getClasses();toast("Класс сохранён");await renderAdmin();return true;
    });
  }
  function userProfileModal(u){
    showModal(u?"Редактировать профиль":"Добавить профиль",`<div class="form-grid">
      <label class="full"><span>UID из Firebase Authentication</span><input id="mUid" value="${esc(u?.id||"")}" ${u?"disabled":""}></label>
      <label><span>Логин</span><input id="mUsername" value="${esc(u?.username||"")}"></label>
      <label><span>Отображаемое имя</span><input id="mDisplayName" value="${esc(u?.displayName||"")}"></label>
      <label><span>Роль</span><select id="mRole"><option value="teacher" ${u?.role==="teacher"?"selected":""}>Классный руководитель</option><option value="food" ${u?.role==="food"?"selected":""}>Ответственный за питание</option><option value="admin" ${u?.role==="admin"?"selected":""}>Администратор</option></select></label>
      <div class="full"><span class="label">Доступ к классам</span><div class="class-grid">${classes.map(c=>`<label style="display:flex;gap:8px;align-items:center;border:1px solid var(--border);padding:9px;border-radius:10px"><input class="checkbox user-class" type="checkbox" value="${c.id}" ${(u?.classIds||[]).includes(c.id)?"checked":""}><b>${esc(c.name)}</b></label>`).join("")}</div></div>
    </div>`,async()=>{
      const uid=u?.id||$("#mUid").value.trim();if(!uid){toast("Введите UID","error");return false}
      await Service.saveUserProfile({id:uid,username:$("#mUsername").value.trim(),displayName:$("#mDisplayName").value.trim(),role:$("#mRole").value,classIds:$$(".user-class:checked").map(x=>x.value),active:true});toast("Профиль сохранён");await renderAdmin();return true;
    });
  }

  function showModal(title,html,onSave){
    $("#modalRoot").innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close">×</button></div><div class="modal-body">${html}</div><div class="modal-footer"><button class="btn btn-secondary modal-cancel">Отмена</button><button class="btn btn-primary modal-save">Сохранить</button></div></div></div>`;
    const close=()=>$("#modalRoot").innerHTML="";
    $(".modal-close").onclick=close;$(".modal-cancel").onclick=close;
    $(".modal-save").onclick=async e=>{e.currentTarget.disabled=true;try{const ok=await onSave();if(ok!==false)close()}catch(err){toast(err.message,"error")}finally{if($(".modal-save"))$(".modal-save").disabled=false}};
    $(".modal-backdrop").onclick=e=>{if(e.target.classList.contains("modal-backdrop"))close()};
  }

  function aoaToBook(filename,sheets){
    const wb=XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name,aoa])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),name.slice(0,31)));
    XLSX.writeFile(wb,filename);
  }
  function exportClassMonthWorkbook(cls,students,records,y,m,days){
    const map=new Map(records.map(r=>[`${r.studentId}_${r.day}`,r]));
    const header=["ФИО","Категория"];for(let d=1;d<=days;d++){header.push(`${d} О`,`${d} П`)}
    const aoa=[[`${cls.name} класс — ${String(m).padStart(2,"0")}.${y}`],header];
    students.forEach(s=>{const row=[s.fullName,`${catShort(s.lunchCategory)} / ${catShort(s.snackCategory)}`];for(let d=1;d<=days;d++){const r=map.get(`${s.id}_${d}`);row.push(valForMeal(s,r,"lunch"),valForMeal(s,r,"snack"))}aoa.push(row)});
    aoaToBook(`Класс_${cls.name}_${y}-${String(m).padStart(2,"0")}.xlsx`,{[cls.name]:aoa});
  }
  function exportSummaryWorkbook(ac,records,y,m,days){
    const sheets={};
    ac.forEach(cls=>{
      const cr=records.filter(r=>r.classId===cls.id), aoa=[[`${cls.name} класс`],["Категория",...Array.from({length:days},(_,i)=>i+1)]];
      C.LUNCH_CATEGORIES.forEach(c=>aoa.push([c.short,...Array.from({length:days},(_,i)=>countCategory(cr,i+1,"lunch",c.code))]));
      C.SNACK_CATEGORIES.forEach(c=>aoa.push([c.short,...Array.from({length:days},(_,i)=>countCategory(cr,i+1,"snack",c.code))]));
      aoa.push(["Итого Обед",...Array.from({length:days},(_,i)=>countTotal(cr,i+1,"lunch"))]);
      aoa.push(["Итого Полдник",...Array.from({length:days},(_,i)=>countTotal(cr,i+1,"snack"))]);
      sheets[cls.name]=aoa;
    });
    aoaToBook(`Сводная_${y}-${String(m).padStart(2,"0")}.xlsx`,sheets);
  }
  function exportStudentsWorkbook(students){
    const aoa=[["ФИО","Класс","Обед","Полдник","Статус"],...students.map(s=>[s.fullName,classById(s.classId)?.name||s.classId,catName(s.lunchCategory),catName(s.snackCategory),s.status==="withdrawn"?"Выбыл":"Активен"])];
    aoaToBook("База_учащихся.xlsx",{"Учащиеся":aoa});
  }
  function exportDayWorkbook(dateKey,records){
    const header=["Категория",...classes.map(c=>c.name),"Итого"], rows=[];
    [...C.LUNCH_CATEGORIES.map(c=>({meal:"lunch",cat:c})),...C.SNACK_CATEGORIES.map(c=>({meal:"snack",cat:c}))].forEach(x=>{
      const vals=classes.map(c=>records.filter(r=>r.classId===c.id&&r[x.meal+"Status"]==="eating"&&r[x.meal+"Category"]===x.cat.code).length);
      rows.push([x.cat.short,...vals,vals.reduce((a,b)=>a+b,0)]);
    });
    aoaToBook(`Сводная_${dateKey}.xlsx`,{"Сводная":[[`Сводная за ${fmtDate(dateKey)}`],header,...rows]});
  }
  function downloadImportTemplate(){
    const aoa=[["ФИО","Класс","Обед","Полдник"],["Иванова Анна","5А","О (1)","П (1)"],["Петров Максим","5А","О МН (2)","П МН (2)"],["Сидорова Мария","5Б","О УИ (4)",""]];
    aoaToBook("Шаблон_импорта_учащихся.xlsx",{"Учащиеся":aoa});
  }

  window.addEventListener("DOMContentLoaded",boot);
})();
