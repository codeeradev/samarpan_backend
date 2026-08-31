const mongoose = require("mongoose");

const tpaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TPA", tpaSchema);
