export function normalizeSearchQuery(query, options = {}) {
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
