---
name: Squirrel
description: Stash nuts now, gift them anywhere. A pantry of glass jars holding real ecash nuts.
colors:
  espresso-ink: "#2b1d12"
  oat-paper: "#faf6f0"
  card-white: "#ffffff"
  bark-muted: "#7a6a5c"
  linen-line: "#e8dccd"
  rust-accent: "#b45309"
  accent-foreground: "#ffffff"
  leaf-ok: "#15803d"
  brick-bad: "#b91c1c"
  nut-amber: "#f59e0b"
  nut-rust: "#b45309"
  nut-shell: "#8a5a2b"
  nut-line: "#6b4320"
  nut-light: "#fde68a"
  kraft: "color-mix(in oklab, #e8dccd 78%, #8a5a2b)"
  shelf: "#8a5a2b"
  shelf-edge: "#6b4320"
  roast-background-dark: "#17120e"
  cream-foreground-dark: "#f3ebe1"
  card-dark: "#221a14"
  muted-dark: "#a8998a"
  line-dark: "#3a2e24"
  amber-accent-dark: "#f59e0b"
  accent-foreground-dark: "#1a1209"
  ok-dark: "#4ade80"
  bad-dark: "#f87171"
  shelf-dark: "#6b4320"
typography:
  display:
    fontFamily: "Fredoka, var(--font-fredoka), ui-rounded, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Fredoka, var(--font-fredoka), ui-rounded, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Fredoka, var(--font-fredoka), ui-rounded, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  button:
    fontFamily: "Fredoka, var(--font-fredoka), ui-rounded, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  caption:
    fontFamily: "Geist, var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: "Geist Mono, var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  sm: "2px"
  lg: "8px"
  2xl: "16px"
  3xl: "24px"
  sheet: "32px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  7: "28px"
  page-x: "16px"
  page-bottom: "112px"
  control-height: "48px"
  tab-height: "64px"
  column: "32rem"
components:
  button-primary:
    backgroundColor: "{colors.rust-accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.2xl}"
    padding: "0 16px 3px"
    height: "48px"
  button-primary-disabled:
    backgroundColor: "{colors.linen-line}"
    textColor: "{colors.espresso-ink}"
  button-ghost:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.espresso-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.2xl}"
    padding: "0 16px 2px"
    height: "48px"
  field:
    backgroundColor: "{colors.oat-paper}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.2xl}"
    padding: "0 12px"
    height: "48px"
  check:
    backgroundColor: "{colors.oat-paper}"
    rounded: "{rounded.lg}"
    size: "24px"
  check-checked:
    backgroundColor: "{colors.rust-accent}"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.3xl}"
    padding: "16px"
  sheet:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.sheet}"
    padding: "0 16px 16px"
    width: "32rem"
  notice:
    rounded: "{rounded.2xl}"
    padding: "8px 12px"
    typography: "{typography.body}"
  status-pill:
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
    textColor: "{colors.leaf-ok}"
  tab-item:
    textColor: "{colors.bark-muted}"
    typography: "{typography.caption}"
    height: "64px"
  tab-item-active:
    textColor: "{colors.rust-accent}"
    rounded: "{rounded.full}"
    width: "56px"
  kraft-label:
    backgroundColor: "{colors.kraft}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.lg}"
    padding: "10px 12px 8px"
  mini-player:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.3xl}"
    padding: "8px"
---

# Design System: Squirrel

## Overview

**Creative North Star: "The Pantry Shelf"**

Your stash is a jar of real nuts. Every jar on screen holds exactly the nuts you own, sized by value (hazelnut 8 sats, acorn 32, walnut 64), and every gift is one of them leaving through the lid. The world is a warm kitchen pantry: oat paper and espresso ink, clear glass jars with a curved highlight, a wooden plank they stand on, kraft labels hanging below, and one hand-drawn squirrel peeking over the first lid. It is gamified in look and motion only; nothing on screen is a level, a streak or a badge, and every quantity shown is a real balance.

The app is an operate-mode phone shell: a sticky header with the acorn and an online/offline pill, a single 32rem column, a docked mini-player, bottom tabs, and bottom sheets for every task. Density is relaxed and one-handed: 48px controls, a 64px tab bar, generous vertical stacks. The play layer (jars, nuts, squirrel, motion) never edits the money layer: amounts, mint, lock status and warnings are always plain, full-contrast text set beside the decoration, never on it.

