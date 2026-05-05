/**
 * Initialize default panel theme in database
 * Run this once: node seeds/init-default-theme.js
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Theme = require("../models/theme");

const DEFAULT_PANEL_THEME = {
  name: "panel",
  colors: {
    light: {
      base: {
        background: "#f8f8f8",
        foreground: "#1a1a1a",
        border: "#e0e0e0",
        input: "#f0f0f0",
        ring: "#d4a574",
      },
      interactive: {
        primary: "#d4a574",
        primaryForeground: "#ffffff",
        secondary: "#8b6f47",
        secondaryForeground: "#ffffff",
        accent: "#f4e8d0",
        accentForeground: "#2d2416",
        destructive: "#8b3a3a",
        destructiveForeground: "#ffffff",
      },
      components: {
        card: "#ffffff",
        cardForeground: "#1a1a1a",
        popover: "#ffffff",
        popoverForeground: "#1a1a1a",
        muted: "#f5f5f5",
        mutedForeground: "#7a7a7a",
      },
      sidebar: {
        background: "#ffffff",
        foreground: "#475569",
        primary: "#d4a574",
        primaryForeground: "#ffffff",
        accent: "#f4e8d0",
        accentForeground: "#a67c00",
        border: "#e0e0e0",
        ring: "#d4a574",
      },
      charts: {
        1: "#d4a574",
        2: "#8b6f47",
        3: "#f4e8d0",
        4: "#a6956d",
        5: "#9e8860",
      },
    },
    dark: {
      base: {
        background: "#1a1a1a",
        foreground: "#f5f5f5",
        border: "#333333",
        input: "#2a2a2a",
        ring: "#d4a574",
      },
      interactive: {
        primary: "#d4a574",
        primaryForeground: "#1a1a1a",
        secondary: "#a6956d",
        secondaryForeground: "#1a1a1a",
        accent: "#8b6f47",
        accentForeground: "#f5f5f5",
        destructive: "#c45555",
        destructiveForeground: "#1a1a1a",
      },
      components: {
        card: "#252525",
        cardForeground: "#f5f5f5",
        popover: "#2a2a2a",
        popoverForeground: "#f5f5f5",
        muted: "#333333",
        mutedForeground: "#999999",
      },
      sidebar: {
        background: "#1f1f1f",
        foreground: "#e0e0e0",
        primary: "#d4a574",
        primaryForeground: "#1a1a1a",
        accent: "#8b6f47",
        accentForeground: "#f5f5f5",
        border: "#333333",
        ring: "#d4a574",
      },
      charts: {
        1: "#d4a574",
        2: "#a6956d",
        3: "#8b6f47",
        4: "#7a6f5f",
        5: "#6a5f4f",
      },
    },
  },
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/samarpan", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
};

const initDefaultTheme = async () => {
  try {
    // Check if theme already exists
    const existingTheme = await Theme.findOne({ name: "panel" });

    if (existingTheme) {
      console.log("⚠️  Panel theme already exists. Updating...");
      await Theme.findOneAndUpdate({ name: "panel" }, DEFAULT_PANEL_THEME, {
        new: true,
      });
      console.log("✅ Panel theme updated successfully!");
    } else {
      console.log("📝 Creating default panel theme...");
      await Theme.create(DEFAULT_PANEL_THEME);
      console.log("✅ Default panel theme created successfully!");
    }

    // Also create default website theme if it doesn't exist
    const existingWebsiteTheme = await Theme.findOne({ name: "website" });
    if (!existingWebsiteTheme) {
      console.log("📝 Creating default website theme...");
      await Theme.create({
        name: "website",
        colors: DEFAULT_PANEL_THEME.colors, // Use same colors as fallback
      });
      console.log("✅ Default website theme created successfully!");
    }
  } catch (error) {
    console.error("❌ Error initializing theme:", error);
    process.exit(1);
  }
};

const main = async () => {
  await connectDB();
  await initDefaultTheme();
  await mongoose.connection.close();
  console.log("✅ Seed completed and connection closed.");
};

main();
