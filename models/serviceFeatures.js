const mongoose = require("mongoose");

const generateSlug = require("../utils/slugGenerater");

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

    image:String,
    content: { type: String },
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
    },
  },
  { timestamps: true },
);

serviceFeatureSchema.pre("save", async function () {
  if (!this.slug && this.title) {
    let baseSlug = generateSlug(this.title);

    let slug = baseSlug;
    let counter = 1;

    while (
      await mongoose.models.service_feature.findOne({
        slug,
        serviceId: this.serviceId,
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

module.exports = mongoose.model("service_feature", serviceFeatureSchema);
