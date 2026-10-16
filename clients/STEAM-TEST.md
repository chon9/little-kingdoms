# Spacewar Steam PvP test · 2.9.0

The Windows prerelease adds **Steam PvP** alongside **Online duel** crossplay. Steam PvP uses Valve's official runtime with development **AppID 480 (Spacewar)**. Lobby membership comes from Steam Matchmaking; actual moves, passes, resignation and rematch messages use reliable **ISteamNetworkingMessages** packets on channel 27109. They never call the HTTPS room API. Steam selects the route and can use Steam Datagram Relay; the game does not promise a relay-only route. The host orders commands and both clients replay the shared rules engine.

Peer-hosted test results are casual and never enter server-verified online win/loss rankings. Eligible completed games give 40 device-local XP; abruptly interrupted games give none.

## Play with a friend

1. Both players extract the complete Windows ZIP on separate PCs, run Steam, sign in with different accounts, and add each other as Steam friends.
2. Run `LittleKingdoms.exe`, choose **Steam PvP → Connect Steam**.
3. The host chooses Blue or Orange, then **Host Steam duel**. The board waits for the second player.
4. Copy the large **Steam lobby ID** and send it in chat. The friend pastes it into Steam PvP and presses **Join**. This is a friends-only lobby, so Steam friendship or an explicit invite is required.
5. Play normally. After a result, request a rematch; both players must accept before the same lobby starts a fresh match. Leave room is accessible from the battlefield, room and battle menu.

An optional Steam friend list sends normal lobby invites. Accepting an invite while this client is already running offers an in-game join confirmation. AppID 480 does not register this executable as the actual Steam Spacewar application, so invitations are not a supported way to launch a closed client. Manual lobby ID joining works without the overlay. WebView2 overlay behavior is not guaranteed.

Temporary lost packets are retried with the same command ID, preserving confirmed history. A heartbeat pauses input during a connection interruption and restores it after communication resumes. Closing/leaving either application ends that lobby's duel; this test does not provide host migration or seat restoration after restarting the app. Create a new lobby after a departure. The original HTTPS crossplay retains its saved-seat reconnect behavior and requires no Steam client.

Steam initializes when the user chooses Connect Steam. A missing Steam session gives a message and leaves offline play and HTTPS crossplay available. The test requires Windows 10/11 x64, .NET Framework 4.8 and WebView2 Evergreen. F11 / Alt+Enter toggle fullscreen; Escape closes a menu before leaving fullscreen. This is an unsigned portable development ZIP.

## Build and transport boundary

Run `node scripts/build-client.mjs`, then `./scripts/package-windows-lite.ps1` from the root. `scripts/prepare-steam.ps1` downloads **Steamworks.NET 2025.164.1** only from its maintainer's GitHub release, checks the pinned archive SHA256, and re-extracts it before packaging. The ZIP includes the wrapper's MIT license, Valve's official `steam_api64.dll`, provenance notices and test-only `steam_appid.txt` containing 480. Source contains no Steam password or web API key. An actual Steam store release needs the game's own assigned AppID and compliance with the Steamworks SDK terms.

Only the exact bundled origin can use the narrow native bridge. Arbitrary files, operating-system commands and arbitrary Steam APIs are not exposed. Incoming networking identities must belong to the same compatible two-player lobby; metadata checks `lk_game`, `lk_protocol` and the original owner. Packets are capped at 24 KiB, use a dedicated channel, and validate protocol, match identity, action history, legality and rematch consent. No host migration or anti-cheat claim is made for this casual test mode.

## Verification

All 136 unit tests passed, including 11 Steam protocol tests for reliable retries, rule replay, capture, rematch consent, invalid messages and disconnects. `node scripts/steam-check.mjs` tests the real UI with an explicitly simulated two-peer native bridge and asserts zero HTTP room requests. `node scripts/native-check.mjs --lite --online --steam` tests the compiled host and its original crossplay; if Steam is available, it also initializes AppID 480, creates and leaves a real friends-only lobby. That real lobby creation, callback delivery, waiting screen and cleanup were verified for this prerelease.

A real **two-account Steam move exchange has not been verified** in this environment. The simulated two-peer checks do not replace that test; friend testing is the purpose of this prerelease. Browser/Windows HTTPS crossplay, native fullscreen/offline play and the existing language screens passed their regression checks.

## 简体中文

双方在不同电脑上完整解压，使用不同账号登录 Steam 并互加好友。打开游戏，选择“Steam 对战 → 连接 Steam”。房主创建大厅并分享完整大厅编号，好友输入后加入。双方到齐才开局。落子、跳过、认输与再战通过 Steam 传输；再战需双方同意。符合条件的完整测试赛发放 40 本地经验，意外中断不发经验，均不计入服务器验证的在线胜负榜。原有“在线对战”仍可与浏览器、Android 和 Windows 跨平台联机，不需要 Steam。关闭或离开客户端后，请重新创建大厅；此版不支持房主迁移。此版本仅供 Spacewar 应用编号 480 开发测试，不是 Steam 商店正式版。

Primary references: [Valve's Spacewar example](https://partner.steamgames.com/doc/sdk/api/example), [Networking Messages](https://partner.steamgames.com/doc/api/ISteamNetworkingMessages), [Steam Matchmaking](https://partner.steamgames.com/doc/api/ISteamMatchmaking), [official Steamworks.NET release](https://github.com/rlabrecque/Steamworks.NET/releases/tag/2025.164.1).
