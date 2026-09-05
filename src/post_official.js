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
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'fs';
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

    const parsedUrl = new URL(url);
    const signatureParams = { ...oauthParams };
    for (const [key, value] of parsedUrl.searchParams.entries()) {
        signatureParams[key] = value;
    }
    const sortedKeys = Object.keys(signatureParams).sort();
    const paramString = sortedKeys
        .map((k) => `${percentEncode(k)}=${percentEncode(signatureParams[k])}`)
        .join('&');

    const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
    const baseString = `${method}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;

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

const MEDIA_UPLOAD_URL = 'https://upload.twitter.com/1.1/media/upload.json';
const DEFAULT_VIDEO_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_API_VIDEO_BYTES = 512 * 1024 * 1024;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseMediaResponse(response, label) {
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    if (!response.ok) {
        const detail = data.error || data.errors?.map((entry) => entry.message).join('; ') || raw || response.statusText;
        throw new Error(`${label} error ${response.status}: ${detail}`);
    }
    return data;
}

function validateVideoPath(videoPath) {
    if (!existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
    const mimeType = getMimeType(videoPath);
    if (!['video/mp4', 'video/quicktime'].includes(mimeType)) {
        throw new Error(`X video upload supports MP4 or MOV files, got: ${videoPath}`);
    }
    const size = statSync(videoPath).size;
    if (size <= 0) throw new Error(`Video file is empty: ${videoPath}`);
    if (size > MAX_API_VIDEO_BYTES) {
        throw new Error(`Video exceeds X API's 512 MiB upload limit (${size} bytes): ${videoPath}`);
    }
    return { mimeType, size };
}

async function mediaCommand(fields, creds, label) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    const response = await fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: buildOAuthHeader('POST', MEDIA_UPLOAD_URL, creds) },
        body,
    });
    return parseMediaResponse(response, label);
}

async function waitForVideoProcessing(mediaId, processingInfo, creds, { timeoutMs = 20 * 60 * 1000 } = {}) {
    let info = processingInfo;
    const deadline = Date.now() + timeoutMs;
    while (info && !['succeeded', 'failed'].includes(info.state)) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for X to process media ${mediaId}`);
        await sleep(Math.max(1, Number(info.check_after_secs) || 1) * 1000);
        const statusUrl = `${MEDIA_UPLOAD_URL}?command=STATUS&media_id=${encodeURIComponent(mediaId)}`;
        const response = await fetch(statusUrl, {
            headers: { Authorization: buildOAuthHeader('GET', statusUrl, creds) },
        });
        const data = await parseMediaResponse(response, 'Media STATUS');
        info = data.processing_info;
    }
    if (info?.state === 'failed') {
        throw new Error(`X media processing failed: ${info.error?.message || JSON.stringify(info.error || info)}`);
    }
}

export async function uploadVideoMedia(videoPath, creds, {
    chunkBytes = DEFAULT_VIDEO_CHUNK_BYTES,
    mediaCategory = 'tweet_video',
} = {}) {
    const { mimeType, size } = validateVideoPath(videoPath);
    const initialized = await mediaCommand({
        command: 'INIT',
        total_bytes: size,
        media_type: mimeType,
        media_category: mediaCategory,
    }, creds, 'Media INIT');
    const mediaId = initialized.media_id_string || initialized.media_id;
    if (!mediaId) throw new Error(`Media INIT succeeded without a media ID: ${JSON.stringify(initialized)}`);

    const handle = openSync(videoPath, 'r');
    try {
        let offset = 0;
        let segmentIndex = 0;
        while (offset < size) {
            const length = Math.min(chunkBytes, size - offset);
            const chunk = Buffer.allocUnsafe(length);
            const bytesRead = readSync(handle, chunk, 0, length, offset);
            if (bytesRead !== length) throw new Error(`Short read at byte ${offset}: expected ${length}, got ${bytesRead}`);
            const body = new FormData();
            body.append('command', 'APPEND');
            body.append('media_id', String(mediaId));
            body.append('segment_index', String(segmentIndex));
            body.append('media', new Blob([chunk], { type: 'application/octet-stream' }), `segment-${segmentIndex}.bin`);
            const response = await fetch(MEDIA_UPLOAD_URL, {
                method: 'POST',
                headers: { Authorization: buildOAuthHeader('POST', MEDIA_UPLOAD_URL, creds) },
                body,
            });
            await parseMediaResponse(response, `Media APPEND segment ${segmentIndex}`);
            offset += bytesRead;
            segmentIndex += 1;
        }
    } finally {
        closeSync(handle);
    }

    const finalized = await mediaCommand({ command: 'FINALIZE', media_id: mediaId }, creds, 'Media FINALIZE');
    await waitForVideoProcessing(String(mediaId), finalized.processing_info, creds);
    return String(mediaId);
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
        case '.mp4':
            return 'video/mp4';
        case '.mov':
            return 'video/quicktime';
        default:
            return 'application/octet-stream';
    }
}

async function uploadImageMedia(imagePath, creds) {
    if (!existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    const url = MEDIA_UPLOAD_URL;
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

    if (options.imagePath && options.videoPath) {
        throw new Error('Attach either an image or a video, not both.');
    }
    if (options.dryRun) {
        const media = options.videoPath ? validateVideoPath(options.videoPath) : null;
        return { dryRun: true, text, media };
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
    if (options.videoPath) {
        const mediaId = await uploadVideoMedia(options.videoPath, creds, {
            mediaCategory: options.mediaCategory,
        });
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
    let videoPath = null;
    let dryRun = false;
    const textParts = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--reply-to' && args[i + 1]) {
            replyTo = args[++i];
        } else if (args[i] === '--image' && args[i + 1]) {
            imagePath = args[++i];
        } else if (args[i] === '--video' && args[i + 1]) {
            videoPath = args[++i];
        } else if (args[i] === '--dry-run') {
            dryRun = true;
        } else {
            textParts.push(args[i]);
        }
    }

    return { text: textParts.join(' '), replyTo, imagePath, videoPath, dryRun };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const { text, replyTo, imagePath, videoPath, dryRun } = parseArgs(process.argv);

    if (!text) {
        console.error('Usage: node src/post_official.js "Tweet text" [--image <path> | --video <path>] [--reply-to <tweet_id>] [--dry-run]');
        process.exit(1);
    }

    try {
        const result = await postTweet(text, { replyTo, imagePath, videoPath, dryRun });
        if (result.dryRun) {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        }
        const tweetId = result.data?.id;
        console.log(`Posted successfully. Tweet ID: ${tweetId}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
