-- My database schema. It's safe to run this file many times
-- ("IF NOT EXISTS" means nothing happens if the table is already there).

CREATE TABLE IF NOT EXISTS articles (
  id            BIGSERIAL PRIMARY KEY,

  -- The cleaned-up article URL. The UNIQUE constraint is what stops duplicates:
  -- if I import the same article twice, Postgres refuses a second row.
  url           TEXT        NOT NULL UNIQUE,

  title         TEXT        NOT NULL,
  description   TEXT,
  author        TEXT,
  source        TEXT,
  image_url     TEXT,
  category      TEXT,
  language      CHAR(2),
  country       CHAR(2),
  published_at  TIMESTAMPTZ,

  -- Bookkeeping: when I first saw this article and when I last updated it.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_category_idx     ON articles (category);
