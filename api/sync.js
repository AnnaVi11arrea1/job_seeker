const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Required for @neondatabase/serverless in Node.js (non-edge) environment
const { neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = ws;

// POST /api/sync
// Body: { user_id: string (UUID), jobs: Job[] }
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, jobs } = req.body || {};

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid user_id' });
  }
  if (!Array.isArray(jobs)) {
    return res.status(400).json({ error: 'jobs must be an array' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [user_id]
    );
    await client.query('DELETE FROM jobs WHERE user_id = $1', [user_id]);

    if (jobs.length > 0) {
      const placeholders = jobs
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}::jsonb)`)
        .join(', ');
      const values = jobs.flatMap(job => [job.id, user_id, JSON.stringify(job)]);
      await client.query(
        `INSERT INTO jobs (id, user_id, data) VALUES ${placeholders}`,
        values
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, count: jobs.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
    await pool.end();
  }
};
