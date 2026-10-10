# One command to build everything and put the results on the Desktop, with timings:
#   powershell -File tools/build_all.ps1            (web, phone APK, watch APK, Windows app)
#   powershell -File tools/build_all.ps1 -SkipPc    (skip the ~1 minute Windows packaging)
# Both APKs are built by ONE Gradle run (one JVM start, tasks in parallel); a warm daemon makes it a few seconds.
param([switch]$SkipPc, [switch]$SkipAndroid)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$desk = [Environment]::GetFolderPath('Desktop')
$toolRoot = 'D:\CodexBuild\Dynamics'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-home'
$env:TEMP = Join-Path $toolRoot 'tmp'; $env:TMP = $env:TEMP
$t = [Diagnostics.Stopwatch]::StartNew(); $lap = { param($n) '{0,-10} {1,6:N1}s' -f $n, $t.Elapsed.TotalSeconds; $t.Restart() }
Push-Location $root
try {
  python tools/build_web.py | Out-Null; & $lap 'web'
  Copy-Item docs\index.html "$desk\Dynamic.html" -Force; Copy-Item docs\pad.html "$desk\Dynamic Pad.html" -Force; Copy-Item docs\watch.html "$desk\Dynamic Lite (watch).html" -Force
  if (-not $SkipAndroid) {
    & "$root\gradlew.bat" ':app:assembleDebug' ':wear:assembleDebug' --parallel --console=plain -q
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed: $LASTEXITCODE" }
    Copy-Item app\build\outputs\apk\debug\app-debug.apk "$desk\Dynamic.apk" -Force
    Copy-Item wear\build\outputs\apk\debug\wear-debug.apk "$desk\Dynamic Watch.apk" -Force
    & $lap 'android'
  }
  if (-not $SkipPc) { node tools/build_pc.mjs | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'PC build failed' }; & $lap 'windows' }
  'done'
} finally { Pop-Location }
