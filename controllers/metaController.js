const metaService = require("../services/metaService");

const sendError = (res, error) => {
  console.error(error);
  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : "Server error",
  });
};

exports.connect = async (req, res) => {
  try {
    return res.status(200).json({
      authUrl: metaService.createOAuthUrl(req.user._id),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.callback = async (req, res) => {
  try {
    const result = await metaService.handleOAuthCallback(req.query);
    return res.status(200).json({
      message: "Meta login completed. Select a Facebook Page to continue.",
      ...result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.status = async (req, res) => {
  try {
    const result = await metaService.getAccountStatus(req.user._id);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.disconnect = async (req, res) => {
  try {
    const account = await metaService.disconnect(req.user._id);
    return res.status(200).json({
      message: "Meta account disconnected",
      account,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.pages = async (req, res) => {
  try {
    const pages = await metaService.getPages(req.user._id);
    return res.status(200).json({ pages });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.selectPage = async (req, res) => {
  try {
    const account = await metaService.selectPage({
      adminId: req.user._id,
      pageId: req.body.pageId,
    });
    return res.status(200).json({
      message: "Meta Page connected",
      account,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.overview = async (req, res) => {
  try {
    const result = await metaService.getOverview({
      adminId: req.user._id,
      query: req.query,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

const metricHandler = (metric) => async (req, res) => {
  try {
    const series = await metaService.getMetricSeries({
      adminId: req.user._id,
      query: req.query,
      metric,
    });
    return res.status(200).json({ series });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.followers = metricHandler("followers");
exports.reach = metricHandler("reach");
exports.impressions = metricHandler("impressions");

exports.posts = async (req, res) => {
  try {
    const posts = await metaService.getPosts({
      adminId: req.user._id,
      limit: Number(req.query.limit || 50),
    });
    return res.status(200).json({ posts });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.postDetails = async (req, res) => {
  try {
    const { postId, platform } = req.params;
    const result = await metaService.getPostDetails({
      adminId: req.user._id,
      postId,
      platform,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

exports.topPosts = async (req, res) => {
  try {
    const posts = await metaService.getPosts({
      adminId: req.user._id,
      limit: Number(req.query.limit || 50),
    });
    return res.status(200).json({
      posts: posts
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, Number(req.query.take || 10)),
    });
  } catch (error) {
    return sendError(res, error);
  }
};
