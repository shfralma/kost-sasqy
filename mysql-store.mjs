import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });

const databaseUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
const remote = databaseUrl ? new URL(databaseUrl) : null;
if (process.env.NODE_ENV === 'production' && !databaseUrl && (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME)) throw Error('Production database credentials are required.');
export const pool = mysql.createPool({
  host: remote?.hostname || process.env.DB_HOST || '127.0.0.1', port: Number(remote?.port || process.env.DB_PORT || 3306),
  user: remote ? decodeURIComponent(remote.username) : process.env.DB_USER || 'root', password: remote ? decodeURIComponent(remote.password) : process.env.DB_PASSWORD || '',
  database: remote ? decodeURIComponent(remote.pathname.slice(1)) : process.env.DB_NAME || 'kost_sasqy', connectionLimit: 5,
  ...(process.env.DB_SSL === 'true' ? {ssl:{rejectUnauthorized:true,...(process.env.DB_SSL_CA ? {ca:process.env.DB_SSL_CA.replaceAll('\\n','\n')} : {})}} : {}),
  charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
});
export const failure = (message, status = 400) => Object.assign(new Error(message), { status });
export async function initialize() {
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash CHAR(64) PRIMARY KEY, key_version CHAR(64) NOT NULL,
    expires_at BIGINT NOT NULL, INDEX admin_session_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS login_attempts (
    ip_key CHAR(64) PRIMARY KEY, attempts INT UNSIGNED NOT NULL,
    window_started BIGINT NOT NULL, INDEX login_window (window_started)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Additive tables only: the original five tables and SQLite files remain intact.
  await pool.query(`CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(100) PRIMARY KEY, value LONGTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS penghuni_form (
    penghuni_id BIGINT UNSIGNED PRIMARY KEY,
    hunian_id BIGINT UNSIGNED NOT NULL UNIQUE,
    gender VARCHAR(20) NOT NULL, birth DATE NOT NULL,
    origin_phone VARCHAR(300) NOT NULL, emergency_address TEXT NOT NULL,
    signature LONGTEXT NOT NULL, accepted_rules LONGTEXT NOT NULL,
    agreement TINYINT(1) NOT NULL, payment VARCHAR(300) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    CONSTRAINT sasqy_form_penghuni_fk FOREIGN KEY (penghuni_id) REFERENCES penghuni(id),
    CONSTRAINT sasqy_form_hunian_fk FOREIGN KEY (hunian_id) REFERENCES riwayat_hunian(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.execute("INSERT IGNORE INTO settings (setting_key,value) VALUES ('mutation_lock','')");
}
export async function transaction(fn) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize API mutations across server processes, including room availability checks.
    await db.query("SELECT setting_key FROM settings WHERE setting_key='mutation_lock' FOR UPDATE");
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (err) { await db.rollback(); throw err; }
  finally { db.release(); }
}
export async function rules(db = pool) {
  const [rows] = await db.execute("SELECT value FROM settings WHERE setting_key='rules'");
  return rows[0]?.value || '';
}
export async function rooms(db = pool, available = false) {
  const [rows] = await db.query(`SELECT k.nomor_kamar AS number,k.harga_bulanan AS price,k.status AS state FROM kamar k
    ${available ? "WHERE k.status='tersedia' AND NOT EXISTS (SELECT 1 FROM riwayat_hunian h WHERE h.kamar_id=k.id AND h.tanggal_keluar IS NULL)" : ''}
    ORDER BY k.nomor_kamar`);
  return rows.map(r => ({ number: r.number, price: Number(r.price), state: r.state }));
}
export async function residents(db = pool, id) {
  const [rows] = await db.execute(`SELECT p.*,f.gender,f.birth,f.origin_phone,f.emergency_address,
    f.signature,f.accepted_rules,f.agreement,f.payment,f.amount,k.nomor_kamar,h.tanggal_masuk,h.tanggal_keluar,h.id AS occupancy_id
    FROM penghuni p
    LEFT JOIN penghuni_form f ON f.penghuni_id=p.id
    LEFT JOIN riwayat_hunian h ON h.id=COALESCE(f.hunian_id,
      (SELECT MAX(h2.id) FROM riwayat_hunian h2 WHERE h2.penghuni_id=p.id))
    LEFT JOIN kamar k ON k.id=h.kamar_id ${id === undefined ? '' : 'WHERE p.id=?'} ORDER BY p.id`, id === undefined ? [] : [id]);
  return rows.map(r => ({
    id: String(r.id), name: r.nama_lengkap, nik: r.nik, phone: r.no_hp,
    status: r.pekerjaan || '', gender: r.gender || '', birth: r.birth || '',
    institution: r.nama_instansi || '', institutionAddress: r.alamat_instansi || '',
    institutionPhone: r.no_telp_instansi || '', address: r.alamat_ktp || '',
    emergencyName: r.nama_kontak_darurat || '', emergencyPhone: r.no_hp_darurat || '',
    relationship: r.hubungan_darurat || '', originPhone: r.origin_phone || '',
    emergencyAddress: r.emergency_address || '', signature: r.signature || '',
    rules: r.accepted_rules || '', agreement: !!r.agreement, payment: r.payment || '',
    amount: r.amount == null ? '' : String(Number(r.amount)), room: r.nomor_kamar || '',
    entry: r.tanggal_masuk || '', exit: r.tanggal_keluar || '', active: !!r.occupancy_id && !r.tanggal_keluar, created: r.created_at || '',
  }));
}
export async function saveResident(db, d, existing) {
  if (existing && !existing.active) throw failure('Data penghuni yang sudah keluar hanya dapat dilihat dan diunduh.',409);
  const [roomRows] = await db.execute('SELECT * FROM kamar WHERE nomor_kamar=? FOR UPDATE', [d.room]);
  const room = roomRows[0];
  if (!room) throw failure('Kamar belum terdaftar. Hubungi pengelola.');
  const [occupants] = await db.execute('SELECT penghuni_id FROM riwayat_hunian WHERE kamar_id=? AND tanggal_keluar IS NULL', [room.id]);
  if (room.status === 'perbaikan' || occupants.some(o => String(o.penghuni_id) !== d.id)
      || (room.status === 'terisi' && !occupants.some(o => String(o.penghuni_id) === d.id)))
    throw failure('Kamar tersebut tidak tersedia.');
  const values = [d.name,d.nik,d.phone,d.status,d.institution,d.institutionAddress,d.institutionPhone,
    d.address,d.emergencyName,d.emergencyPhone,d.relationship];
  const columns = ['nama_lengkap','nik','no_hp','pekerjaan','nama_instansi','alamat_instansi',
    'no_telp_instansi','alamat_ktp','nama_kontak_darurat','no_hp_darurat','hubungan_darurat'];
  if (existing) {
    await db.execute(`UPDATE penghuni SET ${columns.map(c => `${c}=?`).join(',')},updated_at=NOW() WHERE id=?`, [...values,d.id]);
  } else {
    const [result] = await db.execute(`INSERT INTO penghuni (${columns.join(',')},created_at,updated_at) VALUES (${values.map(() => '?').join(',')},NOW(),NOW())`, values);
    d.id = String(result.insertId);
  }
  const [current] = await db.execute('SELECT hunian_id FROM penghuni_form WHERE penghuni_id=?', [d.id]);
  let hunianId = current[0]?.hunian_id;
  if (hunianId) {
    await db.execute('UPDATE riwayat_hunian SET kamar_id=?,tanggal_masuk=?,updated_at=NOW() WHERE id=?', [room.id,d.entry,hunianId]);
  } else {
    const [result] = await db.execute('INSERT INTO riwayat_hunian (penghuni_id,kamar_id,tanggal_masuk,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())', [d.id,room.id,d.entry]);
    hunianId = result.insertId;
  }
  await db.execute(`INSERT INTO penghuni_form (penghuni_id,hunian_id,gender,birth,origin_phone,emergency_address,signature,accepted_rules,agreement,payment,amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE gender=VALUES(gender),birth=VALUES(birth),
    origin_phone=VALUES(origin_phone),emergency_address=VALUES(emergency_address),signature=VALUES(signature),
    payment=VALUES(payment),amount=VALUES(amount)`,
    [d.id,hunianId,d.gender,d.birth,d.originPhone,d.emergencyAddress,d.signature,d.rules,1,d.payment,d.amount]);
  await db.execute("UPDATE kamar SET status='terisi',updated_at=NOW() WHERE id=?", [room.id]);
  if (existing && existing.room !== d.room) await releaseRoom(db, existing.room);
  return d.id;
}
async function releaseRoom(db, number) {
  await db.execute(`UPDATE kamar k SET status='tersedia',updated_at=NOW() WHERE nomor_kamar=? AND status='terisi'
    AND NOT EXISTS (SELECT 1 FROM riwayat_hunian h WHERE h.kamar_id=k.id AND h.tanggal_keluar IS NULL)`, [number]);
}
export async function deleteResident(db, d) {
  await db.execute('DELETE FROM penghuni_form WHERE penghuni_id=?', [d.id]);
  await db.execute('DELETE b FROM pembayaran b JOIN riwayat_hunian h ON b.hunian_id=h.id WHERE h.penghuni_id=?', [d.id]);
  await db.execute('DELETE FROM riwayat_hunian WHERE penghuni_id=?', [d.id]);
  await db.execute('DELETE FROM penghuni WHERE id=?', [d.id]);
  await releaseRoom(db, d.room);
}

export async function checkoutResident(db, d, exit) {
  if (!d.active) throw failure('Penghuni sudah keluar.',409);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const parsed = typeof exit === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(exit) ? new Date(exit+'T00:00:00Z') : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==exit || exit<d.entry || exit>today)
    throw failure('Tanggal keluar harus valid, tidak sebelum tanggal masuk dan tidak melewati hari ini.');
  const [result] = await db.execute('UPDATE riwayat_hunian SET tanggal_keluar=?,updated_at=NOW() WHERE penghuni_id=? AND tanggal_keluar IS NULL',[exit,d.id]);
  if (!result.affectedRows) throw failure('Penghuni sudah keluar.',409);
  await releaseRoom(db,d.room);
}
