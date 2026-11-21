// My tests for the parser. I run them with:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticle, parseNewsResponse, normalizeUrl } from '../src/parser/articleParser.js';

test('I turn a raw mediastack article into my clean model', () => {
  const article = parseArticle({
    author: '  Jane Doe ',
    title: 'Big   News',
    description: '',
    url: 'https://Example.com/story?id=1&utm_source=twitter#top',
    source: 'Example',
    image: null,
    category: 'Technology',
    language: 'EN',
    country: 'us',
    published_at: '2026-11-20T10:00:00+00:00',
  });

  assert.deepEqual(article, {
    url: 'https://example.com/story?id=1',
    title: 'Big News',
    description: null,
    author: 'Jane Doe',
    source: 'Example',
    imageUrl: null,
    category: 'technology',
    language: 'en',
    country: 'us',
    publishedAt: new Date('2026-11-20T10:00:00Z'),
  });
});

test('I skip articles without a valid url or title', () => {
  assert.equal(parseArticle({ title: 'No url' }), null);
  assert.equal(parseArticle({ url: 'https://x.com/a', title: '   ' }), null);
  assert.equal(parseArticle({ url: 'not a url', title: 'Bad url' }), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});

test('I remove duplicates inside one response and count skipped ones', () => {
  const result = parseNewsResponse({
    pagination: { total: 3 },
    data: [
      { url: 'https://x.com/a?utm_medium=rss', title: 'A' },
      { url: 'https://x.com/a', title: 'A again' },
      { title: 'broken' },
    ],
  });
  assert.equal(result.articles.length, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.total, 3);
});

test('I handle an empty or weird response without crashing', () => {
  assert.deepEqual(parseNewsResponse(undefined), { articles: [], skipped: 0, total: 0 });
  assert.deepEqual(parseNewsResponse({ data: 'nope' }), { articles: [], skipped: 0, total: 0 });
});
