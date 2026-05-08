const mongoose = require("mongoose")

const careerApplicationSchema = new mongoose.Schema({

},
{ timestamps: true },
)

module.exports = mongoose.model("career_application", careerApplicationSchema);
