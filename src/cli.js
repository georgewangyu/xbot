import { Command } from 'commander';
import { XClient } from './client.js';
import { extractTweets } from './utils.js';
import kleur from 'kleur';

const program = new Command();

program
    .name('bird-native')
    .description('Native X/Twitter CLI agent')
    .version('1.0.0')
    .option('-p, --profile <name>', 'Chrome profile name', 'Default')
    .option('--headless', 'Run in headless mode', true)
    .option('--json', 'Output in JSON format (default)', true);

async function runCommand(fn) {
    const options = program.opts();
    const client = new XClient({
        profile: options.profile,
        headless: options.headless === 'true' || options.headless === true
    });
    try {
        await client.init();
    } catch (e) {
        if (process.env.AUTH_TOKEN && process.env.CT0) {
            console.warn(kleur.yellow('Notice: Chrome profile locked/unavailable. Falling back to browserless (token-only) mode.'));
        } else {
            console.error(kleur.red(`Error: Could not launch browser and no manual tokens found. (${e.message})`));
            process.exit(1);
        }
    }

    try {
        await fn(client);
    } catch (e) {
        console.error(kleur.red(`Error: ${e.message}`));
        process.exit(1);
    } finally {
        await client.close();
    }
}

program
    .command('whoami')
    .description('Check authentication status')
    .action(() => runCommand(async (client) => {
        await client.page.goto('https://x.com/home');
        const handle = await client.page.evaluate(() => {
            return document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"]')?.innerText || 'Not logged in';
        });
        console.log(`Authenticated as: ${kleur.green(handle.replace('\n', ' '))}`);
    }));

program
    .command('home')
    .description('Fetch Home timeline')
    .option('-c, --count <number>', 'Number of tweets', 20)
    .action((opts) => runCommand(async (client) => {
        const data = await client.fetchGraphQL('HomeTimeline', {
            count: parseInt(opts.count),
            includePromotedContent: true,
            latestControlAvailable: true,
            requestContext: 'launch'
        }, {
            responsive_web_graphql_timeline_navigation_enabled: true
        });
        const tweets = extractTweets(data);
        console.log(JSON.stringify(tweets, null, 2));
    }));

program
    .command('bookmarks')
    .description('Fetch Bookmarks')
    .option('-c, --count <number>', 'Number of tweets', 20)
    .action((opts) => runCommand(async (client) => {
        const data = await client.fetchGraphQL('Bookmarks', {
            count: parseInt(opts.count)
        }, {
            responsive_web_graphql_timeline_navigation_enabled: true
        });
        const tweets = extractTweets(data);
        console.log(JSON.stringify(tweets, null, 2));
    }));

program
    .command('post <text>')
    .description('Post a new tweet')
    .action((text) => runCommand(async (client) => {
        console.log(kleur.cyan(`Posting: "${text}"...`));
        await client.page.goto('https://x.com/compose/post');
        await client.page.waitForSelector('[data-testid="tweetTextarea_0"]');
        await client.page.fill('[data-testid="tweetTextarea_0"]', text);
        await client.page.click('[data-testid="tweetButtonInline"]');
        console.log(kleur.green('Successfully posted!'));
    }));

program.parse();
