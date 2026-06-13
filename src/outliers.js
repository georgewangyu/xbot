export function rankOutlierTweets(tweets, options = {}) {
    const maxFollowers = options.maxFollowers ?? 50_000;
    const minEngagement = options.minEngagement ?? 8;
    const minViews = options.minViews ?? 250;
    const minViewsPerFollower = options.minViewsPerFollower ?? 0.5;

    return tweets
        .map((tweet) => scoreTweet(tweet))
        .filter((tweet) => {
            const followers = tweet.authorFollowers;
            if (followers !== null && followers !== undefined && followers > maxFollowers) return false;
            const viewsBreakout = (tweet.views ?? 0) >= minViews && (tweet.viewsPerFollower ?? 0) >= minViewsPerFollower;
            return tweet.engagementTotal >= minEngagement || viewsBreakout;
        })
        .sort((a, b) => b.outlierScore - a.outlierScore);
}

export function scoreTweet(tweet) {
    const followers = positive(tweet.authorFollowers);
    const engagement = positive(tweet.engagementTotal);
    const views = positive(tweet.views);
    const engagementPerFollower = followers ? engagement / followers : null;
    const viewsPerFollower = followers && views ? views / followers : null;

    const lowFollowerBonus = followers ? Math.max(0, Math.log10(50_000 / Math.max(followers, 1))) * 8 : 0;
    const viewsScore = viewsPerFollower === null ? 0 : Math.min(80, viewsPerFollower * 20);
    const engagementScore = engagementPerFollower === null ? 0 : Math.min(120, engagementPerFollower * 1200);
    const rawEngagementScore = Math.min(35, Math.log10(engagement + 1) * 12);
    const recencyScore = recencyBonus(tweet.createdAt);
    const outlierScore = round1(viewsScore + engagementScore + rawEngagementScore + lowFollowerBonus + recencyScore);

    return {
        ...tweet,
        engagementPerFollower,
        viewsPerFollower,
        outlierScore,
        hook: extractHook(tweet.text)
    };
}

export function formatRows(tweets, limit = 20) {
    return tweets.slice(0, limit).map((tweet) => ({
        score: tweet.outlierScore,
        vpf: tweet.viewsPerFollower === null ? '-' : round2(tweet.viewsPerFollower),
        epf: tweet.engagementPerFollower === null ? '-' : round4(tweet.engagementPerFollower),
        followers: formatNumber(tweet.authorFollowers),
        engagement: formatNumber(tweet.engagementTotal),
        views: formatNumber(tweet.views),
        author: tweet.author ? `@${tweet.author}` : '-',
        hook: tweet.hook,
        url: tweet.url
    }));
}

export function printTable(rows) {
    const headers = ['score', 'vpf', 'epf', 'followers', 'engagement', 'views', 'author', 'hook', 'url'];
    const widths = {
        score: 6,
        vpf: 7,
        epf: 8,
        followers: 10,
        engagement: 10,
        views: 10,
        author: 18,
        hook: 72,
        url: 45
    };

    console.log(headers.map((header) => pad(header, widths[header])).join('  '));
    console.log(headers.map((header) => '-'.repeat(widths[header])).join('  '));
    for (const row of rows) {
        console.log(headers.map((header) => pad(row[header], widths[header])).join('  '));
    }
}

export function dedupeTweets(tweets) {
    const seen = new Set();
    const deduped = [];
    for (const tweet of tweets) {
        if (!tweet.id || seen.has(tweet.id)) continue;
        seen.add(tweet.id);
        deduped.push(tweet);
    }
    return deduped;
}

function extractHook(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    const firstSentence = normalized.match(/^(.{20,220}?[.!?])\s/)?.[1];
    return truncate(firstSentence || normalized, 140);
}

function recencyBonus(createdAt) {
    const created = Date.parse(createdAt || '');
    if (!Number.isFinite(created)) return 0;
    const ageHours = Math.max((Date.now() - created) / 36e5, 0);
    if (ageHours <= 24) return 10;
    if (ageHours <= 72) return 6;
    if (ageHours <= 168) return 3;
    return 0;
}

function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function round1(value) {
    return Number(value.toFixed(1));
}

function round2(value) {
    return Number(value.toFixed(2));
}

function round4(value) {
    return Number(value.toFixed(4));
}

function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return number.toLocaleString();
}

function pad(value, width) {
    const text = truncate(String(value ?? '-').replace(/\s+/g, ' '), width);
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function truncate(text, width) {
    if (text.length <= width) return text;
    if (width <= 3) return text.slice(0, width);
    return text.slice(0, width - 3).trimEnd() + '...';
}
