const mongoose = require("mongoose");

const slugify = require("slugify");

// function slugify(text) {
//   return text
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9\s-]/g, "")
//     .replace(/\s+/g, "-")
//     .replace(/-+/g, "-");
// }

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
    let baseSlug = slugify(this.title, {
      lower: true,
      strict: false,
      locale: "hi",
      trim: true,
    });
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
