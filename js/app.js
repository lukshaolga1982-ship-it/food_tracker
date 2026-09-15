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
    // После дедлайна блокируется только сегодняшний день и прошлые даты.
    // Будущие дни остаются доступными для предварительной отметки питания.
    if(dateKey>n.dateKey) return true;
    if(dateKey<n.dateKey) return false;
    const [h,m]=(settings?.editDeadline||"09:00").split(":").map(Number);
    return n.hour<h || (n.hour===h && n.minute<m);
  }
  function roleLabel(){return C.ROLE_LABELS[profile?.role]||profile?.role||"—";}
  function catName(code){return C.categoryByCode(code)?.name||"";}
  function catShort(code){return C.categoryByCode(code)?.short||"—";}
  function catLabel(code){const c=C.categoryByCode(code);if(!c)return "—";return c.name?c.short+" · "+c.name:c.short;}
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
    const regBtn=$("#teacherRegisterBtn");
    if(regBtn) regBtn.onclick=()=>teacherRegistrationModal();
  }

  function teacherRegistrationModal(){
    showModal("Регистрация педагога",`<div class="form-grid">
      <label><span>Логин</span><input id="rUsername" placeholder="например, ivanova"></label>
      <label><span>Отображаемое имя</span><input id="rDisplayName" placeholder="Имя Фамилия"></label>
      <label><span>Пароль</span><input id="rPassword" type="password" placeholder="не менее 6 символов"></label>
      <label><span>Повторите пароль</span><input id="rPassword2" type="password"></label>
      <div class="full notice">После регистрации педагог сможет войти в систему, но доступ к классам назначит администратор.</div>
    </div>`,async()=>{
      const p=$("#rPassword").value,p2=$("#rPassword2").value;
      if(p!==p2){toast("Пароли не совпадают","error");return false}
      const user=await Service.registerTeacher($("#rUsername").value,$("#rPassword").value,$("#rDisplayName").value);
      toast("Регистрация выполнена. Роль: педагог. Администратор назначит классы.");
      return true;
    });
  }

  async function enterApp(user){
    profile=await Service.getProfile(user.uid);
    if(!profile && !Service.isDemo()){
      for(let i=0;i<4 && !profile;i++){ await new Promise(r=>setTimeout(r,250)); profile=await Service.getProfile(user.uid); }
    }
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
    $$(".role-teacher").forEach(el=>el.classList.toggle("hidden",profile.role!=="teacher"));
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
      else if(r==="teachers" && ["admin","food"].includes(profile.role)) await renderTeachers();
      else if(r==="reports" && ["admin","food"].includes(profile.role)) await renderReports();
      else if(r==="import" && profile.role==="admin") await renderImport();
      else if(r==="admin" && profile.role==="admin") await renderAdmin();
      else if(r==="teacherMeals" && profile.role==="teacher") await renderTeacherMeals();
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
    if(profile.role==="teacher" && !(profile.classIds||[]).length){ await renderTeacherMeals(); return; }
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

  async function renderTeacherMeals(){
    setTitle("Моё питание","Личный кабинет педагога — только обеды");
    const month=selectedMonth||todayKey().slice(0,7);
    const [y,m]=month.split("-").map(Number);
    const days=dayCount(y,m);
    const start=`${month}-01`, end=`${month}-${String(days).padStart(2,"0")}`;
    const records=await Service.getTeacherMealsBetween(start,end,profile.id);
    const map=new Map(records.map(r=>[r.dateKey,r]));
    const today=todayKey();
    const rows=Array.from({length:days},(_,i)=>{
      const d=`${month}-${String(i+1).padStart(2,"0")}`, r=map.get(d), disabled=d<today;
      const status=r?.status||"not_eating";
      return `<tr><td>${String(i+1).padStart(2,"0")}.${String(m).padStart(2,"0")}.${y}</td><td>${isWeekend(y,m,i+1)?"Выходной":"Рабочий день"}</td><td>
        <div class="segment ${disabled||isWeekend(y,m,i+1)?"disabled":""}" data-teacher-day="${d}">
          <button data-tmeal="eating" class="${status==="eating"?"active":""}">✓ Буду обедать</button>
          <button data-tmeal="not_eating" class="${status!=="eating"?"active":""}">– Не буду</button>
        </div></td></tr>`;
    }).join("");
    const eating=records.filter(r=>r.status==="eating").length;
    const workingEating=records.filter(r=>r.status==="eating"&&!isWeekend(y,m,r.day)).length;
    const profileName=profile.displayName||profile.username||"Педагог";
    $("#content").innerHTML=`
      <div class="grid-kpi">${kpi("Обеды за месяц",eating,"cream")}${kpi("Рабочие дни",workingEating,"green")}</div>
      <div class="card"><div class="card-header"><div><h3>${esc(profileName)}</h3><div class="muted">Отметьте, будете ли вы обедать. Другие виды питания для педагогов не учитываются.</div></div>
        <div class="field compact"><span>Месяц</span><input id="teacherMealMonth" type="month" value="${month}"></div></div>
        <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Тип дня</th><th>Питание</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    $("#teacherMealMonth").onchange=e=>{selectedMonth=e.target.value;renderTeacherMeals()};
    $$('[data-tmeal]').forEach(btn=>btn.onclick=async()=>{
      const seg=btn.closest("[data-teacher-day]"), date=seg.dataset.teacherDay, status=btn.dataset.tmeal;
      try{await Service.saveTeacherMeal(date,status,profile); toast(status==="eating"?"Обед отмечен":"Обед отменён"); renderTeacherMeals();}catch(e){toast(e.message,"error")}
    });
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
      const isFuture=selectedDate>n.dateKey;
      const isPast=selectedDate<n.dateKey;
      banner=editable
        ?`<div class="deadline-banner open"><div><b>${isFuture?"Предварительное редактирование открыто":"Редактирование открыто до "+deadline}</b><div class="muted">${isFuture?"Будущий день: "+fmtDate(selectedDate):"Текущий день: "+fmtDate(selectedDate)}</div></div>${submitted?`<span class="status ok">✓ Сведения переданы</span>`:""}</div>`
        :`<div class="deadline-banner locked"><div><b>🔒 Редактирование закрыто</b><div class="muted">${isPast?"Прошедшие дни доступны только для просмотра.":"Сегодня редактирование закрыто после "+deadline+"."}</div></div></div>`;
    }else{
      banner=`<div class="deadline-banner ${profile.role==="admin"?"open":"locked"}"><div><b>${profile.role==="admin"?"Режим администратора":"Режим просмотра"}</b><div class="muted">${profile.role==="admin"?"Администратор может исправлять данные после дедлайна; изменение попадёт в журнал.":"Ответственный за питание просматривает сведения без изменения."}</div></div></div>`;
    }
    body.innerHTML=`${banner}
      ${editable?`<div class="bulk-bar"><input id="selectAllStudents" class="checkbox" type="checkbox"><b>Массово:</b><button class="btn btn-sm btn-secondary" data-bulk="eating">✓ Питаются</button><button class="btn btn-sm btn-secondary" data-bulk="absent">Н Отсутствуют</button><button class="btn btn-sm btn-secondary" data-bulk="not_eating">– Не питаются</button></div>`:""}
      <div class="student-list">${students.map(s=>studentDailyRow(s,map.get(s.id),editable)).join("")||`<div class="empty"><strong>Нет учащихся</strong>Добавьте учащихся во вкладке «Учащиеся».</div>`}</div>
      ${profile.role==="teacher"&&editable?`<div style="margin-top:16px;display:flex;justify-content:flex-end"><button id="submitClassBtn" class="btn btn-primary">✓ Сведения переданы</button></div>`:""}`;
    bindDailyControls(students,map,editable);
    if($("#submitClassBtn"))$("#submitClassBtn").onclick=async()=>{
      const result=await Service.submitClass(selectedDate,currentClassId,profile);
      const n=result?.recordsMaterialized||0;
      toast(n?`Сведения класса переданы. Зафиксировано учащихся: ${n}`:"Сведения класса переданы");
      renderClassToday();
    };
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
    return `<div class="meal-cell"><div class="meal-head"><b>${title}</b><span class="badge ${meal==="lunch"?"cream":""}">${disabled?"Не получает":esc(catLabel(category))}</span></div>
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
  function mealCellClass(s,r,meal){
    const cat=s[meal+"Category"], status=r?.[meal+"Status"]||(cat?"eating":"none");
    if(!cat||status==="none") return "none";
    if(status==="absent") return "absent";
    if(status==="not_eating") return "not-eating";
    return "eating";
  }
  function monthStudentCell(s,r){
    const lc=mealCellClass(s,r,"lunch"), sc=mealCellClass(s,r,"snack");
    return `<td class="day-cell"><div class="subcols"><span class="mini-cell lunch ${lc}" title="${lc==="absent"?"Отсутствует":lc==="not-eating"?"Не питается":"Питается"}">${esc(valForMeal(s,r,"lunch"))}</span><span class="mini-cell snack ${sc}" title="${sc==="absent"?"Отсутствует":sc==="not-eating"?"Не питается":"Питается"}">${esc(valForMeal(s,r,"snack"))}</span></div></td>`
  }

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
    return students.map(s=>`<tr><td><b>${esc(s.fullName)}</b>${s.dietary?`<div class="student-meta">Диетическое питание</div>`:""}</td><td>${esc(catShort(s.lunchCategory))}${catName(s.lunchCategory)?`<div class="student-meta">${esc(catName(s.lunchCategory))}</div>`:""}</td><td>${s.snackCategory?esc(catShort(s.snackCategory)):"—"}${catName(s.snackCategory)?`<div class="student-meta">${esc(catName(s.snackCategory))}</div>`:""}</td><td>${s.status==="withdrawn"?`<span class="status off">Выбыл</span>`:`<span class="status ok">Активен</span>`}</td><td><div class="actions">${canManage?`<button class="btn btn-sm btn-secondary" data-edit-student="${s.id}">Изменить</button>${profile.role==="admin"?`<button class="btn btn-sm btn-secondary" data-transfer="${s.id}">Перевести</button>`:""}${s.status!=="withdrawn"?`<button class="btn btn-sm btn-danger" data-withdraw="${s.id}">Выбыл</button>`:""}`:""}</div></td></tr>`).join("")||`<tr><td colspan="5"><div class="empty">Нет учащихся</div></td></tr>`;
  }
  function bindStudentActions(students,canManage){
    if(!canManage)return;
    $$("[data-edit-student]").forEach(b=>b.onclick=()=>studentModal(students.find(s=>s.id===b.dataset.editStudent)));
    $$("[data-withdraw]").forEach(b=>b.onclick=async()=>{const s=students.find(x=>x.id===b.dataset.withdraw);if(confirm(`Отметить "${s.fullName}" как выбывшего?`)){await Service.withdrawStudent(s,profile);toast("Учащийся перемещён в архив");renderClassStudents()}});
    $$("[data-transfer]").forEach(b=>b.onclick=()=>transferModal(students.find(s=>s.id===b.dataset.transfer)));
  }
  function categoryOptions(list,value,none=true){return `${none?`<option value="">Не получает</option>`:""}${list.map(c=>`<option value="${c.code}" ${value===c.code?"selected":""}>${esc(c.name ? c.short+" — "+c.name : c.short)}</option>`).join("")}`}
  function studentModal(s){
    showModal(s?"Редактировать учащегося":"Добавить учащегося",`
      <div class="form-grid">
        <label class="full"><span>ФИО</span><input id="mFullName" value="${esc(s?.fullName||"")}" placeholder="Фамилия Имя" required></label>
        <label><span>Категория обеда</span><select id="mLunch">${categoryOptions(C.LUNCH_CATEGORIES,s?.lunchCategory)}</select></label>
        <label><span>Категория полдника</span><select id="mSnack">${categoryOptions(C.SNACK_CATEGORIES,s?.snackCategory)}</select></label>
        <label class="full" style="display:flex;align-items:center;gap:10px"><input id="mDietary" class="checkbox" type="checkbox" ${s?.dietary?"checked":""}> <span>Получает диетическое питание</span></label>
      </div>`,
      async()=>{
        const fullName=$("#mFullName").value.trim();if(!fullName){toast("Введите ФИО","error");return false}
        await Service.saveStudent({...(s||{}),fullName,classId:currentClassId,lunchCategory:$("#mLunch").value||null,snackCategory:$("#mSnack").value||null,dietary:$("#mDietary").checked,status:s?.status||"active"},profile);
        toast(s?"Данные обновлены":"Учащийся добавлен");await renderClassStudents();return true;
      });
  }
  function transferModal(s){
    showModal("Перевести в другой класс",`<p><b>${esc(s.fullName)}</b></p><label><span>Новый класс</span><select id="mTransfer">${classes.filter(c=>c.id!==s.classId).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>`,async()=>{await Service.transferStudent(s,$("#mTransfer").value,profile);toast("Учащийся переведён");await renderClassStudents();return true});
  }

  async function renderFoodSummary(){
    setTitle("Сводная педагогов","Кто будет обедать в выбранном месяце");
    const month=selectedMonth||todayKey().slice(0,7), [y,m]=month.split("-").map(Number), days=dayCount(y,m);
    const start=`${month}-01`, end=`${month}-${String(days).padStart(2,"0")}`;
    const records=await Service.getTeacherMealsBetween(start,end);
    const users=await Service.getUserProfiles();
    const teachers=users.filter(u=>u.role==="teacher"&&u.active!==false);
    const byUser=new Map(teachers.map(u=>[u.id,u]));
    const map=new Map(records.map(r=>[`${r.userId}_${r.dateKey}`,r]));
    const dates=Array.from({length:days},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`);
    const rows=teachers.map(t=>{const vals=dates.map(d=>map.get(`${t.id}_${d}`)?.status==="eating"?"✓":"—");return `<tr><td>${esc(t.displayName||t.username||"")}</td>${vals.map(v=>`<td class="text-center">${v}</td>`).join("")}<td class="text-right"><b>${vals.filter(v=>v==="✓").length}</b></td></tr>`}).join("");
    const totalByDay=dates.map(d=>records.filter(r=>r.dateKey===d&&r.status==="eating").length);
    const total=records.filter(r=>r.status==="eating").length;
    $("#content").innerHTML=`<div class="page-actions"><div class="field compact"><span>Месяц</span><input id="foodTeacherMonth" type="month" value="${month}"></div><div class="notice success">Всего отмечено обедов: <b>${total}</b></div><button id="exportTeacherMeals" class="btn btn-secondary">⇩ Excel</button></div>
      <div class="card"><div class="card-header"><div><h3>Педагоги — обеды</h3><div class="muted">✓ — педагог планирует обедать, — — не отмечено/не будет.</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Педагог</th>${dates.map(d=>`<th class="text-center">${Number(d.slice(-2))}</th>`).join("")}<th>Итого</th></tr></thead><tbody>${rows||`<tr><td colspan="${days+2}" class="empty">Зарегистрированных педагогов пока нет.</td></tr>`}</tbody><tfoot><tr><th>Всего обедов</th>${totalByDay.map(v=>`<th class="text-center">${v||0}</th>`).join("")}<th>${total}</th></tr></tfoot></table></div></div>`;
    $("#foodTeacherMonth").onchange=e=>{selectedMonth=e.target.value;renderFoodSummary()};
    $("#exportTeacherMeals").onclick=()=>{
      const header=["Педагог",...dates.map(d=>Number(d.slice(-2))),"Итого"];
      const aoa=[[`Педагоги — обеды за ${month}`],header,...teachers.map(t=>{const vals=dates.map(d=>map.get(`${t.id}_${d}`)?.status==="eating"?"✓":"—");return [t.displayName||t.username||"",...vals,vals.filter(v=>v==="✓").length]})];
      aoaToBook(`Педагоги_обеды_${month}.xlsx`,{"Обеды":aoa});
    };
  }

  async function renderTeachers(){
    setTitle("Педагоги","Учёт обедов педагогов по дням выбранного месяца");
    const month=selectedMonth||todayKey().slice(0,7);
    const [y,m]=month.split("-").map(Number);
    const days=new Date(y,m,0).getDate();
    const start=`${month}-01`, end=`${month}-${String(days).padStart(2,"0")}`;
    const [profiles,records]=await Promise.all([Service.getUserProfiles(),Service.getTeacherMealsBetween(start,end)]);
    const teachers=profiles.filter(u=>u.role==="teacher" && u.active!==false).sort((a,b)=>(a.displayName||a.username||"").localeCompare(b.displayName||b.username||"","ru"));
    const map=new Map(records.map(r=>[`${r.userId}_${r.dateKey}`,r]));
    const totals=teachers.map(t=>({t,n:Array.from({length:days},(_,i)=>map.get(`${t.id}_${month}-${String(i+1).padStart(2,"0")}`)?.status==="eating"?1:0).reduce((a,b)=>a+b,0)}));
    const dayTotals=Array.from({length:days},(_,i)=>teachers.reduce((n,t)=>n+(map.get(`${t.id}_${month}-${String(i+1).padStart(2,"0")}`)?.status==="eating"?1:0),0));
    const grand=dayTotals.reduce((a,b)=>a+b,0);
    const weekdays=Array.from({length:days},(_,i)=>new Date(y,m-1,i+1).getDay());
    const isWeekend=d=>d===0||d===6;
    const headers=Array.from({length:days},(_,i)=>`<th class="day ${isWeekend(weekdays[i])?"weekend":""}">${i+1}</th>`).join("");
    const rows=teachers.map(t=>{
      const cells=Array.from({length:days},(_,i)=>{const key=`${t.id}_${month}-${String(i+1).padStart(2,"0")}`,r=map.get(key);return `<td class="num ${isWeekend(weekdays[i])?"weekend":""}">${r?.status==="eating"?"✓":r?.status==="not_eating"?"—":""}</td>`}).join("");
      const total=totals.find(x=>x.t.id===t.id)?.n||0;
      return `<tr><td><b>${esc(t.displayName||t.username||"Без имени")}</b><div class="muted" style="font-size:11px">${esc(t.username||"")}</div></td>${cells}<td class="num"><b>${total}</b></td></tr>`;
    }).join("");
    const avg=teachers.length?(grand/teachers.length).toFixed(1):"0";
    const noTeachers=!teachers.length;
    const dayTotalCells=dayTotals.map((n,i)=>`<td class="num ${isWeekend(weekdays[i])?"weekend":""}"><b>${n||""}</b></td>`).join("");
    const html=`
      <div class="page-actions">
        <div class="field compact"><span>Месяц</span><input id="teachersMonth" type="month" value="${month}"></div>
        <div class="notice success" style="margin:0">Всего обедов: <b>${grand}</b> · Педагогов: <b>${teachers.length}</b> · Среднее: <b>${avg}</b> на педагога</div>
        <button id="exportTeachers" class="btn btn-secondary">⇩ Excel</button>
      </div>
      ${noTeachers?`<div class="card"><div class="empty"><strong>Педагоги не найдены</strong><span>Зарегистрированные педагоги появятся здесь.</span></div></div>`:`
      <div class="card">
        <div class="card-header"><h3>Обеды педагогов — ${String(m).padStart(2,"0")}.${y}</h3><span class="muted">✓ — будут обедать · — — не будут</span></div>
        <div class="table-wrap"><table class="summary-table teacher-summary"><thead><tr><th style="min-width:220px">Педагог</th>${headers}<th class="day">Итого</th></tr></thead><tbody>${rows}<tr><td class="total-lunch"><b>ИТОГО ЗА ДЕНЬ</b></td>${dayTotalCells}<td class="num total-lunch"><b>${grand}</b></td></tr></tbody></table></div>
      </div>`}`;
    $("#content").innerHTML=html;
    $("#teachersMonth").onchange=e=>{selectedMonth=e.target.value;renderTeachers()};
    if($("#exportTeachers")) $("#exportTeachers").onclick=()=>{
      const header=["Педагог",...Array.from({length:days},(_,i)=>i+1),"Итого"];
      const sheet=[[`Обеды педагогов за ${String(m).padStart(2,"0")}.${y}`],header];
      teachers.forEach(t=>{const vals=Array.from({length:days},(_,i)=>map.get(`${t.id}_${month}-${String(i+1).padStart(2,"0")}`)?.status==="eating"?"✓":"");sheet.push([t.displayName||t.username||"",...vals,vals.filter(Boolean).length])});
      sheet.push(["ИТОГО ЗА ДЕНЬ",...dayTotals,grand]);
      aoaToBook(`Педагоги_обеды_${month}.xlsx`,{"Педагоги":sheet});
    };
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
    setTitle("Отчёты","Формирование списочных ведомостей за выбранный период");
    const today=todayKey();
    const [ty,tm,td]=today.split("-").map(Number);
    const monday=(d)=>{const x=new Date(d);const w=(x.getDay()+6)%7;x.setDate(x.getDate()-w);return x};
    const mon=monday(new Date(ty,tm-1,td));
    const weekStart=`${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`;
    const month=today.slice(0,7);
    const defaultStart=weekStart, defaultEnd=today;
    const periodControls=`<div class="form-grid"><label><span>Период</span><select id="reportPeriod"><option value="day">День</option><option value="week" selected>Неделя</option><option value="month">Месяц</option><option value="custom">Произвольный</option></select></label><label><span>Дата</span><input id="reportDate" type="date" value="${today}"></label><label id="reportMonthWrap" class="hidden"><span>Месяц</span><input id="reportMonth" type="month" value="${month}"></label><label id="reportStartWrap" class="hidden"><span>Начало</span><input id="reportStart" type="date" value="${defaultStart}"></label><label id="reportEndWrap" class="hidden"><span>Конец</span><input id="reportEnd" type="date" value="${defaultEnd}"></label></div>`;
    $("#content").innerHTML=`<div class="card"><div class="card-header"><h3>Списочные отчёты</h3></div><div class="card-body"><p class="muted">Выберите период. В каждом отчёте видно количество питания <b>по каждому ребёнку</b> и итоговое количество <b>по каждому дню</b>. Предпросмотр открывается на странице и ничего не скачивает.</p>${periodControls}<div class="report-actions" style="margin-top:14px;display:grid;gap:10px"><div class="page-actions"><button id="makeReportsBtn" class="btn btn-primary">⇩ Скачать все отчёты</button><button id="previewReportsBtn" class="btn btn-secondary">👁 Предпросмотр всех</button></div><div class="page-actions"><button id="makeParentReportsBtn" class="btn btn-secondary">Родительская плата</button><button id="previewParentReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div><div class="page-actions"><button id="makeDietReportsBtn" class="btn btn-secondary">Диетическое питание</button><button id="previewDietReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div><div class="page-actions"><button id="makeBenefit5ReportsBtn" class="btn btn-secondary">Льготные 5А–5Б</button><button id="previewBenefit5ReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div><div class="page-actions"><button id="makeBenefit68ReportsBtn" class="btn btn-secondary">Льготные 6–8</button><button id="previewBenefit68ReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div><div class="page-actions"><button id="makeBenefit911ReportsBtn" class="btn btn-secondary">Льготные 9–11</button><button id="previewBenefit911ReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div><div class="page-actions"><button id="makeTeacherReportsBtn" class="btn btn-secondary">Питание педагогов</button><button id="previewTeacherReportsBtn" class="btn btn-secondary">👁 Просмотр</button></div></div><div id="reportHint" class="notice" style="margin-top:14px">Для одного отчёта нажмите «Просмотр», чтобы проверить данные перед скачиванием.</div></div></div>`;
    const updatePeriod=()=>{const v=$("#reportPeriod").value;$("#reportDate").parentElement.classList.toggle("hidden",!['day','week'].includes(v));$("#reportMonthWrap").classList.toggle("hidden",v!=="month");$("#reportStartWrap").classList.toggle("hidden",v!=="custom");$("#reportEndWrap").classList.toggle("hidden",v!=="custom")};
    $("#reportPeriod").onchange=updatePeriod; updatePeriod();
    const loadReportData=async()=>{const range=getReportRange();if(!range.start||!range.end)throw new Error("Укажите корректный период");if(range.start>range.end)throw new Error("Начало периода не может быть позже конца");const students=await Service.getAllStudents(false);const records=await Service.getRecordsBetween(range.start,range.end);return {range,students,records};};
    const runReport=async(type)=>{try{const {range,students,records}=await loadReportData();if(type==="teachers"){await exportTeacherMealReport(range);toast("Отчёт по педагогам сформирован")}else{exportRequestedReports(students,records,range,type);toast(type==="all"?"Все отчёты сформированы":"Отчёт сформирован")}}catch(e){console.error(e);toast(e.message,"error")}};
    const previewReport=async(type)=>{try{const {range,students,records}=await loadReportData();if(type==="teachers"){await previewTeacherMealReport(range)}else{previewRequestedReports(students,records,range,type)}}catch(e){console.error(e);toast(e.message,"error")}};
    $("#makeReportsBtn").onclick=()=>runReport("all");
    $("#makeParentReportsBtn").onclick=()=>runReport("parent");
    $("#makeDietReportsBtn").onclick=()=>runReport("diet");
    $("#makeBenefit5ReportsBtn").onclick=()=>runReport("benefit5");
    $("#makeBenefit68ReportsBtn").onclick=()=>runReport("benefit68");
    $("#makeBenefit911ReportsBtn").onclick=()=>runReport("benefit911");
    $("#previewReportsBtn").onclick=()=>previewReport("all");
    $("#previewParentReportsBtn").onclick=()=>previewReport("parent");
    $("#previewDietReportsBtn").onclick=()=>previewReport("diet");
    $("#previewBenefit5ReportsBtn").onclick=()=>previewReport("benefit5");
    $("#previewBenefit68ReportsBtn").onclick=()=>previewReport("benefit68");
    $("#previewBenefit911ReportsBtn").onclick=()=>previewReport("benefit911");
    $("#makeTeacherReportsBtn").onclick=()=>runReport("teachers");
    $("#previewTeacherReportsBtn").onclick=()=>previewReport("teachers");
  }
  function getReportRange(){
    const mode=$("#reportPeriod").value;
    if(mode==="day") return {start:$("#reportDate").value,end:$("#reportDate").value,label:`за ${fmtDate($("#reportDate").value)}`};
    if(mode==="month"){const [y,m]=$("#reportMonth").value.split("-").map(Number);const last=new Date(y,m,0).getDate();return {start:`${y}-${String(m).padStart(2,"0")}-01`,end:`${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`,label:`за ${monthLabel($("#reportMonth").value)}`};}
    if(mode==="custom") return {start:$("#reportStart").value,end:$("#reportEnd").value,label:`с ${fmtDate($("#reportStart").value)} по ${fmtDate($("#reportEnd").value)}`};
    const d=new Date($("#reportDate").value+"T12:00:00"),w=(d.getDay()+6)%7,s=new Date(d);s.setDate(d.getDate()-w);const e=new Date(s);e.setDate(s.getDate()+6);const k=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;return {start:k(s),end:k(e),label:`с ${fmtDate(k(s))} по ${fmtDate(k(e))}`};
  }

  async function buildTeacherMealReport(range){
    const dates=dateList(range.start,range.end);
    const records=await Service.getTeacherMealsBetween(range.start,range.end);
    const users=await Service.getUserProfiles();
    const teachers=users.filter(u=>u.role==="teacher"&&u.active!==false).sort((a,b)=>String(a.displayName||a.username||"").localeCompare(String(b.displayName||b.username||""),"ru"));
    const rm=new Map(records.map(r=>[`${r.userId}_${r.dateKey}`,r]));
    const rows=[[`Питание педагогов ${range.label}`],["ФИО",...dates.map(fmtDate),"Итого"]];
    const dayTotals=dates.map(d=>teachers.reduce((n,t)=>n+(rm.get(`${t.id}_${d}`)?.status==="eating"?1:0),0));
    teachers.forEach(t=>{
      const vals=dates.map(d=>rm.get(`${t.id}_${d}`)?.status==="eating"?"✓":"");
      rows.push([t.displayName||t.username||"",...vals,vals.filter(Boolean).length]);
    });
    rows.push(["ИТОГО ЗА ДЕНЬ",...dayTotals,dayTotals.reduce((a,b)=>a+b,0)]);
    return {rows,teachers,dates,records};
  }
  async function previewTeacherMealReport(range){
    const {rows}=await buildTeacherMealReport(range);
    const html=`<div class="notice" style="margin-bottom:12px">${esc(range.label)}. ✓ — педагог планирует обедать. В строке «ИТОГО ЗА ДЕНЬ» показано количество педагогов на каждый день, в колонке «Итого» — количество обедов каждого педагога за период.</div><div class="table-wrap"><table class="summary-table report-preview-table">${rows.map((row,ri)=>`<tr>${row.map(v=>ri===0?`<th colspan="${row.length}">${esc(v)}</th>`:ri===1?`<th>${esc(v)}</th>`:`<td class="${ri===rows.length-1?"total-lunch":""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</table></div>`;
    showModal("Предпросмотр: питание педагогов",html,()=>false);
    $(".modal-save")?.classList.add("hidden");$(".modal-cancel")?.classList.add("hidden");
  }
  async function exportTeacherMealReport(range){
    const {rows}=await buildTeacherMealReport(range);
    const suffix=`${range.start}_${range.end}`;
    aoaToBook(`Питание_педагогов_${suffix}.xlsx`,{"Педагоги":rows});
  }

  function dateList(start,end){const out=[];for(let d=new Date(start+"T12:00:00"),e=new Date(end+"T12:00:00");d<=e;d.setDate(d.getDate()+1))out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);return out}
  function studentMealForDay(s,recordsMap,date,meal){const r=recordsMap.get(`${s.id}_${date}`);const status=r?.[meal+"Status"]||(s[meal+"Category"]?"eating":"none");return status==="eating"?true:false}
  function listReportSheet(title,students,records,dates,meal,filterFn){const rm=new Map(records.map(r=>[`${r.studentId}_${r.dateKey}`,r]));const rows=[[title],["ФИО","Класс",...dates.map(fmtDate),"Итого"]];const filtered=students.filter(filterFn).sort((a,b)=>String(a.fullName).localeCompare(String(b.fullName),"ru"));const dayTotals=dates.map(d=>filtered.reduce((n,s)=>n+(studentMealForDay(s,rm,d,meal)?1:0),0));filtered.forEach(s=>{const vals=dates.map(d=>studentMealForDay(s,rm,d,meal)?"✓":"");rows.push([s.fullName,classById(s.classId)?.name||s.classId,...vals,vals.filter(Boolean).length])});rows.push(["ИТОГО ЗА ДЕНЬ","",...dayTotals,dayTotals.reduce((a,b)=>a+b,0)]);return rows}

  function reportSheetGroups(students,records,range,type="all"){
    const dates=dateList(range.start,range.end),groups=[];
    const add=(name,title,ss,meal,filterFn)=>groups.push({name,title,rows:listReportSheet(title,ss,records,dates,meal,filterFn)});
    if(type==="all"||type==="parent") classes.forEach(cls=>{
      add(`${cls.name} Завтраки`,`${cls.name} — завтраки за родительскую плату ${range.label}`,students.filter(s=>s.classId===cls.id&&s.lunchCategory==="O"),"lunch",()=>true);
      add(`${cls.name} Полдники`,`${cls.name} — полдники за родительскую плату ${range.label}`,students.filter(s=>s.classId===cls.id&&s.snackCategory==="P"),"snack",()=>true);
    });
    if(type==="all"||type==="diet"){const diet=students.filter(s=>s.dietary);add("Диеты Завтраки",`Диетическое питание — завтраки ${range.label}`,diet,"lunch",()=>true);add("Диеты Полдники",`Диетическое питание — полдники ${range.label}`,diet,"snack",()=>true)}
    const gs={benefit5:{name:"5А–5Б",ids:["5a","5b"]},benefit68:{name:"6–8",ids:["6a","6b","7a","7b","8a","8b"]},benefit911:{name:"9–11",ids:["9","10","11"]}};
    const wanted=type==="all"?["benefit5","benefit68","benefit911"]:gs[type]?[type]:[];
    wanted.forEach(k=>{const g=gs[k],base=students.filter(s=>g.ids.includes(s.classId));add(`Льготные ${g.name} Завтраки`,`Льготные — ${g.name} — завтраки ${range.label}`,base,"lunch",s=>s.lunchCategory&&s.lunchCategory!=="O");add(`Льготные ${g.name} Полдники`,`Льготные — ${g.name} — полдники ${range.label}`,base,"snack",s=>s.snackCategory&&s.snackCategory!=="P")});
    return groups;
  }
  function previewRequestedReports(students,records,range,type="all"){
    const groups=reportSheetGroups(students,records,range,type);
    const tabs=groups.map((g,i)=>`<button class="btn btn-secondary report-preview-tab${i===0?" active":""}" data-report-tab="${i}">${esc(g.name)}</button>`).join("");
    const panes=groups.map((g,i)=>`<div class="report-preview-pane${i===0?"":" hidden"}" data-report-pane="${i}"><div class="table-wrap"><table class="summary-table report-preview-table">${g.rows.map((row,ri)=>`<tr>${row.map((v,ci)=>ri===0?`<th colspan="${Math.max(1,row.length)}">${esc(v)}</th>`:ri===1?`<th>${esc(v)}</th>`:`<td class="${ri===g.rows.length-1?"total-lunch":""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</table></div></div>`).join("");
    showModal("Предпросмотр отчёта",`<div class="notice" style="margin-bottom:12px">${esc(range.label)}. В строке «ИТОГО ЗА ДЕНЬ» показано количество детей, получающих питание в каждый день. В колонке «Итого» — количество дней питания по каждому ребёнку.</div><div class="page-actions" style="flex-wrap:wrap;margin-bottom:12px">${tabs}</div>${panes}`,()=>false);
    $(".modal-save")?.classList.add("hidden");$(".modal-cancel")?.classList.add("hidden");
    $$(".report-preview-tab").forEach(b=>b.onclick=()=>{$$(".report-preview-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$$(".report-preview-pane").forEach(p=>p.classList.toggle("hidden",p.dataset.reportPane!==b.dataset.reportTab))});
  }

  function exportRequestedReports(students,records,range,type="all"){
    const dates=dateList(range.start,range.end),sheets={};
    const addParent=()=>classes.forEach(cls=>{
      const ss=students.filter(s=>s.classId===cls.id&&s.lunchCategory==="O");
      sheets[`${cls.name} Завтраки`]=listReportSheet(`${cls.name} — завтраки за родительскую плату ${range.label}`,ss,records,dates,"lunch",()=>true);
      sheets[`${cls.name} Полдники`]=listReportSheet(`${cls.name} — полдники за родительскую плату ${range.label}`,students.filter(s=>s.classId===cls.id&&s.snackCategory==="P"),records,dates,"snack",()=>true);
    });
    const addDiet=()=>{
      const diet=students.filter(s=>s.dietary);
      sheets["Диеты Завтраки"]=listReportSheet(`Диетическое питание — завтраки ${range.label}`,diet,records,dates,"lunch",()=>true);
      sheets["Диеты Полдники"]=listReportSheet(`Диетическое питание — полдники ${range.label}`,diet,records,dates,"snack",()=>true);
    };
    const addBenefits=(g)=>{
      const base=students.filter(s=>g.ids.includes(s.classId));
      sheets[`Льготные ${g.name} Завтрак`]=listReportSheet(`Льготные — ${g.name} — завтраки ${range.label}`,base,records,dates,"lunch",s=>s.lunchCategory&&s.lunchCategory!=="O");
      sheets[`Льготные ${g.name} Полдник`]=listReportSheet(`Льготные — ${g.name} — полдники ${range.label}`,base,records,dates,"snack",s=>s.snackCategory&&s.snackCategory!=="P");
    };
    const groups={benefit5:{name:"5А–5Б",ids:["5a","5b"]},benefit68:{name:"6–8",ids:["6a","6b","7a","7b","8a","8b"]},benefit911:{name:"9–11",ids:["9","10","11"]}};
    if(type==="all"||type==="parent")addParent();
    if(type==="all"||type==="diet")addDiet();
    if(type==="all"||groups[type])addBenefits(groups[type]);
    const suffix=type==="all"?"все":type;
    aoaToBook(`Питание_${suffix}_${range.start}_${range.end}.xlsx`,sheets);
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
        <div class="table-wrap"><table><thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Классы</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.displayName||"")}</td><td>${esc(u.username||"")}</td><td>${esc(C.ROLE_LABELS[u.role]||u.role)}</td><td>${(u.classIds||[]).map(id=>esc(classById(id)?.name||id)).join(", ")||"—"}</td><td><button class="btn btn-sm btn-secondary" data-edit-user="${u.id}">Изменить</button>${u.id!==profile.id?`<button class="btn btn-sm btn-danger" data-delete-user="${u.id}">Удалить</button>`:""}</td></tr>`).join("")}</tbody></table></div>
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
      <label><span>Роль</span><select id="mRole"><option value="teacher" ${u?.role==="teacher"?"selected":""}>Педагог</option><option value="food" ${u?.role==="food"?"selected":""}>Ответственный за питание</option><option value="admin" ${u?.role==="admin"?"selected":""}>Администратор</option></select></label>
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
