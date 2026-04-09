---
doc_schema: "doc-frontmatter-v1"
doc_id: "xbot/README"
doc_type: "readme"
doc_status: "active"
title: "xbot — X/Twitter Automation Client"
description: "Native X/Twitter automation client combining Playwright browser posting, official API v2 posting, and GraphQL reading."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:xbot"
  - "type:readme"
---
# xbot — X/Twitter Automation Client

Native X/Twitter automation client with multiple posting strategies and GraphQL-based reading.
Built to bypass bot detection (Error 226) encountered when posting via cookie-auth sessions.

## Architecture

```
xbot/
├── src/
│   ├── cli.js            # Unified CLI (read + official API post)
│   ├── client.js         # XClient: direct GraphQL fetch for reading
│   ├── post_official.js  # Official Twitter API v2 poster (OAuth 1.0a — Option 1)
│   └── credentials.js    # Shared credential loader (.env + georgerepo tokens)
├── README.md
└── IMPROVEMENTS.md       # Backlog and bot-detection strategy options
```

## Posting Strategies

Three strategies are available, ordered by reliability. See `IMPROVEMENTS.md` for full
trade-off analysis.

| Strategy | File | Reliability | Notes |
|----------|------|-------------|-------|
| **Option 1**: Official API v2 | `post_official.js` | Highest | Requires dev app OAuth keys |
| **Option 2**: Session warming | (inline patch) | Medium | No extra credentials |
| **Option 3**: Playwright browser | `cli.js post` | Variable | Uses real Chrome profile |

## Installation

```bash
npm install
```

## Credentials

### Reading (Option 2/3 — cookie auth)
Set in `georgerepo/.tokens/x-twitter.env` or shell environment:
```
AUTH_TOKEN=...
CT0=...
```

Typical shell setup before read commands:
```bash
set -a
source ../georgerepo/.tokens/x-twitter.env
set +a
```

### Posting (Option 1 — official API)
Add to `.env` in this directory or to `georgerepo/.tokens/x-twitter.env`:
```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```
See setup instructions below.

## Usage

### Post a tweet (Option 1 — Official API, recommended)
```bash
node src/post_official.js "Your tweet text here"
```

### Read home timeline
```bash
node src/cli.js home --count 10
```

### Read following timeline
```bash
node src/cli.js latest --count 10
```

### Check auth (add MY_HANDLE=yourusername to env to show profile)
```bash
node src/cli.js me
```

### Read a user's tweets
```bash
node src/cli.js user <handle> --count 10
```

## Setting Up Official API (Option 1)

1. Go to [developer.twitter.com](https://developer.twitter.com) and sign in with your X account
2. Click **"Sign up for Free Account"** (Free tier: 1,500 tweets/month write)
3. Fill in the use case description (e.g. "Personal automation for posting to my own account")
4. Once approved, go to **Projects & Apps → Create App**
5. Under **Keys and Tokens**, generate:
   - API Key & Secret
   - Access Token & Secret (with **Read and Write** permissions)
6. Add all four values to `georgerepo/.tokens/x-twitter.env`

## Configuration

Chrome profile defaults (edit `src/client.js` to override):
- Path: `~/Library/Application Support/Google/Chrome`
- Profile: `Default`

## Genesis

**Created**: Early 2026

**Motivation**: The `bird` CLI tool (cookie-auth GraphQL) reliably reads X data but
triggers error 226 ("automated request") on write operations. `xbot` was built as a
stealth Playwright alternative and later extended with official API v2 support for
reliable posting.
