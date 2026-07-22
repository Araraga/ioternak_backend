require("dotenv").config();
const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");
const pool = require("./config/db");
const aiController = require("./controllers/ai_controller");
const authRoutes = require("./routes/authRoutes");
const { formatPhoneNumber, sendWhatsappOTP } = require("./utils/whatsapp");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// MQTT
// ============================================================

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  protocol: "mqtts",
  port: Number(process.env.MQTT_PORT || 8883),
  rejectUnauthorized: false,
});

mqttClient.on("connect", () => {
  console.log("✅ Terhubung ke HiveMQ Broker!");
  mqttClient.subscribe(["devices/+/data", "devices/+/register"], (err) => {
    if (err) console.error("Gagal subscribe:", err);
    else console.log("📡 Listening: Data & Register...");
  });
});

mqttClient.on("message", async (topic, message) => {
  try {
    const topicParts = topic.split("/");
    const deviceId = topicParts[1];
    const action = topicParts[2];

    // ── REGISTER ──────────────────────────────────────────
    if (action === "register") {
      const info = JSON.parse(message.toString());
      console.log(`[REGISTER] Perangkat baru: ${deviceId}`);

      await pool.query(
        `INSERT INTO devices (device_id, device_name, type, whatsapp_number)
         VALUES ($1, $2, $3, '')
         ON CONFLICT (device_id) DO NOTHING`,
        [deviceId, info.device_name || deviceId, info.type || "unknown"],
      );
      return;
    }

    // ── DATA ───────────────────────────────────────────────
    if (action === "data") {
      let rawData = JSON.parse(message.toString());
      let data = Array.isArray(rawData) ? rawData[0] : rawData;
      const gasValue = data.gas_ppm !== undefined ? data.gas_ppm : data.amonia;

      if (data.temperature === undefined || gasValue === undefined) return;

      console.log(
        `[DATA] ${deviceId}: Suhu=${data.temperature}°C  Gas=${gasValue} PPM`,
      );

      // Pastikan device ada
      await pool.query(
        `INSERT INTO devices (device_id, device_name, type, whatsapp_number)
         VALUES ($1, $2, 'IoPeka', '')
         ON CONFLICT (device_id) DO NOTHING`,
        [deviceId, `IoPeka ${deviceId.substring(7)}`],
      );

      // Simpan sensor data
      await pool.query(
        `INSERT INTO sensor_data(device_id, temperature, humidity, gas_ppm)
         VALUES($1, $2, $3, $4)`,
        [deviceId, data.temperature, data.humidity ?? 0, gasValue],
      );

      // Ambil info device + owner
      const deviceRes = await pool.query(
        "SELECT * FROM devices WHERE device_id = $1",
        [deviceId],
      );
      if (deviceRes.rows.length === 0) return;
      const device = deviceRes.rows[0];

      let alertMessage = "";
      let notifType = "";
      let notifTitle = "";
      let notifBody = "";

      // Cek ambang batas
      if (Number(data.temperature) > Number(device.threshold_temp)) {
        notifType = "temperature";
        notifTitle = "⚠️ Peringatan Suhu Tinggi!";
        notifBody = `Lokasi: ${device.device_name} | Suhu: ${data.temperature}°C (ambang: ${device.threshold_temp}°C)`;
        alertMessage = `*PERINGATAN SUHU TINGGI!*\nLokasi: ${device.device_name}\nSuhu: ${data.temperature}°C`;
      } else if (Number(gasValue) > Number(device.threshold_gas)) {
        notifType = "gas";
        notifTitle = "☁️ Peringatan Amonia Tinggi!";
        notifBody = `Lokasi: ${device.device_name} | Gas: ${gasValue} PPM (ambang: ${device.threshold_gas} PPM)`;
        alertMessage = `*PERINGATAN AMONIA TINGGI!*\nLokasi: ${device.device_name}\nGas: ${gasValue} PPM`;
      }

      // Simpan notifikasi ke DB jika ada peringatan dan device punya owner
      if (notifType && device.owned_by) {
        await pool.query(
          `INSERT INTO notifications (user_id, device_id, barn_id, type, title, body)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            device.owned_by,
            deviceId,
            device.barn_id || null,
            notifType,
            notifTitle,
            notifBody,
          ],
        );
      }

      // Kirim WhatsApp alert
      if (
        alertMessage &&
        device.whatsapp_number &&
        device.whatsapp_number.length > 5
      ) {
        const formattedWA = formatPhoneNumber(device.whatsapp_number);
        await sendWhatsappOTP(formattedWA, alertMessage);
      }
    }
  } catch (err) {
    console.error("Error MQTT:", err);
  }
});

// ============================================================
// FIRMWARE
// ============================================================

app.use("/firmware", express.static(path.join(__dirname, "firmware")));

app.get("/api/firmware/check", (req, res) => {
  const deviceType = req.query.type;
  if (deviceType === "IoPeka") {
    res.json({
      status: "success",
      latest_version: "1.0.2",
      download_url: "http://38.103.170.74:3000/firmware/update_iopeka.bin",
    });
  } else {
    res.json({
      status: "success",
      latest_version: "1.0.1",
      download_url: "http://38.103.170.74:3000/firmware/update_iopakan.bin",
    });
  }
});

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => res.send("🚀 Backend IoTernak Running!"));

// ============================================================
// AUTH ROUTES (OTP, register)
// ============================================================

app.use("/auth", authRoutes);

// ============================================================
// AUTH — LOGIN (phone-based, no password)
// ============================================================

app.post("/api/login", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({ error: "Nomor telepon wajib diisi" });

    const formatted = formatPhoneNumber(phone);

    const result = await pool.query(
      "SELECT * FROM users WHERE phone_number = $1",
      [formatted],
    );

    if (result.rows.length > 0) {
      res.json({ status: "success", user: result.rows[0] });
    } else {
      res
        .status(404)
        .json({ status: "error", message: "Nomor belum terdaftar." });
    }
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// DEVICES
// ============================================================

// GET /api/my-devices?user_id=
app.get("/api/my-devices", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "User ID diperlukan" });

    const result = await pool.query(
      `SELECT d.*, b.barn_name, b.location, b.animal_type
       FROM devices d
       LEFT JOIN barns b ON d.barn_id = b.id
       WHERE d.owned_by = $1
       ORDER BY d.device_name ASC`,
      [user_id],
    );

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    console.error("My Devices Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /api/check-device?id=
app.get("/api/check-device", async (req, res) => {
  try {
    const { id } = req.query;
    const result = await pool.query(
      "SELECT * FROM devices WHERE device_id = $1",
      [id],
    );
    if (result.rows.length > 0)
      res.status(200).json({ status: "success", device: result.rows[0] });
    else res.status(404).json({ status: "error", message: "Not found" });
  } catch (err) {
    console.error("Check Device Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
});

// POST /api/claim-device
app.post("/api/claim-device", async (req, res) => {
  try {
    const { device_id, user_id, user_phone, barn_id } = req.body;
    const formattedPhone = formatPhoneNumber(user_phone || "");

    const check = await pool.query(
      "SELECT * FROM devices WHERE device_id = $1",
      [device_id],
    );
    if (check.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Perangkat belum terdaftar." });
    }

    const device = check.rows[0];
    if (device.owned_by !== null && device.owned_by != user_id) {
      return res
        .status(403)
        .json({
          status: "error",
          message: "Perangkat sudah dimiliki orang lain!",
        });
    }

    if (barn_id != null) {
      await pool.query(
        "UPDATE devices SET owned_by = $1, whatsapp_number = $2, barn_id = $3 WHERE device_id = $4",
        [user_id, formattedPhone, barn_id, device_id],
      );
    } else {
      await pool.query(
        "UPDATE devices SET owned_by = $1, whatsapp_number = $2 WHERE device_id = $3",
        [user_id, formattedPhone, device_id],
      );
    }

    res.json({
      status: "success",
      message: "Perangkat berhasil diklaim.",
      type: device.type,
    });
  } catch (err) {
    console.error("Claim Device Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// POST /api/release-device
app.post("/api/release-device", async (req, res) => {
  try {
    const { device_id, user_id } = req.body;
    const result = await pool.query(
      `UPDATE devices
       SET owned_by = NULL, whatsapp_number = '', barn_id = NULL
       WHERE device_id = $1 AND owned_by = $2`,
      [device_id, user_id],
    );

    if (result.rowCount === 0)
      return res.status(403).json({ status: "error", message: "Gagal hapus." });

    res.json({ status: "success", message: "Perangkat dihapus." });
  } catch (err) {
    console.error("Release Device Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// SENSOR DATA
// ============================================================

// GET /api/sensor-data?id=
app.get("/api/sensor-data", async (req, res) => {
  try {
    const { id } = req.query;
    const result = await pool.query(
      `SELECT timestamp, temperature, humidity, gas_ppm AS amonia
       FROM sensor_data
       WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'
       ORDER BY timestamp ASC`,
      [id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Sensor Data Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
});

// ============================================================
// SCHEDULE (IoPakan feeder)
// ============================================================

// GET /api/get-schedule?id=
app.get("/api/get-schedule", async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Device ID required" });

    const result = await pool.query(
      "SELECT times FROM schedules WHERE device_id = $1",
      [id],
    );

    if (result.rows.length > 0) {
      let times = result.rows[0].times;
      if (typeof times === "string") times = JSON.parse(times);
      res.json({ status: "success", data: { times } });
    } else {
      res.json({ status: "success", data: { times: [] } });
    }
  } catch (err) {
    console.error("Get Schedule Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// POST /api/schedule?id=
app.post("/api/schedule", async (req, res) => {
  try {
    const { id } = req.query;
    const newSchedule = req.body;

    await pool.query(
      `INSERT INTO schedules (device_id, times)
       VALUES ($1, $2)
       ON CONFLICT (device_id)
       DO UPDATE SET times = $2, updated_at = NOW()`,
      [id, JSON.stringify(newSchedule.times)],
    );

    mqttClient.publish(
      `devices/${id}/commands/set_schedule`,
      JSON.stringify(newSchedule),
      { qos: 1, retain: true },
    );

    res.json({ status: "success" });
  } catch (err) {
    console.error("Schedule Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================
// BARNS
// ============================================================

// GET /api/barns?user_id=
app.get("/api/barns", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "User ID diperlukan" });

    const result = await pool.query(
      `SELECT b.*, COUNT(d.device_id) AS device_count
       FROM barns b
       LEFT JOIN devices d ON d.barn_id = b.id
       WHERE b.owner_id = $1
       GROUP BY b.id
       ORDER BY b.barn_name ASC`,
      [user_id],
    );

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    console.error("Barns Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /api/barn/:barn_id
app.get("/api/barn/:barn_id", async (req, res) => {
  try {
    const { barn_id } = req.params;
    const barnRes = await pool.query("SELECT * FROM barns WHERE id = $1", [
      barn_id,
    ]);

    if (barnRes.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Kandang tidak ditemukan." });
    }

    const devicesRes = await pool.query(
      "SELECT * FROM devices WHERE barn_id = $1 ORDER BY device_name ASC",
      [barn_id],
    );

    res.json({
      status: "success",
      data: { barn: barnRes.rows[0], devices: devicesRes.rows },
    });
  } catch (err) {
    console.error("Barn Detail Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /api/barn-summary/:barn_id — ringkasan kandang untuk AI context
app.get("/api/barn-summary/:barn_id", async (req, res) => {
  try {
    const { barn_id } = req.params;

    const barnRes = await pool.query("SELECT * FROM barns WHERE id = $1", [
      barn_id,
    ]);
    if (barnRes.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Kandang tidak ditemukan." });
    }
    const barn = barnRes.rows[0];

    // Ambil sensor data terbaru dari semua perangkat kandang
    const devicesRes = await pool.query(
      "SELECT device_id FROM devices WHERE barn_id = $1",
      [barn_id],
    );
    const deviceIds = devicesRes.rows.map((r) => r.device_id);

    let latestSensor = null;
    if (deviceIds.length > 0) {
      const sensorRes = await pool.query(
        `SELECT device_id, temperature, humidity, gas_ppm, timestamp
         FROM sensor_data
         WHERE device_id = ANY($1)
         ORDER BY timestamp DESC LIMIT 1`,
        [deviceIds],
      );
      latestSensor = sensorRes.rows[0] || null;
    }

    // Total keuangan bulan ini
    const financeRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_this_month
       FROM barn_finances
       WHERE barn_id = $1
         AND EXTRACT(MONTH FROM recorded_at) = EXTRACT(MONTH FROM NOW())
         AND EXTRACT(YEAR FROM recorded_at)  = EXTRACT(YEAR FROM NOW())`,
      [barn_id],
    );

    res.json({
      status: "success",
      data: {
        barn,
        latest_sensor: latestSensor,
        finance_this_month: financeRes.rows[0].total_this_month,
      },
    });
  } catch (err) {
    console.error("Barn Summary Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// POST /api/barn — buat kandang baru
app.post("/api/barn", async (req, res) => {
  try {
    const {
      barn_name,
      owner_id,
      location,
      animal_type,
      capacity,
      description,
      preferred_temp_min,
      preferred_temp_max,
      preferred_humidity_min,
      preferred_humidity_max,
      preferred_gas_max,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO barns
         (barn_name, owner_id, location, animal_type, capacity, description,
          preferred_temp_min, preferred_temp_max, preferred_humidity_min,
          preferred_humidity_max, preferred_gas_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        barn_name,
        owner_id,
        location,
        animal_type,
        capacity,
        description,
        preferred_temp_min ?? 29.0,
        preferred_temp_max ?? 33.0,
        preferred_humidity_min ?? 50.0,
        preferred_humidity_max ?? 70.0,
        preferred_gas_max ?? 20.0,
      ],
    );

    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Create Barn Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// PUT /api/barn/:barn_id — update kandang
app.put("/api/barn/:barn_id", async (req, res) => {
  try {
    const { barn_id } = req.params;
    const updates = req.body;

    const ALLOWED_KEYS = [
      "barn_name",
      "location",
      "animal_type",
      "capacity",
      "description",
      "preferred_temp_min",
      "preferred_temp_max",
      "preferred_humidity_min",
      "preferred_humidity_max",
      "preferred_gas_max",
    ];

    const setClauses = [];
    const values = [];
    let index = 1;

    for (const key of Object.keys(updates)) {
      if (!ALLOWED_KEYS.includes(key)) continue; // whitelist
      setClauses.push(`${key} = $${index}`);
      values.push(updates[key]);
      index++;
    }

    if (setClauses.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "Tidak ada data untuk diperbarui." });
    }

    values.push(barn_id);
    const query = `
      UPDATE barns
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE id = $${index}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Update Barn Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// DELETE /api/barn/:barn_id — hapus kandang
app.delete("/api/barn/:barn_id", async (req, res) => {
  try {
    const { barn_id } = req.params;
    const result = await pool.query(
      "DELETE FROM barns WHERE id = $1 RETURNING id",
      [barn_id],
    );
    if (result.rowCount === 0)
      return res
        .status(404)
        .json({ status: "error", message: "Kandang tidak ditemukan." });

    res.json({ status: "success", message: "Kandang berhasil dihapus." });
  } catch (err) {
    console.error("Delete Barn Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// BARN FINANCES — Keuangan Kandang
// ============================================================

// GET /api/barn-finances?barn_id=
app.get("/api/barn-finances", async (req, res) => {
  try {
    const { barn_id } = req.query;
    if (!barn_id)
      return res
        .status(400)
        .json({ status: "error", message: "barn_id diperlukan" });

    const result = await pool.query(
      `SELECT * FROM barn_finances
       WHERE barn_id = $1
       ORDER BY recorded_at DESC`,
      [barn_id],
    );

    // Hitung total per kategori bulan ini
    const summaryRes = await pool.query(
      `SELECT category,
              SUM(amount) AS total,
              COUNT(*) AS count
       FROM barn_finances
       WHERE barn_id = $1
         AND EXTRACT(MONTH FROM recorded_at) = EXTRACT(MONTH FROM NOW())
         AND EXTRACT(YEAR FROM recorded_at)  = EXTRACT(YEAR FROM NOW())
       GROUP BY category`,
      [barn_id],
    );

    const totalThisMonth = summaryRes.rows.reduce(
      (acc, r) => acc + Number(r.total),
      0,
    );

    res.json({
      status: "success",
      data: result.rows,
      summary: {
        total_this_month: totalThisMonth,
        by_category: summaryRes.rows,
      },
    });
  } catch (err) {
    console.error("Get Barn Finances Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// POST /api/barn-finances — catat pengeluaran baru
app.post("/api/barn-finances", async (req, res) => {
  try {
    const { barn_id, user_id, category, description, amount, recorded_at } =
      req.body;

    if (!barn_id || !user_id || !amount) {
      return res
        .status(400)
        .json({
          status: "error",
          message: "barn_id, user_id, dan amount wajib diisi",
        });
    }

    const result = await pool.query(
      `INSERT INTO barn_finances (barn_id, user_id, category, description, amount, recorded_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, NOW()))
       RETURNING *`,
      [
        barn_id,
        user_id,
        category || "lainnya",
        description,
        amount,
        recorded_at || null,
      ],
    );

    res.status(201).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Add Barn Finance Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// BARN FEED LOGS — Log Pemberian Pakan
// ============================================================

// GET /api/barn-feed-logs?barn_id=
app.get("/api/barn-feed-logs", async (req, res) => {
  try {
    const { barn_id } = req.query;
    if (!barn_id)
      return res
        .status(400)
        .json({ status: "error", message: "barn_id diperlukan" });

    const result = await pool.query(
      `SELECT * FROM barn_feed_logs
       WHERE barn_id = $1
       ORDER BY logged_at DESC
       LIMIT 100`,
      [barn_id],
    );

    // Total pakan hari ini (dalam kg)
    const todayRes = await pool.query(
      `SELECT COALESCE(SUM(quantity_kg), 0) AS total_today
       FROM barn_feed_logs
       WHERE barn_id = $1
         AND status = 'selesai'
         AND DATE(logged_at) = CURRENT_DATE`,
      [barn_id],
    );

    res.json({
      status: "success",
      data: result.rows,
      total_today_kg: todayRes.rows[0].total_today,
    });
  } catch (err) {
    console.error("Get Feed Logs Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// POST /api/barn-feed-logs — catat log pakan baru
app.post("/api/barn-feed-logs", async (req, res) => {
  try {
    const {
      barn_id,
      user_id,
      device_id,
      feed_type,
      quantity_kg,
      cost_per_kg,
      notes,
      feeding_time,
      status,
      logged_at,
    } = req.body;

    if (!barn_id || quantity_kg === undefined) {
      return res
        .status(400)
        .json({
          status: "error",
          message: "barn_id dan quantity_kg wajib diisi",
        });
    }

    const result = await pool.query(
      `INSERT INTO barn_feed_logs
         (barn_id, user_id, device_id, feed_type, quantity_kg, cost_per_kg, total_cost, notes, feeding_time, status, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6,
               CASE WHEN $5 IS NOT NULL AND $6 IS NOT NULL THEN $5 * $6 ELSE NULL END,
               $7, $8::time, $9, COALESCE($10::timestamp, NOW()))
       RETURNING *`,
      [
        barn_id,
        user_id || null,
        device_id || null,
        feed_type || null,
        quantity_kg || null,
        cost_per_kg || null,
        notes || null,
        feeding_time || null,
        status || "selesai",
        logged_at || null,
      ],
    );

    res.status(201).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Add Feed Log Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================

// GET /api/notifications?user_id=
app.get("/api/notifications", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "user_id diperlukan" });

    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [user_id],
    );

    const unread = result.rows.filter((n) => !n.is_read).length;

    res.json({ status: "success", data: result.rows, unread_count: unread });
  } catch (err) {
    console.error("Get Notifications Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// PATCH /api/notifications/:id/read — tandai satu notifikasi sudah dibaca
app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE notifications SET is_read = true WHERE id = $1", [
      id,
    ]);
    res.json({ status: "success" });
  } catch (err) {
    console.error("Mark Notification Read Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// DELETE /api/notifications/clear — hapus semua notifikasi user
// NOTE: Harus sebelum route /:id agar tidak tertangkap sebagai id=clear
app.delete("/api/notifications/clear", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "user_id diperlukan" });

    await pool.query("DELETE FROM notifications WHERE user_id = $1", [user_id]);
    res.json({ status: "success", message: "Semua notifikasi dihapus." });
  } catch (err) {
    console.error("Clear Notifications Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// SUBSCRIPTION
// ============================================================

// GET /api/my-subscription?user_id=
app.get("/api/my-subscription", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "user_id diperlukan" });

    const result = await pool.query(
      `SELECT
          o.id,
          o.order_code,
          o.device_id,
          o.duration,
          o.total_bill,
          o.status,
          o.created_at,
          (o.created_at + (o.duration || ' months')::interval) AS expired_date,
          CASE
            WHEN o.status = 'Success'
              AND (o.created_at + (o.duration || ' months')::interval) > NOW()
            THEN 'Aktif'
            ELSE 'Habis'
          END AS subscription_status
       FROM orders o
       WHERE o.user_id = $1
         AND o.status = 'Success'
       ORDER BY o.created_at DESC`,
      [user_id],
    );

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    console.error("My Subscription Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ============================================================
// AI CHAT
// ============================================================

app.post("/api/chat", aiController.chatWithAssistant);

// ============================================================
// CRON JOBS
// ============================================================

// Bersihkan sensor data > 7 hari
cron.schedule("0 0 * * *", async () => {
  console.log("🧹 [CRON] Membersihkan data sensor lama...");
  try {
    const result = await pool.query(
      "DELETE FROM sensor_data WHERE timestamp < NOW() - INTERVAL '7 days'",
    );
    console.log(`   → ${result.rowCount} baris dihapus`);
  } catch (err) {
    console.error("Gagal membersihkan data:", err.message);
  }
});

// Periksa & kunci device yang langganannya habis
cron.schedule("0 1 * * *", async () => {
  console.log("🔒 [CRON] Memeriksa masa langganan perangkat...");
  try {
    const result = await pool.query(
      `SELECT device_id
       FROM orders
       WHERE status = 'Success'
         AND (created_at + (duration || ' months')::interval) < NOW()`,
    );

    for (let row of result.rows) {
      console.log(`   → Mengunci perangkat ${row.device_id}`);
      mqttClient.publish(
        `devices/${row.device_id}/commands/lock`,
        JSON.stringify({ status: "locked" }),
        { qos: 1, retain: true },
      );
    }
  } catch (err) {
    console.error("Gagal memproses penguncian langganan:", err.message);
  }
});

// Bersihkan notifikasi > 30 hari
cron.schedule("0 2 * * *", async () => {
  console.log("🔔 [CRON] Membersihkan notifikasi lama...");
  try {
    const result = await pool.query(
      "DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'",
    );
    console.log(`   → ${result.rowCount} notifikasi lama dihapus`);
  } catch (err) {
    console.error("Gagal membersihkan notifikasi:", err.message);
  }
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
