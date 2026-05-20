/**
 * migrate.js — vytvoří všechny tabulky v NeonDB (pokud ještě neexistují).
 * Spuštění: npm run db:migrate
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('Spouštím migraci...');

  const sql = fs.readFileSync(path.join(__dirname, '..', 'lib', 'schema.sql'), 'utf8');

  // Odstraň comment řádky a spusť každý příkaz zvlášť
  const stripped = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  const statements = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await pool.query(stmt);
  }

  console.log('✅ Migrace dokončena — všechny tabulky jsou připraveny.');
  await pool.end();
}

main().catch(err => {
  console.error('❌ Chyba při migraci:', err.message);
  process.exit(1);
});
