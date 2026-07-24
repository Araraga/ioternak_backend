// controllers/authController.js
const pool = require("../config/db");
const { formatPhoneNumber, sendWhatsappOTP } = require("../utils/whatsapp");

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ============================================================
// 1. REQUEST OTP
// ============================================================
exports.requestOTP = async (req, res) => {
  const { phone } = req.body;

  try {
    if (!phone) {
      return res
        .status(400)
        .json({ status: "error", message: "Nomor HP wajib diisi" });
    }

    const formattedPhone = formatPhoneNumber(phone);
    console.log(`[DEBUG] Memeriksa Pengguna: ${formattedPhone} ATAU ${phone}`);

    // Pengecekan apakah nomor sudah terdaftar
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE phone_number = $1 OR phone_number = $2",
      [formattedPhone, phone],
    );

    if (userCheck.rows.length > 0) {
      console.log(
        `[BLOCKED] Nomor ${phone} sudah terdaftar dengan ID: ${userCheck.rows[0].user_id}`,
      );
      return res.status(400).json({
        status: "error",
        message: "Nomor ini sudah terdaftar. Silakan Masuk (Login).",
      });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60000); // Masa berlaku 5 menit

    // Menghapus OTP lama jika ada
    await pool.query(
      "DELETE FROM otp_verifications WHERE phone_number = $1 OR phone_number = $2",
      [formattedPhone, phone],
    );

    // Menyimpan OTP baru ke pangkalan data
    await pool.query(
      `INSERT INTO otp_verifications (phone_number, otp_code, expires_at) VALUES ($1, $2, $3)`,
      [formattedPhone, otp, expiresAt],
    );
    console.log(`✅ OTP tersimpan untuk ${formattedPhone}`);

    // Mengirim pesan melalui whatsapp-web.js
    const isSent = await sendWhatsappOTP(formattedPhone, otp);

    if (isSent) {
      res.json({ status: "success", message: "OTP terkirim ke WhatsApp!" });
    } else {
      res.status(500).json({
        status: "error",
        message: "Gagal mengirim WhatsApp. Periksa koneksi atau sesi Client.",
      });
    }
  } catch (error) {
    console.error("❌ ERROR REQUEST-OTP:", error.message);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan server.",
      error: error.message,
    });
  }
};

// ============================================================
// 2. REGISTER FINAL
// ============================================================
exports.registerWithOTP = async (req, res) => {
  const { full_name, phone, otp } = req.body;

  try {
    if (!full_name || !phone || !otp) {
      return res
        .status(400)
        .json({ status: "error", message: "Data tidak lengkap" });
    }

    const formattedPhone = formatPhoneNumber(phone);

    // A. Verifikasi OTP (memeriksa format 62 atau format masukan pengguna)
    const otpCheck = await pool.query(
      `SELECT * FROM otp_verifications
       WHERE (phone_number = $1 OR phone_number = $2)
         AND otp_code = $3
         AND expires_at > NOW()`,
      [formattedPhone, phone, otp],
    );

    if (otpCheck.rows.length === 0) {
      return res
        .status(400)
        .json({
          status: "error",
          message: "Kode OTP salah atau telah kedaluwarsa.",
        });
    }

    // B. Menyimpan pengguna baru dengan format nomor 62
    const newUser = await pool.query(
      `INSERT INTO users (full_name, phone_number)
       VALUES ($1, $2)
       RETURNING user_id, full_name, phone_number`,
      [full_name, formattedPhone],
    );

    // C. Menghapus OTP yang sudah diverifikasi dari tabel
    await pool.query(
      "DELETE FROM otp_verifications WHERE phone_number = $1 OR phone_number = $2",
      [formattedPhone, phone],
    );

    console.log(`🎉 Pengguna Baru Terdaftar: ${full_name}`);

    res.status(201).json({
      status: "success",
      message: "Registrasi Berhasil!",
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error("❌ ERROR REGISTER:", error.message);
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ status: "error", message: "Nomor HP ini sudah terdaftar." });
    }
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan server.",
      error: error.message,
    });
  }
};
