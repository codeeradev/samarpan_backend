const mongoose = require("mongoose");

const shortSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shortUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: "",
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    doctorTestimonial: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Composite index for query performance
shortSchema.index({
  isActive: 1,
  doctorTestimonial: 1,
  sortOrder: 1,
});

module.exports = mongoose.model("Short", shortSchema);
