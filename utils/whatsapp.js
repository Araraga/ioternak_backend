const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

/**
 * Normalise phone number ke format internasional 62xxx (tanpa + atau spasi).
 * Mendukung input: "0812...", "62812...", "+62812..."
 */
const formatPhoneNumber = (number) => {
  let formatted = number.toString().trim();
  formatted = formatted.replace(/\D/g, "");

  if (formatted.startsWith("0")) {
    formatted = "62" + formatted.substring(1);
  }

  return formatted;
};

/**
 * Kirim pesan WhatsApp via Fonnte.
 * Dipakai untuk: OTP registrasi & alert sensor (suhu/gas tinggi).
 *
 * @param {string} phone   - Nomor tujuan (format 62xxx)
 * @param {string} message - Isi pesan
 * @returns {boolean}      - true jika berhasil
 */
const sendWhatsappOTP = async (phone, message) => {
  try {
    const token = process.env.FONNTE_TOKEN;

    const response = await axios.post(
      "https://api.fonnte.com/send",
      {
        target: phone,
        message: message,
        countryCode: "62",
      },
      {
        headers: {
          Authorization: token,
        },
      },
    );

    console.log(`📲 Log Fonnte ke ${phone}:`, response.data);

    if (response.data.status) {
      return true;
    } else {
      console.error("Gagal Kirim Fonnte:", response.data.reason);
      return false;
    }
  } catch (error) {
    console.error("Error Axios Fonnte:", error.message);
    return false;
  }
};

module.exports = { formatPhoneNumber, sendWhatsappOTP };
