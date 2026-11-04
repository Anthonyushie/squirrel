# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Listeners** of a podcast (first show: Nodesignal) who download episodes and listen where signal is bad: trains, planes, the countryside. Their job: tip the creator at the moment an episode moves them, even in airplane mode.
- **Creators** (podcast hosts) who receive gifts in person by scanning a QR, verify them offline, redeem them later, and read listeners' messages on air.
- **Nut November judges** (Value4Value track) who see the product first through the demo loop and the README GIF.

## Product Purpose

Squirrel lets listeners gift creators Cashu ecash with no internet connection. Sats are stashed while online as fixed-size nuts (8, 32, 64 sats) locked to the creator's key, so a gift handed over offline cannot be double-spent. Success: a listener gifts mid-episode in airplane mode, and the creator's phone shows "Verified · 32 sats · locked to you" with no network.

## Positioning

The only V4V gifting flow that works fully offline on both sides: P2PK-locked nuts (NUT-11) plus offline DLEQ verification (NUT-12), with NIP-61 nutzaps as the remote fallback. Each gift carries the listener's message and the exact moment in the episode that prompted it.

## Operating Context

- Installable PWA, phone-first, used one-handed while listening; frequently offline by design.
- Core loop: Stash (online: add sats, fill a jar) → Gift (offline, from the player) → Deliver (QR in person, or queued nutzap) → Verify (creator, offline) → Redeem (creator, online) → Refund (after the 30-day locktime).
- Creator side also has Moments: where in each episode listeners reached for a gift, with a "Read on air" view.

## Capabilities and Constraints

- Next.js 16 App Router, React 19.3, Tailwind CSS 4, all data on device in IndexedDB, no backend database. Service worker caches the app shell; it must keep working offline.
- Gamified look, not a game (confirmed): the game feel lives entirely in look and motion (mascot, nut physics, celebrations, tactile controls). No levels, XP, streaks, badges, quests or leaderboards. Jars and the creator's hoard show real balances, nothing invented.
- Sound (confirmed): haptics on key moments by default; sound effects are opt-in.
- Money is real on non-test mints. Game devices must never obscure amounts, mint, lock status, or warnings, and must never nudge users to spend more than they chose.
- Keys live in browser storage with no backup; this is a demo-grade wallet.

## Brand Commitments

- Name: Squirrel. Tagline: "Stash nuts now, gift them anywhere."
- Keep the existing colour palette (tokens in `app/globals.css`, light and dark) and the acorn logo (`public/icon.svg`). Both are explicitly loved by the owner.
- Mascot (confirmed): a squirrel character, newly drawn as a hand-built SVG rig in the acorn logo's flat style, plus nut animations.
- Vocabulary: nuts, jar, stash, gift, hoard.

## Evidence on Hand

- Real content: Nodesignal's public RSS feed (episodes, artwork, chapters) via `/api/feed`.
- Real protocol facts in `README.md` (safety table, standards used).
- Absent: user counts, testimonials, press. The README references `docs/demo.gif`, which does not exist yet. Do not fabricate any of these.

## Product Principles

1. Offline is the feature: every celebration and animation must work in airplane mode.
2. Truth over theatre: amounts, lock status and verification results stay exact and legible inside every game moment.
3. Reward giving, never pressure it: celebrations mark gifts made; nothing invents urgency or upsells sats.
4. The demo loop is the product: stash, gift, verify must be the most delightful path.

## Accessibility & Inclusion

- Honor `prefers-reduced-motion` (already in place for the Verified moment): every animation needs a calm equivalent.
- One-handed phone use, 44px+ touch targets, legible in bright daylight (the gift QR stays high-contrast white).
- Sound is never the only signal; haptics are never the only signal.
