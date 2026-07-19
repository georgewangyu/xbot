# XBot Agent Instructions

## Required Startup Context

At the start of a session in this repository, read:

1. `README.md`
2. `VISION.md`
3. `IMPROVEMENTS.md`

## Mission

`xbot` is a native X/Twitter automation client. Keep read and write paths
explicit, inspectable, and separate enough that reliability or policy quirks do
not get hidden behind vague "automation" language.

## Working Rules

1. Read `VISION.md` before changing product direction or auth strategy.
2. Preserve the split between official API posting and cookie/session-backed
   reading.
3. All CLI read commands, including search and outlier discovery, must default
   to the Bird-style `auth_token` + `ct0` session path. Never fall back to the
   paid official API automatically. A paid read path requires an explicit
   user-approved command and must identify itself as billable.
4. Keep credentials and private token-file assumptions out of public docs when
   possible.
5. Prefer explainable command behavior over opaque convenience wrappers.

## Validation

```bash
npm run env
npm test
```
