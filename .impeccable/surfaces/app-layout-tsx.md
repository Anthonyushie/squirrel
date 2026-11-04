---
version: 1
slug: "app-layout-tsx"
primary_target: "app/layout.tsx"
related_targets: ["components/listen/Listen.tsx","components/creator/Creator.tsx","components/settings/Settings.tsx"]
---

# App shell: Listen, Creator, Settings

Mode: Operate (phone-first PWA). Audience: listeners gifting mid-episode, often offline; creators verifying gifts offline; Nut November judges watching the demo loop. Gamified look, not a game: no levels, XP, streaks or badges. Palette tokens and acorn logo are brief-pinned. Haptics default, sound opt-in. Demo loop first, repeat-use tuning after.

## Direction contract

THESIS: Your stash is a jar of real nuts. Every jar on screen holds exactly the nuts you own, sized by value, and every gift is one of them leaving the lid. Refuses the gamified-app default of XP bars, streak flames and confetti over a grey wallet.

OWN-WORLD: Pinned espresso/amber tokens; nuts from the logo's five colours (hazelnut 8, acorn 32, walnut 64); clear glass jars with a curved highlight and kraft labels; Fredoka for numbers, titles, buttons and labels over Geist body; pressable buttons that sink; odometer digits in fixed cells; one hand-drawn squirrel per screen.

STORY: Listeners see sats become nuts, fill a jar for a creator while online, then flick a nut to them from the player in airplane mode. Creators watch the offline checks tick, then the nut lands in their hoard.

FIRST VIEWPORT: Listen, 390 wide: header with acorn and status pill; wallet balance as rolling digits with Add sats; the creator's jar centred at ~45% width, squirrel peeking over the lid, kraft label with creator, best-before and sats; Fill jar primary below; docked mini-player with acorn Gift button above the tab bar.

FORM: Pantry jar shelf, candidate 3 of 7; raises from split-flap (fixed-cell changes), orienteering (play layer never edits money layer), centre-rail (complete control state set). seed:8b451dc6f07eb9ad

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
