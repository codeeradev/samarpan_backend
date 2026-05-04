const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema({
  name: {
    type: String,
    enum: ["website", "panel"], // 🔥 restrict
    required: true,
    unique: true, // 🔥 one per type
  },

  colors: {
    primary: { type: String }, // #FF5733
    primary_deep: { type: String },
    primary_light: { type: String },
    primary_soft: { type: String },

        // panel
    secondary: String,
    background: String,
    foreground: String,
    border: String,

  },
});

module.exports = mongoose.model("Theme", themeSchema);
