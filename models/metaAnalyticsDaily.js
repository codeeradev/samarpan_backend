const mongoose = require("mongoose");

const metaAnalyticsDailySchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    followers: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    profileVisits: { type: Number, default: 0 },
    websiteClicks: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

metaAnalyticsDailySchema.index({ adminId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("MetaAnalyticsDaily", metaAnalyticsDailySchema);
