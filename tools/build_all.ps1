# Update EVERY app from the one source, with one command:
#   powershell -File tools/build_all.ps1                 web + smoke test + phone APK + watch APK + Windows app
#   powershell -File tools/build_all.ps1 -Install        ...and install on a connected phone / watch (adb)
#   powershell -File tools/build_all.ps1 -Restart        ...and restart a running Dynamic PC when its shell must be repackaged
#   -NoCheck  skip the smoke test (~40 s)   -SkipAndroid / -SkipPc  skip a target   -Repackage  force the Windows repackage
#
# What happens:
#   1. python tools/build_web.py       docs/index.html (+ pad, watch). Every build carries an id (git hash + time) shown in System.
#   2. node tools/check.mjs            headless desktop / phone / watch boot, every tab, presets, random, eyes, canvases. Stops on any error.
#   3. Desktop copies                  Dynamic.html, Dynamic Pad.html, Dynamic Lite (watch).html
#   4. Windows "live" folder           the page is copied to D:\CodexBuild\DynamicPC\live; an open Dynamic PC reloads itself in ~2 s.
#      The Electron shell is repackaged only when pc/ changed (a hash tells), so most updates take no repackaging at all.
#   5. Gradle (one run, parallel)      Dynamic.apk and Dynamic Watch.apk on the Desktop; -Install pushes them to the right device.
# Nothing is pushed to git or deployed: that stays a deliberate step.
param([switch]$SkipPc, [switch]$SkipAndroid, [switch]$NoCheck, [switch]$Install, [switch]$Restart, [switch]$Repackage)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$desk = [Environment]::GetFolderPath('Desktop')
$pcWork = 'D:\CodexBuild\DynamicPC'
$toolRoot = 'D:\CodexBuild\Dynamics'
$adb = 'C:\PATH_programs\platform-tools\adb.exe'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-home'
$env:TEMP = Join-Path $toolRoot 'tmp'; $env:TMP = $env:TEMP
$t = [Diagnostics.Stopwatch]::StartNew(); $log = @()
function Lap($name, $note = '') { $script:log += ('{0,-9} {1,6:N1}s  {2}' -f $name, $t.Elapsed.TotalSeconds, $note); $t.Restart() }
Push-Location $root
try {
  python tools/build_web.py | Out-Null
  $build = (Select-String -Path docs\index.html -Pattern 'const BUILD=(\{[^}]*\})' -List | ForEach-Object { $_.Matches[0].Groups[1].Value })
  Lap 'web' $build
  if (-not $NoCheck) { node tools/check.mjs; if ($LASTEXITCODE -ne 0) { throw 'Smoke test failed: nothing was shipped.' }; Lap 'check' 'desktop, phone, watch' }
  Copy-Item docs\index.html "$desk\Dynamic.html" -Force; Copy-Item docs\pad.html "$desk\Dynamic Pad.html" -Force; Copy-Item docs\watch.html "$desk\Dynamic Lite (watch).html" -Force
  New-Item -ItemType Directory -Force "$pcWork\live" | Out-Null
  foreach ($f in 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png') { Copy-Item "docs\$f" "$pcWork\live\$f" -Force }
  Lap 'copies' 'Desktop + Windows live folder'
  if (-not $SkipAndroid) {
    & "$root\gradlew.bat" ':app:assembleDebug' ':wear:assembleDebug' --parallel --console=plain -q
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed: $LASTEXITCODE" }
    Copy-Item app\build\outputs\apk\debug\app-debug.apk "$desk\Dynamic.apk" -Force
    Copy-Item wear\build\outputs\apk\debug\wear-debug.apk "$desk\Dynamic Watch.apk" -Force
    $note = 'phone + watch APKs'
    if ($Install -and (Test-Path $adb)) {
      $serials = (& $adb devices) | Select-String '\tdevice$' | ForEach-Object { ($_ -split '\t')[0] }
      if (-not $serials) { $note += ' (no device attached: nothing installed)' }
      foreach ($s in $serials) {
        $watch = (& $adb -s $s shell pm list features) -match 'android.hardware.type.watch'
        $apk = if ($watch) { 'wear\build\outputs\apk\debug\wear-debug.apk' } else { 'app\build\outputs\apk\debug\app-debug.apk' }
        & $adb -s $s install -r $apk | Out-Null; $note += " | installed on $s ($(if ($watch) {'watch'} else {'phone'}))"
      }
    }
    Lap 'android' $note
  }
  if (-not $SkipPc) {
    $files = 'pc\main.js', 'pc\preload.js', 'pc\package.json', 'pc\icon.ico' | Where-Object { Test-Path $_ }
    $hash = (($files | ForEach-Object { (Get-FileHash $_ -Algorithm SHA1).Hash }) -join '')
    $hashFile = "$pcWork\pc.hash"; $exe = "$pcWork\out\Dynamic-win32-x64\Dynamic.exe"
    $same = (Test-Path $hashFile) -and ((Get-Content $hashFile -Raw).Trim() -eq $hash) -and (Test-Path $exe)
    $running = [bool](Get-Process -Name Dynamic -ErrorAction SilentlyContinue)
    if ($same -and -not $Repackage) { Lap 'windows' $(if ($running) { 'shell unchanged: the open app reloads itself' } else { 'shell unchanged: nothing to repackage' }) }
    else {
      node tools/build_pc.mjs | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Windows app build failed' }
      Set-Content $hashFile $hash
      if ($running -and $Restart) { Get-Process -Name Dynamic | Stop-Process -Force; Start-Sleep -Seconds 2; $running = $false }
      if (-not $running) {   # nothing holds the old files: swap the new shell in now
        if (Test-Path "$pcWork\out") { Remove-Item "$pcWork\out" -Recurse -Force }
        Move-Item "$pcWork\out-next" "$pcWork\out"
        if ($Restart) { Start-Process $exe }
        Lap 'windows' $(if ($Restart) { 'repackaged and restarted' } else { 'repackaged' })
      } else { Lap 'windows' 'repackaged; it replaces the open one at the next launch of the Desktop shortcut (or use -Restart)' }
    }
  }
  $log
  'done  ' + $build
} finally { Pop-Location }
