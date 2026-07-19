import { randomBytes, randomUUID } from 'node:crypto';
import { loadCookieCredentials } from './credentials.js';

export class XClient {
    constructor(options = {}) {
        this.options = options;
        this.fetchImpl = options.fetchImpl || fetch;
        this.clientUuid = randomUUID();
        this.clientDeviceId = randomUUID();
        this.queryIds = {
            'HomeTimeline': 'edseUwk9sP5Phz__9TIRnA',
            'HomeLatestTimeline': 'iOEZpOdfekFsxSlPQCQtPg',
            'UserTweets': 'Wms1GvIiHXAPBaCr9KblaA',
            'UserByScreenName': 'IGgvgiOx4QZndDHuD3x9TQ',
            'TweetDetail': '_NvJCnIjOW__EP5-RF197A',
            'Bookmarks': 'RV1g3b8n_SGOHwkqKYSCFw',
            'FavoriteTweet': 'lI07N6Otwv1PhnEgXILM7A'
        };
        this.searchTimelineQueryIds = [
            '6AAys3t42mosm_yTI_QENg',
            'M1jEez78PEfVfbQLvlWMvQ',
            '5h0kNbk3ii97rmfY6CdgAA',
            'Tp1sewRU1AsZpBWhqCZicQ'
        ];
    }

    createTransactionId() {
        return randomBytes(16).toString('hex');
    }

    async fetchGraphQL(operation, variables = {}, features = {}) {
        const queryId = this.queryIds[operation];
        if (!queryId) throw new Error(`Unknown operation: ${operation}`);

        const defaultFeatures = this.getDefaultFeatures();

        const finalFeatures = { ...defaultFeatures, ...features };
        const params = new URLSearchParams({
            variables: JSON.stringify(variables),
            features: JSON.stringify(finalFeatures)
        });

        const url = `https://x.com/i/api/graphql/${queryId}/${operation}?${params.toString()}`;
        const headers = this.getSessionHeaders();

        const res = await this.fetchImpl(url, { headers });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`X API Error ${res.status}: ${text.slice(0, 200)}`);
        }
        return await res.json();
    }

    getDefaultFeatures() {
        return {
            rweb_video_screen_enabled: true,
            profile_label_improvements_pcf_label_in_post_enabled: true,
            responsive_web_profile_redirect_enabled: true,
            rweb_tipjar_consumption_enabled: true,
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
    }

    getSessionHeaders() {
        const { authToken, ct0 } = this.options.cookies || loadCookieCredentials();

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
            'content-type': 'application/json',
            'origin': 'https://x.com',
            'referer': 'https://x.com/'
        };
        return headers;
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
            const push = (res) => {
                if (res?.rest_id || res?.tweet?.rest_id) results.push(res);
            };

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
                    const userLegacy = userResult?.legacy || {};
                    const userCore = userResult?.core || {};
                    const author = userLegacy.screen_name || userCore.screen_name;
                    const views = numberOrNull(tweet.views?.count ?? tweet.views?.view_count ?? legacy.views);
                    const followers = numberOrNull(userLegacy.followers_count ?? userCore.followers_count);
                    const engagementTotal = [
                        legacy.favorite_count,
                        legacy.retweet_count,
                        legacy.reply_count,
                        legacy.quote_count
                    ].reduce((sum, value) => sum + numberOrZero(value), 0);

                    tweets.push({
                        id: tweet.rest_id,
                        text,
                        author,
                        authorName: userLegacy.name || userCore.name,
                        authorFollowers: followers,
                        createdAt: legacy.created_at,
                        likes: legacy.favorite_count,
                        retweets: legacy.retweet_count,
                        replies: legacy.reply_count,
                        quotes: legacy.quote_count,
                        views,
                        engagementTotal,
                        url: author && tweet.rest_id ? `https://x.com/${author}/status/${tweet.rest_id}` : null
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

    async searchTweets(query, count = 25) {
        const limit = Math.max(1, Math.floor(Number(count) || 25));
        const allTweets = [];
        const seen = new Set();
        let cursor;

        while (allTweets.length < limit) {
            const pageCount = Math.min(20, limit - allTweets.length);
            const page = await this.fetchSearchPage(query, pageCount, cursor);
            const instructions = page?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
            const { tweets, nextCursor } = this.parseTweets(instructions);
            let added = 0;

            for (const tweet of tweets) {
                if (!tweet.id || seen.has(tweet.id)) continue;
                seen.add(tweet.id);
                allTweets.push(tweet);
                added += 1;
                if (allTweets.length >= limit) break;
            }

            if (!nextCursor || nextCursor === cursor || tweets.length === 0 || added === 0) break;
            cursor = nextCursor;
        }

        return allTweets.slice(0, limit);
    }

    async fetchSearchPage(query, count, cursor) {
        const variables = {
            rawQuery: String(query || '').trim(),
            count,
            querySource: 'typed_query',
            product: 'Latest',
            ...(cursor ? { cursor } : {})
        };
        if (!variables.rawQuery) throw new Error('Search query is required.');

        const params = new URLSearchParams({ variables: JSON.stringify(variables) });
        const headers = this.getSessionHeaders();
        const features = this.getDefaultFeatures();
        const errors = [];

        for (const queryId of this.searchTimelineQueryIds) {
            const url = `https://x.com/i/api/graphql/${queryId}/SearchTimeline?${params.toString()}`;
            const response = await this.fetchImpl(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ features, queryId })
            });

            if (!response.ok) {
                const detail = await response.text();
                errors.push(`${queryId}: HTTP ${response.status} ${detail.slice(0, 120)}`);
                if ([400, 404, 422].includes(response.status)) continue;
                throw new Error(`Session search failed: ${errors.at(-1)}`);
            }

            const data = await response.json();
            if (data.errors?.length) {
                errors.push(`${queryId}: ${data.errors.map((error) => error.message).join('; ')}`);
                continue;
            }
            return data;
        }

        throw new Error(`Session search failed for all known Bird-style query IDs. ${errors.join(' | ')}`);
    }

}

function numberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
    return numberOrNull(value) ?? 0;
}
