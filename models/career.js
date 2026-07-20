const mongoose = require("mongoose");

const careerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    department: {
      type: String,
      default: "",
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
    employmentType: {
      type: String,
      default: "",
      trim: true,
    },
    experience: {
      type: String,
      default: "",
      trim: true,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    seo: {
      metaTitle: {
        type: String,
        default: "",
        trim: true,
      },
      metaDescription: {
        type: String,
        default: "",
        trim: true,
      },
      keywords: {
        type: [String],
        default: [],
      },
    },
    requirements: {
      type: [String],
      default: [],
    },
    responsibilities: {
      type: [String],
      default: [],
    },
    applyEmail: {
      type: String,
      default: "",
      trim: true,
    },
    applyLink: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "open",
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("career", careerSchema);
