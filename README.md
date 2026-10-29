# OrderFlow

Sistema de pedidos con cuatro microservicios que se comunican por REST, RabbitMQ y Kafka.

| Servicio | Tecnología de comunicación | Puerto (host) |
|---|---|---|
| `orders-service` | REST (cliente y servidor), publica en RabbitMQ y Kafka | 8081 |
| `inventory-service` | REST | 8082 |
| `notification-service` | Consume RabbitMQ y Kafka, envía correos por SMTP | — |
| `analytics-service` | Consume Kafka, expone métricas por REST | 8083 |

Infraestructura:

| Componente | URL / puerto |
|---|---|
| RabbitMQ (panel de administración) | http://localhost:15672 (usuario `guest`, contraseña `guest`) |
| Kafka (KRaft, un solo nodo) | `kafka:9092` (solo dentro de la red de Docker) |
| Mailpit (bandeja de correos de prueba) | http://localhost:8025 |

## Requisitos

- Docker y Docker Compose
- Node.js 22 o superior (solo para correr los tests fuera de Docker)

## Levantar el sistema

```bash
docker compose up -d --build
```

El primer arranque tarda alrededor de un minuto mientras Kafka y RabbitMQ pasan sus healthchecks. Para ver el estado:

```bash
docker compose ps
docker compose logs -f orders-service notification-service analytics-service
```

Para apagar todo y borrar los datos:

```bash
docker compose down -v
```

## Ejercicio 1: Orders consulta a Inventory por REST

Productos cargados al iniciar:

| productId | Producto | Stock |
|---|---|---|
| `P-001` | Notebook 14" | 10 |
| `P-002` | Mouse inalámbrico | 50 |
| `P-003` | Monitor 27" | 0 |

```bash
# Ver stock
curl http://localhost:8082/products

# Crear pedido (queda en estado CREATED)
curl -X POST http://localhost:8081/orders \
  -H "content-type: application/json" \
  -d '{"productId":"P-001","quantity":2,"customerEmail":"ana@mail.com"}'

# Confirmar: OrdersService consulta disponibilidad y reserva stock en InventoryService
curl -X POST http://localhost:8081/orders/<id>/confirm
```

Respuestas de `POST /orders/:id/confirm`:

| Caso | Código |
|---|---|
| Hay stock, se reserva y el pedido pasa a `CONFIRMED` | 200 |
| No hay stock suficiente (el pedido sigue en `CREATED`) | 409 |
| El producto no existe | 422 |
| InventoryService no responde en 2 s | 503 |

Probar la caída de InventoryService:

```bash
docker compose stop inventory-service
curl -X POST http://localhost:8081/orders/<id>/confirm   # 503 a los 2 s
docker compose start inventory-service
```

Probar latencia en InventoryService (simula una respuesta lenta):

```bash
INVENTORY_DELAY_MS=1500 docker compose up -d inventory-service
```

En PowerShell: `$env:INVENTORY_DELAY_MS=1500; docker compose up -d inventory-service`.

## Ejercicio 2: Pedido Creado por RabbitMQ

Al crear un pedido, `orders-service` publica `OrderCreated` en el exchange `orders` con la routing key `order.created`. El mensaje llega a la cola durable `notifications.order-created` y `notification-service` envía el correo "Recibimos tu pedido". Los correos se ven en http://localhost:8025.

| Recurso en RabbitMQ | Tipo |
|---|---|
| `orders` | exchange `direct`, durable |
| `notifications.order-created` | cola durable |
| `orders.dlx` / `notifications.order-created.dlq` | exchange y cola de mensajes fallidos |

Probar con NotificationService caído:

```bash
docker compose stop notification-service

# Crear algunos pedidos
curl -X POST http://localhost:8081/orders -H "content-type: application/json" \
  -d '{"productId":"P-002","quantity":1,"customerEmail":"c1@mail.com"}'

# Ver los mensajes acumulados en la cola (o en http://localhost:15672 > Queues)
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers

docker compose start notification-service
# Los correos pendientes aparecen en http://localhost:8025
```

