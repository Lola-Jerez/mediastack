# Mediastack News Importer

Fetches news articles from the [mediastack API](https://mediastack.com/) (I found it on [public-apis](https://github.com/public-apis/public-apis)), clean them up into my own data model, and save them in a PostgreSQL database that runs in Docker.

## How my code is organized

```
API  ──►  src/api/mediastackClient.js   (I fetch: timeouts, retries, rate limiting)
     ──►  src/parser/articleParser.js   (I clean the raw data into my Article model)
     ──►  src/db/articleRepository.js   (I read/write the database – the ONLY place with SQL)
```

| File | What it does |
|---|---|
| `src/import.js` | My main script. It connects the three steps above. |
| `src/config.js` | All my settings in one place, loaded from `.env`. |
| `src/db/pool.js` | My connection to PostgreSQL. |
| `db/schema.sql` | My `articles` table. |
| `docker-compose.yml` | My PostgreSQL container. |
| `test/` | My tests (they use a fake API, so they never spend my quota). |

## What I need installed

- **Node.js 18 or newer** (I use 24; there's an `.nvmrc`, so I just run `nvm use`). Node 18+ has `fetch` built in.
- **Docker Desktop** (it must be running).

## How I set it up (first time)

```bash
nvm use                 # switches me to Node 24
npm install             # installs pg and dotenv
cp .env.example .env    # then I open .env and add my API key + a DB password
npm run db:up           # starts PostgreSQL in Docker
```

I get my free API key at https://mediastack.com/signup/free.

## How I run it

```bash
npm run import   # fetches news and saves it to my database
npm test         # runs my tests
npm run db:down  # stops the database (my data is kept in a Docker volume)
```

To look at my data directly:

```bash
docker exec -it mediastack-news-db psql -U news_user -d news -c "SELECT title, source FROM articles ORDER BY published_at DESC LIMIT 10;"
```

(If I changed `POSTGRES_USER` / `POSTGRES_DB` in `.env`, I use those names instead.)

## Things I need to know about my FREE plan

- **Only 100 requests per month.** Every page I fetch = 1 request. That's why `MAX_PAGES_PER_RUN=1` by default. If I run the import once a day, that's ~30 requests a month, which is fine.
- **No HTTPS.** The free plan only allows `http://`, so my API key travels unencrypted. I accept that for a learning project. If I upgrade, I change `baseUrl` in `src/config.js` to `https://`.
- **Max 100 articles per request**, and the news can be slightly delayed.

## How I handle real-world problems

**Timeouts:** if the API doesn't answer within 10 seconds, I abort the request (`AbortSignal.timeout`).

**Retries:** I only retry when the problem is *temporary*:

| Problem | Do I retry? |
|---|---|
| Timeout / network error | yes |
| HTTP 5xx (server error) | yes |
| HTTP 429 `rate_limit_reached` (too many requests) | yes |
| HTTP 429 `usage_limit_reached` (monthly quota gone) | no, retrying wastes time |
| Wrong/missing API key, feature not in my plan |  no, I need to fix it myself |

I wait longer between each retry (≈1s, 2s, 4s) plus a little random "jitter". If the API sends a `Retry-After` header, I wait that long instead. I retry 3 times at most.

**Rate limiting:** I always leave at least 1 second between two requests, and I cap how many pages I fetch per run.

## Why running the import twice doesn't create duplicates

1. My parser cleans each URL (it removes `utm_...` tracking params and `#anchors`), so the same article always has the same URL.
2. The `url` column in my table is `UNIQUE`, so Postgres refuses a duplicate row.
3. My repository uses `INSERT ... ON CONFLICT (url) DO UPDATE`, so a second import **updates** existing rows instead of failing or duplicating them.

## Keeping my secrets safe

- My API key and database password live **only** in `.env`.
- `.env` is in `.gitignore`, so git never commits it. `.env.example` (with fake values) is the one I commit.
- `docker-compose.yml` reads the password from `.env` with `${POSTGRES_PASSWORD}`. It's never hard-coded.
- I never log the request URL, because it contains my API key.
- If I ever commit my key by mistake, I generate a new one in my mediastack dashboard straight away.

## How I can change things

- **Different news?** I edit `MEDIASTACK_LANGUAGES`, `COUNTRIES`, `CATEGORIES`, `KEYWORDS` in `.env`.
- **Add a field to my model?** I add it in `parseArticle()` (parser), add a column in `db/schema.sql`, and add it to the `INSERT` in `articleRepository.js`. (`schema.sql` only *creates* the table. If the table already exists, I add the column with `ALTER TABLE articles ADD COLUMN ...`.)
- **Different timeouts/retries?** I change the numbers in `src/config.js`.
