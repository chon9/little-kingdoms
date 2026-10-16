$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$version=(Get-Content clients/package.json -Raw | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid release version'}
$destination=Join-Path $root "clients/releases/LittleKingdoms-$version-Windows"
if(Test-Path -LiteralPath $destination){throw 'Release exists. Bump the version rather than overwrite a delivered build.'}
$steam=& "$PSScriptRoot/prepare-steam.ps1"
$sdk=Join-Path $root 'artifacts/webview2-sdk'
$sdkVersion='1.0.4258.31'
if(!(Test-Path -LiteralPath "$sdk/lib/net462/Microsoft.Web.WebView2.Core.dll")){
    New-Item -ItemType Directory -Path $sdk -Force | Out-Null
    $archive=Join-Path $root 'artifacts/webview2-sdk.zip'
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $sdk -Force
}
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -LiteralPath clients/www -Destination "$destination/www" -Recurse
foreach($file in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')){Copy-Item -LiteralPath "$sdk/lib/net462/$file" -Destination $destination}
Copy-Item -LiteralPath "$sdk/build/native/x64/WebView2Loader.dll" -Destination $destination
Copy-Item -LiteralPath "$sdk/LICENSE.txt" -Destination "$destination/WebView2-LICENSE.txt"
Copy-Item -LiteralPath clients/native/LittleKingdoms.ico -Destination $destination
foreach($file in @('Steamworks.NET.dll','steam_api64.dll')){Copy-Item -LiteralPath "$steam/Windows-x64/$file" -Destination $destination}
Copy-Item -LiteralPath "$steam/LICENSE.txt" -Destination "$destination/Steamworks.NET-LICENSE.txt"
Copy-Item -LiteralPath clients/native/STEAM-NOTICE.txt -Destination $destination
'480' | Set-Content -LiteralPath "$destination/steam_appid.txt" -Encoding ASCII
$compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /win32manifest:clients\native\app.manifest /win32icon:clients\native\LittleKingdoms.ico "/out:$destination\LittleKingdoms.exe" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/reference:$destination\Microsoft.Web.WebView2.Core.dll" "/reference:$destination\Microsoft.Web.WebView2.WinForms.dll" "/reference:$destination\Steamworks.NET.dll" clients\native\Program.cs clients\native\SteamBridge.cs
if($LASTEXITCODE -ne 0){throw 'Native Windows compilation failed'}
@'
Run LittleKingdoms.exe. Keep all files in this folder together.
STEAM MULTIPLAYER DEVELOPMENT BUILD -- AppID 480, not a Steam store release.
1. All players extract this complete ZIP on separate Windows PCs.
2. Run Steam, sign in with different accounts, and add each other as Steam friends.
3. Run LittleKingdoms.exe, choose Steam PvP, then Connect Steam.
4. Choose Quick Match for 1v1, or choose 1v1/2v2 and host a private Steam room.
5. For private games, send the large Steam lobby ID to your friends in chat.
6. Friends choose the same 1v1/2v2 format, paste the full ID and press Join.
The board opens only when all required players connect. Moves/pass/resign/rematch use
SteamNetworkingMessages reliable packets; they do not use the Cloudflare room API.
After a result, everyone must accept a rematch. Colors swap; the ID stays the same.
2v2 teams: host + first friend versus next two friends. Blue always starts; turns
alternate Blue A, Orange A, Blue B, Orange B. Both teammates share 40 castles.
Four consecutive individual passes end 2v2. A resignation forfeits that team.
Use Leave room to close the lobby. Temporary connection loss pauses input; keep
the client open while Steam reconnects. Host migration/rejoining a closed app is
not supported in this test. Start a new lobby after either client closes/leaves.
Steam friends invitations are optional; manual lobby ID joining is the reliable
fallback when the Steam overlay or invitation launch is unavailable.
Steam test duels are casual: eligible completed games award 40 local XP and never
create verified online wins/losses. Abruptly interrupted games award no XP.
Online duel is the original HTTPS crossplay mode for browser/Android/Windows;
it works without Steam. Steam PvP requires all players to use this Windows build.
This package uses only the official Valve runtime, not a Steam emulator.
No Steam password or web API key is needed by the game. AppID 480 must be replaced
with the game's own assigned AppID before an actual Steam release.
F11 or Alt+Enter: toggle fullscreen. Escape: close a menu, then leave fullscreen.
Fullscreen is enabled on first launch; your display choice is saved.
Requires Windows 10/11 x64, .NET Framework 4.8, and the shared WebView2 Evergreen Runtime.
Most Windows PCs already have these. If the runtime is missing, obtain it from:
https://developer.microsoft.com/microsoft-edge/webview2/
Bots, music, progression and pass-and-play work offline. Online duels use the hosted game server.
Skill ranks (20 kyu to 9 dan) use device-local Elo estimates separately from XP.
AI and online games count. Ranked AI disables undo; turn Ranked AI battles off
in Settings before a practice match. Restarting/abandoning after a move counts
as a defeat. Ranks are not official Go credentials or a verified server ladder.
Progress is local to this installation's Windows user profile, not an online account.
This development release is unsigned. It is not an app-store submission.
'@ | Set-Content -LiteralPath "$destination/START-HERE.txt" -Encoding UTF8
$zip="$destination.zip"
Compress-Archive -LiteralPath $destination -DestinationPath $zip
Get-Item -LiteralPath $zip | Select-Object FullName,Length
