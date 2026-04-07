import { chromium } from 'playwright';
import { discoverQueryIds } from './src/discovery.js';

async function test() {
    console.log('Testing Native X Client Discovery...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        const ids = await discoverQueryIds(page);
        const count = Object.keys(ids).length;
        console.log(`\nSuccess! Discovered ${count} GraphQL Operations.`);
        
        const essential = ['HomeTimeline', 'Bookmarks', 'CreateTweet', 'FavoriteTweet'];
        console.log('\nChecking essential operations:');
        essential.forEach(op => {
            const status = ids[op] ? `[OK] ${ids[op]}` : '[MISSING]';
            console.log(`- ${op.padEnd(15)}: ${status}`);
        });
        
    } catch (e) {
        console.error('\nDiscovery Failed:', e.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

test();
