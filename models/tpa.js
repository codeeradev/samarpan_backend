const mongoose = require("mongoose");

const tpaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      lowercase: true,
      default: "tpa",
    },
    image: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TPA", tpaSchema);
