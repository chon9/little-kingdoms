# Steam multiplayer development test · 3.0.0

The Windows client provides **Steam PvP** beside the original HTTPS **Online duel / 2v2 Alliance**. Steam uses Valve's official runtime with development **AppID 480 (Spacewar)**; only this technical notice uses that platform test name. Steam itself may display the AppID's platform name. The game cannot rename Valve's test application.

Actual moves, passes, resignation, heartbeats and rematch consent use reliable **ISteamNetworkingMessages** on channel 27109. They never call the HTTPS room API. Steam chooses direct or relayed routes; relay-only routing and the WebView2 overlay are not promised. The host orders commands and every peer replays the shared rules engine.

## Quick Match (1v1)

1. Run Steam, sign in, launch this Windows build and choose **Steam PvP → Connect Steam**.
2. Select **1v1 Duel**, then **Quick Match · 1v1**.
3. The public queue searches compatible waiting Little Kingdoms rooms. If none exists, it creates one and periodically searches again. Concurrent hosts converge on the lower lobby ID. Full or departed-room races retry safely.
4. Wait for an opponent, or use **Leave room** to cancel. The board starts only when both peers complete the game handshake.

Quick Match filters game namespace, protocol 2, duel format, queue marker, waiting phase and an open slot. Private rooms do not appear in its results. A real multi-account queue convergence test remains outstanding.

## Private 1v1 or 2v2 with friends

1. All players extract the complete ZIP on separate Windows PCs, run Steam using different accounts, and add one another as Steam friends.
2. Choose **Steam PvP → Connect Steam**, then choose the same **1v1 / 2v2** format on every PC.
3. The host chooses Blue or Orange and hosts a room. Share the complete large lobby ID in chat; friends paste it and press **Join**.
4. The board waits for two or four peers respectively. In 2v2, host plus the first friend are one team; the next two friends form the other team. The host publishes a stable SteamID-to-seat roster, so clients do not infer teams from their own member-list order.
5. **Blue always starts.** Teams share 40 castles per color; turn order is Blue A → Orange A → Blue B → Orange B. Four consecutive individual passes end 2v2. The original capture, territory lock and literal Blue handicap/scoring rules apply. Any teammate's resignation forfeits the team.
6. After a result, everyone must explicitly agree to a rematch. The lobby and teammates stay; Blue/Orange swap. In 2v2 this requires all four consents.

Invites can open an in-game confirmation when the client is running. The client is not registered as the actual AppID 480 application, so invitations are not a supported way to launch a closed client. Manual lobby ID joining does not require the overlay. When an invite supplies format metadata, the client selects that format.

Temporary packet loss retries commands with stable IDs and preserves confirmed history. Heartbeats pause input during outages. Leaving/closing a live client forfeits and blocks rematch; this test does not provide host migration or restoring a Steam seat after restarting the application. Create a new lobby after a departure. HTTPS crossplay retains its saved-seat reconnect behavior.

## Progress and requirements

Steam and 2v2 are casual: eligible individual seats earn **40 local XP**, not verified online leaderboard wins. A seat must have deployed two castles; the match must contain at least four. Resigning earns the resigning player no XP; interrupted Steam sessions earn none. Existing eligible server-authoritative 1v1 duel rankings remain separate.

Requires Windows 10/11 x64, .NET Framework 4.8, shared WebView2 Evergreen and signed-in Steam for Steam mode. Offline bots/music/local play and HTTPS crossplay do not require Steam. F11 / Alt+Enter toggle fullscreen; Escape first closes a menu. The portable development ZIP is unsigned.

## Build and trust boundary

Run `node scripts/build-client.mjs`, then `./scripts/package-windows-lite.ps1`. The package uses **Steamworks.NET 2025.164.1**, verified against its pinned maintainer-release SHA256. It includes licenses, Valve's official steam_api64.dll and test-only steam_appid.txt (480). No password, web API key or database credential is bundled. A production Steam release needs the developer's own assigned AppID and applicable SDK terms.

Only the bundled exact origin can use the narrow native bridge. It exposes bounded lobby/friend/message operations, not arbitrary OS commands or Steam APIs. Messages are capped at 24 KiB; senders must be members of the same compatible 2/4-player lobby and the original owner must still be present. Protocol, roster, match, action history, rules and rematch consent are checked. Reliable sends request restarting broken sessions. No anti-cheat or host migration claim is made.

## Verification and limits

153 engine/API/progression/artwork/Steam unit tests pass. Browser checks cover real four-seat web gameplay and an explicitly simulated four-peer Steam bridge, Blue-first order with an Orange host, four passes, four consents, same-room color rotation, Chinese and responsive layouts. Steam simulations assert zero HTTP room requests. New artwork and all seven owner-supplied Pixabay tracks decode and work offline.

The compiled native bridge initialized the official AppID 480 runtime, created real 2/4-seat private lobbies and a public Quick Match queue, delivered callbacks and left cleanly. **Real multi-account Steam moves and Quick Match convergence are not verified in this environment.** Local protocol simulations do not replace that friend test.

References: [Valve development example](https://partner.steamgames.com/doc/sdk/api/example), [Networking Messages](https://partner.steamgames.com/doc/api/ISteamNetworkingMessages), [Matchmaking](https://partner.steamgames.com/doc/api/ISteamMatchmaking), [Steamworks.NET release](https://github.com/rlabrecque/Steamworks.NET/releases/tag/2025.164.1).