Motion is tactile and physical: buttons sink when pressed, digits roll in fixed cells, nuts are physics-simulated and pour, rattle and hop out. Big moments play full the first few times, then a shorter cut, and collapse to a still, in-place equivalent under reduced motion. Haptics are on by default; synthesized sound is opt-in.

**Key Characteristics:**
- Pinned espresso/amber palette; every new colour derives from the acorn logo's five colours plus ink.
- Fredoka carries numbers, titles, buttons and labels; Geist carries reading text; Geist Mono carries keys and tokens.
- Pressable controls with a darker bottom edge that sink 2-3px on press.
- Glass jars holding simulated nuts sized by value, standing on a wooden shelf with kraft labels.
- One squirrel per screen, behind the first jar, paws on the lid.
- Odometer digits that roll per place without reflowing the line.

## Colors

A warm, low-saturation pantry of oat, linen and espresso, lit by a single rust/amber accent and the logo's nut browns.

### Primary
- **Rust Accent** (rust-accent; dark scheme: amber-accent-dark): the one action colour. Primary buttons, the active tab pill, focus outlines, caret and form accents, the player progress fill, checked checkboxes, the "Real sats" pill and warning notices (as a 10-15% tint with a 40% border). Text on it is white in light mode and near-black (accent-foreground-dark) in dark mode.

### Secondary
- **Nut palette** (nut-amber, nut-rust, nut-shell, nut-line, nut-light): the acorn logo's own five colours, used only for illustration: nut art, the squirrel rig, the jar lid and the shelf. Amber is the acorn body, rust the hazelnut and squirrel fur, shell the walnut and acorn cap, line the walnut seams and cap stroke, light the highlights and squirrel belly.
- **Kraft** (kraft): linen mixed with nut-shell for the jar labels; text on it is always espresso-ink in both schemes.
- **Shelf** (shelf / shelf-edge): the wooden plank under the jars and the jar lids, with a 6px darker front edge.

### Tertiary
- **Leaf OK** (leaf-ok / ok-dark): online status, success notices, "Copied", the minted "+N" moment and the Verified screen.
- **Brick Bad** (brick-bad / bad-dark): errors and the rejected-gift screen.

### Neutral
- **Oat Paper** (oat-paper / roast-background-dark): page background, header and tab bar fill, field and code wells.
- **Card White** (card-white / card-dark): cards, sheets, the mini-player and ghost buttons.
- **Espresso Ink** (espresso-ink / cream-foreground-dark): all body and money text.
- **Bark Muted** (bark-muted / muted-dark): secondary lines, inactive tabs, field labels, the offline pill.
- **Linen Line** (linen-line / line-dark): every 1px border, the sheet grabber, skeletons, the progress track, the disabled primary fill.

Glass is not a colour: it is foreground at 4% (5% dark) with a 24% (26% dark) foreground edge and a white shine stroke at 85% (45% dark), all via `color-mix`.

### Named Rules
**The Logo Palette Rule.** The `:root` and dark tokens are owner-pinned. Any new colour is a mix of the logo's five colours (#f59e0b, #b45309, #8a5a2b, #6b4320, #fde68a) and ink (#2b1d12), or of an existing token. No other hue enters the system.

**The One Accent Rule.** Rust/amber is the only action colour. Green and red mean status, never action.

**The Plain Money Rule.** Amounts, mint, lock status and warnings are set in foreground or status colour on an opaque surface, at full contrast. Decoration (nuts, glass, squirrel, shine) never sits on top of them.

## Typography

**Display Font:** Fredoka (via next/font, `--font-fredoka`)
**Body Font:** Geist (with system sans fallback)
**Label/Mono Font:** Geist Mono for npubs, keys, mint URLs and cashu tokens

**Character:** Fredoka's soft round terminals give numbers, titles and buttons the friendly, toy-like voice; Geist keeps explanations and money context sober and legible.

