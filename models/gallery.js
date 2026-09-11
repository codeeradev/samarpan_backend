const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema(
  {
    caption: String,
    category: {
      type: String,
      trim: true,
      lowercase: true,
      default: "other",
    },

    image: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Gallery", gallerySchema);
