# Bird-Native

A native, browser-based X/Twitter CLI client developed to replace the dependency on external CLI tools and bypass bot detection (Error 226).

## Features
- **Stealth Browser Agent**: Uses Playwright + Stealth to execute actions within a real Chrome context.
- **Dynamic Discovery**: Scans X's web assets for the latest GraphQL operation IDs and variables.
- **Human-like Posting**: Automates the composition UI to ensure posts look human to Twitter's risk engine.
- **Data Export**: Support for Home Timeline, Bookmarks, and Likes.

## Installation
```bash
npm install
```

## Usage
```bash
# Authenticate (uses your existing Chrome profile)
node src/cli.js whoami

# Post a tweet
node src/cli.js post "Hello from my native agent"

# Fetch data
node src/cli.js home --count 10
node src/cli.js bookmarks --count 10
```

## Configuration
The client defaults to your standard Google Chrome profile:
- Path: `~/Library/Application Support/Google/Chrome`
- Profile: `Default`

You can override these in `src/client.js` if you wish to use a different profile or path.
