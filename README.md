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
├── research/
│   └── X_VIRALITY.md     # Notes on recommendation dynamics and posting philosophy
├── setup/
│   └── OFFICIAL_API_SETUP.md  # Durable setup note for X official API read/write access
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
Add these to `.env` in this directory or to `georgerepo/.tokens/x-twitter.env`:
```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```
These are separate from the cookie-based read credentials (`AUTH_TOKEN`, `CT0`).
Posting will not work until all four API values are present.

## Usage

### Post a tweet (Option 1 — Official API, recommended)
```bash
node src/cli.js post "Your tweet text here"
```

### Post a reply (Option 1 — Official API)
```bash
node src/cli.js post --reply-to 1234567890123456789 "Your reply text here"
```

### Validate a markdown thread draft before posting
```bash
node src/cli.js thread-validate ../georgerepo/social-media/text/platforms/x-linkedin-threads/2026-04-14_builder-vs-coder-ai-thread.md
```

### Post a markdown thread draft safely
```bash
node src/cli.js thread-post ../georgerepo/social-media/text/platforms/x-linkedin-threads/2026-04-14_builder-vs-coder-ai-thread.md
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

1. Open the X Developer Console at `https://console.x.com` and sign in with the X account that should own the posts.
2. Accept the Developer Agreement if the account has not been enrolled yet.
3. Click `New App` and create an app for this posting workflow.
4. In the app settings, make sure the app permission level is `Read and write`.
5. In `Keys and tokens`, generate and save these credentials immediately:
   - API Key
   - API Secret
   - Access Token
   - Access Token Secret
6. Add the four values to `georgerepo/.tokens/x-twitter.env` or `xbot/.env`:
   ```env
   X_API_KEY=...
   X_API_SECRET=...
   X_ACCESS_TOKEN=...
   X_ACCESS_TOKEN_SECRET=...
   ```
7. If you changed app permissions after generating tokens, regenerate the access token and secret so they pick up the new scope.

### Verify Posting Setup

From the workspace root:

```bash
node xbot/src/cli.js post "hello from xbot official api"
```

If credentials are missing, `xbot` will tell you exactly which env vars are absent.
On success, it prints the created tweet ID.

### Troubleshooting

- `Missing credentials`: one or more of the four `X_*` API variables are not loaded.
- `403` or permission errors: the app is still `Read only`, or the access token was generated before switching to `Read and write`.
- Read commands working but post failing: this usually means only `AUTH_TOKEN` and `CT0` are present. Read and write auth are separate in this repo.

## Configuration

Chrome profile defaults (edit `src/client.js` to override):
- Path: `~/Library/Application Support/Google/Chrome`
- Profile: `Default`

## Research Notes

- `research/X_VIRALITY.md` — working notes on what seems to drive reach on X, how to think about recommendation surfaces, and practical posting philosophy for builders.

## Setup Notes

- `setup/OFFICIAL_API_SETUP.md` — exact console flow, credential mapping, and failure modes for getting `xbot` onto the official X API with read/write access.

## Genesis

**Created**: Early 2026

**Motivation**: The `bird` CLI tool (cookie-auth GraphQL) reliably reads X data but
triggers error 226 ("automated request") on write operations. `xbot` was built as a
stealth Playwright alternative and later extended with official API v2 support for
reliable posting.
