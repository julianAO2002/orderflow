# Runs a full order lifecycle against the running stack.
param([string]$Email = "cliente@mail.com")

$Orders = if ($env:ORDERS_URL) { $env:ORDERS_URL } else { "http://localhost:8081" }

function Send-Post($Path, $Body) {
    try {
        $json = if ($Body) { $Body | ConvertTo-Json -Compress } else { $null }
        Invoke-RestMethod -Method Post -Uri "$Orders$Path" -ContentType "application/json" -Body $json
    } catch {
        $_.ErrorDetails.Message
    }
}

Write-Host "1) Crear pedido"
$order = Send-Post "/orders" @{ productId = "P-001"; quantity = 2; customerEmail = $Email }
$order | ConvertTo-Json -Depth 5

Write-Host "`n2) Confirmar (consulta a InventoryService)"
Send-Post "/orders/$($order.id)/confirm" | ConvertTo-Json -Depth 5

Write-Host "`n3) Enviar"
Send-Post "/orders/$($order.id)/ship" | ConvertTo-Json -Depth 5

Write-Host "`n4) Pedido sin stock (P-003)"
$noStock = Send-Post "/orders" @{ productId = "P-003"; quantity = 1; customerEmail = $Email }
Send-Post "/orders/$($noStock.id)/confirm"

Write-Host "`nCorreos: http://localhost:8025  |  Metricas: http://localhost:8083/metrics"
