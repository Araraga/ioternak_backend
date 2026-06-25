const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

console.log("File authRoutes.js BERHASIL dimuat!");

router.post(
  "/request-otp",
  (req, res, next) => {
    console.log("Ada yang mengetuk pintu /request-otp!");
    next();
  },
  authController.requestOTP,
);

router.post("/register", authController.registerWithOTP);

module.exports = router;