### Hierarchy
- **Display** (600, 3rem, line-height 1): the wallet balance, the gift amount in the gift sheet, verdict lines and the "+N" minted moment. Always rolling digits or plain numerals, followed by a muted "sats" at 1.125rem.
- **Headline** (600, 1.875rem): one h1 per tab (Creator, Settings).
- **Title** (600, 1.25rem): h2 section heads and sheet titles; 1.125rem for setup-card heads.
- **Button** (Fredoka 600, 1.0625rem): every button; 1.125rem for the screen's main primary, 1.5rem for Scan gift.
- **Body** (400, 0.875rem): the default reading size across screens and notices.
- **Label** (500, 0.875rem, muted): field labels above inputs.
- **Caption** (500, 0.75rem): tab labels, status pills, player times, small connection notes. Kraft labels use 13px detail lines.

Headings use `text-wrap: balance` and -0.005em tracking. Numbers use the `num` treatment: Fredoka with tabular figures requested.

### Named Rules
**The Fixed Cell Rule.** Changing numbers roll per digit inside cells sized by an invisible copy of the digit (760ms, 45ms stagger per place), so the line never reflows. The real value stays in the DOM for screen readers.

**The Two Voices Rule.** Fredoka for anything you count, tap or title; Geist for anything you read. Never set paragraphs in Fredoka.

## Layout

Phone-first single column: `max-w-lg` (32rem) centred, 16px side padding, 16px top and 112px bottom padding so content clears the docked mini-player and the 64px tab bar (plus the safe-area inset). The header is sticky with a bottom hairline; the tab bar is fixed with a top hairline. The mini-player floats 8px above the tab bar in the same 32rem column. Bottom sheets take full width up to 32rem and at most 92vh, scrolling inside with a sticky grabber/title row.

Vertical rhythm comes from stack spacing: 16px between blocks inside a screen, 28px between major sections of a tab, 8-12px within a group. Inline gaps are 8px (icon + label) and 12px (row items). Jars sit in a horizontally scrollable shelf, each column `min(46vw, 12rem)` with 12px gaps; the first column gets 24% top padding for the squirrel's head.

The first viewport on Listen: header, balance with Add sats, the jar shelf centred, Fill jar full-width below, the mini-player with its Gift button docked above the tabs.

**Desktop (`lg`, 64rem and up).** Every desktop rule is `lg:`-gated; below 64rem the phone layout is unchanged. The column widens to 72rem with 32px side padding and 32px top. Listen and Creator split into a 25rem left column and a fluid right column with a 56px gap: the jar shelf (Listen) or Scan gift plus the hoard (Creator) sit on the left, and gifts, episodes, moments, inbox and keys scroll on the right. The left column is pinned (`tall` variant: `lg` plus at least 47rem of height, so the header, the column and the docked player all fit). Onboarding and the Creator title span both columns. Settings uses two equal columns: the creator form on the left, keys and Feel on the right. The creator key setup is capped at 36rem.

## Elevation & Depth

