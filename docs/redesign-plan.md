# Squirrel redesign: Pantry Jars

A plan for a gamified-looking (not game) redesign. It keeps the current palette, the acorn logo, the app's layout (header, bottom tabs, sheets) and every flow. It does not change any wallet, gift or verify logic.

## Decisions so far

| Question | Answer |
| --- | --- |
| Direction | **Pantry Jars**: the stash is a shelf of glass jars filled with real-looking nuts |
| Game layer | Look only. No levels, XP, streaks, badges or quests |
| Mascot | Hand-built SVG squirrel, drawn in the acorn logo's flat style, animated in code |
| Sound | Haptics by default, sound effects opt-in |
| Priority | Demo loop first (stash, gift offline, verify), then tune for repeat use |
| Kept as is | Colour tokens in `app/globals.css`, `public/icon.svg`, tab layout, all copy about money and safety |

## The idea in one line

Every jar on screen holds the nuts you really have: fill one and they tumble in, gift one and it pops out of the lid into the creator's hands. Nothing on screen stands for anything you don't actually have.

## Visual system

**Palette (unchanged).** Espresso ground, amber accent, the existing light and dark tokens. New tokens only come from the logo's own five colours:

- Hazelnut (8 sats): small and round, `#b45309` body, `#fde68a` highlight
- Acorn (32 sats): the logo's acorn exactly, `#8a5a2b` cap, `#f59e0b` body
- Walnut (64 sats): largest, `#8a5a2b` shell, `#6b4320` ridges
- Glass: foreground at 6–10% with one curved highlight. Kraft label: `--line` tone with `--foreground` ink

Nut size follows value, so you can read a jar at a glance.

**Type.** Geist stays for body and UI text, Geist Mono for keys and tokens. Fredoka (variable, through `next/font`, self-hosted so it works offline) is added for numbers, screen titles, button labels and jar labels. That rounded face is most of the "gamified" feel.

**Signature move: the Jar.** One `<Jar>` component, used for the listener's stash, the gift sheet, the fill preview and the creator's hoard:

