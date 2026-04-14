import { readFileSync } from 'fs';
import { resolve } from 'path';
import { postTweet } from './post_official.js';

function normalizeNewlines(text) {
    return text.replace(/\r\n/g, '\n');
}

function extractRecommendedThread(markdown) {
    const normalized = normalizeNewlines(markdown);
    const start = normalized.indexOf('## Recommended Thread');
    if (start === -1) {
        throw new Error('Missing "## Recommended Thread" section.');
    }

    const rest = normalized.slice(start + '## Recommended Thread'.length);
    const nextHeading = rest.search(/\n##\s+/);
    return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

export function parseThreadDraft(markdown) {
    const section = extractRecommendedThread(markdown);
    const matches = [...section.matchAll(/^### Post (\d+)\s*$/gm)];
    if (matches.length === 0) {
        throw new Error('No "### Post N" sections found under "## Recommended Thread".');
    }

    const posts = [];
    for (let i = 0; i < matches.length; i++) {
        const number = Number(matches[i][1]);
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : section.length;
        const text = section.slice(start, end).trim();
        posts.push({ number, text });
    }
    return posts;
}

export function validateThreadPosts(posts) {
    const errors = [];
    const warnings = [];

    if (posts.length === 0) {
        errors.push('Thread has no posts.');
        return { errors, warnings };
    }

    posts.forEach((post, index) => {
        if (post.number !== index + 1) {
            errors.push(`Post numbering is not consecutive at Post ${post.number}; expected Post ${index + 1}.`);
        }
        if (!post.text.trim()) {
            errors.push(`Post ${post.number} is empty.`);
        }
        if (post.text.includes('\\n')) {
            errors.push(`Post ${post.number} contains literal "\\n" text; use real line breaks in the markdown draft.`);
        }
        if (post.text.length > 280) {
            errors.push(`Post ${post.number} is ${post.text.length} characters; X limit is 280.`);
        }
    });

    const postsWithLinks = posts.filter((post) => /https?:\/\//.test(post.text));
    for (const post of postsWithLinks) {
        if (post.number !== posts.length) {
            warnings.push(`Post ${post.number} contains a link before the final post.`);
        }
    }

    return { errors, warnings };
}

export function loadAndValidateThreadDraft(filePath) {
    const absolutePath = resolve(filePath);
    const markdown = readFileSync(absolutePath, 'utf8');
    const posts = parseThreadDraft(markdown);
    const validation = validateThreadPosts(posts);
    return { absolutePath, posts, ...validation };
}

export async function postThreadPosts(posts) {
    let replyTo = null;
    const ids = [];

    for (const post of posts) {
        const result = await postTweet(post.text, replyTo ? { replyTo } : {});
        const id = result.data?.id;
        if (!id) {
            throw new Error(`Missing tweet ID while posting Post ${post.number}.`);
        }
        ids.push(id);
        replyTo = id;
    }

    return ids;
}
