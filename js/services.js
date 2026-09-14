window.FOOD_APP = window.FOOD_APP || {};

(function(){
  const C = FOOD_APP;

  function configured(){
    const c = window.FIREBASE_CONFIG || {};
    return c.apiKey && !String(c.apiKey).startsWith("PASTE_") &&
           c.projectId && !String(c.projectId).startsWith("PASTE_");
  }

  function id(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function dateKeyFromDate(d){
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function parseDateKey(k){
    const [y,m,d] = k.split("-").map(Number);
    return {year:y, month:m, day:d};
  }

  class FirebaseService {
    constructor(){
      firebase.initializeApp(window.FIREBASE_CONFIG);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.FieldValue = firebase.firestore.FieldValue;
      this.currentProfile = null;
    }
    isDemo(){ return false; }
    authListener(cb){ return this.auth.onAuthStateChanged(cb); }
    async signIn(username,password){
      const raw = username.trim().toLowerCase();
      const email = raw.includes("@") ? raw : `${raw}@${window.APP_CONFIG.usernameDomain}`;
      return this.auth.signInWithEmailAndPassword(email,password);
    }
    async signOut(){ return this.auth.signOut(); }
    async getProfile(uid){
      const snap = await this.db.collection("users").doc(uid).get();
      if(!snap.exists) return null;
      this.currentProfile = {id:snap.id, ...snap.data()};
      return this.currentProfile;
    }
    async getSettings(){
      const snap = await this.db.collection("settings").doc("general").get();
      return snap.exists ? snap.data() : {...window.APP_CONFIG};
    }
    async saveSettings(data){
      await this.db.collection("settings").doc("general").set({...data, updatedAt:this.FieldValue.serverTimestamp()},{merge:true});
    }
    async getClasses(){
      const s = await this.db.collection("classes").where("active","==",true).get();
      return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    }
    async getAllClasses(){
      const s = await this.db.collection("classes").get();
      return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    }
    async saveClass(data){
      const ref = data.id ? this.db.collection("classes").doc(data.id) : this.db.collection("classes").doc();
      const payload = {...data}; delete payload.id;
      await ref.set({...payload, active: payload.active !== false, updatedAt:this.FieldValue.serverTimestamp()},{merge:true});
      return ref.id;
    }
    async seedDefaultClasses(){
      const batch = this.db.batch();
      C.DEFAULT_CLASSES.forEach(x => batch.set(this.db.collection("classes").doc(x.id), {...x,active:true},{merge:true}));
      await batch.commit();
    }
    async getStudents(classId, includeWithdrawn=false){
      let q = this.db.collection("students").where("classId","==",classId);
      const s = await q.get();
      return s.docs.map(d=>({id:d.id,...d.data()}))
        .filter(x=>includeWithdrawn || x.status !== "withdrawn")
        .sort((a,b)=>String(a.fullName||"").localeCompare(String(b.fullName||""),"ru"));
    }
    async getAllStudents(includeWithdrawn=false){
      const s = await this.db.collection("students").get();
      return s.docs.map(d=>({id:d.id,...d.data()}))
        .filter(x=>includeWithdrawn || x.status !== "withdrawn")
        .sort((a,b)=>String(a.fullName||"").localeCompare(String(b.fullName||""),"ru"));
    }
    async saveStudent(data, actor){
      const ref = data.id ? this.db.collection("students").doc(data.id) : this.db.collection("students").doc();
      const payload = {...data}; delete payload.id;
      if(!data.id) payload.createdAt = this.FieldValue.serverTimestamp();
      payload.updatedAt = this.FieldValue.serverTimestamp();
      payload.status = payload.status || "active";
      await ref.set(payload,{merge:true});
      await this.log(actor,"student_saved",{studentId:ref.id,fullName:payload.fullName,classId:payload.classId});
      return ref.id;
    }
    async withdrawStudent(student, actor){
      await this.db.collection("students").doc(student.id).set({
        status:"withdrawn",
        withdrawnAt:this.FieldValue.serverTimestamp(),
        updatedAt:this.FieldValue.serverTimestamp()
      },{merge:true});
      await this.log(actor,"student_withdrawn",{studentId:student.id,fullName:student.fullName,classId:student.classId});
    }
    async transferStudent(student,newClassId,actor){
      await this.db.collection("students").doc(student.id).set({
        classId:newClassId,
        updatedAt:this.FieldValue.serverTimestamp()
      },{merge:true});
      await this.log(actor,"student_transferred",{studentId:student.id,fullName:student.fullName,fromClassId:student.classId,toClassId:newClassId});
    }
    async getDailyRecords(dateKey,classId=null){
      let q = this.db.collection("dailyRecords").where("dateKey","==",dateKey);
      if(classId) q = q.where("classId","==",classId);
      const s = await q.get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    async getMonthlyRecords(classId,year,month){
      const last = new Date(year,month,0).getDate();
      const start = `${year}-${String(month).padStart(2,"0")}-01`;
      const end = `${year}-${String(month).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
      const s = await this.db.collection("dailyRecords")
        .where("classId","==",classId).where("dateKey",">=",start).where("dateKey","<=",end).get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    async getMonthAllRecords(year,month){
      const last = new Date(year,month,0).getDate();
      const start = `${year}-${String(month).padStart(2,"0")}-01`;
      const end = `${year}-${String(month).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
      const s = await this.db.collection("dailyRecords").where("dateKey",">=",start).where("dateKey","<=",end).get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    async saveDailyRecord(student,dateKey,lunchStatus,snackStatus,actor){
      const parts = parseDateKey(dateKey);
      const docId = `${dateKey}_${student.id}`;
      const payload = {
        dateKey, ...parts, studentId:student.id, studentName:student.fullName, classId:student.classId,
        lunchCategory:student.lunchCategory || null, snackCategory:student.snackCategory || null,
        lunchStatus: student.lunchCategory ? lunchStatus : "none",
        snackStatus: student.snackCategory ? snackStatus : "none",
        updatedBy:actor.id, updatedAt:this.FieldValue.serverTimestamp()
      };
      await this.db.collection("dailyRecords").doc(docId).set(payload,{merge:true});
      return payload;
    }
    async submitClass(dateKey,classId,actor){
      const parts = parseDateKey(dateKey);
      await this.db.collection("dailySubmissions").doc(`${dateKey}_${classId}`).set({
        dateKey,...parts,classId,submittedBy:actor.id,submittedByName:actor.displayName||actor.username||"",
        submittedAt:this.FieldValue.serverTimestamp(),updatedAt:this.FieldValue.serverTimestamp()
      },{merge:true});
      await this.log(actor,"class_submitted",{dateKey,classId});
    }
    async getSubmissions(dateKey,classId=null){
      let q = this.db.collection("dailySubmissions").where("dateKey","==",dateKey);
      if(classId) q = q.where("classId","==",classId);
      const s = await q.get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    async importStudents(rows,actor){
      const chunks=[];
      for(let i=0;i<rows.length;i+=400) chunks.push(rows.slice(i,i+400));
      for(const chunk of chunks){
        const batch=this.db.batch();
        chunk.forEach(r=>{
          const ref=this.db.collection("students").doc();
          batch.set(ref,{...r,status:"active",createdAt:this.FieldValue.serverTimestamp(),updatedAt:this.FieldValue.serverTimestamp()});
        });
        await batch.commit();
      }
      await this.log(actor,"students_imported",{count:rows.length});
    }

    async importMigration(data,actor){
      // Make sure the standard classes exist before resolving class names.
      await this.seedDefaultClasses();
      const classList = await this.getClasses();
      const classMap = new Map(classList.map(c=>[String(c.name).trim().toLowerCase(),c]));

      const normalizeName = v => String(v||"").trim().replace(/\s+/g," ").toLowerCase();
      const existingStudents = await this.getAllStudents(true);
      const studentMap = new Map();
      existingStudents.forEach(st=>{
        const cls = classList.find(c=>c.id===st.classId);
        if(cls) studentMap.set(`${cls.name.toLowerCase()}|${normalizeName(st.fullName)}`,st);
      });

      const studentWrites=[];
      for(const item of (data.students||[])){
        const cls=classMap.get(String(item.className||"").trim().toLowerCase());
        if(!cls) throw new Error(`Не найден класс ${item.className}`);
        const key=`${cls.name.toLowerCase()}|${normalizeName(item.fullName)}`;
        let st=studentMap.get(key);
        if(st){
          st={...st,classId:cls.id,lunchCategory:item.lunchCategory||null,snackCategory:item.snackCategory||null,status:"active"};
          studentMap.set(key,st);
          studentWrites.push({ref:this.db.collection("students").doc(st.id),data:{
            fullName:item.fullName,classId:cls.id,lunchCategory:item.lunchCategory||null,
            snackCategory:item.snackCategory||null,status:"active",updatedAt:this.FieldValue.serverTimestamp()
          }});
        }else{
          const ref=this.db.collection("students").doc();
          st={id:ref.id,fullName:item.fullName,classId:cls.id,lunchCategory:item.lunchCategory||null,snackCategory:item.snackCategory||null,status:"active"};
          studentMap.set(key,st);
          studentWrites.push({ref,data:{
            fullName:item.fullName,classId:cls.id,lunchCategory:item.lunchCategory||null,
            snackCategory:item.snackCategory||null,status:"active",
            createdAt:this.FieldValue.serverTimestamp(),updatedAt:this.FieldValue.serverTimestamp()
          }});
        }
      }

      const commitWrites = async (writes) => {
        for(let i=0;i<writes.length;i+=400){
          const batch=this.db.batch();
          writes.slice(i,i+400).forEach(w=>batch.set(w.ref,w.data,{merge:true}));
          await batch.commit();
        }
      };
      await commitWrites(studentWrites);

      const recordWrites=[];
      for(const r of (data.records||[])){
        const cls=classMap.get(String(r.className||"").trim().toLowerCase());
        if(!cls) continue;
        const st=studentMap.get(`${cls.name.toLowerCase()}|${normalizeName(r.fullName)}`);
        if(!st) continue;
        const parts=parseDateKey(r.dateKey);
        const ref=this.db.collection("dailyRecords").doc(`${r.dateKey}_${st.id}`);
        recordWrites.push({ref,data:{
          dateKey:r.dateKey,...parts,studentId:st.id,studentName:st.fullName,classId:cls.id,
          lunchCategory:r.lunchCategory||st.lunchCategory||null,
          snackCategory:r.snackCategory||st.snackCategory||null,
          lunchStatus:r.lunchStatus||"none",snackStatus:r.snackStatus||"none",
          updatedBy:actor.id,updatedAt:this.FieldValue.serverTimestamp(),migrated:true
        }});
      }
      await commitWrites(recordWrites);

      const submissionWrites=[];
      for(const sub of (data.submissions||[])){
        const cls=classMap.get(String(sub.className||"").trim().toLowerCase());
        if(!cls) continue;
        const parts=parseDateKey(sub.dateKey);
        const ref=this.db.collection("dailySubmissions").doc(`${sub.dateKey}_${cls.id}`);
        submissionWrites.push({ref,data:{
          dateKey:sub.dateKey,...parts,classId:cls.id,submittedBy:actor.id,
          submittedByName:"Перенос из старых таблиц",
          submittedAt:this.FieldValue.serverTimestamp(),updatedAt:this.FieldValue.serverTimestamp(),migrated:true
        }});
      }
      await commitWrites(submissionWrites);
      await this.log(actor,"history_migrated",{
        students:(data.students||[]).length,records:(data.records||[]).length,
        submissions:(data.submissions||[]).length,period:data.period||null
      });
      return {students:(data.students||[]).length,records:(data.records||[]).length};
    }
    async getUserProfiles(){
      const s=await this.db.collection("users").get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    async saveUserProfile(data){
      const payload={...data}; const uid=payload.id; delete payload.id;
      await this.db.collection("users").doc(uid).set({...payload,updatedAt:this.FieldValue.serverTimestamp()},{merge:true});
    }
    async log(actor,action,details){
      try{
        await this.db.collection("auditLog").add({
          action,details,actorId:actor?.id||null,actorName:actor?.displayName||actor?.username||null,
          createdAt:this.FieldValue.serverTimestamp()
        });
      }catch(e){ console.warn("auditLog write skipped:",e.message); }
    }
  }

  class DemoService {
    constructor(){
      this.key="braslavFoodDemoV1";
      this.currentProfile={id:"demo-admin",username:"demo",displayName:"Демо-администратор",role:"admin",classIds:[]};
      this.load();
    }
    isDemo(){return true;}
    load(){
      const saved=localStorage.getItem(this.key);
      if(saved){ this.data=JSON.parse(saved); return; }
      const students=[
        ["Анищенко Алиана","O","P"],["Драбович Ярослав","O","P"],["Капуста Екатерина","O_MN","P_MN"],
        ["Масловский Глеб","O","P"],["Мацук Анна","O","P"],["Мацуль Михаил","O","P"],["Петухов Глеб","O","P"],
        ["Побяржин Давид","O","P"],["Притыцкая Александра","O_MN","P_MN"],["Ралькевич Артем","O","P"],
        ["Сидорова Софья","O_MN","P_MN"],["Трофимченкова Виолетта","O","P"],["Шаркель Ева","O","P"],
        ["Якубовский Глеб","O","P"],["Януль Элиза","O","P"],["Яроцкая Марианна","O_MN","P_MN"]
      ].map((x,i)=>({id:"s5a"+i,fullName:x[0],classId:"5a",lunchCategory:x[1],snackCategory:x[2],status:"active"}));
      const students5b=[
        ["Алексеева Дарья","O_MN","P_MN"],["Бондарь Кирилл","O","P"],["Василевская Анна","O","P"],["Гриневич Павел","O_MN","P_MN"],
        ["Дрозд Мария","O","P"],["Ермак Тимофей","O","P"],["Жук Софья","O","P"],["Зайцев Матвей","O_MN","P_MN"],["Иванова Ева","O","P"],
        ["Ковалёв Максим","O","P"],["Лебедева Полина","O","P"],["Мороз Арсений","O","P"],["Новик Алина","O_MN","P_MN"],["Орлов Глеб","O","P"],
        ["Петрова Варвара","O","P"],["Романюк Никита","O","P"],["Савицкая Ксения","O","P"]
      ].map((x,i)=>({id:"s5b"+i,fullName:x[0],classId:"5b",lunchCategory:x[1],snackCategory:x[2],status:"active"}));
      this.data={
        classes:C.DEFAULT_CLASSES.map(x=>({...x,active:true})),
        students:[...students,...students5b],
        records:[], submissions:[], users:[this.currentProfile],
        settings:{...window.APP_CONFIG}
      };
      this.save();
    }
    save(){localStorage.setItem(this.key,JSON.stringify(this.data));}
    authListener(cb){setTimeout(()=>cb({uid:"demo-admin"}),50);return()=>{}}
    async signIn(){return {user:{uid:"demo-admin"}}}
    async signOut(){location.reload()}
    async getProfile(){return this.currentProfile}
    async getSettings(){return this.data.settings}
    async saveSettings(d){this.data.settings={...this.data.settings,...d};this.save()}
    async getClasses(){return this.data.classes.filter(x=>x.active!==false).sort((a,b)=>a.order-b.order)}
    async getAllClasses(){return [...this.data.classes].sort((a,b)=>a.order-b.order)}
    async saveClass(d){const idx=this.data.classes.findIndex(x=>x.id===d.id);if(idx>=0)this.data.classes[idx]={...this.data.classes[idx],...d};else this.data.classes.push({...d,id:d.id||id(),active:true});this.save()}
    async seedDefaultClasses(){C.DEFAULT_CLASSES.forEach(c=>{if(!this.data.classes.some(x=>x.id===c.id))this.data.classes.push({...c,active:true})});this.save()}
    async getStudents(classId,includeWithdrawn=false){return this.data.students.filter(x=>x.classId===classId&&(includeWithdrawn||x.status!=="withdrawn")).sort((a,b)=>a.fullName.localeCompare(b.fullName,"ru"))}
    async getAllStudents(includeWithdrawn=false){return this.data.students.filter(x=>includeWithdrawn||x.status!=="withdrawn").sort((a,b)=>a.fullName.localeCompare(b.fullName,"ru"))}
    async saveStudent(d){const idx=this.data.students.findIndex(x=>x.id===d.id);if(idx>=0)this.data.students[idx]={...this.data.students[idx],...d};else this.data.students.push({...d,id:id(),status:"active"});this.save()}
    async withdrawStudent(s){const x=this.data.students.find(y=>y.id===s.id);if(x)x.status="withdrawn";this.save()}
    async transferStudent(s,c){const x=this.data.students.find(y=>y.id===s.id);if(x)x.classId=c;this.save()}
    async getDailyRecords(dateKey,classId=null){return this.data.records.filter(x=>x.dateKey===dateKey&&(!classId||x.classId===classId))}
    async getMonthlyRecords(classId,year,month){return this.data.records.filter(x=>x.classId===classId&&x.year===year&&x.month===month)}
    async getMonthAllRecords(year,month){return this.data.records.filter(x=>x.year===year&&x.month===month)}
    async saveDailyRecord(student,dateKey,lunchStatus,snackStatus){
      const parts=parseDateKey(dateKey), rid=`${dateKey}_${student.id}`, idx=this.data.records.findIndex(x=>x.id===rid);
      const r={id:rid,dateKey,...parts,studentId:student.id,studentName:student.fullName,classId:student.classId,lunchCategory:student.lunchCategory||null,snackCategory:student.snackCategory||null,lunchStatus:student.lunchCategory?lunchStatus:"none",snackStatus:student.snackCategory?snackStatus:"none"};
      if(idx>=0)this.data.records[idx]=r;else this.data.records.push(r);this.save();return r;
    }
    async submitClass(dateKey,classId){const rid=`${dateKey}_${classId}`,idx=this.data.submissions.findIndex(x=>x.id===rid);const s={id:rid,dateKey,classId,submittedAt:new Date().toISOString()};if(idx>=0)this.data.submissions[idx]=s;else this.data.submissions.push(s);this.save()}
    async getSubmissions(dateKey,classId=null){return this.data.submissions.filter(x=>x.dateKey===dateKey&&(!classId||x.classId===classId))}
    async importStudents(rows){rows.forEach(r=>this.data.students.push({...r,id:id(),status:"active"}));this.save()}

    async importMigration(data){
      await this.seedDefaultClasses();
      const normalizeName=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();
      for(const item of (data.students||[])){
        const cls=this.data.classes.find(c=>String(c.name).toLowerCase()===String(item.className).toLowerCase());
        if(!cls) continue;
        let st=this.data.students.find(x=>x.classId===cls.id&&normalizeName(x.fullName)===normalizeName(item.fullName));
        if(st){Object.assign(st,{lunchCategory:item.lunchCategory||null,snackCategory:item.snackCategory||null,status:"active"});}
        else{st={id:id(),fullName:item.fullName,classId:cls.id,lunchCategory:item.lunchCategory||null,snackCategory:item.snackCategory||null,status:"active"};this.data.students.push(st);}
      }
      for(const r of (data.records||[])){
        const cls=this.data.classes.find(c=>String(c.name).toLowerCase()===String(r.className).toLowerCase());if(!cls)continue;
        const st=this.data.students.find(x=>x.classId===cls.id&&normalizeName(x.fullName)===normalizeName(r.fullName));if(!st)continue;
        const parts=parseDateKey(r.dateKey),rid=`${r.dateKey}_${st.id}`,idx=this.data.records.findIndex(x=>x.id===rid);
        const rec={id:rid,dateKey:r.dateKey,...parts,studentId:st.id,studentName:st.fullName,classId:cls.id,lunchCategory:r.lunchCategory||st.lunchCategory||null,snackCategory:r.snackCategory||st.snackCategory||null,lunchStatus:r.lunchStatus||"none",snackStatus:r.snackStatus||"none",migrated:true};
        if(idx>=0)this.data.records[idx]=rec;else this.data.records.push(rec);
      }
      for(const sub of (data.submissions||[])){
        const cls=this.data.classes.find(c=>String(c.name).toLowerCase()===String(sub.className).toLowerCase());if(!cls)continue;
        const rid=`${sub.dateKey}_${cls.id}`;if(!this.data.submissions.some(x=>x.id===rid))this.data.submissions.push({id:rid,dateKey:sub.dateKey,classId:cls.id,migrated:true});
      }
      this.save();return {students:(data.students||[]).length,records:(data.records||[]).length};
    }
    async getUserProfiles(){return this.data.users}
    async saveUserProfile(d){const i=this.data.users.findIndex(x=>x.id===d.id);if(i>=0)this.data.users[i]={...this.data.users[i],...d};else this.data.users.push(d);this.save()}
    async log(){}
  }

  C.services = {configured,FirebaseService,DemoService,dateKeyFromDate,parseDateKey};
})();
