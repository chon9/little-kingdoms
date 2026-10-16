# Little Kingdoms · Shu & Wei

A mobile-first, playable Great Kingdom-inspired territory game with 40 Q-style general avatars, 10 bot levels, local PvP and online rooms.

Version 2.2 adds the Field Academy, a playable tutorial with ten lessons. Open **Learn to play** in the lobby, follow the link in Codex, or visit `/tutorial.html`. You select squares and deploy castles, review what changed, then continue. The lessons cover connected liberties, building a single protected eye, larger sealed territory, danger and defense, capture, open/contested areas, the neutral wall, self-capture, passing/scoring and simultaneous destruction. Every action uses the same rules engine as actual matches. Practice progress saves separately, resumes after refresh and never changes a real saved match, online seat or match XP. The complete tutorial is bundled for offline use.

The GitHub public source export is deliberately separate from the private deployment checkout. It includes no hosted project identity, credential, local room store, browser profile or machine-specific build setting, and starts with fresh history. The public PvP service URL remains in the client build configuration so browser and installed players can share rooms. Configure your own deployment and `DB` binding to host a separate server. A standalone Worker build does not require the private Sites manifest.

Version 2.1 adds device-local commander XP, 50 commander levels, first-win bonuses for each bot difficulty, and avatar unlocks through level 21. Two avatars start unlocked. Completed matches need at least four deployed castles, including two of your own, to earn XP; resigning earns no XP. Stable match IDs prevent repeat rewards after reconnect/reload. Cosmetic progress is unranked and does not sync between devices. The profile/Generals button opens the avatar collection; its Rivals tab retains the original twenty AI opponents.

Your equipped general appears in the battle HUD and anime cut-ins with first-person opening, tactical and result dialogue. Online seats exchange avatar IDs through authoritative room state; a chosen avatar stays fixed for that match. Settings separately control music, effects, cut-ins and optional device speech. River Oath is an original 64-second looping instrumental, composed in `scripts/compose-music.py`, with no third-party samples. Audio starts after the first user interaction, pauses when the app is hidden, and works offline.

The primary Windows 2.1 client is now a small WinForms/WebView2 host instead of a bundled Electron runtime. It opens fullscreen on first launch, persists the display choice, and supports F11 / Alt+Enter / Escape and the in-game fullscreen control. It requires the system-shared WebView2 Evergreen Runtime and .NET Framework 4.8. The earlier Electron client remains available as a development fallback. Both render the same locally bundled game; this is not a Godot/Cocos engine migration.

Version 2 uses a full-screen game lobby, general selection, ten difficulty buttons, a dedicated battle screen, touch controls and bottom game navigation. The board sizes to the available viewport instead of requiring page scrolling. Gameplay settings and the codex live in game dialogs. Original painted riverlands art forms the background; fonts and all game assets are bundled locally.

Windows and Android client projects are in [clients/](clients/README.md). They bundle the game locally and connect to the same hosted PvP API. A browser installation manifest/service worker also enables cached offline bot/local play after the first successful load. Android APK compilation still requires the Android SDK; see the client README for current build status and commands.

Version 2.1.2 corrects misleading one-liberty danger hints. `groupSafety` checks whether the opponent actually has a legal winning capture. A group sharing a protected sealed liberty gets a green check instead of a false red warning. Fully sealed empty territories are off limits to the opponent at every size, including single-square eyes; the capture exception does not override the territory ban. Open gaps and pre-existing enemy castles can make a region playable. The original rules remain unchanged.

The in-game Codex is a 12-chapter illustrated comic with Guan Yu and Cao Cao, precise board diagrams and buttons that run each proposed move through the actual engine. The question-mark button beside Danger jumps to the eye chapter. A standalone reader is at `/rulebook.html`; the 12-page A5 PDF is `/assets/little-kingdoms-comic-rules.pdf`. These files are bundled and cached for offline reading. The guide explicitly labels this app's confirmed scoring and simultaneous-capture variants.

## Run locally

Requires Node.js 22 or newer. No dependency installation is needed to play, build, or run the engine/API tests.

```powershell
node scripts/dev.mjs
```

Open the printed URL (default `http://localhost:4173`). To select a different port:

```powershell
$env:PORT = '4317'
node scripts/dev.mjs
```

On the same network, a second device can use the host computer's LAN IP and chosen port, subject to the computer's firewall. For hosted friends, the site's visitor access policy must permit both players.

## Play

- Start a battle, tap a square, then Deploy. Tapping the selected square again also deploys.
- Choose Shu (blue, first) or Wei (orange, second), and any bot level from 1–10. Changing an active battle's settings asks before discarding it.
- Local PvP alternates on one device. Online creates a 6-character room code; the other player enters it or follows the invite link and joins.
- Bot and local games autosave in browser storage. Online seats reconnect after a reload in the same browser tab. Rooms expire after 12 hours. Closing a tab can discard that tab's online seat credential.
- Undo is available in local/bot play. It rewinds a complete human/bot turn when appropriate; it is disabled for online and completed matches.
- Castle danger hints mark groups with one remaining liberty. Territory shading is optional. Music begins after interaction; music/effects volume and master mute are saved.
- General faces temporarily become shocked or sad when a group is threatened or the human gains a clear advantage.

## Rules implemented

The board has 81 squares, a permanent white E5 shared wall, and 40 castles per player. Connected orthogonal same-color castles share liberties. A group with no liberties is captured, ending the match instantly. A self-capture is illegal unless the same move captures an enemy; simultaneous destruction awards Wei the win.

Empty orthogonally connected regions bordered only by one player's castles, the neutral wall and board edges count as that player's territory. A region reaching all four outer edges is the open field, not an enclosure. Enemy-bordered regions cannot be claimed. Opponents cannot deploy in sealed territory.

