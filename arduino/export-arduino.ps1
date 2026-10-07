$ErrorActionPreference = 'Stop'
$sketchDirectory = Join-Path $PSScriptRoot 'SmartFarm'
New-Item -ItemType Directory -Path $sketchDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src/main.cpp') -Destination (Join-Path $sketchDirectory 'SmartFarm.ino') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src/hardware_config.h') -Destination (Join-Path $sketchDirectory 'hardware_config.h') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'src/secrets.example.h') -Destination (Join-Path $sketchDirectory 'secrets.example.h') -Force
Write-Output "Arduino IDE sketch ready: $sketchDirectory"
