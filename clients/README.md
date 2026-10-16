# Installed clients

The installed clients bundle the game's UI, rules engine, bot Worker, artwork and fonts. They do not embed a browser pointing at a hosted page. Bot and same-device PvP work offline. Online rooms use the same authoritative HTTPS Worker/D1 API as browser players, so Windows, Android and browser users can share a room.

Version 2.4 includes the English / 简体中文 switch, all translation catalogs, and both language editions of the comic PDF. The header button and Settings language choice work offline, save per device, and preserve the current match. Nicknames and room codes stay unchanged. Optional Chinese character speech depends on a Chinese voice being installed on the device; normal gameplay and dialogue text do not require one.

Version 2.3 bundles all 30 collectible castle sprites and 20 board surfaces. Welcome and level-up pulls, owned appearances and equipment work offline and save in the local profile. Public leaderboards need internet: device progress is unranked, and online wins/losses come from eligible server-recorded duels. Your guest commander token stays in the local profile; it is never bundled in a release. Castle equipment is shared with your next online opponent; each player sees their own board theme.

No Cloudflare account is needed to play. Online play requires internet access and the continued availability of the hosted service. Hosting accounts and any usage quotas belong to the deployment platform, not to individual players. The installed game uses device CPU/RAM for rendering and bot search; the PvP server and database run in the cloud.

## Shared client build

From the repository root:

```powershell
node scripts/build-client.mjs
```

This writes ignored `clients/www/` and sets its API origin to `https://shu-wei-kingdoms.alexchon911.chatgpt.site`. Hosted browser builds retain same-origin API requests. No token, account secret, database credential or administrative key is bundled.

Use Node >=22.12 for native tooling. Install `clients/package.json` dependencies inside `clients/`. Electron 44 requires an explicit `node node_modules/electron/install.js` runtime download after installation if it has not already been installed. Capacitor's three packages are pinned together at 8.5.3.

## Windows

Version **2.9.0** is a **Spacewar Steam PvP test** prerelease. It adds a separate Steam lobby and reliable native Steam gameplay transport while preserving the original HTTPS crossplay option. Read [Steam test instructions, architecture and verification limits](STEAM-TEST.md) before testing with friends. Browser and Android builds retain their existing online transport; only the native Windows host exposes the Steam bridge.

The primary 2.1 Windows client is a small native WinForms window backed by the system-shared **WebView2 Evergreen Runtime**. It bundles the complete game locally without shipping another Chromium installation. It requires Windows 10/11 x64, .NET Framework 4.8, and WebView2 Evergreen (present on Windows 11 and most Windows 10 PCs). Missing-runtime startup displays Microsoft's download address instead of silently installing software.

Version 2.2 includes the ten-lesson playable Field Academy and the complete comic guide offline. The tutorial has its own practice boards and saved lesson progress; it does not overwrite real games or earn match XP. Tutorial, comic, board and game navigation all stay within the bundled local origin.

From the repository root, build the client assets and run `./scripts/package-windows-lite.ps1`. This downloads the pinned official Microsoft WebView2 SDK 1.0.4258.31 and checksum-verified Steamworks.NET package when needed, compiles with the .NET Framework compiler, and creates `clients/releases/LittleKingdoms-2.9.0-Windows.zip`. Release folders are not silently overwritten. The ZIP is approximately 12 MiB, excluding the shared OS runtime. All files stay together when extracted.

The game opens borderless fullscreen on its first normal launch. The in-game fullscreen button, F11 and Alt+Enter toggle modes; Escape leaves fullscreen after closing any open dialog. Your last display mode saves in `%LOCALAPPDATA%/LittleKingdoms/display.txt`. Progress and preferences live in that user's WebView2 profile. Game files run at the isolated virtual origin `https://kingdoms.local/index.html`; these are mapped local assets, not an external website. There is no address bar, local HTTP server or open listening port in normal use.

