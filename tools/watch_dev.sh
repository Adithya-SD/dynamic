#!/bin/sh
export MSYS_NO_PATHCONV=1
# Push the freshly built watch engine into a debug install without rebuilding the APK, restart the app and show its log.
#   tools/watch_dev.sh <ip:port> [seconds]
ADB="${ADB:-C:/PATH_programs/platform-tools/adb.exe}"; S="$1"; SECS="${2:-20}"
python tools/build_web.py > /dev/null || exit 1
timeout 60 "$ADB" -s "$S" push wear/build/watchAssets/engine.js /data/local/tmp/dev-engine.js > /dev/null || exit 1
timeout 20 "$ADB" -s "$S" shell run-as dev.dynamic.watch cp /data/local/tmp/dev-engine.js files/dev-engine.js || exit 1
timeout 20 "$ADB" -s "$S" shell am force-stop dev.dynamic.watch
timeout 20 "$ADB" -s "$S" logcat -c
timeout 20 "$ADB" -s "$S" shell am start -n dev.dynamic.watch/.WatchActivity > /dev/null
sleep "$SECS"
timeout 30 "$ADB" -s "$S" logcat -d -s DynamicJS:V Dynamic:V AndroidRuntime:E
