import { readFile } from 'node:fs/promises';
import { pool, initialize } from '../mysql-store.mjs';
try {
 const sql=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 for(const statement of sql.replace(/^\s*--[^\n]*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)) await pool.query(statement);
 await initialize();
 console.log('Schema initialized. No resident data imported or seeded.');
} finally { await pool.end(); }
