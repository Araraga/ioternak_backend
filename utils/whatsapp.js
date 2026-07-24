// utils/whatsapp.js
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// Inisialisasi client WhatsApp dengan LocalAuth agar sesi login tersimpan
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Menampilkan QR Code di terminal untuk proses autentikasi
client.on("qr", (qr) => {
  console.log("📌 Pindai QR Code di bawah ini menggunakan aplikasi WhatsApp:");
  qrcode.generate(qr, { small: true });
});

// Menampilkan log ketika WhatsApp berhasil terhubung
client.on("ready", () => {
  console.log("✅ WhatsApp Web Client telah siap dan terhubung!");
});

// Menampilkan log ketika autentikasi berhasil
client.on("authenticated", () => {
  console.log("✅ WhatsApp berhasil terautentikasi.");
});

// Menampilkan log jika autentikasi gagal
client.on("auth_failure", (msg) => {
  console.error("❌ Kegagalan autentikasi WhatsApp:", msg);
});

// Fungsi untuk memulai instance WhatsApp
const initializeWhatsApp = () => {
  client.initialize();
};

/**
 * Normalisasi nomor telepon ke format internasional 62xxx (tanpa + atau spasi).
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
 * Kirim pesan WhatsApp menggunakan whatsapp-web.js.
 * Dipakai untuk: OTP registrasi & alert sensor.
 *
 * @param {string} phone   - Nomor tujuan (format 62xxx)
 * @param {string} message - Isi pesan atau kode OTP
 * @returns {boolean}      - true jika berhasil
 */
const sendWhatsappOTP = async (phone, message) => {
  try {
    // Format tujuan (ID) untuk whatsapp-web.js harus berakhiran @c.us
    const chatId = `${phone}@c.us`;

    let finalMessage = message;

    // Apabila parameter message hanya berisi angka, format sebagai pesan OTP standar
    if (/^\d+$/.test(message)) {
      finalMessage = `*KODE OTP REGISTRASI*\n\nKode OTP Anda adalah: *${message}*\n\nBerlaku selama 5 menit. Jangan berikan kode ini kepada pihak mana pun.`;
    }

    // Eksekusi pengiriman pesan
    await client.sendMessage(chatId, finalMessage);
    console.log(`📲 Berhasil mengirim WhatsApp ke ${phone}`);
    return true;
  } catch (error) {
    console.error("❌ Error mengirim WhatsApp:", error.message);
    return false;
  }
};

module.exports = { initializeWhatsApp, formatPhoneNumber, sendWhatsappOTP };
