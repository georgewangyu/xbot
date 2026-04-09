import { randomBytes, randomUUID } from 'node:crypto';
import { loadCookieCredentials } from './credentials.js';

export class XClient {
    constructor(options = {}) {
        this.options = options;
        this.clientUuid = randomUUID();
        this.clientDeviceId = randomUUID();
        this.queryIds = {
            'HomeTimeline': 'edseUwk9sP5Phz__9TIRnA',
            'HomeLatestTimeline': 'iOEZpOdfekFsxSlPQCQtPg',
            'UserTweets': 'Wms1GvIiHXAPBaCr9KblaA',
            'UserByScreenName': 'IGgvgiOx4QZndDHuD3x9TQ',
            'TweetDetail': '_NvJCnIjOW__EP5-RF197A',
            'SearchTimeline': '6AAys3t42mosm_yTI_QENg',
            'Bookmarks': 'RV1g3b8n_SGOHwkqKYSCFw',
            'FavoriteTweet': 'lI07N6Otwv1PhnEgXILM7A'
        };
    }

    createTransactionId() {
        return randomBytes(16).toString('hex');
    }

    async fetchGraphQL(operation, variables = {}, features = {}) {
        const queryId = this.queryIds[operation];
        if (!queryId) throw new Error(`Unknown operation: ${operation}`);

        const defaultFeatures = {
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            communities_web_enable_tweet_community_results_fetch: true,
            c9s_tweet_anatomy_moderator_badge_enabled: true,
            articles_preview_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            responsive_web_twitter_article_tweet_consumption_enabled: true,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
            longform_notetweets_rich_text_read_enabled: true,
            longform_notetweets_inline_media_enabled: true,
            responsive_web_enhance_cards_enabled: false
        };

        const finalFeatures = { ...defaultFeatures, ...features };
        const params = new URLSearchParams({
            variables: JSON.stringify(variables),
            features: JSON.stringify(finalFeatures)
        });

        const url = `https://x.com/i/api/graphql/${queryId}/${operation}?${params.toString()}`;
        const { authToken, ct0 } = loadCookieCredentials();

        if (!authToken || !ct0) {
            throw new Error('Missing AUTH_TOKEN or CT0. Set them in georgerepo/.tokens/x-twitter.env or shell environment.');
        }

        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
            'Cookie': `auth_token=${authToken}; ct0=${ct0}`,
            'x-csrf-token': ct0,
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': 'en',
            'x-client-uuid': this.clientUuid,
            'x-twitter-client-deviceid': this.clientDeviceId,
            'x-client-transaction-id': this.createTransactionId(),
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            'origin': 'https://x.com',
            'referer': 'https://x.com/'
        };

