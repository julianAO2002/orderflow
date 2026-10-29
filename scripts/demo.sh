#!/usr/bin/env bash
# Runs a full order lifecycle against the running stack.
set -euo pipefail

ORDERS=${ORDERS_URL:-http://localhost:8081}
EMAIL=${1:-cliente@mail.com}

json() { curl -s -H 'content-type: application/json' "$@"; echo; }

echo "1) Crear pedido"
ORDER=$(json -X POST "$ORDERS/orders" -d "{\"productId\":\"P-001\",\"quantity\":2,\"customerEmail\":\"$EMAIL\"}")
echo "$ORDER"
ID=$(echo "$ORDER" | sed -E 's/.*"id":"([^"]+)".*/\1/')

echo; echo "2) Confirmar (consulta a InventoryService)"
json -X POST "$ORDERS/orders/$ID/confirm"

echo; echo "3) Enviar"
json -X POST "$ORDERS/orders/$ID/ship"

echo; echo "4) Pedido sin stock (P-003)"
NO_STOCK=$(json -X POST "$ORDERS/orders" -d "{\"productId\":\"P-003\",\"quantity\":1,\"customerEmail\":\"$EMAIL\"}")
NO_STOCK_ID=$(echo "$NO_STOCK" | sed -E 's/.*"id":"([^"]+)".*/\1/')
json -X POST "$ORDERS/orders/$NO_STOCK_ID/confirm"

echo; echo "Correos: http://localhost:8025  |  Métricas: http://localhost:8083/metrics"
