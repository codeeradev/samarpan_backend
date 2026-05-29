const mongoose = require("mongoose");

const generateSlug = require("../utils/slugGenerater");

const procedureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    shortDescription: {
      type: String,
      required: true,
      maxlength: [300, "Short description cannot exceed 300 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    image: String,
    content: String,
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
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

procedureSchema.pre("save", async function () {
  // slug auto
  if (!this.slug && this.title) {
    let baseSlug = generateSlug(this.title);
    let slug = baseSlug;

    // ensure unique
    let count = 1;
    while (
      await mongoose.models.procedure.findOne({
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${count++}`;
    }

    this.slug = slug;
  }
});

module.exports = mongoose.model("procedure", procedureSchema);
