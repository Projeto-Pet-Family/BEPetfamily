const { Pool } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_FdYvOjbx51CX@ep-lingering-wave-ae8v6e5a-pooler.c-2.us-east-2.aws.neon.tech/petfamily?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('Conectado ao PostgreSQL Neon');
});

pool.on('error', (err) => {
  console.error('Erro na conexão com PostgreSQL:', err);
});

module.exports = pool;