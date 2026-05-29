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

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },

    image: {
      type: String, // store image path
      required: true,
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

blogSchema.pre("save", async function () {
  // slug auto
  if (!this.slug && this.title) {
    let baseSlug = slugify(this.title, {
      lower: true,
      strict: true,
      locale: "hi",
      trim: true,
    });

    let slug = baseSlug;

    // ensure unique
    let count = 1;
    while (
      await mongoose.models.Blog.findOne({
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${count++}`;
    }

    this.slug = slug;
  }
});

module.exports = mongoose.model("Blog_Category", blogSchema);
