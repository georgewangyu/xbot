import crypto from 'crypto';
import { loadApiCredentials } from './credentials.js';

const SEARCH_URL = 'https://api.twitter.com/2/tweets/search/recent';

export async function searchRecentTweets(query, count = 25, options = {}) {
    const creds = loadApiCredentials();
    const missing = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'].filter((key) => !creds[key]);
    if (missing.length > 0) {
        throw new Error(`Missing official X API credentials: ${missing.join(', ')}`);
    }

    const requested = Math.max(10, Math.min(count, 100));
    const params = {
        query: normalizeQuery(query, options),
        max_results: String(requested),
        expansions: 'author_id',
        'tweet.fields': 'created_at,public_metrics',
        'user.fields': 'username,name,public_metrics'
    };

    const url = `${SEARCH_URL}?${new URLSearchParams(params).toString()}`;
    const response = await fetch(url, {
        headers: {
            Authorization: buildOAuthHeader('GET', SEARCH_URL, params, creds)
        }
    });
    const data = await response.json();
    if (!response.ok) {
        const detail = data.detail || data.title || data.errors?.map((entry) => entry.message).join('; ') || JSON.stringify(data);
        throw new Error(`Official X search error ${response.status}: ${detail}`);
    }

    return mapSearchResponse(data).slice(0, count);
}

function normalizeQuery(query, options = {}) {
    const text = String(query || '').trim();
    if (!text) throw new Error('Search query is required.');
    const parts = [text];
    if (!/\bmin_faves:/.test(text) && Number(options.searchMinLikes) > 0) {
        parts.push(`min_faves:${Number(options.searchMinLikes)}`);
    }
    if (!/\bis:retweet\b/.test(text)) parts.push('-is:retweet');
    if (!options.includeReplies && !/\bis:reply\b/.test(text)) parts.push('-is:reply');
    if (!/\blang:/.test(text)) parts.push('lang:en');
    return parts.join(' ');
}

function mapSearchResponse(data) {
    const users = new Map((data.includes?.users || []).map((user) => [user.id, user]));
    return (data.data || []).map((tweet) => {
        const user = users.get(tweet.author_id) || {};
        const metrics = tweet.public_metrics || {};
        const likes = numberOrZero(metrics.like_count);
        const retweets = numberOrZero(metrics.retweet_count);
        const replies = numberOrZero(metrics.reply_count);
        const quotes = numberOrZero(metrics.quote_count);
        const bookmarks = numberOrZero(metrics.bookmark_count);
        const views = numberOrNull(metrics.impression_count);
        const followers = numberOrNull(user.public_metrics?.followers_count);
        const engagementTotal = likes + retweets + replies + quotes + bookmarks;
        const author = user.username;

        return {
            id: tweet.id,
            text: tweet.text,
            author,
            authorName: user.name,
            authorFollowers: followers,
            createdAt: tweet.created_at,
            likes,
            retweets,
            replies,
            quotes,
            bookmarks,
            views,
            engagementTotal,
            url: author && tweet.id ? `https://x.com/${author}/status/${tweet.id}` : null
        };
    });
}

function buildOAuthHeader(method, baseUrl, queryParams, creds) {
    const oauthParams = {
        oauth_consumer_key: creds.apiKey,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: creds.accessToken,
        oauth_version: '1.0'
    };

    const allParams = { ...queryParams, ...oauthParams };
    const paramString = Object.keys(allParams)
        .sort()
        .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
        .join('&');

    const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
    const baseString = `${method}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
    oauthParams.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    return 'OAuth ' + Object.entries(oauthParams)
        .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
        .join(', ');
}

function percentEncode(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function numberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
    return numberOrNull(value) ?? 0;
}
