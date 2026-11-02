import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import PDFDocument from 'pdfkit';
const root = fileURLToPath(new URL('./public/', import.meta.url));
await mkdir(new URL('./.data/', import.meta.url), {recursive:true});
const db = new DatabaseSync(fileURLToPath(new URL('./.data/sasqy.sqlite', import.meta.url)));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS residents (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rooms (number TEXT PRIMARY KEY, price INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
const sessions = new Map();
const password = process.env.SASQY_ADMIN_PASSWORD || 'Sasqy2026!';
const hash = scryptSync(password, 'sasqy-local', 64);
const json = (res,status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
const rows = () => db.prepare('SELECT data FROM residents').all().map(r=>JSON.parse(r.data));
const rules = () => db.prepare("SELECT value FROM settings WHERE key='rules'").get()?.value || '';
const auth = req => Date.now()-(sessions.get((req.headers.cookie||'').split('; ').find(c=>c.startsWith('sasqy='))?.slice(6))||0)<8*60*60*1000;
async function body(req) {let raw=''; for await (const chunk of req) {raw+=chunk; if(raw.length>1500000) throw Error('Data terlalu besar');} return JSON.parse(raw || '{}');}
const fields = ['name','status','nik','gender','phone','birth','institution','institutionPhone','address','originPhone','institutionAddress','emergencyName','relationship','emergencyPhone','emergencyAddress','room','entry','amount'];
function valid(d, acceptedRules=rules()) {
  if(fields.some(k=>typeof d[k]!=='string'||!d[k].trim()||d[k].length>300)) return 'Lengkapi seluruh kolom formulir.';
  if(!/^\d{16}$/.test(d.nik)) return 'NIK harus berisi 16 digit.';
  if(!/^\+?\d[\d\s-]{8,18}$/.test(d.phone)||!/^\+?\d[\d\s-]{8,18}$/.test(d.emergencyPhone)) return 'Nomor HP tidak valid.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.birth)||!/^\d{4}-\d{2}-\d{2}$/.test(d.entry)) return 'Tanggal tidak valid.';
  if(!['Mahasiswa','Pelajar','Bekerja','Lainnya'].includes(d.status)||!['Laki-laki','Perempuan'].includes(d.gender)) return 'Pilihan formulir tidak valid.';
  const nominal=d.amount.trim().replace(/^rp\.?\s*/i,'');
  if(!/^(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)$/.test(nominal)) return 'Masukkan nominal seperti Rp1.500.000 atau 1500000.';
  const amount=Number(nominal.replaceAll('.',''));
  if(!Number.isSafeInteger(amount)||amount<=0) return 'Jumlah pembayaran harus berupa rupiah utuh dan lebih dari nol.';
  d.amount=String(amount);
  d.room=d.room.trim();
  if(!/^[A-Za-z0-9-]{1,12}$/.test(d.room)) return 'Nomor kamar maksimal 12 karakter: huruf, angka, atau tanda hubung.';
  if(rows().some(r=>r.id!==d.id&&r.room===d.room)) return 'Kamar tersebut sudah ditempati.';
  if(rows().some(r=>r.id!==d.id&&r.nik===d.nik)) return 'NIK sudah terdaftar.';
  if(!acceptedRules) return 'Tata tertib belum diisi pengelola. Simpan draf terlebih dahulu.';
  if(!d.agreement||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d.signature||'')) return 'Setujui tata tertib dan simpan tanda tangan.';
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
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://127.0.0.1:4173');const p=url.pathname;const method=req.method;
  if(p.startsWith('/api/')) {
   if(method!=='GET'&&req.headers.origin&&req.headers.origin!=='http://127.0.0.1:4173'&&req.headers.origin!=='http://localhost:4173') return json(res,403,{error:'Permintaan tidak diizinkan.'});
   if(p==='/api/login'&&method==='POST'){const d=await body(req);if(d.username!=='admin'||!timingSafeEqual(hash,scryptSync(String(d.password||''),'sasqy-local',64)))return json(res,401,{error:'Username atau password salah.'});const token=randomBytes(32).toString('hex');sessions.set(token,Date.now());res.setHeader('Set-Cookie',`sasqy=${token}; HttpOnly; SameSite=Strict; Path=/`);return json(res,200,{ok:true});}
   if(p==='/api/session') return json(res,200,{authenticated:auth(req)});
   if(p==='/api/logout'&&method==='POST'){const token=(req.headers.cookie||'').split('; ').find(c=>c.startsWith('sasqy='))?.slice(6);sessions.delete(token);res.setHeader('Set-Cookie','sasqy=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
   if(p==='/api/public'&&method==='GET')return json(res,200,{rules:rules(),rooms:db.prepare('SELECT * FROM rooms ORDER BY number').all().filter(r=>!rows().some(d=>d.room===r.number)).map(r=>({number:r.number,price:r.price}))});
   if(p==='/api/residents'&&method==='POST'){const d=await body(req);d.id=randomBytes(8).toString('hex');const error=valid(d);if(error)return json(res,400,{error});d.rules=rules();d.created=new Date().toISOString();db.exec('BEGIN');try{db.prepare('INSERT INTO rooms (number,price) VALUES (?,0) ON CONFLICT(number) DO NOTHING').run(d.room);db.prepare('INSERT INTO residents VALUES (?,?)').run(d.id,JSON.stringify(d));db.exec('COMMIT');}catch(err){db.exec('ROLLBACK');throw err;}return json(res,201,{ok:true,id:d.id});}
   if(!auth(req))return json(res,401,{error:'Silakan login admin.'});
   if(p==='/api/residents'&&method==='GET')return json(res,200,rows());
   if(p==='/api/rooms'&&method==='GET')return json(res,200,db.prepare('SELECT * FROM rooms ORDER BY number').all());
   if(p==='/api/rooms'&&method==='POST'){const d=await body(req);if(!/^[A-Za-z0-9-]{1,12}$/.test(d.number)||!Number.isFinite(Number(d.price))||Number(d.price)<0)return json(res,400,{error:'Nomor kamar atau harga tidak valid.'});db.prepare('INSERT INTO rooms VALUES (?,?) ON CONFLICT(number) DO UPDATE SET price=excluded.price').run(d.number,Number(d.price));return json(res,200,{ok:true});}
   if(p.startsWith('/api/rooms/')&&method==='DELETE'){const n=decodeURIComponent(p.split('/').pop());if(rows().some(r=>r.room===n))return json(res,409,{error:'Kamar masih ditempati.'});db.prepare('DELETE FROM rooms WHERE number=?').run(n);return json(res,200,{ok:true});}
   if(p==='/api/rules'&&method==='GET')return json(res,200,{rules:rules()});
   if(p==='/api/rules'&&method==='POST'){const d=await body(req);if(typeof d.rules!=='string'||d.rules.length>10000)return json(res,400,{error:'Tata tertib maksimal 10.000 karakter.'});db.prepare("INSERT INTO settings VALUES ('rules',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(d.rules.trim());return json(res,200,{ok:true});}
   if(p.startsWith('/api/residents/')){const id=p.split('/')[3];const row=db.prepare('SELECT data FROM residents WHERE id=?').get(id);if(!row)return json(res,404,{error:'Penghuni tidak ditemukan.'});const d=JSON.parse(row.data);if(method==='GET'&&p.endsWith('/pdf'))return pdf(res,d);if(method==='GET')return json(res,200,d);if(method==='DELETE'){db.prepare('DELETE FROM residents WHERE id=?').run(id);return json(res,200,{ok:true});}if(method==='PUT'){const next={...await body(req),id};const error=valid(next,d.rules);if(error)return json(res,400,{error});next.rules=d.rules;next.created=d.created;db.exec('BEGIN');try{db.prepare('INSERT INTO rooms (number,price) VALUES (?,0) ON CONFLICT(number) DO NOTHING').run(next.room);db.prepare('UPDATE residents SET data=? WHERE id=?').run(JSON.stringify(next),id);db.exec('COMMIT');}catch(err){db.exec('ROLLBACK');throw err;}return json(res,200,{ok:true});}}
   return json(res,404,{error:'Tidak ditemukan.'});
  }
  const file=path.resolve(root,`.${p==='/'?'/index.html':decodeURIComponent(p)}`);if(!file.startsWith(root))return json(res,403,{error:'Tidak diizinkan'});
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
 }catch(err){if(res.headersSent){res.destroy();return;}json(res,400,{error:err.code==='SQLITE_CONSTRAINT_PRIMARYKEY'?'Data sudah ada.':'Permintaan tidak dapat diproses.'});}
});server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
