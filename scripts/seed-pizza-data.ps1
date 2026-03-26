param(
  [string]$PizzaHost = 'http://localhost:3000'
)

function Invoke-PizzaRequest {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('GET','POST','PUT','DELETE')][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  $uri = "$PizzaHost$Path"
  if ($Body) {
    $payload = $Body | ConvertTo-Json -Depth 5 -Compress
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $payload
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
}

Write-Host "Seeding JWT Pizza data on $PizzaHost" -ForegroundColor Cyan

$baseHeaders = @{ 'Content-Type' = 'application/json' }

try {
  $loginBody = @{ email = 'a@jwt.com'; password = 'admin' }
  $login = Invoke-PizzaRequest -Method PUT -Path '/api/auth' -Body $loginBody -Headers $baseHeaders
  $token = $login.token
  if (-not $token) {
    throw "Admin login succeeded but token was empty. Response: $(ConvertTo-Json $login -Compress)"
  }
  Write-Host 'Admin login succeeded.'

  $userPayloads = @(
    @{ name = 'pizza diner'; email = 'd@jwt.com'; password = 'diner' },
    @{ name = 'pizza franchisee'; email = 'f@jwt.com'; password = 'franchisee' }
  )
  foreach ($payload in $userPayloads) {
    Invoke-PizzaRequest -Method POST -Path '/api/auth' -Body $payload -Headers $baseHeaders | Out-Null
  }
  Write-Host 'Users created (diner & franchisee).'

  $authHeaders = @{}
  foreach ($key in $baseHeaders.Keys) { $authHeaders[$key] = $baseHeaders[$key] }
  $authHeaders['Authorization'] = "Bearer $token"

  $pizzas = @(
    @{ title = 'Veggie'; description = 'A garden of delight'; image = 'pizza1.png'; price = 0.0038 },
    @{ title = 'Pepperoni'; description = 'Spicy treat'; image = 'pizza2.png'; price = 0.0042 },
    @{ title = 'Margarita'; description = 'Essential classic'; image = 'pizza3.png'; price = 0.0042 },
    @{ title = 'Crusty'; description = 'A dry mouthed favorite'; image = 'pizza4.png'; price = 0.0028 },
    @{ title = 'Charred Leopard'; description = 'For those with a darker side'; image = 'pizza5.png'; price = 0.0099 }
  )
  foreach ($pizza in $pizzas) {
    Invoke-PizzaRequest -Method PUT -Path '/api/order/menu' -Body $pizza -Headers $authHeaders | Out-Null
  }
  Write-Host 'Menu items added.'

  $franchiseBody = @{ name = 'pizzaPocket'; admins = @(@{ email = 'f@jwt.com' }) }
  Invoke-PizzaRequest -Method POST -Path '/api/franchise' -Body $franchiseBody -Headers $authHeaders | Out-Null

  $storeBody = @{ franchiseId = 1; name = 'SLC' }
  Invoke-PizzaRequest -Method POST -Path '/api/franchise/1/store' -Body $storeBody -Headers $authHeaders | Out-Null

  Write-Host 'Franchise and store created.'
  Write-Host 'Database seed complete.' -ForegroundColor Green
}
catch {
  Write-Error "Failed to seed data: $_"
  exit 1
}
