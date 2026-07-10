require("dotenv").config();
const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron");
const path = require("path");
const pool = require("./config/db");
const aiController = require("./controllers/ai_controller");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  protocol: "mqtts",
  port: Number(process.env.MQTT_PORT || 8883),
  rejectUnauthorized: false,
});

mqttClient.on("connect", () => {
  console.log("Terhubung ke HiveMQ Broker!");
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

    if (action === "register") {
      const info = JSON.parse(message.toString());
      console.log(`[REGISTER] Sinyal perangkat baru: ${deviceId}`);

      const query = `
        INSERT INTO devices (device_id, device_name, type, whatsapp_number)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (device_id) DO NOTHING
      `;
      await pool.query(query, [
        deviceId,
        info.device_name || deviceId,
        info.type || "unknown",
        "",
      ]);
      return;
    }

    if (action === "data") {
      let rawData = JSON.parse(message.toString());
      let data = Array.isArray(rawData) ? rawData[0] : rawData;
      const gasValue = data.gas_ppm !== undefined ? data.gas_ppm : data.amonia;

      if (data.temperature === undefined || gasValue === undefined) return;

      console.log(
        `[DATA] ${deviceId}: Suhu=${data.temperature}, Gas=${gasValue}`,
      );

      const ensureDeviceQuery = `
        INSERT INTO devices (device_id, device_name, type, whatsapp_number)
        VALUES ($1, $2, 'IoPeka', '')
        ON CONFLICT (device_id) DO NOTHING
      `;
      await pool.query(ensureDeviceQuery, [
        deviceId,
        `IoPeka ${deviceId.substring(7)}`,
      ]);

      await pool.query(
        "INSERT INTO sensor_data(device_id, temperature, humidity, gas_ppm) VALUES($1, $2, $3, $4)",
        [deviceId, data.temperature, data.humidity ?? 0, gasValue],
      );

      const deviceRes = await pool.query(
        "SELECT * FROM devices WHERE device_id = $1",
        [deviceId],
      );
      if (deviceRes.rows.length === 0) return;

      const device = deviceRes.rows[0];
      let alertMessage = "";

      if (Number(data.temperature) > Number(device.threshold_temp)) {
        alertMessage = `*PERINGATAN SUHU TINGGI!*\nLokasi: ${device.device_name}\nSuhu: ${data.temperature}°C`;
      } else if (Number(gasValue) > Number(device.threshold_gas)) {
        alertMessage = `*PERINGATAN AMONIA TINGGI!*\nLokasi: ${device.device_name}\nGas: ${gasValue} PPM`;
      }

      if (
        alertMessage &&
        device.whatsapp_number &&
        device.whatsapp_number.length > 5
      ) {
        await sendWhatsApp(device.whatsapp_number, alertMessage);
      }
    }
  } catch (err) {
    console.error("Error MQTT:", err);
  }
});

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

app.get("/", (req, res) => res.send("🚀 Backend Maggenzim Running!"));
app.post("/api/chat", aiController.chatWithAssistant);
app.use("/auth", authRoutes);

app.post("/api/login", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone)
      return res.status(400).json({ error: "Nomor telepon wajib diisi" });

    let formatted = phone.replace(/\D/g, "");
    if (formatted.startsWith("0")) formatted = "62" + formatted.substring(1);

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

