#!/usr/bin/env node

import { Command } from 'commander';
import { XClient } from './client.js';
import { postTweet } from './post_official.js';
import { getEnv } from './credentials.js';
import { loadAndValidateThreadDraft, postThreadPosts } from './thread_draft.js';

const program = new Command();

program
    .name('xbot')
    .description('X/Twitter CLI — official API posting, GraphQL reading')
    .version('1.0.0');

program
    .command('post <text>')
    .description('Post a tweet via the official API (Option 1)')
    .option('-r, --reply-to <tweet_id>', 'Reply to a tweet ID')
    .action(async (text, options) => {
        try {
            const result = await postTweet(text, { replyTo: options.replyTo });
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

program.parse();
