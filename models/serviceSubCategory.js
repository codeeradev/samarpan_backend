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

const serviceFeatureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
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
    featureServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "service_feature",
      required: true,
    },
    image: String,
    content: { type: String },
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

serviceFeatureSchema.pre("save", async function () {

  if (!this.slug && this.title) {
    let baseSlug = slugify(this.title, {
      lower: true,
      strict: false,
      locale: "hi",
      trim: true,
    });

    let slug = baseSlug;
    let counter = 1;

    while (
      await this.constructor.findOne({
        slug,
        _id: { $ne: this._id },
      })
    ) {
      slug = `${baseSlug}-${counter++}`;
    }

    this.slug = slug;
  }

  this.seo = this.seo || {};

  if (!this.seo.metaTitle) {
    this.seo.metaTitle = this.title;
  }
});

module.exports = mongoose.model("service_sub_category", serviceFeatureSchema);
