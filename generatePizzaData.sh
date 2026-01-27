#!/usr/bin/env bash
set -euo pipefail

# Check if host is provided as a command line argument
if [ -z "${1:-}" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1

response=$(curl -s -f -X PUT "$host/api/auth" -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json')
token=$(echo "$response" | node -pe "const fs = require('fs'); const t = JSON.parse(fs.readFileSync(0, 'utf8')).token; if (!t) process.exit(1); t;" | tr -d '\r\n')
if [ -z "$token" ] || [ "$token" = "null" ]; then
  echo "Error: failed to retrieve auth token from $host/api/auth. Response: $response"
  exit 1
fi

# Add users
curl -sf -X POST "$host/api/auth" -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'
curl -sf -X POST "$host/api/auth" -d '{"name":"pizza franchisee", "email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json'

# Add menu
curl -sf -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Veggie", "description": "A garden of delight", "image":"pizza1.png", "price": 0.0038 }'  -H "Authorization: Bearer $token"
curl -sf -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Pepperoni", "description": "Spicy treat", "image":"pizza2.png", "price": 0.0042 }'  -H "Authorization: Bearer $token"
curl -sf -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Margarita", "description": "Essential classic", "image":"pizza3.png", "price": 0.0042 }'  -H "Authorization: Bearer $token"
curl -sf -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Crusty", "description": "A dry mouthed favorite", "image":"pizza4.png", "price": 0.0028 }'  -H "Authorization: Bearer $token"
curl -sf -X PUT "$host/api/order/menu" -H 'Content-Type: application/json' -d '{ "title":"Charred Leopard", "description": "For those with a darker side", "image":"pizza5.png", "price": 0.0099 }'  -H "Authorization: Bearer $token"

# Add franchise and store
curl -sf -X POST "$host/api/franchise" -H 'Content-Type: application/json' -d '{"name": "pizzaPocket", "admins": [{"email": "f@jwt.com"}]}'  -H "Authorization: Bearer $token"
curl -sf -X POST "$host/api/franchise/1/store" -H 'Content-Type: application/json' -d '{"franchiseId": 1, "name":"SLC"}'  -H "Authorization: Bearer $token"

echo "Database data generated"
