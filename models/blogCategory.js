const mongoose = require("mongoose");

const generateSlug = require("../utils/slugGenerater");

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
    let baseSlug = generateSlug(this.title);

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
