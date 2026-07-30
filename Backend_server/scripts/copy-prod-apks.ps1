# Copy APK prod (flavor assembleProdDebug) vào public/downloads cho /get-app.
# Không commit APK (đã gitignore).
$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$dl = Join-Path $root "Backend_server\public\downloads"
New-Item -ItemType Directory -Path $dl -Force | Out-Null

$indoor = Join-Path $root "IndoorNavigationApp\app\build\outputs\apk\prod\debug\app-prod-debug.apk"
$tptp = Join-Path $root "TPTPbank\app\build\outputs\apk\prod\debug\app-prod-debug.apk"

if (-not (Test-Path $indoor)) { throw "Thiếu IndoorNav prod APK. Chạy: IndoorNavigationApp\gradlew.bat :app:assembleProdDebug" }
if (-not (Test-Path $tptp)) { throw "Thiếu TPTPbank prod APK. Chạy: TPTPbank\gradlew.bat :app:assembleProdDebug" }

Copy-Item $indoor (Join-Path $dl "IndoorNav.apk") -Force
Copy-Item $tptp (Join-Path $dl "TPTPbank.apk") -Force
Get-ChildItem $dl -Filter "*.apk" | ForEach-Object {
  "{0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB)
}
Write-Host "OK → $dl"
Write-Host "GitHub Release (khi đã cài gh):"
Write-Host "  gh release create apps-v1.1.0 `"$dl\IndoorNav.apk`" `"$dl\TPTPbank.apk`" -t `"Apps v1.1.0`" -n `"IndoorNav + TPTPbank prod (API Render)`""
