const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
{
  title: {
    type: String,
    required: true,
    trim: true
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  shortDescription: {
    type: String,
    required: true
  },

  sortOrder: {
    type: Number,
    default: 0
  },

  image: {
    type: String,
    required: true
  },

  icon: {
    type: String,
    required: true
  },

  content: {
    type: String
  },

  faqs: [
    {
      question: String,
      answer: String
    }
  ],

  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },

  isActive: {
    type: Boolean,
    default: true
  }

},
{ timestamps: true }
);

module.exports = mongoose.model("Service", serviceSchema);
