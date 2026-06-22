const mongoose = require("mongoose");

const seoReportSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      index: true,
    },

    reportHtml: {
      type: String,
      required: true,
    },

    reportDate: {
      type: String,
      required: true,
      index: true,
    },

    source: {
      type: String,
      default: "rankmath",
    },
  },
  {
    timestamps: true,
  },
);

seoReportSchema.index(
  {
    url: 1,
    reportDate: 1,
  },
  {
    unique: true,
  },
);

module.exports = mongoose.model("SeoReport", seoReportSchema);
