#!/usr/bin/env node

import { Command } from 'commander';
import { XClient } from './client.js';

const program = new Command();

program
    .name('xbot')
    .description('Stealth X/Twitter CLI for posting and fetching (100% Browserless)')
    .version('1.0.0');

program
    .command('post <text>')
    .description('Post a new tweet')
    .action(async (text) => {
        const client = new XClient();
        try {
            // TODO: client.post(text) via HTTP
            process.exit(0);
        } catch (e) {
            console.error(e);
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
            console.error(e);
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
            console.error(e);
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
            console.error(e);
            process.exit(1);
        }
    });

program
    .command('me')
    .description('Show current authenticated user info')
    .action(async () => {
        const client = new XClient();
        try {
            const res = await client.fetchGraphQL('HomeTimeline', { count: 1 });
            if (res) console.log("Session is VALID (Direct HTTP).");
        } catch (e) {
            console.error("Session check failed:", e.message);
            process.exit(1);
        }
    });

program.parse();
