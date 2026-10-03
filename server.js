const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const ROOT = __dirname, PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || ROOT;
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JOBS_FILE = path.join(DATA_DIR, 'internships.json');
const APPS_FILE = path.join(DATA_DIR, 'applications.json');
const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();
function read(file, fallback=[]) { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function write(file, data) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(data,null,2)); }
function id(){ return crypto.randomUUID(); }
function send(res,status,data,headers={}) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(data)); }
function cookie(res, value){ res.setHeader('Set-Cookie', value); }
function parseCookies(req){ return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]})); }
function currentUser(req){ const sid=parseCookies(req).sid; return sid ? sessions.get(sid) : null; }
function body(req){ return new Promise((resolve,reject)=>{let raw=''; req.on('data',c=>{raw+=c;if(raw.length>1e6){reject(new Error('Request too large'));req.destroy();}});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)}); }
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')}}
function validPassword(password,user){try{return crypto.timingSafeEqual(Buffer.from(hashPassword(password,user.salt).hash,'hex'),Buffer.from(user.passwordHash,'hex'))}catch{return false}}
function safeUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,company:u.company||''}}
function requireRole(user,...roles){return !!user && roles.includes(user.role)}
function seed(){
 let users=read(USERS_FILE,[]); const adminEmail=(process.env.ADMIN_EMAIL||'admin@interntrack.local').toLowerCase();
 if(!users.some(u=>u.email===adminEmail)){const p=process.env.ADMIN_PASSWORD||'Admin@12345';const hp=hashPassword(p);users.push({id:id(),name:'InternTrack Admin',email:adminEmail,role:'admin',salt:hp.salt,passwordHash:hp.hash,createdAt:new Date().toISOString()});write(USERS_FILE,users);console.log(`Admin account: ${adminEmail} / ${p} (change this before public deployment)`)}
 if(!fs.existsSync(JOBS_FILE))write(JOBS_FILE,[
 {id:id(),title:'Frontend Developer Intern',companyName:'PixelCraft',location:'Remote',type:'Remote',stipend:'₹8,000/month',duration:'3 months',description:'Build responsive interfaces with HTML, CSS and JavaScript. Work with a small product team.',eligibility:'HTML, CSS, JavaScript basics',skills:['HTML','CSS','JavaScript'],status:'published',createdAt:new Date().toISOString(),createdBy:'seed'},
 {id:id(),title:'Data Analyst Intern',companyName:'InsightWorks',location:'Bengaluru, India',type:'Hybrid',stipend:'₹12,000/month',duration:'6 months',description:'Help clean datasets, create dashboards and communicate insights to business teams.',eligibility:'Excel and SQL basics; Python is a plus',skills:['SQL','Excel','Python'],status:'published',createdAt:new Date().toISOString(),createdBy:'seed'},
 {id:id(),title:'Marketing Intern',companyName:'BrightSide',location:'Mumbai, India',type:'On-site',stipend:'₹6,000/month',duration:'2 months',description:'Support social content, campaign research and performance reporting.',eligibility:'Strong writing and communication',skills:['Content','Research','Social media'],status:'published',createdAt:new Date().toISOString(),createdBy:'seed'}]);
 if(!fs.existsSync(APPS_FILE))write(APPS_FILE,[]);
}
async function api(req,res,url){
 const user=currentUser(req), method=req.method, p=url.pathname;
 if(p==='/api/health')return send(res,200,{ok:true});
 if(p==='/api/auth/me'&&method==='GET')return send(res,200,{user:user?safeUser(user):null});
 if(p==='/api/auth/signup'&&method==='POST'){
  const b=await body(req);const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),role=b.role;
  if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!['student','company'].includes(role))return send(res,400,{error:'Enter a name, valid email, password (at least 8 characters), and account type.'});
  const users=read(USERS_FILE,[]);if(users.some(u=>u.email===email))return send(res,409,{error:'An account with this email already exists.'});
  const hp=hashPassword(password);const u={id:id(),name,email,role,company:String(b.company||'').trim(),salt:hp.salt,passwordHash:hp.hash,createdAt:new Date().toISOString()};users.push(u);write(USERS_FILE,users);const sid=id();sessions.set(sid,u);cookie(res,`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);return send(res,201,{user:safeUser(u)});
 }
 if(p==='/api/auth/login'&&method==='POST'){
  const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');const u=read(USERS_FILE,[]).find(x=>x.email===email);
  if(!u||!validPassword(password,u))return send(res,401,{error:'Email or password is incorrect.'});const sid=id();sessions.set(sid,u);cookie(res,`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);return send(res,200,{user:safeUser(u)});
 }
 if(p==='/api/auth/logout'&&method==='POST'){const sid=parseCookies(req).sid;if(sid)sessions.delete(sid);cookie(res,'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send(res,200,{ok:true});}
 if(p==='/api/internships'&&method==='GET'){let jobs=read(JOBS_FILE,[]).filter(j=>j.status==='published');const q=(url.searchParams.get('q')||'').toLowerCase();if(q)jobs=jobs.filter(j=>[j.title,j.companyName,j.location,j.description,(j.skills||[]).join(' ')].join(' ').toLowerCase().includes(q));return send(res,200,{internships:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});}
 if(p==='/api/company/internships'&&method==='GET'){if(!requireRole(user,'company','admin'))return send(res,403,{error:'Company account required.'});const jobs=read(JOBS_FILE,[]).filter(j=>user.role==='admin'||j.createdBy===user.id);return send(res,200,{internships:jobs});}
 if(p==='/api/internships'&&method==='POST'){if(!requireRole(user,'company','admin'))return send(res,403,{error:'Sign in with a company account to post internships.'});const b=await body(req);if(!String(b.title||'').trim()||!String(b.description||'').trim())return send(res,400,{error:'Title and description are required.'});const jobs=read(JOBS_FILE,[]);const j={id:id(),title:String(b.title).trim(),companyName:user.role==='admin'?String(b.companyName||'InternTrack').trim():(user.company||user.name),location:String(b.location||'Remote').trim(),type:String(b.type||'Remote'),stipend:String(b.stipend||'Not specified').trim(),duration:String(b.duration||'Not specified').trim(),description:String(b.description).trim(),eligibility:String(b.eligibility||'').trim(),skills:String(b.skills||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,12),status:user.role==='admin'?'published':'pending',createdAt:new Date().toISOString(),createdBy:user.id};jobs.unshift(j);write(JOBS_FILE,jobs);return send(res,201,{internship:j});}
 const jobMatch=p.match(/^\/api\/internships\/([^/]+)$/);
 if(jobMatch&&method==='DELETE'){if(!requireRole(user,'company','admin'))return send(res,403,{error:'Company account required.'});const jobs=read(JOBS_FILE,[]),j=jobs.find(x=>x.id===jobMatch[1]);if(!j)return send(res,404,{error:'Internship not found.'});if(user.role!=='admin'&&j.createdBy!==user.id)return send(res,403,{error:'You can only remove your own posts.'});write(JOBS_FILE,jobs.filter(x=>x.id!==j.id));return send(res,200,{ok:true});}
 if(jobMatch&&method==='PATCH'){if(!requireRole(user,'admin'))return send(res,403,{error:'Admin access required.'});const b=await body(req),jobs=read(JOBS_FILE,[]),j=jobs.find(x=>x.id===jobMatch[1]);if(!j)return send(res,404,{error:'Internship not found.'});if(['published','pending','rejected'].includes(b.status))j.status=b.status;write(JOBS_FILE,jobs);return send(res,200,{internship:j});}
 if(p==='/api/applications'&&method==='POST'){if(!requireRole(user,'student'))return send(res,403,{error:'Sign in with a student account to apply.'});const b=await body(req),jobs=read(JOBS_FILE,[]),job=jobs.find(j=>j.id===b.internshipId&&j.status==='published');if(!job)return send(res,404,{error:'This internship is no longer available.'});const apps=read(APPS_FILE,[]);if(apps.some(a=>a.studentId===user.id&&a.internshipId===job.id))return send(res,409,{error:'You have already applied to this internship.'});const a={id:id(),internshipId:job.id,internshipTitle:job.title,companyName:job.companyName,studentId:user.id,studentName:user.name,studentEmail:user.email,phone:String(b.phone||'').trim(),resumeUrl:String(b.resumeUrl||'').trim(),coverLetter:String(b.coverLetter||'').trim(),status:'submitted',createdAt:new Date().toISOString()};apps.unshift(a);write(APPS_FILE,apps);return send(res,201,{application:a});}
 if(p==='/api/applications'&&method==='GET'){if(!user)return send(res,401,{error:'Please sign in.'});let apps=read(APPS_FILE,[]);if(user.role==='student')apps=apps.filter(a=>a.studentId===user.id);else if(user.role==='company'){const own=new Set(read(JOBS_FILE,[]).filter(j=>j.createdBy===user.id).map(j=>j.id));apps=apps.filter(a=>own.has(a.internshipId));}return send(res,200,{applications:apps});}
 const appMatch=p.match(/^\/api\/applications\/([^/]+)$/);if(appMatch&&method==='PATCH'){if(!requireRole(user,'company','admin'))return send(res,403,{error:'Company or admin access required.'});const b=await body(req),apps=read(APPS_FILE,[]),a=apps.find(x=>x.id===appMatch[1]);if(!a)return send(res,404,{error:'Application not found.'});if(user.role==='company'&&!read(JOBS_FILE,[]).some(j=>j.id===a.internshipId&&j.createdBy===user.id))return send(res,403,{error:'Not your applicant.'});if(!['submitted','reviewing','shortlisted','rejected','accepted'].includes(b.status))return send(res,400,{error:'Invalid status.'});a.status=b.status;write(APPS_FILE,apps);return send(res,200,{application:a});}
 if(p==='/api/admin/overview'&&method==='GET'){if(!requireRole(user,'admin'))return send(res,403,{error:'Admin access required.'});return send(res,200,{users:read(USERS_FILE,[]).map(safeUser),internships:read(JOBS_FILE,[]),applications:read(APPS_FILE,[])});}
 return send(res,404,{error:'API route not found.'});
}
seed();
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);let file=path.join(PUBLIC,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));if(!file.startsWith(PUBLIC))return send(res,403,{error:'Forbidden'});fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}const ext=path.extname(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[ext]||'application/octet-stream')});res.end(data)});}catch(e){console.error(e);send(res,500,{error:e.message||'Server error'});}});
server.listen(PORT,'0.0.0.0',()=>console.log(`InternTrack Portal running on http://localhost:${PORT}`));
