const express = require("express");
const {
  submitAppointment,
  getServices,
  getDoctors,
  getReviews,
  getShorts,
  getBlogs
} = require("../controllers/websiteController");

const router = express.Router();

router.post("/submit-appointment", submitAppointment);
router.get("/get-services", getServices);
router.get("/get-doctors", getDoctors);
router.get("/get-reviews", getReviews);
router.get("/get-shorts", getShorts);
router.get("/get-blogs", getBlogs);

module.exports = router;
