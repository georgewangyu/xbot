#!/usr/bin/env node

import { Command } from 'commander';
import { XClient } from './client.js';
import { postTweet } from './post_official.js';
import { getEnv, loadApiCredentials, loadCookieCredentials, resolvedEnvPaths } from './credentials.js';
import { loadAndValidateThreadDraft, postThreadPosts } from './thread_draft.js';
import { dedupeTweets, formatRows, printTable, rankOutlierTweets } from './outliers.js';
import { normalizeSearchQuery } from './search_query.js';

const program = new Command();

program
    .name('xbot')
    .description('X/Twitter CLI — official API posting, GraphQL reading')
    .version('1.0.0');

program
    .command('env')
    .description('Show the currently resolved non-secret configuration')
    .action(() => {
        const api = loadApiCredentials();
        const cookies = loadCookieCredentials();
        const paths = resolvedEnvPaths();
        console.log(JSON.stringify({
            hasApiKey: Boolean(api.apiKey),
            hasApiSecret: Boolean(api.apiSecret),
            hasAccessToken: Boolean(api.accessToken),
            hasAccessTokenSecret: Boolean(api.accessTokenSecret),
            hasAuthToken: Boolean(cookies.authToken),
            hasCt0: Boolean(cookies.ct0),
            hasMyHandle: Boolean(getEnv('MY_HANDLE')),
            localEnvPath: paths.localEnvPath,
            privateEnvPath: paths.privateEnvPath,
            overrideEnvPath: paths.overrideEnvPath || null
        }, null, 2));
    });

