const mongoose = require("mongoose");

const metaAccountSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    pageId: { type: String, trim: true, default: "" },
    pageName: { type: String, trim: true, default: "" },
    pagePicture: { type: String, trim: true, default: "" },
    instagramBusinessAccountId: { type: String, trim: true, default: "" },
    instagramUsername: { type: String, trim: true, default: "" },
    accessToken: { type: String, default: "" },
    tokenExpiresAt: { type: Date, default: null },
    connectedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "active", "expired", "disconnected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true, versionKey: false },
);

metaAccountSchema.index({ adminId: 1, status: 1 });

module.exports = mongoose.model("MetaAccount", metaAccountSchema);