Hybrid and soft: surfaces are separated mainly by tone (oat page, white card) and 1px linen borders, with a single tinted shadow colour (`--shadow`, espresso at 20%; black at 55% in dark) used in long, negative-spread drop shadows that read as objects resting on a shelf rather than floating panels. Pressable controls get depth from an inset bottom edge, not from a lifted shadow.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 12px 28px -22px var(--shadow)`): cards.
- **Mini-player** (`box-shadow: 0 14px 32px -14px var(--shadow)`): the docked player.
- **Sheet** (`box-shadow: 0 -12px 40px -20px var(--shadow)`): bottom sheets, cast upward.
- **Shelf object** (`box-shadow: 0 8px 14px -8px var(--shadow)` plank, `0 8px 14px -10px` kraft label): the plank and labels.
- **Primary key** (`inset 0 -4px 0 var(--accent-edge), 0 10px 18px -12px var(--accent-edge)`): primary buttons; pressed becomes `inset 0 -1px 0` with `0 4px 8px -6px`.
- **Ghost key** (`inset 0 -3px 0 var(--ghost-edge)`): ghost buttons; pressed `inset 0 -1px 0`.
- **Jar floor** (an SVG ellipse filled with `--shadow`): under each jar.

### Named Rules
**The Sinking Key Rule.** Buttons have a darker bottom edge and sink on press (2px ghost, 3px primary) as the edge collapses. Disabled controls go flat: no edge, no shadow, no movement.

**The Shelf Shadow Rule.** Drop shadows are soft and pulled in by a negative spread, always in `--shadow`. No hard offset shadows, no coloured glows except the accent edge under the primary key.

## Shapes

Soft, rounded, objectlike. Controls, fields, notices and code wells use 16px corners; cards, the mini-player and artwork 24px; sheets 32px on the top corners only; pills, tab highlight, dots and toggles are fully round; checkboxes and the shelf plank 8px. Kraft labels have a 2px top and 8px bottom corner, hang 1.5deg off true and carry a small punched hole, like a tag tied to a jar. The glass jar is a single SVG silhouette (neck, shoulders, 32-unit rounded base) with a lid that tips open from its left edge. Icons are 24-unit stroke drawings with 2px round caps and joins in currentColor.

## Components

### Buttons
Tactile keys that sink.
- **Shape:** gently rounded (16px), minimum height 48px, 16px horizontal padding, Fredoka 600 at 1.0625rem.
- **Primary:** rust-accent fill with white text (amber with near-black in dark), a 4px darker inset bottom edge (`--accent-edge`) and a tight accent drop shadow.
- **Pressed / Focus:** translateY(3px) primary, 2px others, 120ms ease-out; focus is a 2px accent outline offset 3px.
- **Disabled:** primary turns linen with 70%-ink text and goes flat; ghost turns transparent with muted text. Busy shows a progress cursor via `aria-busy`.
- **Ghost:** card fill, 1px linen border, 3px inset bottom edge. Used for secondary actions (Add sats, Copy, Paste a gift, Reclaim).
- **Bare:** the base key without fill for icon buttons (sheet close, seek ±15/30s, round 48px).

### Chips
- **Status pill:** fully round, 4px x 10px, caption type. Online is leaf-ok text on a 15% ok tint with an ok dot; offline is muted on a 20% muted tint, briefly reading "Offline · gifting still works". It flips in (rotateX) on change.
- **Real sats pill:** accent text on a 15% accent tint, shown only on non-test mints.
- **NutChip:** a nut on an 85% ink disc so the amber acorn stays visible on an accent button.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** card-white / card-dark.
- **Shadow Strategy:** card rest shadow (see Elevation).
- **Border:** 1px linen.
- **Internal Padding:** 16px.
- **Notice:** 16px corners, 1px border, 8px x 12px, body type, in four tones: info (oat, muted), warn (10% accent tint, 40% accent border, ink text), bad (10% bad tint, bad text, shakes once), ok (10% ok tint, ok text).

### Inputs / Fields
- **Style:** 48px tall, 16px corners, 1px linen border on oat paper, 12px horizontal padding, 1rem text; keys, URLs and tokens in Geist Mono at 0.875rem (0.75rem for pasted tokens).
- **Focus:** border turns accent with a 3px 25% accent ring; no outline.
- **Checkbox:** 24px, 8px corners, 2px linen border; checked fills accent with a check icon sibling; presses to 0.92 scale.
- **Toggle:** a fully round track with a white 24px knob sliding 24px.

### Navigation
- **Header:** sticky, oat fill, bottom hairline, the 32px acorn logo and "Squirrel" in Fredoka 600 1.25rem, status pill at right.
- **Tab bar:** three tabs (Listen, Creator, Settings), 64px tall, icon over caption label. Inactive is muted; active is accent with a 56 x 32px fully round 15% accent pill behind the icon. Tabs are full page loads animated as cross-document view transitions: old page fades out 120ms ease-in, new page rises 10px over 320ms ease-out, and the pill glides between tabs over 340ms.
- **Desktop nav:** on `lg` the tab bar is hidden and the same three tabs sit in the header beside the logo as 40px Fredoka links with a 20px icon. Inactive tabs are muted and take a 5% foreground wash on hover. The active tab is accent, with a full-round 15% accent pill behind it that carries the `tab-pill` transition.

### Bottom Sheet
Slides up over 420ms ease-out on a 50% black backdrop. A 40 x 6px linen grabber and the sticky title row drag it down; release past 110px or a fast flick dismisses (200ms ease-in), otherwise it springs back (260ms ease-out). Tap outside or Escape also closes. On `lg` it becomes a centred dialog instead: 32px corners all round, at most 85vh (52rem), 24px side padding, no grabber and no drag. It rises 16px from 97% scale over 320ms ease-out, and leaves with a 200ms fade and a slight drop.

### Glass Jar (signature)
An SVG jar (200 x 250 viewBox) holding exactly the user's nuts, physics-simulated and settled on first paint. New nuts drop through the neck as the lid tips open (300ms ease-out, -22deg); removed nuts hop out and shrink away (300ms ease-in). Tapping rattles; on Android, tilting shifts them. Nuts stay below the shoulders (max 90 visible). The jar is decorative and `aria-hidden`; its kraft label carries the numbers.

### Kraft Label
Hangs under each jar from the shelf plank: creator name in Fredoka 600 0.875rem uppercase with wide tracking (the label's own lettering, as printed on a jar tag), the total in Fredoka 1.25rem with "sats ready", nut counts ("2 × acorn"), days to the best-before locktime, and the mint if it differs from the wallet's.

### Nuts
Flat logo-style art in a 64-unit box: hazelnut (8 sats, rust), acorn (32 sats, the logo path for path), walnut (64 sats, shell with seams). Collision radius scales 1 : 1.25 : 1.5. A nut icon always has its amount written beside it.

### Squirrel
An SVG rig in a 120 x 140 box, in nut-palette colours, facing left toward the jar. Idle motion is slow and small (tail sway 3.4s, breathing 2.8s, glance 9s, blink 5.2s, ear twitch 7s); poses are one-shot and short: hop, puff, toss, cheer, worry. Offline it wears goggles. It stands behind the first jar with its paws on the lid.

### Mini-player
Docked above the tab bar: 24px-cornered card with the play button, episode title (0.875rem semibold), a 4px accent progress bar on a linen track, mono-numeral times, and the acorn Gift button. It rises in once (420ms). Tapping opens the Now playing sheet. On `lg` it docks 20px above the window's bottom edge at the full 72rem column width, adding back-15 and forward-30 keys around the play button and a 44px artwork thumbnail before the title.

### Verdict Screen
A full-bleed alertdialog in the light-scheme status hue (leaf-ok for verified, brick-bad for rejected) with white text, a nut dropping into a 15% white disc, a white badge popping in with a check or cross, and the verdict stamped in at display size (stamp-in, 460ms).

## Do's and Don'ts

### Do:
- **Do** derive any new colour from the logo's five colours and ink, or mix existing tokens with `color-mix(in oklab, ...)`.
- **Do** keep every money fact (amount, mint, lock status, warning) as plain foreground or status text on an opaque surface, next to the decoration, never on it.
- **Do** show exactly one squirrel per screen, behind the first jar with its paws on the lid.
- **Do** size nuts by value (hazelnut 8, acorn 32, walnut 64) and make jars hold exactly the real nuts.
- **Do** use the shared key for every control: 48px minimum, 16px corners, inset bottom edge, sink on press, flat when disabled.
- **Do** roll changing numbers in fixed digit cells, and give every big moment a full, short and still cut through `playMoment`.
- **Do** keep haptics on key moments by default and sound strictly opt-in.
- **Do** honour reduced motion: view transitions off, animations and transitions collapse to 1ms, content arrives in place.

### Don't:
- **Don't** introduce levels, XP, streaks, badges, quests, leaderboards or confetti; the game feel lives only in look and motion.
- **Don't** change the pinned `:root` or dark tokens, or redraw the acorn logo.
- **Don't** use green or red for actions; they are status only.
- **Don't** use hard offset shadows or coloured glows; depth is soft, negative-spread `--shadow` plus the key's inset edge.
- **Don't** set paragraphs in Fredoka or numbers that change in Geist.
- **Don't** animate on scroll, or loop motion outside the squirrel's idle rig and waiting or playing states (rocking nut while loading or awaiting payment, skeleton shimmer, ring pulse on a pending invoice QR, breathing scan frame, equaliser bars while audio plays).
- **Don't** nudge users to spend more than they chose; jars and hoards show real balances only.
