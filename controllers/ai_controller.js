// Ganti pemanggilan modul Google dengan Groq
const Groq = require("groq-sdk");
const pool = require("../config/db");

// Inisialisasi Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.chatWithAssistant = async (req, res) => {
  const { message, device_id, user_id } = req.body;

  if (!message) {
    return res.status(400).json({
      status: "error",
      message: "Pesan wajib diisi untuk bertanya pada Prof. Jago.",
    });
  }

  try {
    let sensorContext =
      "Saat ini tidak ada data sensor spesifik yang terlampir.";

    // ... [Bagian ini TETAP SAMA seperti sebelumnya (Logika Query SQL)] ...
    if (device_id && device_id.trim() !== "") {
      const sensorQuery = `SELECT temperature, humidity, gas_ppm, timestamp FROM sensor_data WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 5`;
      const sensorResult = await pool.query(sensorQuery, [device_id]);
      if (sensorResult.rows.length > 0) {
        const latest = sensorResult.rows[0];
        sensorContext = `Data Kondisi Kandang Terkini (ID Alat: ${device_id}):\n- Suhu: ${latest.temperature}°C\n- Kelembapan: ${latest.humidity}%\n- Kadar Amonia: ${latest.gas_ppm} PPM.`;
      }
    } else if (user_id) {
      const devicesQuery = `SELECT device_id, device_name FROM devices WHERE owned_by = $1`;
      const devicesRes = await pool.query(devicesQuery, [user_id]);
      if (devicesRes.rows.length > 0) {
        let allDevicesData = [];
        for (let dev of devicesRes.rows) {
          const sData = await pool.query(
            "SELECT temperature, humidity, gas_ppm FROM sensor_data WHERE device_id = $1 ORDER BY timestamp DESC LIMIT 1",
            [dev.device_id],
          );
          if (sData.rows.length > 0) {
            const d = sData.rows[0];
            allDevicesData.push(
              `- Kandang ${dev.device_name}: Suhu ${d.temperature}°C, Lembab ${d.humidity}%, Amonia ${d.gas_ppm} PPM`,
            );
          } else {
            allDevicesData.push(
              `- Kandang ${dev.device_name}: Belum ada data.`,
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

      KONTEKS DATA SENSOR:
      ${sensorContext}

      STANDAR ACUAN: 
      - Suhu Ideal: 29°C - 33°C.
      - Amonia Aman: < 20 PPM.
      - Kelembapan Ideal: 50% - 70%.

      PERTANYAAN USER: "${message}"

      INSTRUKSI PENTING (STRICT):
      1. FOKUS PADA PERTANYAAN: Jawablah HANYA apa yang ditanyakan user. Jangan melebar.
      2. GAYA BAHASA: Gunakan bahasa Indonesia yang luwes dan "friendly".
      3. PANJANG JAWABAN: Buat jawaban yang "PAS". Cukup berikan info inti.
      4. FORMAT TEXT (WAJIB): DILARANG menggunakan Markdown. Jika butuh poin-poin, gunakan tanda strip (-) saja.

      Silakan jawab sebagai Prof. Jago:
    `;

    // --- PROSES GENERATE TEXT MENGGUNAKAN GROQ ---
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      // Anda bisa menggunakan model lain seperti:
      // "llama-3.3-70b-versatile" atau "mixtral-8x7b-32768"
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply =
      chatCompletion.choices[0]?.message?.content || "Maaf, tidak ada respon.";

    // Membersihkan markdown hasil balasan AI jika masih bocor
    let cleanText = reply
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/#/g, "")
      .replace(/`/g, "")
      .replace(/\[/g, "")
      .replace(/\]/g, "");

    res.json({
      status: "success",
      reply: cleanText,
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({
      status: "error",
      message: "Prof. Jago sedang gangguan sesaat. Coba lagi nanti ya.",
    });
  }
};
