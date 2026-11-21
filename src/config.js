// I keep ALL my settings in one place. Everything comes from environment
// variables, which the dotenv package loads from my .env file.
import 'dotenv/config';

// I use this helper so the app crashes early with a clear message
// if I forgot to put something important in my .env file.
function required(name) {
  const value = process.env[name];
  if (!value || value === 'put_your_key_here') {
    throw new Error(`Missing ${name}. I need to add it to my .env file (see .env.example).`);
  }
  return value;
}

export const config = {
  mediastack: {
    apiKey: required('MEDIASTACK_API_KEY'),

    // My free plan does NOT allow HTTPS, so I have to use http://.
    // If I upgrade my plan, I change this to https:// (safer, the key gets encrypted).
    baseUrl: 'http://api.mediastack.com/v1',

    // Filters for which news I want. Empty string = no filter.
    languages: process.env.MEDIASTACK_LANGUAGES || 'en',
    countries: process.env.MEDIASTACK_COUNTRIES || '',
    categories: process.env.MEDIASTACK_CATEGORIES || '',
    keywords: process.env.MEDIASTACK_KEYWORDS || '',

    // mediastack allows max 100 articles per request.
    pageSize: 100,

    // How many pages I fetch per run. Each page costs me 1 request
    // from my monthly free quota (100/month), so I keep it low.
    maxPagesPerRun: Number(process.env.MAX_PAGES_PER_RUN || 1),

    // How long I wait for the API before I give up on a request (milliseconds).
    timeoutMs: 10_000,

    // How many times I retry a request that failed for a TEMPORARY reason.
    maxRetries: 3,

    // How long I wait before my first retry. It doubles each time (1s, 2s, 4s).
    retryBaseDelayMs: 1_000,

    // The smallest gap I leave between two requests, so I never hammer the API.
    minDelayBetweenRequestsMs: 1_000,
  },

  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    database: required('POSTGRES_DB'),
  },
};
