#!/usr/bin/env node
/**
 * post_official.js — Post a tweet via the official Twitter API v2 (OAuth 1.0a).
 *
 * This is the recommended posting strategy (Option 1). It uses the official
 * POST /2/tweets endpoint with OAuth 1.0a User Context credentials, which
 * Twitter explicitly supports and does not flag as bot traffic.
 *
 * Required env vars (in .env or georgerepo/.tokens/x-twitter.env):
 *   X_API_KEY            — API Key (Consumer Key)
 *   X_API_SECRET         — API Key Secret (Consumer Secret)
 *   X_ACCESS_TOKEN       — Access Token (your account)
 *   X_ACCESS_TOKEN_SECRET — Access Token Secret
 *
 * Usage:
 *   node src/post_official.js "Your tweet text"
 *   node src/post_official.js --reply-to 1234567890 "Your reply text"
 */

import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// --- Credential loading ---

function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return {};
    const loaded = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const [key, ...rest] = line.split('=');
        let value = rest.join('=').trim();
        if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
            value = value.slice(1, -1);
        }
        loaded[key.trim()] = value;
    }
    return loaded;
}

function loadCredentials() {
    // Load from .env in this repo first, then fall back to georgerepo tokens
    const localEnv = resolve(import.meta.dirname, '..', '.env');
    const privateEnv = resolve(homedir(), 'Documents/Workspace/georgerepo/.tokens/x-twitter.env');

    const fileVars = { ...loadEnvFile(privateEnv), ...loadEnvFile(localEnv) };

    const get = (key) => process.env[key] || fileVars[key] || '';

    return {
        apiKey: get('X_API_KEY'),
        apiSecret: get('X_API_SECRET'),
        accessToken: get('X_ACCESS_TOKEN'),
        accessTokenSecret: get('X_ACCESS_TOKEN_SECRET'),
    };
}

// --- OAuth 1.0a signing ---

function percentEncode(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(method, url, bodyParams, creds) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const oauthParams = {
        oauth_consumer_key: creds.apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: creds.accessToken,
        oauth_version: '1.0',
    };

    // Signature base string: merge oauth params + body params, sort, encode
    const allParams = { ...oauthParams, ...bodyParams };
    const sortedKeys = Object.keys(allParams).sort();
    const paramString = sortedKeys
        .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
        .join('&');

    const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
    const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;

    const signature = crypto
        .createHmac('sha1', signingKey)
        .update(baseString)
        .digest('base64');

    oauthParams.oauth_signature = signature;

    const headerValue =
        'OAuth ' +
        Object.entries(oauthParams)
            .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
            .join(', ');

    return headerValue;
}

// --- Tweet posting ---

async function postTweet(text, options = {}) {
    const creds = loadCredentials();

    const missing = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'].filter(
        (k) => !creds[k]
    );
    if (missing.length > 0) {
        const envNames = {
            apiKey: 'X_API_KEY',
            apiSecret: 'X_API_SECRET',
            accessToken: 'X_ACCESS_TOKEN',
            accessTokenSecret: 'X_ACCESS_TOKEN_SECRET',
        };
        throw new Error(
            `Missing credentials: ${missing.map((k) => envNames[k]).join(', ')}\n` +
            'Add them to georgerepo/.tokens/x-twitter.env or a local .env file.\n' +
            'See README.md → "Setting Up Official API (Option 1)" for setup instructions.'
        );
    }

    const url = 'https://api.twitter.com/2/tweets';
    const body = { text };
    if (options.replyTo) {
        body.reply = { in_reply_to_tweet_id: options.replyTo };
    }

    const authHeader = buildOAuthHeader('POST', url, {}, creds);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
        const detail = data.detail || data.title || JSON.stringify(data);
        throw new Error(`API error ${response.status}: ${detail}`);
    }

    return data;
}

// --- CLI entrypoint ---

function parseArgs(argv) {
    const args = argv.slice(2);
    let replyTo = null;
    const textParts = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--reply-to' && args[i + 1]) {
            replyTo = args[++i];
        } else {
            textParts.push(args[i]);
        }
    }

    return { text: textParts.join(' '), replyTo };
}

const { text, replyTo } = parseArgs(process.argv);

if (!text) {
    console.error('Usage: node src/post_official.js "Tweet text" [--reply-to <tweet_id>]');
    process.exit(1);
}

try {
    const result = await postTweet(text, { replyTo });
    const tweetId = result.data?.id;
    console.log(`Posted successfully. Tweet ID: ${tweetId}`);
} catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
}