Two consecutive passes score enclosed **empty squares only**. The user's confirmed literal scoring variant is applied: subtract 2 from Shu, then require an adjusted lead of at least 3. Shu therefore needs **5 more raw territory** than Wei. All smaller margins and ties go to Wei.

Background supplied by the user: [Board's Eye View](https://www.boardseyeview.net/post/great-kingdom), [Board Game Diaries](https://boardgamediaries.com/great-kingdom/). This is a fan-made implementation with original art, not an official licensed edition.

## Bot implementation

`shared/ai.js` prioritizes the weakest unprotected group rather than letting territory compensate for an imminent capture. Protected eyes are recognized as safe. At every search ply, levels 3–10 enumerate immediate captures and required defenses, retaining defensive extensions/connections and forcing attacks outside the quiet-move beam. Quiescence search reads capture chases beyond the normal search horizon (up to 28 extensions at level 10). Alpha-beta pruning, position caching, transposition bounds and iterative deepening support strategic search up to depth 10. Passes are searched as real actions, never substituted after a defensive move has been selected.

Nominal search budgets range from 35 ms to 3600 ms; lower levels add more evaluation noise. A bounded 81-square enumeration supplies a legal, immediately safe fallback, and timed searches retain completed iterations. Work runs in a dedicated browser Worker. Actual depth depends on the device and position; there is no claimed tournament rating.

The defensive regression at A8 with an allied castle on A5 is reproducible from legal moves `[9,10,36,1,'pass',19]`. The old level 10 chose F4 and lost to A9 → A7 → A6; the updated engine plays A7 before that trap. Tests repeat this under all board symmetries and both factions. The final comparison against the prior engine won 12 of 12 games with equal 100 ms turn budgets, paired openings and seed 92173. This is a small development check, not a general strength rating. `scripts/ai-arena.mjs` can repeat it with the prior engine supplied as its module argument.

## Checks

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/validate-artifact.mjs
```

63 tests cover territory, neutral walls, group liberties, captures, suicide, simultaneous capture, supply, komi, defensive traps, symmetries, counter-captures, double threats, safe eyes, legal-capture hints, larger closed territory, open/contested regions, all comic examples, all ten tutorial lessons, defense/reply sequencing, tutorial refresh recovery, wrong-move rejection, search deadlines, passing, authorization, stale/concurrent online moves, shared avatars, native CORS, XP awards, repeat-claim protection and avatar locks.

`scripts/browser-check.mjs` uses the installed Microsoft Edge via its DevTools protocol. It expects a running preview at `http://127.0.0.1:4317` and verifies desktop and 360/390px mobile layouts, square cells, bot turns, undo, rules/roster dialogs, local results, two online clients, bidirectional moves and reconnect. Screenshots are saved to ignored `artifacts/`. This developer check launches headless Edge and needs local process/socket access.

`node scripts/comic-book-check.mjs` checks all twelve standalone chapters at 320/390/768px, verifies the interactive eye example, and exports a tagged A5 PDF to `output/pdf/little-kingdoms-comic-rules.pdf`. It uses the same running preview and installed Edge. After changing the guide, render and inspect all PDF pages, confirm exactly 12 pages, then copy the verified PDF to `public/assets/` before building clients or hosting artifacts. The portrait art is reused from the existing general atlases; the diagrams and speech layouts are editable HTML/CSS/SVG, not generated pictures of boards.

`node scripts/tutorial-check.mjs` plays every tutorial step through real mouse input, checks protected-eye and danger states, blocked attempts, reload recovery, match/room/XP isolation, 320px phone/landscape/desktop layouts and cached offline launch. It also uses the running preview at port 4317 and the installed Edge browser.

## Hosting and online persistence

`worker/index.js` is a Cloudflare-compatible Worker. `scripts/build.mjs` embeds the frontend, game modules and optimized WebP art into a single ESM output at `dist/server/index.js`.

`.openai/hosting.json` retains the Sites project identity and declares the `DB` D1 binding. `db/schema.js` defines online rooms; immutable generated SQL and metadata are in `drizzle/`. To generate a new migration after changing the schema, install development dependencies and run `npm run db:generate`. The Sites publish workflow packages and applies these migrations.

Online seat tokens use 256-bit random values and are stored only in the player's session storage. Only SHA-256 token digests are stored server-side. The server validates every move with the same engine, verifies seat/turn/version, checks same-origin POSTs and atomically updates by version. A stale or duplicate submission cannot overwrite another turn. Room state is never client-authoritative. Production rooms use D1; local rooms use ignored `data/rooms.json`.

New Sites are owner-private by default. Online invitees must have visitor access to the hosted site; a room code does not bypass the hosting access policy. Local PvP works without a second visitor.

This game's owner explicitly approved public publication; the deployed game is public and friend invite links can be opened without an owner invitation.

## Artwork

Built-in imagegen produced the original 20-general atlas and two expression variants. Final game assets: `public/assets/generals.webp`, `public/assets/generals-shock.webp`, `public/assets/generals-sad.webp`. Full-resolution PNG sources remain in `artwork/source/`. WebP files retain the original dimensions and are encoded at quality 88 for delivery. Exact generation/edit prompts are recorded in `artwork/prompts.txt`.

The additional twenty-general atlas is `public/assets/generals-unlock.webp`, with its PNG source and the exact built-in imagegen prompt at `artwork/source/generals-unlock.png` and `artwork/unlock-generals-prompt.txt`. Its first two rows are Shu and last two Wei. The music file is `public/assets/river-oath.mp3`; rebuilding it needs Python/numpy and ffmpeg. Runtime playback needs neither.
