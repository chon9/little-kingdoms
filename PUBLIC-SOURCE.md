# Public source snapshot

This source export starts with a fresh Git history. Private hosting identity, source-repository credentials, local room data, browser profiles, caches and machine-specific build settings are excluded. PNG text/EXIF metadata is removed without changing pixels. The client contains only the public online-play URL; it contains no database or administrative credential.

Run `node scripts/dev.mjs` to play locally and `node --test tests/*.test.mjs` to test. `node scripts/build.mjs` builds the Worker; configure your own deployment and DB binding before hosting a separate instance. The original hosted project configuration is intentionally absent.
