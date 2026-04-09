---
doc_schema: "doc-frontmatter-v1"
doc_id: "xbot/IMPROVEMENTS"
doc_type: "improvements"
doc_status: "active"
title: "xbot Improvements"
description: "Backlog of enhancements for the xbot X/Twitter automation client, including posting reliability options and bot-detection workarounds."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:xbot"
  - "type:improvements"
---
# xbot Improvements

Backlog of enhancements for the xbot X/Twitter automation client.

## Active Issue: Error 226 — Automated Request Detection

Twitter returns error 226 ("this request looks automated") on write operations.
This happens even with the Playwright stealth approach (Option 3 below) when
X's risk engine detects scripted behavior from cookie-auth sessions.

Three viable approaches are documented below, ordered by reliability.

---

## Option 1: Official Twitter API v2 ✅ Implemented (`src/post_official.js`)

Use the official `POST /2/tweets` endpoint with OAuth 1.0a credentials from a
registered developer app. Twitter explicitly allows this — no bot detection,
consistent behavior, no GraphQL query ID rotation issues.

**How it works:**
- Developer app created at developer.twitter.com (Free tier)
- OAuth 1.0a: API Key + API Secret + Access Token + Access Token Secret
- Posts via `oauth-1.0a` + native `fetch` — no third-party HTTP client needed
- `bird` (and xbot browser mode) remain for all read operations

**Free tier limits:**
- Write: 1,500 tweets/month (ample for personal posting)
- Read: 1 million tweet reads/month (more than enough)

**Required env vars (add to `.env` or `georgerepo/.tokens/x-twitter.env`):**
```
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

**CLI usage:**
```bash
node src/post_official.js "Your tweet text here"
```

**Tradeoffs:**
- Requires developer app approval (usually instant for Free tier)
- Cleanest, most maintainable long-term approach
- Read operations unaffected — keep using `bird` / `src/cli.js` for those

---

## Option 2: Session Warming (Quick Patch — No Dev Account Needed)

Before posting via GraphQL or `bird`, warm the session with read calls and add
a human-like random delay. Simulates real browsing behavior, which reduces the
226 trigger rate.

**Implementation sketch:**
```js
// In src/client.js or a wrapper script:
await client.fetchGraphQL('HomeTimeline', { count: 3 }); // warm session
await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000)); // 3–8s delay
await postTweet(text);
```

**Tradeoffs:**
- No developer account required — works with existing cookie auth
- Fragile: Twitter may tighten detection at any time
- Adds 3–10 seconds per post
- Still not 100% reliable — depends on session freshness

---

## Option 3: Playwright Browser Automation — Current Default (`src/cli.js post`)

Drive a real Chrome instance via Playwright + Stealth to post through the X
compose UI. Generates a full browser fingerprint (JS events, DOM, cookies).

**Current implementation:** `src/cli.js` → `post` command
- Opens `x.com/compose/post` in a persistent Chrome context
- Types text into the tweet textarea
- Clicks the post button

**Why it still triggers detection:**
- The Chrome profile may be the same one used for real browsing — shared session
  state can signal automation
- Headless mode (even with stealth) leaves subtle fingerprint signals
- X may be fingerprinting the CDP (Chrome DevTools Protocol) connection itself

**Potential improvements to Option 3:**
- [ ] Run non-headless for posting (visible window is harder to fingerprint)
- [ ] Add random mouse movement and scroll before composing
- [ ] Add realistic typing speed (`page.type()` with `delay` option) instead of `page.fill()`
- [ ] Warm the page by visiting the home feed first, then navigating to compose

**Tradeoffs:**
- Most detection-resistant in theory, but maintenance-heavy
- Fragile to X UI selector changes
- Requires Chrome to be installed and profile accessible

---

## Near-Term Backlog

- [x] Wire `post_official.js` into `cli.js` (`xbot post` now uses official API)
- [x] Support replying to a tweet: `node src/cli.js post --reply-to <tweet_id> "text"`
- [x] Centralize credential loading — shared `src/credentials.js` module
- [x] Add pagination support — timeline methods auto-paginate for counts > 40
- [ ] Wire `post_official.js` into daily workflow / agent posting skill
- [ ] Add thread posting: chain multiple tweets via official API reply field
- [ ] Add media upload support via `POST /2/media/upload` (v1.1 endpoint still required for media)
- [ ] Add `--dry-run` flag to preview tweet without posting
- [ ] Add scheduled posting: accept `--at "HH:MM"` and sleep until then

## Low Priority / Research

- [ ] Explore Twitter API Basic tier ($100/month) for higher write limits
- [ ] Monitor `@steipete/bird` for upstream fixes to the 226 fallback path
- [ ] Investigate whether Playwright CDP fingerprint can be masked further

---

*Add ideas as they emerge. See `README.md` for architecture overview.*
