param(
    [string]$EnvFile = ".env",
    [int]$IntervalMilliseconds = 500
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DotEnvValues {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Unable to find $Path."
    }

    $result = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        $pair = $trimmed.Split('=', 2)
        if ($pair.Count -ne 2) {
            continue
        }

        $key = $pair[0].Trim()
        $value = $pair[1].Trim()

        if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        elseif ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $result[$key] = $value
    }

    return $result
}

function New-CpuMetricJson {
    param([int]$CpuValue)

    $timeUnixNano = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000

    $template = @'
{
  "resourceMetrics": [
    {
      "scopeMetrics": [
        {
          "metrics": [
            {
              "name": "cpu",
              "unit": "%",
              "gauge": {
                "dataPoints": [
                  {
                    "asInt": __CPU_VALUE__,
                    "timeUnixNano": "__TIME_UNIX_NANO__",
                    "attributes": [
                      {
                        "key": "source",
                        "value": { "stringValue": "jwt-pizza-service" }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
'@

    return $template.Replace('__CPU_VALUE__', $CpuValue.ToString()).Replace('__TIME_UNIX_NANO__', $timeUnixNano.ToString())
}

$dotenv = Get-DotEnvValues -Path $EnvFile
$requiredKeys = @('endpoint_url', 'account_id', 'api_key')
foreach ($key in $requiredKeys) {
    if (-not $dotenv.ContainsKey($key)) {
        throw "Missing `$key` in $EnvFile."
    }
}

$endpointUrl = $dotenv['endpoint_url']
$accountId = $dotenv['account_id']
$apiKey = $dotenv['api_key']
$otelHeaders = [Environment]::GetEnvironmentVariable('OTEL_EXPORTER_OTLP_HEADERS', 'Process')
if (-not $otelHeaders) {
    $otelHeaders = [Environment]::GetEnvironmentVariable('OTEL_EXPORTER_OTLP_HEADERS', 'User')
}
if (-not $otelHeaders) {
    $otelHeaders = [Environment]::GetEnvironmentVariable('OTEL_EXPORTER_OTLP_HEADERS', 'Machine')
}

$curl = Get-Command curl.exe -ErrorAction Stop
$baseArgs = @('-k', '-i', '-X', 'POST', '-H', 'Content-Type: application/json')
if ($otelHeaders) {
    $baseArgs += @('-H', $otelHeaders)
}
$baseArgs += @('-u', "${accountId}:${apiKey}", $endpointUrl)

Write-Host "Streaming cpu metrics to $endpointUrl ..."
Write-Host "Press Ctrl+C to stop the loop."

$tempPayloadPath = Join-Path ([IO.Path]::GetTempPath()) ("grafana-metric-" + [Guid]::NewGuid().ToString() + ".json")

try {
    while ($true) {
        $randomValue = Get-Random -Minimum 0 -Maximum 101
        $payload = New-CpuMetricJson -CpuValue $randomValue
        [System.IO.File]::WriteAllText($tempPayloadPath, $payload)
        $args = $baseArgs + @('--data-binary', "@$tempPayloadPath")
        & $curl.Source @args
        Start-Sleep -Milliseconds $IntervalMilliseconds
    }
}
catch [System.Exception] {
    Write-Error $_
    throw
}
finally {
    Remove-Item -LiteralPath $tempPayloadPath -ErrorAction SilentlyContinue
}