        const res = await fetch(url, { headers });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`X API Error ${res.status}: ${text.slice(0, 200)}`);
        }
        return await res.json();
    }

    // Returns { tweets, nextCursor }
    parseTweets(instructions) {
        const tweets = [];
        const seen = new Set();
        let nextCursor = null;

        const collectResults = (entry) => {
            // Extract bottom cursor
            const content = entry.content;
            if (content?.entryType === 'TimelineTimelineCursor' && content?.cursorType === 'Bottom') {
                nextCursor = content.value;
                return [];
            }

            const results = [];
            const push = (res) => { if (res?.rest_id) results.push(res); };

            push(content?.itemContent?.tweet_results?.result);
            push(content?.item?.itemContent?.tweet_results?.result);

            for (const item of content?.items ?? []) {
                push(item?.item?.itemContent?.tweet_results?.result);
                push(item?.itemContent?.tweet_results?.result);
                push(item?.content?.itemContent?.tweet_results?.result);
            }
            return results;
        };

        for (const instruction of instructions ?? []) {
            if (instruction.type !== 'TimelineAddEntries' && instruction.type !== 'TimelinePinEntry') continue;

            const entries = instruction.entry ? [instruction.entry] : instruction.entries;
            for (const entry of entries ?? []) {
                const results = collectResults(entry);
                for (const result of results) {
                    const tweet = result.tweet || result;
                    const legacy = tweet.legacy;
                    if (!legacy || seen.has(tweet.rest_id)) continue;

                    seen.add(tweet.rest_id);

                    let text = legacy.full_text;
                    const note = tweet.note_tweet?.note_tweet_results?.result;
                    if (note?.text) text = note.text;

                    const core = tweet.core || result.core;
                    const userResult = core?.user_results?.result;
                    const userLegacy = userResult?.legacy || userResult?.core;

                    tweets.push({
                        id: tweet.rest_id,
                        text,
                        author: userLegacy?.screen_name,
                        authorName: userLegacy?.name,
                        createdAt: legacy.created_at,
                        likes: legacy.favorite_count,
                        retweets: legacy.retweet_count,
                        replies: legacy.reply_count,
                        quotes: legacy.quote_count
                    });
                }
            }
        }
        return { tweets, nextCursor };
    }

    async getHomeTimeline(count = 20) {
        const allTweets = [];
        let cursor = undefined;

        while (allTweets.length < count) {
            const vars = {
                count: Math.min(count - allTweets.length, 40),
                includePromotedContent: true,
                latestControlAvailable: true,
                requestContext: 'launch',
                withCommunity: true
            };
            if (cursor) vars.cursor = cursor;

            const res = await this.fetchGraphQL('HomeTimeline', vars);
            const instructions = res?.data?.home?.home_timeline_urt?.instructions;
            const { tweets, nextCursor } = this.parseTweets(instructions);
            allTweets.push(...tweets);

            if (!nextCursor || tweets.length === 0) break;
            cursor = nextCursor;
        }

        return allTweets.slice(0, count);
    }

    async getHomeLatestTimeline(count = 20) {
        const allTweets = [];
        let cursor = undefined;

        while (allTweets.length < count) {
            const vars = {
                count: Math.min(count - allTweets.length, 40),
                includePromotedContent: true,
                latestControlAvailable: true,
                requestContext: 'launch',
                withCommunity: true
            };
            if (cursor) vars.cursor = cursor;

            const res = await this.fetchGraphQL('HomeLatestTimeline', vars);
            const instructions = res?.data?.home?.home_timeline_urt?.instructions;
            const { tweets, nextCursor } = this.parseTweets(instructions);
            allTweets.push(...tweets);

            if (!nextCursor || tweets.length === 0) break;
            cursor = nextCursor;
        }

        return allTweets.slice(0, count);
    }

    async getUserByScreenName(screenName) {
        const res = await this.fetchGraphQL('UserByScreenName', {
            screen_name: screenName,
            withGrokTranslatedBio: false
        });
        const user = res?.data?.user?.result;
        if (!user || user.__typename === 'UserUnavailable') return null;

        const legacy = user.legacy;
        return {
            id: user.rest_id,
            username: legacy.screen_name,
            name: legacy.name,
            description: legacy.description,
            followersCount: legacy.followers_count,
            followingCount: legacy.friends_count,
            location: legacy.location
        };
    }

    async getUserTweets(userId, count = 20) {
        const allTweets = [];
        let cursor = undefined;

        while (allTweets.length < count) {
            const vars = {
                userId,
                count: Math.min(count - allTweets.length, 40),
                includePromotedContent: false,
                withQuickPromoteEligibilityTweetFields: true,
                withVoice: true,
                withV2Timeline: true
            };
            if (cursor) vars.cursor = cursor;

            const res = await this.fetchGraphQL('UserTweets', vars);
            const instructions = res?.data?.user?.result?.timeline_v2?.timeline?.instructions
                               || res?.data?.user?.result?.timeline?.timeline?.instructions;
            const { tweets, nextCursor } = this.parseTweets(instructions);
            allTweets.push(...tweets);

            if (!nextCursor || tweets.length === 0) break;
            cursor = nextCursor;
        }

        return allTweets.slice(0, count);
    }
}
