$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\theja\KeepFlip"
$repoUrl = "https://github.com/theJARiD85/KeepFlip-newUi.git"

Set-Location $projectRoot

Write-Host "Fetching the current analysis pipeline from KeepFlip-newUi/master..." -ForegroundColor Cyan
git fetch $repoUrl master
if ($LASTEXITCODE -ne 0) {
    throw "git fetch failed."
}

$analysisFiles = @(
    "services/item-analysis-service.ts",
    "services/itemAiService.ts",
    "services/ebaySoldCompsService.ts",
    "services/local-vision-service.ts",
    "types/item-analysis.ts"
)

foreach ($file in $analysisFiles) {
    git cat-file -e "FETCH_HEAD`:$file"
    if ($LASTEXITCODE -ne 0) {
        throw "The fetched master branch does not contain $file."
    }
}

Write-Host "Restoring the analysis and valuation service files..." -ForegroundColor Cyan
git checkout FETCH_HEAD -- $analysisFiles
if ($LASTEXITCODE -ne 0) {
    throw "Could not restore the analysis service files."
}

$scannerPath = Join-Path $projectRoot "components\scanner\scanner-screen.native.tsx"
if (-not (Test-Path $scannerPath)) {
    throw "Scanner file not found: $scannerPath"
}

$text = [System.IO.File]::ReadAllText($scannerPath)
$analysisBackdropAnchor = '{analysisBackdropUri ? ('
$anchorIndex = $text.IndexOf($analysisBackdropAnchor, [System.StringComparison]::Ordinal)

if ($anchorIndex -lt 0) {
    throw "Could not find the scanner analysis-backdrop block."
}

$meshCondition = '{generatedModel ? ('
$meshIndex = $text.IndexOf(
    $meshCondition,
    $anchorIndex,
    [System.StringComparison]::Ordinal
)

if ($meshIndex -ge 0) {
    $replacement = '{generatedModel && analysisState?.status === "result" ? ('
    $text = $text.Remove($meshIndex, $meshCondition.Length)
    $text = $text.Insert($meshIndex, $replacement)
    Write-Host "Deferred the animated 3D Canvas until analysis and valuation finish." -ForegroundColor Green
}
elseif (
    $text.IndexOf(
        '{generatedModel && analysisState?.status === "result" ? (',
        $anchorIndex,
        [System.StringComparison]::Ordinal
    ) -lt 0
) {
    throw "The scanner mesh condition has an unexpected source layout."
}

$scrimCondition = 'generatedModel && styles.cameraScrimWithModel'
$scrimIndex = $text.IndexOf(
    $scrimCondition,
    $anchorIndex,
    [System.StringComparison]::Ordinal
)

if ($scrimIndex -ge 0) {
    $scrimReplacement = @'
generatedModel &&
              analysisState?.status === "result" &&
              styles.cameraScrimWithModel
'@
    $text = $text.Remove($scrimIndex, $scrimCondition.Length)
    $text = $text.Insert($scrimIndex, $scrimReplacement.Trim())
}

$atmosphereCondition = 'analysisState?.status === "analyzing" && !generatedModel'
$atmosphereIndex = $text.IndexOf(
    $atmosphereCondition,
    $anchorIndex,
    [System.StringComparison]::Ordinal
)

if ($atmosphereIndex -ge 0) {
    $atmosphereReplacement = 'analysisState?.status === "analyzing"'
    $text = $text.Remove($atmosphereIndex, $atmosphereCondition.Length)
    $text = $text.Insert($atmosphereIndex, $atmosphereReplacement)
    Write-Host "Kept the lightweight scanner atmosphere active during analysis." -ForegroundColor Green
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($scannerPath, $text, $utf8NoBom)

Write-Host "Verifying required analysis modules..." -ForegroundColor Cyan
foreach ($file in $analysisFiles) {
    if (-not (Test-Path (Join-Path $projectRoot $file))) {
        throw "Required file is still missing: $file"
    }
}

Write-Host "Running TypeScript validation..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    throw "TypeScript validation failed. Review the first reported error above."
}

Remove-Item -Recurse -Force (Join-Path $projectRoot ".expo") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Analysis and valuation recovery patch completed." -ForegroundColor Green
Write-Host "Start Metro with: npx expo start --clear" -ForegroundColor Yellow
