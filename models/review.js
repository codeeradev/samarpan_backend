const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
  id:{ type: String, unique: true, index: true},
  authorName:String,
  authorUrl:String,
  profilePhotoUrl:String,
  rating:Number,
  relativeTimeDescription:String,
  text:String,
  time:{ type: Number, index: true },
  language:String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Review", reviewSchema);
