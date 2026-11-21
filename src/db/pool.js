// My connection to PostgreSQL.
// A "pool" keeps a few connections open and reuses them, which is faster
// than opening a new connection for every query.
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  ...config.db,
  max: 5,
  connectionTimeoutMillis: 5_000, // I give up if the DB doesn't answer in 5s
});
