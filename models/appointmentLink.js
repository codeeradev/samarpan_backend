const mongoose = require("mongoose");

const appointmentLinkSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      trim: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    doctorName: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

appointmentLinkSchema.index({ doctorId: 1, isActive: 1 });

module.exports = mongoose.model("appointmentlinks", appointmentLinkSchema);
