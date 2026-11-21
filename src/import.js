// My import script. I run it with:  npm run import
//
// The flow is:  API client  ->  parser  ->  repository (database)
// Each step lives in its own file, so I can change one without breaking the others.
import { config } from './config.js';
import { createMediastackClient } from './api/mediastackClient.js';
import { parseNewsResponse } from './parser/articleParser.js';
import { createArticleRepository } from './db/articleRepository.js';
import { pool } from './db/pool.js';

async function main() {
  const ms = config.mediastack;
  const client = createMediastackClient(ms);
  const repo = createArticleRepository(pool);

  await repo.ensureSchema();

  let totalInserted = 0;
  let totalUpdated = 0;

  // I fetch page by page, but never more than maxPagesPerRun
  // (every page costs me 1 request from my monthly free quota).
  for (let page = 0; page < ms.maxPagesPerRun; page++) {
    const offset = page * ms.pageSize;
    console.log(`📥 Fetching page ${page + 1} (offset ${offset})...`);

    const response = await client.fetchNews({
      limit: ms.pageSize,
      offset,
      languages: ms.languages,
      countries: ms.countries,
      categories: ms.categories,
      keywords: ms.keywords,
    });

    const { articles, skipped, total } = parseNewsResponse(response);
    const { inserted, updated } = await repo.upsertMany(articles);
    totalInserted += inserted;
    totalUpdated += updated;

    console.log(`   ${articles.length} clean articles (${skipped} skipped) → ${inserted} new, ${updated} updated`);

    // I stop early if there are no more pages to fetch.
    if (offset + ms.pageSize >= total || articles.length === 0) break;
  }

  console.log(`✅ Done. ${totalInserted} new, ${totalUpdated} updated. Total in my DB: ${await repo.count()}`);
}

main()
  .catch((err) => {
    // I print a friendly message, and set exit code 1 so scripts/cron know it failed.
    console.error(`❌ Import failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end()); // I close the DB connections so Node can exit
