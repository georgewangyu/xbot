---
doc_schema: "doc-frontmatter-v1"
doc_id: "xbot/setup/OFFICIAL_API_SETUP"
doc_type: "setup_note"
doc_status: "active"
title: "Official API Setup"
description: "Durable setup notes for connecting xbot to the official X API with OAuth 1.0a read/write access."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:xbot"
  - "platform:x-twitter"
  - "type:setup_note"
---
# Official API Setup

This note captures the setup flow that actually worked for `xbot` to read and write through the official X API.

The important distinction:

- cookie auth (`AUTH_TOKEN`, `CT0`) is enough for local read flows through GraphQL
- official posting requires a separate OAuth 1.0a credential set

## Required Credentials

`xbot` uses these four environment variables for official API posting:

```env
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

Credential mapping in the X console:

- `Consumer Key` -> `X_API_KEY`
- `Consumer Secret` -> `X_API_SECRET`
- `Access Token` -> `X_ACCESS_TOKEN`
- `Access Token Secret` -> `X_ACCESS_TOKEN_SECRET`

These are loaded by `src/credentials.js`.

## Where To Put Them

Supported locations:

- `georgerepo/.tokens/x-twitter.env`
- `xbot/.env`

The existing read credentials can stay in the same private token file:

```env
AUTH_TOKEN=...
CT0=...
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

## Console Setup Flow

### 1. Open the Developer Console

Go to:

- `https://console.x.com`

Use the X account that should own the posts.

### 2. Use the pay-per-use app path

The working setup used a pay-per-use app in the X Developer Console.
No separate legacy monthly-plan app was required.

If an app already exists, reuse it unless there is a hard console-side reason not to.

### 3. Configure authentication settings

In the app:

- open `User authentication settings`
- set `App permissions` to `Read and write`
- choose `Web App, Automated App or Bot`

The console may require URL fields even though `xbot` is not using a user-facing OAuth 2.0 web login flow.

Minimal placeholder values are enough to save:

- `Callback URI / Redirect URL`: `https://example.com/callback`
- `Website URL`: `https://example.com`
- `Organization name`: `Example`
- `Organization URL`: `https://example.com`
- `Terms of Service`: `https://example.com/terms`
- `Privacy Policy`: `https://example.com/privacy`

`Request email from users` is not needed for `xbot`.
Leave it off.

### 4. Generate or reveal the OAuth 1.0a credentials

On the `Keys and tokens` page, collect:

- `Consumer Key`
- `Consumer Secret`
- `Access Token`
- `Access Token Secret`

Important:

- the access token must show `Read and write`
- if the token was generated before changing app permissions, regenerate it

## What Does Not Matter For This Flow

These are not used by the current `xbot` posting implementation:

- `Bearer Token`
- `Client ID`
- `Client Secret`
- app/client identifiers shown elsewhere in the console

The current implementation in `src/post_official.js` uses OAuth 1.0a user-context credentials only.

## Verification

From the workspace root:

```bash
node xbot/src/cli.js post "hello from xbot official api"
```

Expected outcomes:

- success: `Posted successfully. Tweet ID: ...`
- missing credentials: one or more `X_*` variables are absent
- permission issue: app or token is still read-only
- billing issue: the pay-per-use account has no credits

## Failure Modes We Hit

### 1. Missing credentials

Error shape:

```text
Missing credentials: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
```

Meaning:

- only read cookies were present
- official API vars had not been added yet

### 2. Wrong OAuth 1.0a permissions

Error shape:

```text
API error 403: Your client app is not configured with the appropriate oauth1 app permissions for this endpoint.
```

Meaning:

- app was not fully configured for write-capable OAuth 1.0a posting
- fix was to switch the app to `Read and write` and regenerate the access token pair

### 3. No credits

Error shape:

```text
API error 402: Your enrolled account [...] does not have any credits to fulfill this request.
```

Meaning:

- auth was correct
- billing was the remaining blocker

Adding credits in the pay-per-use console resolved this.

## Sequence That Worked

1. Keep existing read cookies for GraphQL reads.
2. Create or reuse a pay-per-use app in `console.x.com`.
3. Set `User authentication settings` to `Read and write`.
4. Choose `Web App, Automated App or Bot`.
5. Fill required URL fields with placeholders if needed.
6. Collect `Consumer Key` and `Consumer Secret`.
7. Regenerate the `Access Token` and `Access Token Secret` after the permission change.
8. Add the four `X_*` values to the local private token file.
9. Add credits to the pay-per-use account.
10. Run `node xbot/src/cli.js post "..."`.

## Operational Notes

- Reading and writing are separate auth paths in this repo.
- If reads work and writes fail, do not assume the API code is broken.
- Regenerating the access token after permission changes matters.
- If secrets are pasted into chat during setup, rotate them after the flow is confirmed.
