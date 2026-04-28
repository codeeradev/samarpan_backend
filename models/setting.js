const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    inquiry_email: {
      type: String,
      trim: true,
    },
    mobile_number: {
      type: String,
      trim: true,
    },
    inquiry_mobile_number: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
    },
    working_hours: {
      type: String,
    },
    password: {
      type: String,
    },
    contact_us: {
      type: String,
      default: true,
    },
    term_and_condition: {
      type: String,
      default: true,
    },
    privacy_policy: {
      type: String,
      default: true,
    },
    about_us: {
      type: String,
      default: true,
    },
    social_links: {
      facebook: { type: String, trim: true },
      youtube: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      instagram: { type: String, trim: true },
      call: { type: String, trim: true },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("setting", settingSchema);
