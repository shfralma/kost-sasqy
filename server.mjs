import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { pool, initialize, transaction, residents as rows, rules, rooms, saveResident, deleteResident, failure } from './mysql-store.mjs';
import PDFDocument from 'pdfkit';
const root = path.resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const production = process.env.NODE_ENV === 'production';
const publicOrigin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
if (production && (!process.env.SASQY_ADMIN_PASSWORD || process.env.SASQY_ADMIN_PASSWORD.length < 16 || process.env.SASQY_ADMIN_PASSWORD === 'Sasqy2026!')) throw Error('Set a unique SASQY_ADMIN_PASSWORD of at least 16 characters.');
if (production && (!publicOrigin || new URL(publicOrigin).protocol !== 'https:' || new URL(publicOrigin).origin !== publicOrigin)) throw Error('Set PUBLIC_ORIGIN to the exact HTTPS website origin.');
await initialize();
const password = process.env.SASQY_ADMIN_PASSWORD || 'Sasqy2026!';
const hash = scryptSync(password, 'sasqy-local', 64);
const json = (res,status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
const sessionKey = createHash('sha256').update(hash).digest('hex');
const cookieToken = req => (req.headers.cookie||'').split(/;\s*/).find(c=>c.startsWith('sasqy='))?.slice(6)||'';
const tokenHash = token => createHash('sha256').update(token).digest('hex');
async function auth(req) {
 const token=cookieToken(req);if(!/^[a-f0-9]{64}$/.test(token))return false;
 const [found]=await pool.execute('SELECT token_hash FROM admin_sessions WHERE token_hash=? AND key_version=? AND expires_at>?',[tokenHash(token),sessionKey,Date.now()]);
 return found.length>0;
}
async function limitLogin(req) {
 const ip=process.env.VERCEL ? String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim() : req.socket?.remoteAddress||'unknown';
 const key=tokenHash(ip);const now=Date.now();const cutoff=now-15*60*1000;
 await pool.execute('INSERT INTO login_attempts (ip_key,attempts,window_started) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(window_started<?,1,attempts+1),window_started=IF(window_started<?,?,window_started)',[key,now,cutoff,cutoff,now]);
 const [found]=await pool.execute('SELECT attempts FROM login_attempts WHERE ip_key=?',[key]);
 await pool.execute('DELETE FROM login_attempts WHERE window_started<?',[cutoff]);
 return Number(found[0].attempts)<=20;
}
async function body(req) {
 if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString():JSON.stringify(req.body);if(Buffer.byteLength(raw)>1500000)throw failure('Data terlalu besar',413);return JSON.parse(raw||'{}');}
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1500000)throw failure('Data terlalu besar',413);}return JSON.parse(raw||'{}');
}
const fields = ['name','status','nik','gender','phone','birth','institution','institutionPhone','address','originPhone','institutionAddress','emergencyName','relationship','emergencyPhone','emergencyAddress','room','entry','amount','payment'];
async function valid(d, acceptedRules, db) {
  if(fields.some(k=>typeof d[k]!=='string'||!d[k].trim()||d[k].length>300)) return 'Lengkapi seluruh kolom formulir.';
  if(!/^\d{16}$/.test(d.nik)) return 'NIK harus berisi 16 digit.';
  if(!/^\+?\d[\d\s-]{8,18}$/.test(d.phone)||!/^\+?\d[\d\s-]{8,18}$/.test(d.emergencyPhone)) return 'Nomor HP tidak valid.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.birth)||!/^\d{4}-\d{2}-\d{2}$/.test(d.entry)) return 'Tanggal tidak valid.';
  if(!['Mahasiswa','Pelajar','Bekerja','Lainnya'].includes(d.status)||!['Laki-laki','Perempuan'].includes(d.gender)) return 'Pilihan formulir tidak valid.';
  const nominal=d.amount.trim().replace(/^rp\.?\s*/i,'');
  if(!/^(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)$/.test(nominal)) return 'Masukkan nominal seperti Rp1.500.000 atau 1500000.';
  const amount=Number(nominal.replaceAll('.',''));
  if(!Number.isSafeInteger(amount)||amount<=0||amount>9999999999) return 'Jumlah pembayaran harus berupa rupiah utuh dan lebih dari nol.';
  d.amount=String(amount);
  d.room=d.room.trim();
  if(!/^[A-Za-z0-9-]{1,12}$/.test(d.room)) return 'Nomor kamar maksimal 12 karakter: huruf, angka, atau tanda hubung.';
  const existing = await rows(db);
  if(existing.some(r=>r.id!==d.id&&r.room.toLowerCase()===d.room.toLowerCase())) return 'Kamar tersebut sudah ditempati.';
  if(existing.some(r=>r.id!==d.id&&r.nik===d.nik)) return 'NIK sudah terdaftar.';
  if(!acceptedRules) return 'Tata tertib belum diisi pengelola. Simpan draf terlebih dahulu.';
  const limits={name:150,phone:20,institution:150,institutionPhone:20,emergencyName:150,emergencyPhone:20,relationship:50};
  if(Object.entries(limits).some(([k,max])=>d[k].length>max)) return 'Nama atau nomor kontak melebihi batas kolom database.';
  for(const k of ['birth','entry']) { const parsed=new Date(d[k]+'T00:00:00Z'); if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==d[k]||Number(d[k].slice(0,4))<1000) return 'Tanggal tidak valid.'; }
  if(d.agreement!==true||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')) return 'Setujui tata tertib dan simpan tanda tangan.';
  try { const image=Buffer.from(d.signature.split(',')[1],'base64'); docSignature(image); } catch { return 'Gambar tanda tangan tidak valid.'; }
}
function docSignature(image) {
  if(image.length>1000000||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw Error('Invalid PNG');
  const doc=new PDFDocument({autoFirstPage:false}); doc.on('data',()=>{}); doc.on('error',()=>{});
  try { const png=doc.openImage(image); if(png.width>4096||png.height>4096) throw Error('Invalid dimensions'); } finally { doc.end(); }
}
function pdf(res,d) {
 const doc=new PDFDocument({size:'A4',margin:42});
 res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Formulir_${d.id}.pdf"`,'Cache-Control':'no-store'}); doc.pipe(res); doc.registerFont('Inter',path.join(root,'assets/inter-regular.woff')); doc.registerFont('InterBold',path.join(root,'assets/inter-bold.woff')); doc.font('Inter');
 const brand=()=>{doc.font('InterBold').fontSize(18).fillColor('#080808').text('KOST',42,35).text('SAS',42,51);doc.fillColor('#ea1111').text('Q',79,51).fillColor('#080808').text('Y',93,51);};
 brand(); doc.fontSize(14).text('FORMULIR PENGHUNI KOST SASQY',145,38);doc.font('Inter').fontSize(9).fillColor('#777').text('Data dan tanda tangan penghuni',145,63);doc.moveTo(42,90).lineTo(553,90).strokeColor('#ddd').stroke();
 let y=108;
 const section=t=>{doc.fillColor('#202020').font('InterBold').fontSize(10).text(t,42,y); y+=25;};
 const row=(k,v)=>{const val=String(v||'-'); if(y>690){doc.addPage();y=42;}doc.font('Inter').fontSize(9).fillColor('#666').text(k,42,y,{width:170});doc.fillColor('#202020').text(val,212,y,{width:335});y+=Math.max(25,doc.heightOfString(val,{width:335})+10);};
 section('DATA PENGHUNI'); row('Nama lengkap',d.name);row('Nomor NIK',d.nik);row('Nomor HP',d.phone);row('Status / Jenis Kelamin',`${d.status} / ${d.gender}`);row('Tanggal Lahir',d.birth);row('Alamat sesuai KTP',d.address);row('Instansi / Sekolah',d.institution);row('Alamat / Nomor Instansi',`${d.institutionAddress} / ${d.institutionPhone}`);row('No. Telepon Daerah Asal',d.originPhone);
 y+=12;section('KONTAK DARURAT');row('Nama / Hubungan',`${d.emergencyName} / ${d.relationship}`);row('Nomor HP / Alamat',`${d.emergencyPhone} / ${d.emergencyAddress}`);
 y+=12;section('DATA KOST & PEMBAYARAN');row('Nomor Kamar / Tanggal Masuk',`${d.room} / ${d.entry}`);row('Cara Pembayaran',d.payment);row('Nominal Pembayaran',`Rp ${Number(d.amount).toLocaleString('id-ID')}`);
 y+=12;section('PERNYATAAN PENGHUNI');doc.font('Inter').fontSize(9).text('Saya menyatakan data yang diisi benar, telah membaca tata tertib Kost SASQY, dan bersedia menaati peraturan yang berlaku.',42,y,{width:510});y+=48;
 if(y>660){doc.addPage();y=50;}
 doc.text(`Tanggal: ${d.entry}`,370,y);try{doc.image(Buffer.from(d.signature.split(',')[1],'base64'),370,y+22,{fit:[175,72]});}catch{}doc.font('InterBold').text(d.name,370,y+104,{width:175});
 doc.addPage();doc.font('InterBold').fontSize(16).text('Tata Tertib Kost SASQY',42,42);doc.font('Inter').fontSize(10).text(d.rules||'',42,84,{width:510,lineGap:5});doc.end();
}
export const handler=async(req,res)=>{
 try {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://127.0.0.1:4173');const p=url.pathname;const method=req.method;
  if(p==='/healthz'&&method==='GET'){await pool.query('SELECT 1');return json(res,200,{ok:true});}
  if(p.startsWith('/api/')) {
   if(method!=='GET'&&req.headers.origin&&!(production?[publicOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]).includes(req.headers.origin)) return json(res,403,{error:'Permintaan tidak diizinkan.'});
   if(p==='/api/login'&&method==='POST'){
    if(!await limitLogin(req))return json(res,429,{error:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'});
    const d=await body(req);if(d.username!=='admin'||!timingSafeEqual(hash,scryptSync(String(d.password||''),'sasqy-local',64)))return json(res,401,{error:'Username atau password salah.'});const token=randomBytes(32).toString('hex');await pool.execute('DELETE FROM admin_sessions WHERE expires_at<?',[Date.now()]);await pool.execute('INSERT INTO admin_sessions (token_hash,key_version,expires_at) VALUES (?,?,?)',[tokenHash(token),sessionKey,Date.now()+8*60*60*1000]);res.setHeader('Set-Cookie',`sasqy=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production?'; Secure':''}`);return json(res,200,{ok:true});}
   if(p==='/api/session') return json(res,200,{authenticated:await auth(req)});
   if(p==='/api/logout'&&method==='POST'){await pool.execute('DELETE FROM admin_sessions WHERE token_hash=?',[tokenHash(cookieToken(req))]);res.setHeader('Set-Cookie',`sasqy=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`);return json(res,200,{ok:true});}
   if(p==='/api/public'&&method==='GET')return json(res,200,{rules:await rules(),rooms:await rooms(pool,true)});
   if(p==='/api/residents'&&method==='POST'){
    const d=await body(req);delete d.id;
    const id=await transaction(async db=>{d.rules=await rules(db);const error=await valid(d,d.rules,db);if(error)throw failure(error);return saveResident(db,d);});
    return json(res,201,{ok:true,id});
   }
   if(!await auth(req))return json(res,401,{error:'Silakan login admin.'});
   if(p==='/api/residents'&&method==='GET')return json(res,200,await rows());
   if(p==='/api/rooms'&&method==='GET')return json(res,200,await rooms());
   if(p==='/api/rooms'&&method==='POST'){
    const d=await body(req);const price=Number(d.price);
    if(typeof d.number!=='string'||!/^[A-Za-z0-9-]{1,12}$/.test(d.number)||!['string','number'].includes(typeof d.price)||String(d.price).trim()===''||!Number.isSafeInteger(price)||price<0||price>9999999999)throw failure('Nomor kamar atau harga tidak valid.');
    await transaction(db=>db.execute(`INSERT INTO kamar (nomor_kamar,harga_bulanan,created_at,updated_at) VALUES (?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE harga_bulanan=VALUES(harga_bulanan),updated_at=NOW()`,[d.number,price]));
    return json(res,200,{ok:true});
   }
   if(p.startsWith('/api/rooms/')&&method==='DELETE'){
    const n=decodeURIComponent(p.split('/').pop());
    await transaction(async db=>{
      const [occupied]=await db.execute(`SELECT k.id FROM kamar k WHERE k.nomor_kamar=? AND (k.status='terisi' OR EXISTS (SELECT 1 FROM riwayat_hunian h WHERE h.kamar_id=k.id AND h.tanggal_keluar IS NULL))`,[n]);
      if(occupied.length)throw failure('Kamar masih ditempati.',409);
      const [history]=await db.execute('SELECT h.id FROM riwayat_hunian h JOIN kamar k ON k.id=h.kamar_id WHERE k.nomor_kamar=? LIMIT 1',[n]);
      if(history.length)throw failure('Kamar memiliki riwayat hunian dan tidak dapat dihapus.',409);
      await db.execute('DELETE FROM kamar WHERE nomor_kamar=?',[n]);
    });return json(res,200,{ok:true});
   }
   if(p==='/api/rules'&&method==='GET')return json(res,200,{rules:await rules()});
   if(p==='/api/rules'&&method==='POST'){
    const d=await body(req);if(typeof d.rules!=='string'||d.rules.length>10000)throw failure('Tata tertib maksimal 10.000 karakter.');
    await transaction(db=>db.execute("INSERT INTO settings (setting_key,value) VALUES ('rules',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[d.rules.trim()]));return json(res,200,{ok:true});
   }
   const residentPath=p.match(/^\/api\/residents\/(\d+)(\/pdf)?$/);
   if(residentPath){
    const id=residentPath[1];
    if(method==='GET'){const [d]=await rows(pool,id);if(!d)throw failure('Penghuni tidak ditemukan.',404);return residentPath[2]?pdf(res,d):json(res,200,d);}
    if(!residentPath[2]&&['PUT','DELETE'].includes(method)){
      const payload=method==='PUT'?await body(req):null;
      await transaction(async db=>{
        const [d]=await rows(db,id);if(!d)throw failure('Penghuni tidak ditemukan.',404);
        if(method==='DELETE')return deleteResident(db,d);
        const next={...payload,id,rules:d.rules};const error=await valid(next,d.rules,db);if(error)throw failure(error);
        await saveResident(db,next,d);
      });return json(res,200,{ok:true});
    }
   }
   return json(res,404,{error:'Tidak ditemukan.'});
  }
  const file=path.resolve(root,`.${p==='/'?'/index.html':decodeURIComponent(p)}`);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Tidak diizinkan'});
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(err){
   if(res.headersSent){res.destroy();return;}
   const duplicate=err.code==='ER_DUP_ENTRY';
   const unavailable=['ECONNREFUSED','PROTOCOL_CONNECTION_LOST','ETIMEDOUT'].includes(err.code);
   if(!err.status&&!duplicate)console.error('Request failed:',err.code||err.name);
   json(res,err.status||(duplicate?409:unavailable?503:err instanceof SyntaxError?400:500),{error:err.status?err.message:duplicate?'NIK atau data sudah terdaftar.':unavailable?'Database sementara tidak tersedia.':'Permintaan tidak dapat diproses.'});
 }
};
const port=Number(process.env.PORT||4173);
if(!process.env.VERCEL){
const server=http.createServer(handler);
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Listening on port ${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit(0);}));
}
