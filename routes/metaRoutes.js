const express = require("express");
const metaController = require("../controllers/metaController");
const checkAdmin = require("../middleware/checkAdmin");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

router.get("/callback", metaController.callback);

router.use(verifyToken, checkAdmin);

router.get("/connect", metaController.connect);
router.get("/status", metaController.status);
router.post("/disconnect", metaController.disconnect);
router.get("/pages", metaController.pages);
router.post("/select-page", metaController.selectPage);
router.get("/overview", metaController.overview);
router.get("/followers", metaController.followers);
router.get("/reach", metaController.reach);
router.get("/impressions", metaController.impressions);
router.get("/posts", metaController.posts);
router.get("/posts/:postId/:platform", metaController.postDetails);
router.get("/top-posts", metaController.topPosts);

module.exports = router;
