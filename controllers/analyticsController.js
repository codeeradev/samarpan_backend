const {
  getAnalyticsDashboard,
  trackPageView,
} = require("../services/analyticsService");

exports.trackAnalytics = async (req, res) => {
  try {
    await trackPageView({
      visitorId: req.body.visitorId,
      page: req.body.page,
    });

    return res.status(201).json({ message: "Analytics event tracked" });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const analytics = await getAnalyticsDashboard();

    return res.status(200).json({
      message: "Analytics retrieved successfully",
      analytics,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