## Ejercicio 3: Cambios de estado por Kafka

Cada cambio de estado (`CREATED`, `CONFIRMED`, `SHIPPED`) se publica en el topic `orders.status-changed` (3 particiones, clave = id del pedido). Lo consumen dos consumer groups independientes:

| Consumer group | Qué hace |
|---|---|
| `notification-service` | Envía el correo de `CONFIRMED` y `SHIPPED` |
| `analytics-service` | Calcula métricas en `GET /metrics` |

```bash
# Enviar un pedido confirmado
curl -X POST http://localhost:8081/orders/<id>/ship

# Métricas
curl http://localhost:8083/metrics
```

Ejemplo de respuesta de `/metrics`:

```json
{
  "totalEvents": 4,
  "totalOrders": 2,
  "ordersByStatus": { "CREATED": 1, "CONFIRMED": 0, "SHIPPED": 1 },
  "unitsConfirmedByProduct": { "P-001": 2 },
  "avgSecondsToConfirm": 0.27,
  "lastEventAt": "2026-10-29T18:53:27.302Z"
}
```

Probar la relectura del topic: las métricas viven en memoria, pero al reiniciar `analytics-service` vuelve a leer el topic desde el offset 0 y las reconstruye.

```bash
docker compose restart analytics-service
curl http://localhost:8083/metrics   # mismos valores a los pocos segundos
```

Ver los eventos guardados en el topic:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic orders.status-changed \
  --from-beginning --property print.key=true --timeout-ms 5000
```

## Demo completa

Con el sistema levantado:

```bash
./scripts/demo.sh                 # Linux, macOS o Git Bash
```

```powershell
.\scripts\demo.ps1                # Windows PowerShell
```

## API

### orders-service (http://localhost:8081)

| Método | Ruta | Cuerpo |
|---|---|---|
| `GET` | `/orders` | — |
| `GET` | `/orders/:id` | — |
| `POST` | `/orders` | `{ "productId": "P-001", "quantity": 2, "customerEmail": "ana@mail.com" }` |
| `POST` | `/orders/:id/confirm` | — |
| `POST` | `/orders/:id/ship` | — |

Un pedido solo puede avanzar `CREATED → CONFIRMED → SHIPPED`; cualquier otro salto responde 409.

### inventory-service (http://localhost:8082)

| Método | Ruta | Cuerpo |
|---|---|---|
| `GET` | `/products` | — |
| `GET` | `/products/:productId/availability?quantity=N` | — |
| `POST` | `/products/:productId/reservations` | `{ "quantity": 2 }` |

### analytics-service (http://localhost:8083)

| Método | Ruta |
|---|---|
| `GET` | `/metrics` |

Todos los servicios HTTP exponen `GET /health`.

## Tests

Cada servicio tiene sus tests con el runner nativo de Node:

```bash
cd services/orders-service && npm install && npm test
```

Lo mismo para `inventory-service`, `notification-service` y `analytics-service`.

## Estructura

```
orderflow/
├── docker-compose.yml
├── scripts/                 demo.sh y demo.ps1
├── docs/                    respuestas teóricas (PDF)
└── services/
    ├── orders-service/
    ├── inventory-service/
    ├── notification-service/
    └── analytics-service/
```

## Variables de entorno

| Servicio | Variable | Valor por defecto en compose |
|---|---|---|
| orders | `INVENTORY_URL` | `http://inventory-service:3001` |
| orders | `INVENTORY_TIMEOUT_MS` | `2000` |
| orders, notification | `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672` |
| orders, notification, analytics | `KAFKA_BROKERS` | `kafka:9092` |
| inventory | `INVENTORY_DELAY_MS` | `0` |
| notification | `SMTP_HOST` / `SMTP_PORT` | `mailpit` / `1025` |
| analytics | `REPLAY_ON_START` | `true` |
