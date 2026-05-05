const mongoose = require("mongoose");

// PANEL (complex structure - as it is)
const colorGroupSchema = {
  base: {
    background: String,
    foreground: String,
    border: String,
    input: String,
    ring: String,
  },
  interactive: {
    primary: String,
    primaryForeground: String,
    secondary: String,
    secondaryForeground: String,
    accent: String,
    accentForeground: String,
    destructive: String,
    destructiveForeground: String,
  },
  components: {
    card: String,
    cardForeground: String,
    popover: String,
    popoverForeground: String,
    muted: String,
    mutedForeground: String,
  },
  sidebar: {
    background: String,
    foreground: String,
    primary: String,
    primaryForeground: String,
    accent: String,
    accentForeground: String,
    border: String,
    ring: String,
  },
  charts: {
    1: String,
    2: String,
    3: String,
    4: String,
    5: String,
  },
};

// WEBSITE (simple flat structure)
const websiteColorSchema = {
  primary: String,
  primary_deep: String,
  primary_light: String,
  primary_soft: String,
};

// MAIN SCHEMA
const themeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["website", "panel"],
      required: true,
      unique: true,
    },

    logo: String,
    favicon: String,

    // Only one will be used depending on name
    colors: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Theme", themeSchema);
