import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { uploadVideoMedia } from '../src/post_official.js';

const credentials = {
    apiKey: 'key',
    apiSecret: 'secret',
    accessToken: 'token',
    accessTokenSecret: 'token-secret',
};

test('chunked video upload initializes, appends each range, and finalizes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xbot-video-'));
    const videoPath = join(directory, 'clip.mp4');
    writeFileSync(videoPath, Buffer.alloc(10));
    const originalFetch = globalThis.fetch;
    const commands = [];
    globalThis.fetch = async (_url, options) => {
        const command = options.body.get('command');
        commands.push(command);
        if (command === 'INIT') {
            assert.equal(options.body.get('total_bytes'), '10');
            assert.equal(options.body.get('media_category'), 'tweet_video');
            return new Response(JSON.stringify({ media_id_string: '123' }), { status: 200 });
        }
        if (command === 'APPEND') return new Response('', { status: 200 });
        if (command === 'FINALIZE') {
            return new Response(JSON.stringify({ processing_info: { state: 'succeeded' } }), { status: 200 });
        }
        throw new Error(`Unexpected command: ${command}`);
    };

    try {
        const mediaId = await uploadVideoMedia(videoPath, credentials, { chunkBytes: 4 });
        assert.equal(mediaId, '123');
        assert.deepEqual(commands, ['INIT', 'APPEND', 'APPEND', 'APPEND', 'FINALIZE']);
    } finally {
        globalThis.fetch = originalFetch;
        rmSync(directory, { recursive: true, force: true });
    }
});

test('video upload rejects unsupported local formats before network access', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xbot-video-'));
    const videoPath = join(directory, 'clip.mkv');
    writeFileSync(videoPath, Buffer.from('not-media'));
    try {
        await assert.rejects(
            uploadVideoMedia(videoPath, credentials),
            /supports MP4 or MOV/,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
