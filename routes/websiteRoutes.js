const express = require("express");
const {
  submitAppointment,
  getServices,
  getDoctors,
  getReviews,
  getShorts,
  getBlogs,
  getGallery,
  getContentByModelKey,
  getPageBySlug,
  getSettings,
} = require("../controllers/websiteController");

const router = express.Router();

router.post("/submit-appointment", submitAppointment);
router.get("/get-services", getServices);
router.get("/get-doctors", getDoctors);
router.get("/get-reviews", getReviews);
router.get("/get-shorts", getShorts);
router.get("/get-blogs", getBlogs);
router.get("/get-gallery", getGallery);
router.get("/get-content/:modelKey", getContentByModelKey);
router.get("/get-page/:slug", getPageBySlug);
router.get("/get-settings", getSettings);
module.exports = router;
