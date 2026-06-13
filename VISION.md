# XBot Vision

`xbot` should be a dependable X/Twitter operator client for George's workflow:
read timelines and search surfaces, inspect account state, validate post
drafts, and publish through the most stable allowed path.

## Product Thesis

The useful product is not "Twitter automation" in the abstract. The useful
product is a local tool that makes X operationally legible:

1. official API posting when reliability matters,
2. session-backed reading when the official API is insufficient,
3. explicit auth boundaries instead of pretending one credential path does
   everything.

## Operating Principle

Keep the repo honest about what is stable, what is brittle, and what depends on
external platform policy. Public docs should tell the operator which surfaces
are official, which are unofficial, and what is likely to break first.

## Goals

- Keep posting predictable through the official API path.
- Keep reading surfaces useful for research and outlier detection.
- Preserve inspectable CLI commands rather than hiding behavior in private
  wrappers.
- Make auth and failure modes obvious enough that an agent can debug them.

## Non-Goals

- Do not pretend cookie-auth write automation is the preferred long-term path.
- Do not turn the repo into a generic social-media scheduler.
- Do not hide credential or source-coverage gaps behind fake success output.
