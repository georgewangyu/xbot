#!/usr/bin/env node
/**
 * post_official.js — Post a tweet via the official Twitter API v2 (OAuth 1.0a).
 *
 * This is the recommended posting strategy (Option 1). It uses the official
 * POST /2/tweets endpoint with OAuth 1.0a User Context credentials, which
 * Twitter explicitly supports and does not flag as bot traffic.
 *
 * Required env vars (in .env or georgerepo/.tokens/x-twitter.env):
 *   X_API_KEY             — API Key (Consumer Key)
 *   X_API_SECRET          — API Key Secret (Consumer Secret)
 *   X_ACCESS_TOKEN        — Access Token (your account)
 *   X_ACCESS_TOKEN_SECRET — Access Token Secret
 *
 * Usage:
 *   node src/post_official.js "Your tweet text"
 *   node src/post_official.js --image /path/to/image.png "Your tweet text"
 *   node src/post_official.js --reply-to 1234567890 "Your reply text"
 */

import crypto from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { loadApiCredentials } from './credentials.js';

// --- OAuth 1.0a signing ---

function percentEncode(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(method, url, creds) {
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

    const sortedKeys = Object.keys(oauthParams).sort();
    const paramString = sortedKeys
        .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
        .join('&');

    const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
    const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;

    const signature = crypto
        .createHmac('sha1', signingKey)
        .update(baseString)
        .digest('base64');

    oauthParams.oauth_signature = signature;

    return (
        'OAuth ' +
        Object.entries(oauthParams)
            .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
            .join(', ')
    );
}

function getMimeType(filePath) {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        default:
            return 'application/octet-stream';
    }
}

async function uploadImageMedia(imagePath, creds) {
    if (!existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const authHeader = buildOAuthHeader('POST', url, creds);
    const body = new FormData();
    const mimeType = getMimeType(imagePath);
    const imageBuffer = readFileSync(imagePath);
    body.append('media', new Blob([imageBuffer], { type: mimeType }), basename(imagePath));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
        },
        body,
    });

    const data = await response.json();
    if (!response.ok) {
        const detail = data.error || data.errors?.map((entry) => entry.message).join('; ') || JSON.stringify(data);
        throw new Error(`Media upload error ${response.status}: ${detail}`);
    }

    if (!data.media_id_string) {
        throw new Error(`Media upload succeeded without a media_id_string: ${JSON.stringify(data)}`);
    }

    return data.media_id_string;
}

// --- Tweet posting ---

export async function postTweet(text, options = {}) {
    const creds = loadApiCredentials();

    const missing = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'].filter((k) => !creds[k]);
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
    if (options.imagePath) {
        const mediaId = await uploadImageMedia(options.imagePath, creds);
        body.media = { media_ids: [mediaId] };
    }

    const authHeader = buildOAuthHeader('POST', url, creds);

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
    let imagePath = null;
    const textParts = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--reply-to' && args[i + 1]) {
            replyTo = args[++i];
        } else if (args[i] === '--image' && args[i + 1]) {
            imagePath = args[++i];
        } else {
            textParts.push(args[i]);
        }
    }

    return { text: textParts.join(' '), replyTo, imagePath };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const { text, replyTo, imagePath } = parseArgs(process.argv);

    if (!text) {
        console.error('Usage: node src/post_official.js "Tweet text" [--image <path>] [--reply-to <tweet_id>]');
        process.exit(1);
    }

    try {
        const result = await postTweet(text, { replyTo, imagePath });
        const tweetId = result.data?.id;
        console.log(`Posted successfully. Tweet ID: ${tweetId}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
