# Laundry Loop Tracker Lab

Standalone prototype for the Laundry Loop customer order-tracking popup.

## Why this repo exists

This repository is intentionally separate from the production `laundry-loop` repository so the tracking UI and progress math can be refined without triggering production deploy/build usage.

## Prototype goals

- Match the approved Laundry Loop tracker reference: compact dashboard, semi-circular gauge, five visual stages, branded status card and three-part information strip.
- Keep **pickup ETA** separate from **gauge progress**.
- Use a circular ease-out curve inside the current staff-confirmed stage.
- Never allow elapsed time alone to cross into Washing, Drying or Ready.
- Support live lookups through the existing public `track_public_order` RPC.
- Include lab controls for safe visual/math testing.

## Current stage model

Regular:
- Received / Processing: 4h internal gauge budget
- Washing: 2h internal gauge budget
- Drying: 2h internal gauge budget

Express:
- Received / Processing: 1h
- Washing: 1.5h
- Drying: 1.5h

The stage budgets control gauge movement only. They do **not** change the pickup promise.

## Static deployment

No build step is required. Publish the repository root as a static site.