app.get("/api/my-devices", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "User ID diperlukan" });

    const result = await pool.query(
      `
      SELECT d.*, b.barn_name, b.location, b.animal_type
      FROM devices d
      LEFT JOIN barns b ON d.barn_id = b.id
      WHERE d.owned_by = $1
      ORDER BY d.device_name ASC
      `,
      [user_id],
    );

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    console.error("My Devices Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

app.get("/api/barns", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id)
      return res
        .status(400)
        .json({ status: "error", message: "User ID diperlukan" });

    const result = await pool.query(
      `
      SELECT b.*,
             COUNT(d.device_id) AS device_count
      FROM barns b
      LEFT JOIN devices d ON d.barn_id = b.id
      WHERE b.owner_id = $1
      GROUP BY b.id
      ORDER BY b.barn_name ASC
      `,
      [user_id],
    );

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    console.error("Barns Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

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
      data: {
        barn: barnRes.rows[0],
        devices: devicesRes.rows,
      },
    });
  } catch (err) {
    console.error("Barn Detail Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

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
      `
      INSERT INTO barns
        (barn_name, owner_id, location, animal_type, capacity, description,
         preferred_temp_min, preferred_temp_max, preferred_humidity_min,
         preferred_humidity_max, preferred_gas_max)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
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
      ],
    );

    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Create Barn Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

app.put("/api/barn/:barn_id", async (req, res) => {
  try {
    const { barn_id } = req.params;
    const updates = req.body;

    const setClauses = [];
    const values = [];
    let index = 1;

    for (const key of Object.keys(updates)) {
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

app.post("/api/claim-device", async (req, res) => {
  try {
    const { device_id, user_id, user_phone, barn_id } = req.body;
    let formattedPhone = (user_phone || "").replace(/\D/g, "");
    if (formattedPhone.startsWith("0"))
      formattedPhone = "62" + formattedPhone.substring(1);

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
      return res.status(403).json({
        status: "error",
        message: "Perangkat sudah dimiliki orang lain!",
      });
    }

    const updateQuery =
      barn_id != null
        ? "UPDATE devices SET owned_by = $1, whatsapp_number = $2, barn_id = $3 WHERE device_id = $4"
        : "UPDATE devices SET owned_by = $1, whatsapp_number = $2 WHERE device_id = $3";

    const args =
      barn_id != null
        ? [user_id, formattedPhone, barn_id, device_id]
        : [user_id, formattedPhone, device_id];

    await pool.query(updateQuery, args);

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

app.post("/api/release-device", async (req, res) => {
  try {
    const { device_id, user_id } = req.body;
    const result = await pool.query(
      "UPDATE devices SET owned_by = NULL, whatsapp_number = '' WHERE device_id = $1 AND owned_by = $2",
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

app.get("/api/sensor-data", async (req, res) => {
  try {
    const { id } = req.query;
    const query = `
      SELECT timestamp, temperature, humidity, gas_ppm AS amonia
      FROM sensor_data
      WHERE device_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'
      ORDER BY timestamp ASC
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error("Sensor Data Error:", err);
    res.status(500).json({ error: "DB Error" });
  }
});

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

app.post("/api/schedule", async (req, res) => {
  try {
    const { id } = req.query;
    const newSchedule = req.body;

    await pool.query(
      `INSERT INTO schedules (device_id, times) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET times = $2, updated_at = NOW()`,
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

async function sendWhatsApp(to, message) {
  try {
    let formatted = to.trim().replace(/\D/g, "");
    if (formatted.startsWith("0")) formatted = "62" + formatted.substring(1);

    await axios.post(
      "https://api.fonnte.com/send",
      { target: formatted, message, countryCode: "62" },
      { headers: { Authorization: process.env.FONNTE_TOKEN } },
    );
  } catch (err) {
    console.error("Fonnte Error:", err.message || err);
  }
}

cron.schedule("0 0 * * *", async () => {
  console.log("🧹 [CRON] Membersihkan data lama...");
  try {
    await pool.query(
      "DELETE FROM sensor_data WHERE timestamp < NOW() - INTERVAL '7 days'",
    );
  } catch (err) {
    console.error("Gagal membersihkan data:", err.message);
  }
});

cron.schedule("0 1 * * *", async () => {
  console.log("🔒 [CRON] Memeriksa masa langganan perangkat...");
  try {
    const expiredQuery = `
      SELECT device_id
      FROM orders
      WHERE status = 'Success'
      AND (created_at + (duration || ' months')::interval) < NOW()
    `;
    const result = await pool.query(expiredQuery);

    for (let row of result.rows) {
      console.log(
        `Mengunci perangkat ${row.device_id} karena langganan habis.`,
      );
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
