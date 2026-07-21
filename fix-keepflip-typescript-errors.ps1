$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\theja\KeepFlip"
Set-Location $projectRoot

function Read-Utf8File([string]$relativePath) {
    $path = Join-Path $projectRoot $relativePath
    if (-not (Test-Path $path)) {
        throw "Required file not found: $relativePath"
    }
    return [System.IO.File]::ReadAllText($path)
}

function Write-Utf8File([string]$relativePath, [string]$content) {
    $path = Join-Path $projectRoot $relativePath
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Replace-RegexOnce(
    [string]$relativePath,
    [string]$pattern,
    [string]$replacement,
    [string]$description
) {
    $content = Read-Utf8File $relativePath
    $regex = [System.Text.RegularExpressions.Regex]::new(
        $pattern,
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )

    if (-not $regex.IsMatch($content)) {
        Write-Host "Already fixed or source changed: $description" -ForegroundColor DarkYellow
        return
    }

    $updated = $regex.Replace($content, $replacement, 1)
    Write-Utf8File $relativePath $updated
    Write-Host "Fixed: $description" -ForegroundColor Green
}

Write-Host "Fixing the 13 TypeScript errors reported by tsc..." -ForegroundColor Cyan

# 1. inventory.tsx: add useMemo.
Replace-RegexOnce `
    "app\(app)\inventory.tsx" `
    "import\s*\{\s*useCallback\s*,\s*useState\s*\}\s*from\s*(['""]react\1);" `
    "import { useCallback, useMemo, useState } from `$1react`$1;" `
    "inventory feed useMemo import"

# 2-6. React Native 0.85 exposes StyleSheet.absoluteFill, not absoluteFillObject.
$absoluteFillFiles = @(
    "components\auth\keepflip-auth-screen.tsx",
    "components\scanner\item-analysis-bubbles.tsx",
    "components\scanner\multi-scan-photo-review.tsx",
    "components\scanner\scanner-screen.tsx",
    "components\scanner\scanner-tool-carousel.tsx"
)

foreach ($relativePath in $absoluteFillFiles) {
    $content = Read-Utf8File $relativePath
    if ($content.Contains("StyleSheet.absoluteFillObject")) {
        $content = $content.Replace(
            "StyleSheet.absoluteFillObject",
            "StyleSheet.absoluteFill"
        )
        Write-Utf8File $relativePath $content
        Write-Host "Fixed: $relativePath absolute-fill style" -ForegroundColor Green
    }
    else {
        Write-Host "Already fixed: $relativePath absolute-fill style" -ForegroundColor DarkYellow
    }
}

# 7. Normalize ColorSchemeName before indexing light/dark maps.
Replace-RegexOnce `
    "components\parallax-scroll-view.tsx" `
    "const colorScheme = useColorScheme\(\) \?\? 'light';" `
    "const colorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';" `
    "parallax color-scheme indexing"

# 8. React Three Fiber native CanvasProps does not expose dpr.
Replace-RegexOnce `
    "components\scanner\mesh-viewer.native.tsx" `
    "^\s*dpr=\{\[1,\s*1\.5\]\}\s*\r?\n" `
    "" `
    "native MeshViewer Canvas dpr prop"

# 9. Fix expo-symbols name union so it is not used as a Record key.
$iconPath = "components\ui\icon-symbol.tsx"
$iconContent = Read-Utf8File $iconPath

$iconContent = $iconContent.Replace(
    "import { SymbolWeight, SymbolViewProps } from 'expo-symbols';",
    "import { SymbolWeight } from 'expo-symbols';"
)
$iconContent = $iconContent.Replace(
    'import { SymbolWeight, SymbolViewProps } from "expo-symbols";',
    'import { SymbolWeight } from "expo-symbols";'
)

$iconContent = [System.Text.RegularExpressions.Regex]::Replace(
    $iconContent,
    "type IconMapping = Record<SymbolViewProps\['name'\], ComponentProps<typeof MaterialIcons>\['name'\]>;\r?\ntype IconSymbolName = keyof typeof MAPPING;\r?\n",
    "type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];`r`n"
)

$iconContent = [System.Text.RegularExpressions.Regex]::Replace(
    $iconContent,
    "\}\s+as IconMapping;",
    "} as const satisfies Record<string, MaterialIconName>;"
)

if (-not $iconContent.Contains("type IconSymbolName = keyof typeof MAPPING;")) {
    $iconContent = $iconContent.Replace(
        "} as const satisfies Record<string, MaterialIconName>;",
        "} as const satisfies Record<string, MaterialIconName>;`r`n`r`ntype IconSymbolName = keyof typeof MAPPING;"
    )
}

Write-Utf8File $iconPath $iconContent
Write-Host "Fixed: IconSymbol mapping types" -ForegroundColor Green

# 10-11. Normalize the theme before indexing props and Colors.
$themePath = "hooks\use-theme-color.ts"
$themeContent = Read-Utf8File $themePath
$themeContent = $themeContent.Replace(
    "const theme = useColorScheme() ?? 'light';",
    "const theme = useColorScheme() === 'dark' ? 'dark' : 'light';"
)
$themeContent = $themeContent.Replace(
    'const theme = useColorScheme() ?? "light";',
    'const theme = useColorScheme() === "dark" ? "dark" : "light";'
)
Write-Utf8File $themePath $themeContent
Write-Host "Fixed: useThemeColor unspecified scheme handling" -ForegroundColor Green

# 12. Appwrite React Native SDK calls the execution route field xpath.
$tripoPath = "services\tripo3d-model-api.ts"
$tripoContent = Read-Utf8File $tripoPath
$tripoContent = [System.Text.RegularExpressions.Regex]::Replace(
    $tripoContent,
    "(\r?\n\s*)path:\s*(['""])/\2,",
    '$1xpath: $2/$2,',
    1
)
Write-Utf8File $tripoPath $tripoContent
Write-Host "Fixed: Appwrite createExecution xpath parameter" -ForegroundColor Green

Write-Host ""
Write-Host "Running TypeScript validation..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    throw "TypeScript still reports errors. Copy the new error list; these 13 reported errors have been patched."
}

Remove-Item -Recurse -Force (Join-Path $projectRoot ".expo") -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "TypeScript validation passed." -ForegroundColor Green
Write-Host "Start Metro with: npx expo start --clear" -ForegroundColor Yellow