The host accepts display controls and the bounded Steam test operations documented above, only from its own exact origin. Arbitrary OS/file access is not exposed. Navigation/popups/downloads and sensitive permissions are blocked. QA alone enables a DevTools port and uses an invisible window and a separate profile in ignored `artifacts/`. The shared runtime still uses device CPU/RAM; reducing download size does not remove rendering or AI resource usage.

`node scripts/native-check.mjs --lite` tests the actual lightweight executable, native fullscreen state and bounds restoration, F11/Alt+Enter/Escape, isolated renderer, offline launch and the level-10 defensive regression. After deployment, add `--online` to verify native-to-browser API moves and shared avatars.

The older Electron wrapper remains a development fallback: from `clients/`, `npm run desktop`; from the root, `node scripts/package-windows.mjs` creates its separately named release folder. The Electron fallback also has a narrow display bridge and fullscreen fixes. Previously downloaded clients retain their old bundled UI/bots until replaced with a new release.

Run **LittleKingdoms.exe** and retain every other file alongside it. A ZIP of that complete folder is the portable distribution. This is an unsigned development release, not a signed installer or an app-store submission.

The Electron fallback uses a registered `app://kingdoms` protocol, `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a restrictive CSP, a narrow display-only IPC bridge and no untrusted navigation or popups. It loads bundled assets through a path-bounded protocol handler. Standard browser certificate and origin checks stay enabled.

`node scripts/native-check.mjs` verifies the actual Electron client, an isolated renderer, offline startup, a locally computed bot turn and undo. After deploying the API, `node scripts/native-check.mjs --online` also creates a native-hosted room, joins it from an HTTPS client, exchanges both players' moves and ends the test battle.

## Android

The generated project is `clients/android/`. It targets Android SDK 36 and requires an Android SDK/Android Studio installation and a compatible JDK (see the current Capacitor Android requirements). An APK has not been built on this machine because the Android SDK is absent.

After building shared client assets, from `clients/`:

```powershell
npm run android:sync
npm run android:open
```

Use Android Studio to install the SDK and build/run on a device. With a configured JDK and SDK, a debug APK can also be produced from `clients/android/`:

```powershell
.\gradlew.bat assembleDebug
```

The output is `app/build/outputs/apk/debug/app-debug.apk`. A distributable release requires a signing key and a release build; no release key has been created or uploaded. Device behavior and APK builds remain unverified until an Android SDK/device is available.

Capacitor serves bundled files under `https://localhost`. The game requests only the INTERNET permission, disables cleartext traffic and Android backup, and does not request camera, microphone or location permissions.

## Browser install / offline play

The public game includes an install manifest and service worker. A supporting browser can install it from its menu, or Settings → Install game when the browser offers installation. The application shell, general expressions, backdrop and fonts are cached. Room APIs are always network-only. Reloading while offline can open the cached game once the initial cache finishes. This is a browser-installed app, distinct from the APK and Windows executable.

## Cross-client protocol

The API accepts the hosted same origin and the exact native origins `https://kingdoms.local`, `app://kingdoms`, `https://localhost`, `http://localhost` and `capacitor://localhost`. Preflights permit only GET/POST/OPTIONS and Content-Type/Authorization. There is no wildcard origin or credential-cookie access. Room ownership still requires a random seat token; CORS is not authentication. Unknown and opaque (`null`) origins are rejected. A server-generated stable match ID and both cosmetic avatar IDs are stored in the room's state. Avatars cannot be changed through move requests. Unlocks are device-local and unranked, not account-verified achievements.

Browser seats use session storage to keep tabs independent. Native seats also persist in local storage, allowing a closed app to reconnect until the 12-hour room expiry. Tokens are never sent in invite URLs.

Primary documentation: [Capacitor workflow](https://capacitorjs.com/docs/basics/workflow), [Capacitor configuration](https://capacitorjs.com/docs/config), [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

Windows host documentation: [WebView2 runtime distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution), [local content and virtual origins](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content). A future Godot rebuild can export native Windows/Android builds and reuse the HTTPS room protocol, but would require porting the UI and game/AI code; the 2.1 client solves the immediate download/fullscreen issue while preserving the tested JavaScript game.
