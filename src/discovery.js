// Building native X client

const DISCOVERY_PAGES = [
    'https://x.com/?lang=en',
    'https://x.com/explore',
    'https://x.com/notifications',
];

const BUNDLE_URL_REGEX = /https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[A-Za-z0-9.-]+\.js/g;
const OPERATION_PATTERNS = [
    {
        regex: /e\.exports=\{queryId\s*:\s*["']([^"']+)["']\s*,\s*operationName\s*:\s*["']([^"']+)["']/gs,
        operationGroup: 2,
        queryIdGroup: 1,
    },
    {
        regex: /e\.exports=\{operationName\s*:\s*["']([^"']+)["']\s*,\s*queryId\s*:\s*["']([^"']+)["']/gs,
        operationGroup: 1,
        queryIdGroup: 2,
    },
    {
        regex: /operationName\s*[:=]\s*["']([^"']+)["'](.{0,4000}?)queryId\s*[:=]\s*["']([^"']+)["']/gs,
        operationGroup: 1,
        queryIdGroup: 3,
    }
];

export async function discoverQueryIds(page) {
    console.log('Scanning X for current GraphQL operation IDs...');
    const queryIds = {};
    const bundles = new Set();

    // 1. Visit discovery pages to find bundle URLs
    // We can use the playwright page provided by the client
    for (const url of DISCOVERY_PAGES) {
        try {
            await page.goto(url, { waitUntil: 'networkidle' });
            const content = await page.content();
            const matches = content.matchAll(BUNDLE_URL_REGEX);
            for (const match of matches) {
                bundles.add(match[0]);
            }
        } catch (e) {
            // Ignore individual page failures
        }
    }

    if (bundles.size === 0) {
        throw new Error('No JS bundles discovered. Twitter layout might have changed or access is blocked.');
    }

    console.log(`Analyzing ${bundles.size} bundles...`);

    // 2. Fetch and scan each bundle for queryId mappings
    for (const bundleUrl of bundles) {
        try {
            const response = await fetch(bundleUrl);
            const js = await response.text();
            
            for (const pattern of OPERATION_PATTERNS) {
                pattern.regex.lastIndex = 0;
                let match;
                while ((match = pattern.regex.exec(js)) !== null) {
                    const opName = match[pattern.operationGroup];
                    const qId = match[pattern.queryIdGroup];
                    if (opName && qId) {
                        queryIds[opName] = qId;
                    }
                }
            }
        } catch (e) {
            // Skip problematic bundles
        }
    }

    return queryIds;
}
