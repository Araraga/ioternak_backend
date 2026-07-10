const Groq = require("groq-sdk");
const pool = require("../config/db");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.chatWithAssistant = async (req, res) => {
  const { message, device_id, user_id, barn_id } = req.body;

  if (!message) {
    return res.status(400).json({
      status: "error",
      message: "Pesan wajib diisi untuk bertanya pada Prof. Jago.",
    });
  }

  try {
    let sensorContext =
      "Saat ini tidak ada data sensor spesifik yang terlampir.";
    let barnContext = "Saat ini tidak ada data manajemen kandang tambahan.";

    if (device_id && device_id.trim() !== "") {
      const sensorQuery = `
        SELECT temperature, humidity, gas_ppm, timestamp
        FROM sensor_data
        WHERE device_id = $1
        ORDER BY timestamp DESC
        LIMIT 5
      `;
      const sensorResult = await pool.query(sensorQuery, [device_id]);

      if (sensorResult.rows.length > 0) {
        const latest = sensorResult.rows[0];
        sensorContext = `Data Kondisi Kandang Terkini (ID Alat: ${device_id}):\n- Suhu: ${latest.temperature}°C\n- Kelembapan: ${latest.humidity}%\n- Kadar Amonia: ${latest.gas_ppm} PPM.`;

        const barnQuery = `
          SELECT b.*, d.device_name, d.type
          FROM devices d
          LEFT JOIN barns b ON d.barn_id = b.id
          WHERE d.device_id = $1
        `;
        const barnResult = await pool.query(barnQuery, [device_id]);

        if (barnResult.rows.length > 0) {
          const barn = barnResult.rows[0];
          if (barn.barn_name) {
            barnContext = `Manajemen Kandang:\n- Nama kandang: ${barn.barn_name}\n- Lokasi: ${barn.location || "-"}\n- Tipe ternak: ${barn.animal_type || "-"}\n- Kapasitas: ${barn.capacity || "-"} ekor\n- Suhu ideal: ${barn.preferred_temp_min || 29}°C s/d ${barn.preferred_temp_max || 33}°C\n- Kelembapan ideal: ${barn.preferred_humidity_min || 50}% s/d ${barn.preferred_humidity_max || 70}%\n- Ambang amonia: ${barn.preferred_gas_max || 20} PPM\n- Catatan: ${barn.description || "-"}.\n- Perangkat: ${barn.device_name || device_id}.`;
          }
        }
      }
    } else if (barn_id && barn_id.toString().trim() !== "") {
      const barnQuery = `SELECT * FROM barns WHERE id = $1`;
      const barnResult = await pool.query(barnQuery, [barn_id]);
      if (barnResult.rows.length > 0) {
        const barn = barnResult.rows[0];
        barnContext = `Manajemen Kandang:\n- Nama kandang: ${barn.barn_name}\n- Lokasi: ${barn.location || "-"}\n- Tipe ternak: ${barn.animal_type || "-"}\n- Kapasitas: ${barn.capacity || "-"} ekor\n- Suhu ideal: ${barn.preferred_temp_min || 29}°C s/d ${barn.preferred_temp_max || 33}°C\n- Kelembapan ideal: ${barn.preferred_humidity_min || 50}% s/d ${barn.preferred_humidity_max || 70}%\n- Ambang amonia: ${barn.preferred_gas_max || 20} PPM\n- Catatan: ${barn.description || "-"}.\n`;

        const devicesQuery = `
          SELECT device_id, device_name
          FROM devices
          WHERE barn_id = $1
        `;
        const devicesRes = await pool.query(devicesQuery, [barn_id]);
        if (devicesRes.rows.length > 0) {
          const deviceIds = devicesRes.rows.map((row) => row.device_id);
          const sensorResult = await pool.query(
            `
            SELECT device_id, temperature, humidity, gas_ppm, timestamp
            FROM sensor_data
            WHERE device_id = ANY($1)
            ORDER BY timestamp DESC
            LIMIT 5
            `,
            [deviceIds],
          );
          if (sensorResult.rows.length > 0) {
            const latest = sensorResult.rows[0];
            sensorContext = `Data Kondisi Kandang Terkini (ID Alat: ${latest.device_id}):\n- Suhu: ${latest.temperature}°C\n- Kelembapan: ${latest.humidity}%\n- Kadar Amonia: ${latest.gas_ppm} PPM.`;
          }
        }
      }
    } else if (user_id) {
      const devicesQuery = `SELECT d.device_id, d.device_name, b.barn_name FROM devices d LEFT JOIN barns b ON d.barn_id = b.id WHERE d.owned_by = $1`;
      const devicesRes = await pool.query(devicesQuery, [user_id]);

      if (devicesRes.rows.length > 0) {
        let allDevicesData = [];
        for (let dev of devicesRes.rows) {
          const sData = await pool.query(
            `
            SELECT temperature, humidity, gas_ppm, timestamp
            FROM sensor_data
            WHERE device_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
            `,
            [dev.device_id],
          );

          if (sData.rows.length > 0) {
            const d = sData.rows[0];
            allDevicesData.push(
              `- Kandang ${dev.barn_name || dev.device_name}: Suhu ${d.temperature}°C, Lembab ${d.humidity}%, Amonia ${d.gas_ppm} PPM`,
            );
          } else {
            allDevicesData.push(
              `- Kandang ${dev.barn_name || dev.device_name}: Belum ada data.`,
            );
          }
        }

        sensorContext =
          "Rangkuman Data Semua Kandang:\n" + allDevicesData.join("\n");
      }
    }

    const prompt = `
      PERAN ANDA:
      Nama Anda adalah "Prof. Jago", asisten AI IoTernak yang cerdas dan ramah.

      KONTEX DATA SENSOR:
      ${sensorContext}

      KONTEKS MANAJEMEN KANDANG:
      ${barnContext}

      STANDAR ACUAN:
      - Suhu Ideal: 29°C - 33°C.
      - Amonia Aman: < 20 PPM.
      - Kelembapan Ideal: 50% - 70%.

      PERTANYAAN USER: "${message}"

      INSTRUKSI PENTING (STRICT):
      1. FOKUS PADA PERTANYAAN: Jawablah HANYA apa yang ditanyakan user. Jangan melebar.
      2. GAYA BAHASA: Gunakan bahasa Indonesia yang luwes dan friendly.
      3. PANJANG JAWABAN: Buat jawaban yang PAS. Cukup berikan info inti.
      4. FORMAT TEXT (WAJIB): DILARANG menggunakan Markdown. Jika butuh poin-poin, gunakan tanda strip (-) saja.

      Silakan jawab sebagai Prof. Jago:
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply =
      chatCompletion.choices[0]?.message?.content || "Maaf, tidak ada respon.";
    let cleanText = reply
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#/g, "")
      .replace(/`/g, "")
      .replace(/\[/g, "")
      .replace(/\]/g, "");

    res.json({
      status: "success",
      reply: cleanText.trim(),
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({
      status: "error",
      message: "Prof. Jago sedang gangguan sesaat. Coba lagi nanti ya.",
    });
  }
};
