const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    visitorId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    page: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  },
);

analyticsEventSchema.index({ visitorId: 1, createdAt: -1 });
analyticsEventSchema.index({ page: 1, createdAt: -1 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
