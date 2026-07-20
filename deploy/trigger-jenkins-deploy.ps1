param(
  [string]$JenkinsUrl = "https://jenkins.douglasdomingues.com.br",
  [string]$JobPath = "job/Shop%20Heroes%20Planner/job/deploy-production",
  [string]$Token = $env:SHOP_HEROES_PLANNER_JENKINS_TOKEN,
  [string]$TokenFile = "",
  [string]$User = $env:JENKINS_USER,
  [string]$Password = $env:JENKINS_PASSWORD,
  [string]$CredentialFile = "",
  [string]$Branch = "main",
  [bool]$RunNpmInstallOnServer = $true,
  [bool]$RunDbMigrations = $false
)

$ErrorActionPreference = "Stop"

if (-not $Token -and $TokenFile) {
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Token file not found: $TokenFile"
  }

  $Token = (Get-Content -Raw -LiteralPath $TokenFile).Trim()
}

if (-not $Token) {
  throw "Set SHOP_HEROES_PLANNER_JENKINS_TOKEN or pass -TokenFile."
}

$encodedToken = [Uri]::EscapeDataString($Token)
$encodedBranch = [Uri]::EscapeDataString($Branch)
$triggerQuery = "token=$encodedToken&BRANCH=$encodedBranch&RUN_NPM_INSTALL_ON_SERVER=$($RunNpmInstallOnServer.ToString().ToLowerInvariant())&RUN_DB_MIGRATIONS=$($RunDbMigrations.ToString().ToLowerInvariant())"
$triggerUrl = "$($JenkinsUrl.TrimEnd('/'))/$JobPath/buildWithParameters?$triggerQuery"

if ((-not $User -or -not $Password) -and $CredentialFile) {
  if (-not (Test-Path -LiteralPath $CredentialFile)) {
    throw "Credential file not found: $CredentialFile"
  }

  $credentialPairs = @{}
  Get-Content -LiteralPath $CredentialFile | ForEach-Object {
    $separatorIndex = $_.IndexOf(":")
    if ($separatorIndex -ge 0) {
      $credentialPairs[$_.Substring(0, $separatorIndex).Trim()] = $_.Substring($separatorIndex + 1).Trim()
    }
  }

  $User = $credentialPairs.user
  $Password = $credentialPairs.pass
}

if ($User -and $Password) {
  $userPass = "{0}:{1}" -f $User, $Password
  $cookieFile = Join-Path $env:TEMP ("jenkins-trigger-cookie-" + [guid]::NewGuid().ToString() + ".txt")

  try {
    $crumbJson = & curl.exe -sS -u $userPass -c $cookieFile -b $cookieFile "$($JenkinsUrl.TrimEnd('/'))/crumbIssuer/api/json"
    $crumb = $crumbJson | ConvertFrom-Json
    $statusCode = & curl.exe -sS -o NUL -w "%{http_code}" -u $userPass -c $cookieFile -b $cookieFile -H "$($crumb.crumbRequestField): $($crumb.crumb)" -X POST $triggerUrl

    if ([int]$statusCode -lt 200 -or [int]$statusCode -ge 400) {
      throw "Jenkins deploy trigger failed with HTTP $statusCode."
    }

    Write-Output "Jenkins deploy trigger accepted with HTTP $statusCode."
    exit 0
  } finally {
    Remove-Item -LiteralPath $cookieFile -Force -ErrorAction SilentlyContinue
  }
} else {
  $response = Invoke-WebRequest -Uri $triggerUrl -Method Post -UseBasicParsing
}

if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
  throw "Jenkins deploy trigger failed with HTTP $($response.StatusCode)."
}

Write-Output "Jenkins deploy trigger accepted with HTTP $($response.StatusCode)."
