const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const formatPhoneNumber = (number) => {
  let formatted = number.toString().trim();

  formatted = formatted.replace(/\D/g, "");

  if (formatted.startsWith("0")) {
    formatted = "62" + formatted.substring(1);
  }

  return formatted;
};

const sendWhatsappOTP = async (phone, otp) => {
  try {
    const token = process.env.FONNTE_TOKEN;
    const message = `*IoTernak Security*
Kode Verifikasi Anda: *${otp}*

Jangan berikan kode ini kepada siapa pun.
Kode berlaku selama 5 menit.`;

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

    console.log(`Log Fonnte ke ${phone}:`, response.data);

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
