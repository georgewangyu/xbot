import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { discoverQueryIds } from './discovery.js';

chromium.use(stealthPlugin());

export class XClient {
    constructor(options = {}) {
        this.options = options;
        this.browser = null;
        this.context = null;
        this.page = null;
        this.queryIds = {
            'HomeTimeline': 'edseUwk9sP5Phz__9TIRnA',
            'Bookmarks': '7_9NCCl3YMa9S9fJpL_T7A',
            'CreateTweet': 'PAt9U0nId7pIdLbhH5AQLQ',
            'FavoriteTweet': 'lI07N6O6_mC7_6Uf17uW2w'
        };
    }

    async init() {
        // Use your actual Chrome profile to bypass detection and reuse credentials
        const userDataDir = this.options.userDataDir || `/Users/gywang912/Library/Application Support/Google/Chrome`;
        const profile = this.options.profile || 'Default';

        this.context = await chromium.launchPersistentContext(userDataDir, {
            headless: this.options.headless !== false,
            channel: 'chrome',
            args: [
                '--disable-blink-features=AutomationControlled',
                `--profile-directory=${profile}`
            ]
        });

        this.page = await this.context.newPage();
        
        // Load Query IDs if not provided
        if (Object.keys(this.queryIds).length === 0) {
            this.queryIds = await discoverQueryIds(this.page);
        }
    }

    async close() {
        if (this.context) await this.context.close();
    }

    async getQueryId(operation) {
        return this.queryIds[operation];
    }

    async fetchGraphQL(operation, variables = {}, features = {}) {
        const queryId = await this.getQueryId(operation);
        
        // Fallback or override specific query IDs if discovery fails or gives 404s
        const overrides = {
            'HomeTimeline': 'edseUwk9sP5Phz__9TIRnA',
            'HomeLatestTimeline': 'iOEZpOdfekFsxSlPQCQtPg'
        };
        
        const finalQueryId = (overrides[operation] && !queryId) ? overrides[operation] : (queryId || overrides[operation]);
        if (!finalQueryId) throw new Error(`Unknown operation: ${operation}. You may need to refresh discovery.`);

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
            tweet_awards_web_tipping_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
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

        const url = `https://x.com/i/api/graphql/${finalQueryId}/${operation}?${params.toString()}`;

        // Attempt a BROWSERLESS fetch first (Original Bird logic)
        const authToken = process.env.AUTH_TOKEN || '';
        const ct0 = process.env.CT0 || '';

        // If we have tokens and NO active browser page, try standalone fetch
        if (!this.page && authToken && ct0) {
            const headers = {
                'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'Cookie': `auth_token=${authToken}; ct0=${ct0}`,
                'x-csrf-token': ct0,
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                'x-twitter-active-user': 'yes',
                'x-twitter-client-language': 'en'
            };

            const res = await fetch(url, { headers });
            if (res.ok) {
                return await res.json();
            }
            
            // If raw fetch fails with 401/403, we might need a browser
            console.log(`Standalone fetch failed (${res.status}). Attempting browser initialization...`);
        }

        // BROWSER FALLBACK: Reuse session from Chrome profile
        if (!this.page) {
            await this.init();
        }

        return await this.page.evaluate(async ({ fetchUrl }) => {
            const cookieAuth = document.cookie.match(/auth_token=([^;]+)/)?.[1];
            const cookieCt0 = document.cookie.match(/ct0=([^;]+)/)?.[1];
            
            const headers = {
                'x-twitter-active-user': 'yes',
                'x-twitter-client-language': 'en',
                'content-type': 'application/json',
                'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
            };

            if (cookieAuth) headers['Cookie'] = `auth_token=${cookieAuth}; ct0=${cookieCt0}`;
            if (cookieCt0) headers['x-csrf-token'] = cookieCt0;

            const res = await fetch(fetchUrl, { headers });
            if (!res.ok) throw new Error(`X API Error: ${res.status}`);
            return await res.json();
        }, { fetchUrl: url });
    }
}