- An SVG glass jar with a lid, a highlight and a kraft label showing the creator name, "best before" (the locktime) and the sats count.
- The nuts inside are simulated: a small hand-written 2D physics step, so no physics library. It sleeps once the nuts settle and runs only while the jar is on screen.
- Tap the jar and the nuts rattle. On Android, tilting the phone shifts them (iOS would need a permission prompt, so it's skipped there).
- It shows at most about 60 nuts. The label always gives the exact count.

**Three disciplines taken from the directions we didn't pick:**

- *From the split-flap board:* numbers and statuses change in fixed-width cells. Balances roll digit by digit like an odometer, and gift status pills (Queued → Sent → Redeemed) flip in place. The layout never shifts.
- *From the orienteering map:* the playful layer sits on top of the money layer and never changes it. Amounts, mint, lock status, "Real sats" and errors are always plain, full-contrast text. Nothing animates them out of view or covers them.
- *From reference typesetting:* every control has the same complete set of states: rest, pressed (sinks 3px), focus ring, disabled (flat), busy (a wobbling acorn) and success (the label turns into a check).

## The squirrel

It's one SVG rig with separate parts: body, head, two ears, eyes (they blink), cheeks (they puff), front paws and a big S-shaped tail (it sways). A small state machine drives it:

| Pose | Where |
| --- | --- |
| idle (breathes, blinks, tail sways) | Peeking over the stash jar |
| stash (cheeks puff, drops nuts in) | After Fill jar |
| hold, then toss | Gift sheet, then the QR handover |
| goggles on | When offline. Offline is the feature, so the squirrel puts on aviator goggles |
| catch and celebrate (hop, tail flick) | Creator's Verified screen |
| worried | Errors and failed verifications |
| empty paws | Empty states |

Budget: at most one squirrel per screen, and never on top of a QR code, an amount or a warning.

## Feel: motion, haptics, sound

- **No motion library.** CSS keyframes plus the Web Animations API cover sheets, drag-to-dismiss and the nut flight, and the jar has its own small physics step. That means no new dependency (the current `motion` major, 14, was too new to adopt blind).
- **Motion tokens** in `globals.css`: short (120ms), base (220ms) and moment (up to 1.6s) durations. Arrivals use `cubic-bezier(0.16, 1, 0.3, 1)`, exits run faster. Physics provides the bounce, so no bouncy easing curves.
- **Haptics** (`navigator.vibrate`): a tick when a nut lands, a double pulse when a gift is sent, a success pattern on Verified. This works on Android only, since iOS Safari has no vibration API.
- **Sound** (opt-in, Settings → Sounds): generated with the Web Audio API, so there are no audio files to download or cache. Glass clink, lid pop, two-note chime, soft thud for errors.
- **Calm mode:** each big moment plays in full its first few times, then in a shorter version. There's a Settings toggle too. `prefers-reduced-motion` always gets calm mode: static nuts, numbers that jump, fades instead of flights.

## Screen by screen

**Shell (`Chrome.tsx`, `layout.tsx`)**
- Tab changes use cross-document view transitions (CSS `@view-transition`, which suits the deliberate full-page `<a>` navigations). The active-tab pill morphs between tabs and the header stays put.
- The Online/Offline pill flips in place. Going offline briefly shows "Offline · gifting still works".

**Listen: stash (`Stash.tsx`, `Onboarding.tsx`)**
- The wallet balance becomes a rolling counter. The jar list becomes a short shelf of `<Jar>`s, one per creator, with the squirrel peeking over the first.
- Fill sheet: the +/− steppers add and remove nuts in a live preview jar and the total rolls. Going over your balance shakes the total, which stays red text. On confirm, the nuts pour into the shelf jar one by one, each with a clink and a tick.
- Add sats: while waiting there's a quiet pulse around the invoice QR. On payment, the balance rolls up with a chime.
- Onboarding becomes a three-step trail. Each step done drops a nut in, and finishing all three twists the jar lid shut and folds the card into the shelf.

**Listen: player and gifting (`Listen.tsx`, `GiftSheet.tsx`, `Gifts.tsx`)**
- The player moves from a sticky top card to a mini-player docked above the tab bar, with a big acorn Gift button in thumb reach. Tapping it expands to a full Now Playing view.
- Episode downloads: a small acorn rolls along the progress bar, then the bar snaps into a "Saved" pill.
- Gift sheet: the size cards show each nut and how many are left. Picking a size lifts that nut out of the jar into the squirrel's paws.
- Gift by QR: the nut flies up and the white, high-contrast QR screen takes over. The QR itself stays untouched for scanning.
- Send later: the nut drops into a small pouch marked "Will send when online".
- Your gifts list: status pills flip in fixed cells as the background sync updates them.

**Creator (`Creator.tsx`, `Scanner.tsx`, `Moments.tsx`)**
- Scanner: the viewfinder corners breathe and snap onto the QR the moment it's detected.
- **Verified, the biggest moment:** the nut drops in, then each real offline check ticks in one after another (locked to your key, mint signature valid, not expired, not received before). That puts the offline proof on screen, then "Verified · 32 sats · locked to you" stamps down while the squirrel catches the nut. A failed gift cracks the nut (red). "Already received" bounces the nut off the jar (amber).
- The inbox becomes a **hoard jar** filling with received nuts, with a rolling "sats received" count.
- Redeem all: the nuts hop one by one from the hoard into a "redeemed" jar as each swap finishes.
- Moments: the bars grow up from the baseline the first time they appear. The selected bar's highlight slides between bars, and the gift that's playing shows a small equalizer.

**Settings (`Settings.tsx`, `lib/settings.ts`)**
- Add Sounds and Calm animations toggles. Otherwise it gets the shared button and input states and no new animation.

**Everywhere:** squirrel empty states, nut-shaped loading placeholders instead of "Loading…", and copy buttons that pop an acorn when copied.

## Build order

0. **Groundwork.** Commit the Moments and feed work currently uncommitted in the tree, so the redesign diff stays clean. Record the direction contract (impeccable surface brief). Add Fredoka, the nut, glass and motion tokens, the full button states, `lib/feel.ts` (haptics, synth sounds, calm mode, reduced motion) and `<RollingNumber>`.
1. **Art.** `Nut.tsx` (three nuts), `Squirrel.tsx` (rig and pose state machine) and a hidden `/dev/feel` page, excluded from production, to preview every pose and nut at phone size in light and dark.
2. **Signature.** `Jar.tsx` plus `lib/jar-physics.ts`: pour-in, pop-out, rattle, tilt, sleep and the static calm version. Put it on the Listen stash.
3. **Demo loop.** Fill and Add sats sheets, docked player, gift sheet and nut flight, QR handover, the Send later pouch, scanner, the Verified sequence, the hoard and Redeem all. *A demo GIF can be recorded once this step is done.*
4. **Shell and details.** View transitions, the status pill, sheet springs and drag-to-dismiss (`ui.tsx`), download acorn, onboarding trail, status flips, Moments bars, empty and loading states, copy pops, Settings toggles.
5. **Repeat use and hardening.** Calm-mode thresholds, a reduced-motion pass, screen-reader pass (the final value is announced and rolling digits are hidden from readers), a low-end Android check with CPU throttled 4×, light and dark mode, and an airplane-mode test on a production build (`npm run build && npm start`).
6. **Finish.** Impeccable finish review, `DESIGN.md` generated from the built result, and record `docs/demo.gif` (the README already links to it, but the file doesn't exist).

## Constraints the build must respect

- **Offline:** no fetch at runtime for any asset. The service worker only precaches `/_next/static` files named in page HTML, so the jar and squirrel are imported directly rather than lazy-loaded. Then confirm the Fredoka files land in the cache, or add them to `EXTRA` in `public/sw.js`.
- **Performance:** physics runs only while nuts are moving and the jar is visible, and the squirrel animates with transforms only. No new JavaScript dependencies; one added font.
- **Truth:** the jar's contents are worked out from `jarCounts()` and the hoard from `listInbox()`. Nothing decorative ever shows a number that differs from the real one.
- **Browser support:** cross-document view transitions work in Chromium and Safari 18.2+. Firefox just navigates normally.

## Not doing

Levels, XP, streaks, badges, quests, leaderboards, confetti, glassmorphism, or anything that would make the app read as a game you play.
