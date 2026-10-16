$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$version=(Get-Content clients/package.json -Raw | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid release version'}
$destination=Join-Path $root "clients/releases/LittleKingdoms-$version-Windows"
if(Test-Path -LiteralPath $destination){throw 'Release exists. Bump the version rather than overwrite a delivered build.'}
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
$compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /win32manifest:clients\native\app.manifest /win32icon:clients\native\LittleKingdoms.ico "/out:$destination\LittleKingdoms.exe" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/reference:$destination\Microsoft.Web.WebView2.Core.dll" "/reference:$destination\Microsoft.Web.WebView2.WinForms.dll" clients\native\Program.cs
if($LASTEXITCODE -ne 0){throw 'Native Windows compilation failed'}
@'
Run LittleKingdoms.exe. Keep all files in this folder together.
F11 or Alt+Enter: toggle fullscreen. Escape: close a menu, then leave fullscreen.
Fullscreen is enabled on first launch; your display choice is saved.
Requires Windows 10/11 x64, .NET Framework 4.8, and the shared WebView2 Evergreen Runtime.
Most Windows PCs already have these. If the runtime is missing, obtain it from:
https://developer.microsoft.com/microsoft-edge/webview2/
Bots, music, progression and pass-and-play work offline. Online duels use the hosted game server.
Progress is local to this installation's Windows user profile, not an online account.
This development release is unsigned. It is not an app-store submission.
'@ | Set-Content -LiteralPath "$destination/START-HERE.txt" -Encoding UTF8
$zip="$destination.zip"
Compress-Archive -LiteralPath $destination -DestinationPath $zip
Get-Item -LiteralPath $zip | Select-Object FullName,Length
