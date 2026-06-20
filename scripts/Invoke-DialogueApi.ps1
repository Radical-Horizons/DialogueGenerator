<#
.SYNOPSIS
    Appelle l'API REST DialogueGenerator (dev/prod) avec auth automatique.

.DESCRIPTION
    Helper agents : health, login JWT si nécessaire, requête JSON.
    Base URL : env API_URL ou http://localhost:4243

.PARAMETER Method
    GET, POST, PUT, PATCH, DELETE

.PARAMETER Path
    Chemin API (ex. /api/v1/gdd-notion-sync/status). Query inline acceptee :
    /api/v1/gdd-notion-sync/sync?category_file=Personnages.json

.PARAMETER QueryString
    Query params en chaine (compatible npm). Ex. category_file=Personnages.json
    Preferer a -Query via npm run api:invoke (hashtable non serialisable par npm).

.PARAMETER Query
    Hashtable PowerShell — **uniquement** en appel direct pwsh -File, pas via npm.

.EXAMPLE
    npm run api:invoke -- -Method POST -Path /api/v1/gdd-notion-sync/sync -QueryString category_file=Personnages.json

.EXAMPLE
    pwsh -File scripts/Invoke-DialogueApi.ps1 -Method POST -Path /api/v1/gdd-notion-sync/sync -Query @{ category_file = 'Personnages.json' }
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('GET', 'POST', 'PUT', 'PATCH', 'DELETE')]
    [string] $Method,

    [Parameter(Mandatory = $true)]
    [string] $Path,

    [hashtable] $Query = @{},

    [string] $QueryString = '',

    [string] $BodyJson = '',

    [string] $BaseUrl = $(if ($env:API_URL) { $env:API_URL } else { 'http://localhost:4243' }),

    [string] $Token = $(if ($env:API_TOKEN) { $env:API_TOKEN } else { '' }),

    [string] $Username = $(if ($env:API_USERNAME) { $env:API_USERNAME } else { 'admin' }),

    [string] $Password = $(if ($env:API_PASSWORD) { $env:API_PASSWORD } else { 'admin123' })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NormalizedBaseUrl {
    param([string] $Url)
    return $Url.TrimEnd('/')
}

function Split-PathAndQuery {
    param([string] $RelativePath)
    $pathPart = if ($RelativePath.StartsWith('/')) { $RelativePath } else { "/$RelativePath" }
    $queryPart = ''
    $qIndex = $pathPart.IndexOf('?')
    if ($qIndex -ge 0) {
        $queryPart = $pathPart.Substring($qIndex + 1)
        $pathPart = $pathPart.Substring(0, $qIndex)
    }
    return @{ Path = $pathPart; Query = $queryPart }
}

function Parse-QueryString {
    param([string] $Raw)
    $table = @{}
    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return $table
    }
    foreach ($pair in $Raw.TrimStart('?').Split('&')) {
        if ([string]::IsNullOrWhiteSpace($pair)) { continue }
        $eq = $pair.IndexOf('=')
        if ($eq -lt 0) {
            $table[$pair] = ''
        }
        else {
            $key = [uri]::UnescapeDataString($pair.Substring(0, $eq))
            $val = [uri]::UnescapeDataString($pair.Substring($eq + 1))
            $table[$key] = $val
        }
    }
    return $table
}

function Merge-QueryHashtables {
    param(
        [hashtable] $Primary,
        [hashtable] $Secondary
    )
    $merged = @{}
    foreach ($key in $Secondary.Keys) {
        $merged[$key] = $Secondary[$key]
    }
    foreach ($key in $Primary.Keys) {
        $merged[$key] = $Primary[$key]
    }
    return $merged
}

function Build-Uri {
    param(
        [string] $Base,
        [string] $RelativePath,
        [hashtable] $QueryParams
    )
    $split = Split-PathAndQuery -RelativePath $RelativePath
    $pathPart = $split.Path
    $queryFromPath = Parse-QueryString -Raw $split.Query
    $mergedQuery = Merge-QueryHashtables -Primary $QueryParams -Secondary $queryFromPath
    $uriBuilder = [System.UriBuilder]::new("$Base$pathPart")
    if ($mergedQuery -and $mergedQuery.Count -gt 0) {
        $pairs = @()
        foreach ($key in $mergedQuery.Keys) {
            $val = $mergedQuery[$key]
            if ($null -eq $val) { continue }
            if ($val -is [bool]) {
                $pairs += "{0}={1}" -f [uri]::EscapeDataString($key), ([uri]::EscapeDataString($val.ToString().ToLower()))
            }
            else {
                $pairs += "{0}={1}" -f [uri]::EscapeDataString($key), [uri]::EscapeDataString([string]$val)
            }
        }
        $uriBuilder.Query = ($pairs -join '&')
    }
    return $uriBuilder.Uri.AbsoluteUri
}

function Invoke-DialogueApiRequest {
    param(
        [string] $HttpMethod,
        [string] $Uri,
        [string] $BearerToken,
        [string] $JsonBody
    )
    $headers = @{
        Accept = 'application/json'
    }
    if ($BearerToken) {
        $headers['Authorization'] = "Bearer $BearerToken"
    }
    $params = @{
        Method      = $HttpMethod
        Uri         = $Uri
        Headers     = $headers
        ErrorAction = 'Stop'
    }
    if ($JsonBody -and $HttpMethod -in @('POST', 'PUT', 'PATCH')) {
        $params['Body'] = $JsonBody
        $params['ContentType'] = 'application/json; charset=utf-8'
    }
    return Invoke-WebRequest @params -UseBasicParsing
}

function Get-AccessToken {
    param(
        [string] $Base,
        [string] $User,
        [string] $Pass
    )
    $loginUri = Build-Uri -Base $Base -RelativePath '/api/v1/auth/login' -QueryParams @{}
    $loginBody = (@{ username = $User; password = $Pass } | ConvertTo-Json -Compress)
    $resp = Invoke-DialogueApiRequest -HttpMethod 'POST' -Uri $loginUri -BearerToken '' -JsonBody $loginBody
    $parsed = $resp.Content | ConvertFrom-Json
    if (-not $parsed.access_token) {
        throw "Login OK mais access_token absent dans la reponse."
    }
    return [string]$parsed.access_token
}

$base = Get-NormalizedBaseUrl -Url $BaseUrl
$queryParams = @{}
if ($QueryString) {
    $queryParams = Merge-QueryHashtables -Primary $Query -Secondary (Parse-QueryString -Raw $QueryString)
}
elseif ($Query -and $Query.Count -gt 0) {
    $queryParams = $Query
}
$uri = Build-Uri -Base $base -RelativePath $Path -QueryParams $queryParams
$bearer = $Token.Trim()

try {
    $response = Invoke-DialogueApiRequest -HttpMethod $Method -Uri $uri -BearerToken $bearer -JsonBody $BodyJson
}
catch {
    $status = $null
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -in 401, 403 -and -not $bearer) {
        Write-Host "Auth requise ($status) - tentative login $Username..." -ForegroundColor Yellow
        $bearer = Get-AccessToken -Base $base -User $Username -Pass $Password
        $response = Invoke-DialogueApiRequest -HttpMethod $Method -Uri $uri -BearerToken $bearer -JsonBody $BodyJson
    }
    else {
        throw
    }
}

Write-Host "HTTP $($response.StatusCode) $Method $Path" -ForegroundColor Green
$content = $response.Content
if ($content) {
    try {
        $obj = $content | ConvertFrom-Json
        $obj | ConvertTo-Json -Depth 20
    }
    catch {
        Write-Output $content
    }
}

exit 0
