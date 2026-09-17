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
    },

    video: {
      type: String,
    },

    mediaType: {
      type: String,
      enum: ["image", "video"],
      default: "image",
    },
  },
  { timestamps: true },
);

// At least one media field must be present
gallerySchema.pre("save", function (next) {
  if (!this.image && !this.video) {
    return next(new Error("Either image or video must be provided"));
  }
  // next();
});

module.exports = mongoose.model("Gallery", gallerySchema);
