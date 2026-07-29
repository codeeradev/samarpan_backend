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

    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    image: {
      type: String, // store image path
      required: true,
    },

    blogCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Blog_Category",
      required: true,
    },

    shortDescription: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
    },

    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
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

  // SEO auto
  this.seo = this.seo || {};

  if (!this.seo.metaTitle) {
    this.seo.metaTitle = this.title;
  }

  if (!this.seo.metaDescription) {
    this.seo.metaDescription = this.shortDescription;
  }
});

module.exports = mongoose.model("Blog", blogSchema);
