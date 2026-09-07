# API Documentation: Device Portion Configuration

## Endpoints

### 1. Update Portion Configuration
Update rotation configuration for a specific device.

**Endpoint:** `PUT /api/devices/:deviceId/portion-config`

**Parameters:**
- `deviceId` (path parameter): Device ID (e.g., "IOPAKAN_12345678")

**Request Body:**
```json
{
  "sedikit": 3,
  "sedang": 6,
  "banyak": 10
}
```

**Response (Success):**
```json
{
  "status": "success",
  "message": "Konfigurasi rotasi berhasil disimpan",
  "data": {
    "deviceId": "IOPAKAN_12345678",
    "sedikit": 3,
    "sedang": 6,
    "banyak": 10
  }
}
```

**Response (Error - Device Not Found):**
```json
{
  "status": "error",
  "message": "Device tidak ditemukan"
}
```

**Response (Error - Invalid Input):**
```json
{
  "status": "error",
  "message": "Nilai rotasi harus lebih dari 0"
}
```

---

### 2. Get Portion Configuration
Get current rotation configuration for a specific device.

**Endpoint:** `GET /api/devices/:deviceId/portion-config`

**Parameters:**
- `deviceId` (path parameter): Device ID

**Response (Configured):**
```json
{
  "status": "success",
  "data": {
    "deviceId": "IOPAKAN_12345678",
    "sedikit": 3,
    "sedang": 6,
    "banyak": 10,
    "updated_at": "2026-09-07T12:00:00.000Z",
    "isDefault": false
  }
}
```

**Response (Default/Not Configured):**
```json
{
  "status": "success",
  "data": {
    "deviceId": "IOPAKAN_12345678",
    "sedikit": 3,
    "sedang": 6,
    "banyak": 10,
    "isDefault": true
  }
}
```

---

## MQTT Topic

**Topic:** `iopakan/{deviceId}/config/rotations`

**Payload:**
```json
{
  "sedikit": 3,
  "sedang": 6,
  "banyak": 10
}
```

**QoS:** 1 (at least once)
**Retain:** true (last message retained by broker)

---

## Testing

### Using cURL

**Update Configuration:**
```bash
curl -X PUT http://localhost:3000/api/devices/IOPAKAN_12345678/portion-config \
  -H "Content-Type: application/json" \
  -d '{"sedikit": 4, "sedang": 8, "banyak": 12}'
```

**Get Configuration:**
```bash
curl http://localhost:3000/api/devices/IOPAKAN_12345678/portion-config
```

### Using PowerShell

**Update Configuration:**
```powershell
$body = @{
    sedikit = 4
    sedang = 8
    banyak = 12
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/devices/IOPAKAN_12345678/portion-config" `
  -Method PUT `
  -Body $body `
  -ContentType "application/json"
```

**Get Configuration:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/devices/IOPAKAN_12345678/portion-config"
```

---

## Firmware Integration

### Preferences Storage
The firmware stores configuration in ESP32 Preferences:
- Key: `rot_sedikit` (int)
- Key: `rot_sedang` (int)
- Key: `rot_banyak` (int)

### Default Values
If no configuration is set, firmware uses these defaults:
- Sedikit: 3 rotations
- Sedang: 6 rotations
- Banyak: 10 rotations

### MQTT Subscription
Firmware subscribes to: `iopakan/{deviceId}/config/rotations`

When message received, firmware:
1. Validates JSON payload
2. Saves to Preferences
3. Immediately applies to feeding operations
4. No restart required

---

## Database Schema

```sql
CREATE TABLE device_portion_config (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  sedikit INTEGER NOT NULL DEFAULT 3,
  sedang INTEGER NOT NULL DEFAULT 6,
  banyak INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_device 
    FOREIGN KEY (device_id) 
    REFERENCES devices(device_id) 
    ON DELETE CASCADE
);
```
