param(
  [string]$DatabaseId = 'keepflip',
  [string]$TableId = 'marketplace_form_configs'
)

$ErrorActionPreference = 'Stop'

function Invoke-AppwriteJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & appwrite @Arguments --json 2>&1
  if ($LASTEXITCODE -ne 0) {
    $details = ($output | ForEach-Object { [string]$_ }) -join "`n"
    throw "Appwrite CLI command failed: appwrite $($Arguments -join ' ')`n$details"
  }
  $json = ($output | ForEach-Object { [string]$_ }) -join "`n"
  if (-not $json.Trim()) { return $null }
  return $json | ConvertFrom-Json
}

function Get-Records {
  param($Response, [string]$Property)
  if (-not $Response -or -not $Response.PSObject.Properties[$Property]) {
    return @()
  }
  return @($Response.$Property)
}

$tables = Invoke-AppwriteJson @(
  'tablesdb', 'list-tables', '--database-id', $DatabaseId,
  '--search', $TableId, '--limit', '100'
)
$table = (Get-Records $tables 'tables') | Where-Object { $_.'$id' -eq $TableId } | Select-Object -First 1

if (-not $table) {
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-table', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--name', 'Crosslisting Form Selectors',
    '--permissions', 'read("any")'
  )
  Write-Host "Created Appwrite table $TableId in $DatabaseId."
}

$columnsResponse = Invoke-AppwriteJson @(
  'tablesdb', 'list-columns', '--database-id', $DatabaseId,
  '--table-id', $TableId, '--limit', '100'
)
$existingColumnKeys = @((Get-Records $columnsResponse 'columns') | ForEach-Object { $_.key })

if ($existingColumnKeys -notcontains 'marketplace') {
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-string-column', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--key', 'marketplace', '--required', '--size', '32'
  )
}

if ($existingColumnKeys -notcontains 'selectorsJson') {
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-longtext-column', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--key', 'selectorsJson', '--required'
  )
}

if ($existingColumnKeys -notcontains 'enabled') {
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-boolean-column', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--key', 'enabled', '--required=false', '--xdefault'
  )
}

$deadline = (Get-Date).AddSeconds(60)
do {
  Start-Sleep -Seconds 2
  $columnsResponse = Invoke-AppwriteJson @(
    'tablesdb', 'list-columns', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--limit', '100'
  )
  $columns = Get-Records $columnsResponse 'columns'
  $readyKeys = @($columns | Where-Object { $_.status -eq 'available' } | ForEach-Object { $_.key })
  $requiredColumnKeys = @('marketplace', 'selectorsJson', 'enabled')
  $ready = @($requiredColumnKeys | Where-Object { $readyKeys -contains $_ }).Count -eq 3
  $columnErrors = @($columns | Where-Object { $_.status -eq 'failed' })
  if ($columnErrors.Count -gt 0) {
    throw 'Appwrite could not finish creating one or more selector table columns.'
  }
} while (-not $ready -and (Get-Date) -lt $deadline)

if (-not $ready) {
  throw 'Timed out waiting for Appwrite selector columns to become available.'
}

$indexResponse = Invoke-AppwriteJson @(
  'tablesdb', 'list-indexes', '--database-id', $DatabaseId,
  '--table-id', $TableId, '--limit', '100'
)
$indexes = Get-Records $indexResponse 'indexes'
if (-not ($indexes | Where-Object { $_.key -eq 'marketplace_unique' })) {
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-index', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--key', 'marketplace_unique',
    '--type', 'unique', '--columns', 'marketplace'
  )
}

$rowsResponse = Invoke-AppwriteJson @(
  'tablesdb', 'list-rows', '--database-id', $DatabaseId,
  '--table-id', $TableId, '--limit', '100'
)
$existingPlatforms = @((Get-Records $rowsResponse 'rows') | ForEach-Object { $_.marketplace })
foreach ($platform in @('depop', 'poshmark', 'facebookMarketplace', 'mercari', 'offerUp')) {
  if ($existingPlatforms -contains $platform) { continue }
  $rowData = @{
    marketplace = $platform
    selectorsJson = '{}'
    enabled = $true
  } | ConvertTo-Json -Compress
  $null = Invoke-AppwriteJson @(
    'tablesdb', 'create-row', '--database-id', $DatabaseId,
    '--table-id', $TableId, '--row-id', $platform, '--data', $rowData
  )
}

Write-Host "Selector table $TableId is ready with one editable row per marketplace."
