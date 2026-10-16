$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$version='2025.164.1'
$digest='9412348cc404563be5a43a28347cfeda3c679ee044a14d87a507ed2d796a537d'
$cache=Join-Path $root 'artifacts/steamworks-net'
$archive=Join-Path $cache "Steamworks.NET-Standalone_$version.zip"
$unpacked=Join-Path $cache $version
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if(!(Test-Path -LiteralPath $archive)){
    Invoke-WebRequest -Uri "https://github.com/rlabrecque/Steamworks.NET/releases/download/$version/Steamworks.NET-Standalone_$version.zip" -OutFile $archive
}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest){throw 'Steamworks.NET archive checksum does not match the pinned official release.'}
# Re-extract the verified archive so modified cached DLLs cannot enter a release.
Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
return $unpacked
