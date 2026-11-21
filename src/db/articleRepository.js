// My repository layer.
// This is the ONE place in my code that reads from and writes to the database.
// No other file writes SQL. If I ever change my database or table,
// this is the only file I need to edit.
import { readFile } from 'node:fs/promises';

export function createArticleRepository(pool) {
  // I create my table if it doesn't exist yet. Safe to run every time.
  // (docker-compose also runs this file on the very first start,
  // but running it here too means I never forget it.)
  async function ensureSchema() {
    const sql = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
    await pool.query(sql);
  }

  // I save a list of articles. This is an "upsert" (update + insert):
  //   - new URL      -> INSERT a new row
  //   - existing URL -> UPDATE that row instead of creating a duplicate
  // This is why running my import twice never creates duplicates.
  //
  // I do everything inside one transaction: either ALL articles are saved,
  // or (if something breaks) NONE are, so I never end up half-imported.
  async function upsertMany(articles) {
    if (articles.length === 0) return { inserted: 0, updated: 0 };

    const client = await pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (const a of articles) {
        // I ALWAYS use $1, $2... placeholders and never glue values into the
        // SQL string myself. That protects me from SQL injection.
        const result = await client.query(
          `INSERT INTO articles
             (url, title, description, author, source, image_url,
              category, language, country, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (url) DO UPDATE SET
             title        = EXCLUDED.title,
             description  = EXCLUDED.description,
             author       = EXCLUDED.author,
             source       = EXCLUDED.source,
             image_url    = EXCLUDED.image_url,
             category     = EXCLUDED.category,
             language     = EXCLUDED.language,
             country      = EXCLUDED.country,
             published_at = EXCLUDED.published_at,
             updated_at   = now()
           RETURNING (xmax = 0) AS inserted`,
          [
            a.url,
            a.title,
            a.description,
            a.author,
            a.source,
            a.imageUrl,
            a.category,
            a.language,
            a.country,
            a.publishedAt,
          ],
        );
        // Postgres trick: xmax = 0 means the row was freshly inserted,
        // otherwise it was an existing row that I updated.
        if (result.rows[0].inserted) inserted++;
        else updated++;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // I always give the connection back to the pool
    }

    return { inserted, updated };
  }

  // I count how many articles I have in total.
  async function count() {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM articles');
    return rows[0].n;
  }

  // I get the newest articles (handy for checking my import worked).
  async function findLatest(limit = 10) {
    const { rows } = await pool.query(
      `SELECT id, url, title, source, category, language, country, published_at
         FROM articles
        ORDER BY published_at DESC NULLS LAST
        LIMIT $1`,
      [limit],
    );
    return rows;
  }

  return { ensureSchema, upsertMany, count, findLatest };
}
