# Build (and optionally install) the Android app. The app bundles docs/index.html, so build the web app first:
#   python tools/build_web.py ; powershell -File tools/build_android.ps1 -Install
param([string]$Task=':app:assembleDebug',[switch]$Install,[string]$DeviceSerial='')
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolRoot='D:\CodexBuild\Dynamics'
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:GRADLE_USER_HOME=Join-Path $toolRoot 'gradle-home'
$env:TEMP=Join-Path $toolRoot 'tmp'; $env:TMP=$env:TEMP
$adb='C:\PATH_programs\platform-tools\adb.exe'
Push-Location $root
try {
    & "$root\gradlew.bat" $Task --console=plain
    if($LASTEXITCODE -ne 0){throw "Gradle failed: $LASTEXITCODE"}
    if($Install){
        $args=@(); if($DeviceSerial){$args+=@('-s',$DeviceSerial)}
        & $adb @args install -r 'app\build\outputs\apk\debug\app-debug.apk'
        if($LASTEXITCODE -ne 0){throw 'APK installation failed'}
        & $adb @args shell monkey -p dev.dynamic.app -c android.intent.category.LAUNCHER 1 | Out-Null
    }
}finally{Pop-Location}
