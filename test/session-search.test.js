import assert from 'node:assert/strict';
import test from 'node:test';

import { XClient } from '../src/client.js';
import { readFile } from 'node:fs/promises';

test('CLI read commands do not import the paid search module', async () => {
    const cliSource = await readFile(new URL('../src/cli.js', import.meta.url), 'utf8');
    assert.doesNotMatch(cliSource, /official_search|searchRecentTweets|api\.(?:x|twitter)\.com\/2\//);
});

test('session search stays on x.com GraphQL and parses posts', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
        requests.push({ url, options });
        return new Response(JSON.stringify({
            data: {
                search_by_raw_query: {
                    search_timeline: {
                        timeline: {
                            instructions: [{
                                type: 'TimelineAddEntries',
                                entries: [{
                                    content: {
                                        itemContent: {
                                            tweet_results: {
                                                result: {
                                                    tweet: {
                                                        rest_id: '123',
                                                        legacy: {
                                                            full_text: 'Session-backed result',
                                                            favorite_count: 5,
                                                            retweet_count: 2,
                                                            reply_count: 1,
                                                            quote_count: 0,
                                                            created_at: 'Wed Jul 15 16:00:00 +0000 2026'
                                                        },
                                                        core: {
                                                            user_results: {
                                                                result: {
                                                                    legacy: {
                                                                        screen_name: 'exampleuser',
                                                                        name: 'Example User',
                                                                        followers_count: 100
                                                                    }
                                                                }
                                                            }
                                                        },
                                                        views: { count: '1000' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }]
                            }]
                        }
                    }
                }
            }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const client = new XClient({
        fetchImpl,
        cookies: { authToken: 'test-auth', ct0: 'test-ct0' }
    });
    const tweets = await client.searchTweets('AI agents', 1);

    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/x\.com\/i\/api\/graphql\//);
    assert.doesNotMatch(requests[0].url, /api\.(?:x|twitter)\.com\/2\//);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(tweets[0].id, '123');
    assert.equal(tweets[0].author, 'exampleuser');
    assert.equal(tweets[0].views, 1000);
});

test('session search rotates Bird-style query IDs without paid fallback', async () => {
    const urls = [];
    const fetchImpl = async (url) => {
        urls.push(url);
        if (urls.length === 1) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({
            data: {
                search_by_raw_query: {
                    search_timeline: { timeline: { instructions: [] } }
                }
            }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const client = new XClient({
        fetchImpl,
        cookies: { authToken: 'test-auth', ct0: 'test-ct0' }
    });
    const tweets = await client.searchTweets('AI agents', 1);

    assert.deepEqual(tweets, []);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => url.startsWith('https://x.com/i/api/graphql/')));
});