program
    .command('post <text>')
    .description('Post a tweet via the official API (Option 1)')
    .option('-r, --reply-to <tweet_id>', 'Reply to a tweet ID')
    .option('-i, --image <path>', 'Attach a local image file to the tweet')
    .action(async (text, options) => {
        try {
            const result = await postTweet(text, {
                replyTo: options.replyTo,
                imagePath: options.image,
            });
            const tweetId = result.data?.id;
            console.log(`Posted successfully. Tweet ID: ${tweetId}`);
            process.exit(0);
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('thread-validate <file>')
    .description('Validate a markdown thread draft before posting')
    .action((file) => {
        try {
            const result = loadAndValidateThreadDraft(file);
            console.log(`Validated: ${result.absolutePath}`);
            console.log(`Posts: ${result.posts.length}`);
            result.posts.forEach((post) => console.log(`- Post ${post.number}: ${post.text.length} chars`));

            if (result.warnings.length > 0) {
                console.log('\nWarnings:');
                result.warnings.forEach((warning) => console.log(`- ${warning}`));
            }

            if (result.errors.length > 0) {
                console.error('\nErrors:');
                result.errors.forEach((error) => console.error(`- ${error}`));
                process.exit(1);
            }

            console.log('\nValidation passed.');
            process.exit(0);
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('thread-post <file>')
    .description('Validate and post a markdown thread draft')
    .action(async (file) => {
        try {
            const result = loadAndValidateThreadDraft(file);

            if (result.warnings.length > 0) {
                console.log('Warnings:');
                result.warnings.forEach((warning) => console.log(`- ${warning}`));
            }

            if (result.errors.length > 0) {
                console.error('Validation failed:');
                result.errors.forEach((error) => console.error(`- ${error}`));
                process.exit(1);
            }

            const ids = await postThreadPosts(result.posts);
            console.log('Thread posted successfully.');
            console.log(ids.join(' -> '));
            process.exit(0);
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('user <handle>')
    .description('Fetch user tweets')
    .option('-c, --count <number>', 'Number of tweets to fetch', '20')
    .action(async (handle, options) => {
        const client = new XClient();
        try {
            const user = await client.getUserByScreenName(handle);
            if (!user) {
                console.error(`User not found: ${handle}`);
                process.exit(1);
            }

            console.log(`User: ${user.name} (@${user.username})`);
            const tweets = await client.getUserTweets(user.id, parseInt(options.count));
            console.log(JSON.stringify(tweets, null, 2));
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('home')
    .description('Fetch "For You" timeline')
    .option('-c, --count <number>', 'Number of tweets to fetch', '20')
    .action(async (options) => {
        const client = new XClient();
        try {
            const tweets = await client.getHomeTimeline(parseInt(options.count));
            console.log(JSON.stringify(tweets, null, 2));
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('latest')
    .description('Fetch "Following" timeline')
    .option('-c, --count <number>', 'Number of tweets to fetch', '20')
    .action(async (options) => {
        const client = new XClient();
        try {
            const tweets = await client.getHomeLatestTimeline(parseInt(options.count));
            console.log(JSON.stringify(tweets, null, 2));
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('me')
    .description('Validate session and show account info (set MY_HANDLE in env for profile)')
    .action(async () => {
        const client = new XClient();
        try {
            // Validate session with a minimal timeline fetch
            await client.fetchGraphQL('HomeTimeline', {
                count: 1,
                includePromotedContent: false,
                latestControlAvailable: true,
                requestContext: 'launch',
                withCommunity: false
            });
            console.log('Session: VALID');

            const handle = getEnv('MY_HANDLE');
            if (handle) {
                const user = await client.getUserByScreenName(handle);
                if (user) {
                    console.log(`Account : @${user.username} (${user.name})`);
                    console.log(`Followers: ${user.followersCount}  Following: ${user.followingCount}`);
                    if (user.location) console.log(`Location : ${user.location}`);
                    if (user.description) console.log(`Bio      : ${user.description}`);
                }
            } else {
                console.log('Tip: set MY_HANDLE=yourusername in x-twitter.env to see profile info.');
            }
        } catch (e) {
            console.error(`Session check failed: ${e.message}`);
            process.exit(1);
        }
    });

program
    .command('outliers')
    .description('Search X through the cookie/session GraphQL path and rank post outliers')
    .option('-q, --query <query>', 'Search query; repeat for multiple queries', collect, [])
    .option('--queries <csv>', 'Comma-separated search queries')
    .option('-c, --count <number>', 'Tweets to fetch per query', parseInteger, 25)
    .option('--limit <number>', 'Rows to print after ranking', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum author follower count', parseInteger, 50000)
    .option('--min-engagement <number>', 'Minimum engagement unless views are present', parseInteger, 8)
    .option('--min-views <number>', 'Minimum views for a views-per-follower breakout', parseInteger, 250)
    .option('--min-views-per-follower <number>', 'Minimum views/follower ratio for a views breakout', parseNumber, 0.5)
    .option('--search-min-likes <number>', 'Add an X search min_faves operator unless already present; may be rejected by X v2 search', parseInteger, 0)
    .option('--include-replies', 'Include replies in search results')
    .option('--format <format>', 'Output format: table or json', 'table')
    .action(async (options) => {
        const queries = normalizeQueries(options);
        if (queries.length === 0) {
            console.error('Error: pass at least one --query or --queries value.');
            process.exit(1);
        }

        try {
            const allTweets = [];
            const client = new XClient();
            for (const query of queries) {
                const normalizedQuery = normalizeSearchQuery(query, {
                    searchMinLikes: options.searchMinLikes,
                    includeReplies: options.includeReplies
                });
                const tweets = await client.searchTweets(normalizedQuery, options.count);
                allTweets.push(...tweets.map((tweet) => ({ ...tweet, query })));
            }

            const ranked = rankOutlierTweets(dedupeTweets(allTweets), {
                maxFollowers: options.maxFollowers,
                minEngagement: options.minEngagement,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower
            });

            if (options.format === 'json') {
                console.log(JSON.stringify(ranked.slice(0, options.limit), null, 2));
            } else {
                printTable(formatRows(ranked, options.limit));
            }
        } catch (e) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program.parse();

function collect(value, previous) {
    previous.push(value);
    return previous;
}

function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

function parseNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

function normalizeQueries(options) {
    const values = [...(options.query || [])];
    if (options.queries) {
        values.push(...options.queries.split(','));
    }
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
