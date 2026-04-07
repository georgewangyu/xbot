export function parseTweet(entry) {
    const result = entry.content?.itemContent?.tweet_results?.result;
    if (!result) return null;

    const legacy = result.legacy || result.tweet?.legacy;
    if (!legacy) return null;

    const user = result.core?.user_results?.result?.legacy || result.tweet?.core?.user_results?.result?.legacy;

    return {
        id: legacy.id_str,
        text: legacy.full_text,
        author: user ? `@${user.screen_name}` : 'unknown',
        authorName: user ? user.name : 'Unknown',
        createdAt: legacy.created_at,
        likes: legacy.favorite_count,
        retweets: legacy.retweet_count,
        replies: legacy.reply_count
    };
}

export function extractTweets(data) {
    const instructions = data.data?.home?.home_timeline_urt?.instructions || 
                         data.data?.bookmark_timeline_v2?.timeline?.instructions ||
                         data.data?.user_result?.result?.timeline_v2?.timeline?.instructions || [];

    const tweets = [];
    for (const inst of instructions) {
        if (inst.type === 'TimelineAddEntries') {
            for (const entry of inst.entries) {
                const tweet = parseTweet(entry);
                if (tweet) tweets.push(tweet);
            }
        }
    }
    return tweets;
}
