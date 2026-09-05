# xbot — X/Twitter Automation Client

Native X/Twitter automation client with multiple posting strategies and GraphQL-based reading.
Built to bypass bot detection (Error 226) encountered when posting via cookie-auth sessions.

## Status

This repo is runnable and already supports the main intended operator split:

- official API posting for reliable writes
- session/cookie-backed reading for timeline and account inspection
- thread draft validation before posting

## Architecture

```
xbot/
├── src/
│   ├── cli.js            # Unified CLI (read + official API post)
│   ├── client.js         # XClient: session-backed GraphQL timelines + search
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

## Validation

```bash
npm run env
npm test
```

## Credentials

### Reading (Option 2/3 — cookie auth)
Set in a local `.env` file, a private env file referenced by your shell, or the shell environment:
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

For workflows that must not use the default/private X account, point `xbot` at
a dedicated env file:

```bash
XBOT_ENV_FILE=../georgerepo/.tokens/x-sports-radar.env node src/cli.js outliers \
  --query "NBA OR NFL"
```

Values in `XBOT_ENV_FILE` override the default private token file and ambient
shell credentials for that process. Use this for Sports Radar or other
account-specific research lanes where the account boundary matters.

## Usage

### Post a tweet (Option 1 — Official API, recommended)
```bash
node src/cli.js post "Your tweet text here"
```

### Post a tweet with an image (Option 1 — Official API)
```bash
node src/cli.js post --image /absolute/path/to/image.png "Your tweet text here"
```

### Post a tweet with a video (Option 1 — Official API)

Validate the exact local MP4/MOV and copy without creating anything:

```bash
node src/cli.js post --video /absolute/path/to/video.mp4 --dry-run "Your post text"
```

Then upload in 4 MiB chunks, wait for X processing, and create the post:

```bash
node src/cli.js post --video /absolute/path/to/video.mp4 "Approved post text"
```

The API path accepts one image or one video per command and fails closed above
X's documented 512 MiB API upload limit. Longer/larger Premium web uploads are
not assumed to be available through the API.

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

### Find low-follower/high-engagement post outliers

`outliers` uses the same Bird-style `auth_token` + `ct0` session reader as the
timeline commands. It does not call the paid official recent-search API and it
does not fall back to that API when session search fails.

```bash
node src/cli.js outliers \
  --queries "AI agents,Claude Code,context engineering,agent reliability" \
  --count 20 \
  --limit 10
```

Use JSON when saving runs for later analysis:

```bash
node src/cli.js outliers --query "AI agents" --count 50 --format json
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

## Goals

- Keep posting stable through the official API path.
- Keep every CLI read surface, including outlier search, on the session-backed
  GraphQL path by default.
- Make auth boundaries explicit so failures are diagnosable.
- Preserve a local CLI contract that an agent can operate without hidden glue.

## Non-Goals

- replacing X's platform constraints with fake reliability claims
- turning `xbot` into a generic social scheduler
- blurring read and write auth into one magic credential path
- silently converting a failed session read into a billable official API read

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
