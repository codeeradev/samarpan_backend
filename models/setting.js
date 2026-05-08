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
    whatsapp_number: {
      type: String,
      trim: true,
      set: (v) => v ? v.replace(/[^\d+]/g, "") : v
    },
    inquiry_mobile_number: {
      type: String,
      trim: true,
      set: (v) => v ? v.replace(/[^\d+]/g, "") : v
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
    google_reviews: {
      place_id: { type: String, trim: true },
      api_key: { type: String, trim: true },
    },
    social_links: {
      facebook: { type: String, trim: true },
      youtube: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      instagram: { type: String, trim: true },
      call: { type: String, trim: true },
    },
    website_logo:String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("setting", settingSchema);
