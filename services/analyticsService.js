const AnalyticsEvent = require("../models/analyticsEvent");

const ANALYTICS_TIMEZONE = process.env.MAIL_TIMEZONE || "Asia/Kolkata";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePage = (value) => {
  const page = normalizeText(value);

  if (!page) {
    return "/";
  }

  return page.startsWith("/") ? page : `/${page}`;
};

const getStartOfDay = (base = new Date()) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (base = new Date()) => {
  const d = new Date(base);
  d.setHours(23, 59, 59, 999);
  return d;
};

const buildDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getDateDaysAgo = (base, daysAgo) => {
  const d = new Date(base);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
};

const countUniqueVisitors = async (match = {}) => {
  const result = await AnalyticsEvent.aggregate([
    { $match: match },
    { $group: { _id: "$visitorId" } },
    { $count: "count" },
  ]);

  return result[0]?.count || 0;
};

const trackPageView = async ({ visitorId, page }) => {
  const cleanVisitorId = normalizeText(visitorId);
  const cleanPage = normalizePage(page);

  if (!cleanVisitorId) {
    const error = new Error("visitorId is required");
    error.statusCode = 400;
    throw error;
  }

  return AnalyticsEvent.create({
    visitorId: cleanVisitorId,
    page: cleanPage,
  });
};

const getAnalyticsDashboard = async () => {
  const now = new Date();
  const todayStart = getStartOfDay(now);
  const todayEnd = getEndOfDay(now);
  const last7Start = getDateDaysAgo(now, 6);
  const last30Start = getDateDaysAgo(now, 29);
  const last7Days = Array.from({ length: 7 }, (_, i) =>
    getDateDaysAgo(now, 6 - i),
  );

  const [
    totalVisitors,
    todaysVisitors,
    last7DaysVisitors,
    last30DaysVisitors,
    totalPageViews,
    topPages,
    dailyVisitorsRaw,
  ] = await Promise.all([
    countUniqueVisitors(),
    countUniqueVisitors({
      createdAt: { $gte: todayStart, $lte: todayEnd },
    }),
    countUniqueVisitors({
      createdAt: { $gte: last7Start, $lte: todayEnd },
    }),
    countUniqueVisitors({
      createdAt: { $gte: last30Start, $lte: todayEnd },
    }),
    AnalyticsEvent.countDocuments({}),
    AnalyticsEvent.aggregate([
      {
        $group: {
          _id: "$page",
          pageViews: { $sum: 1 },
          visitors: { $addToSet: "$visitorId" },
        },
      },
      {
        $project: {
          _id: 0,
          page: "$_id",
          pageViews: 1,
          visitors: { $size: "$visitors" },
        },
      },
      { $sort: { pageViews: -1, page: 1 } },
      { $limit: 10 },
    ]),
    AnalyticsEvent.aggregate([
      { $match: { createdAt: { $gte: last7Start, $lte: todayEnd } } },
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: ANALYTICS_TIMEZONE,
              },
            },
            visitorId: "$visitorId",
          },
        },
      },
      {
        $group: {
          _id: "$_id.day",
          visitors: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const visitorsByDay = dailyVisitorsRaw.reduce((acc, row) => {
    acc[row._id] = row.visitors;
    return acc;
  }, {});

  return {
    totals: {
      totalVisitors,
      todaysVisitors,
      last7DaysVisitors,
      last30DaysVisitors,
      totalPageViews,
    },
    topPages,
    dailyVisitors: last7Days.map((date) => {
      const day = buildDayKey(date);
      return {
        day,
        visitors: visitorsByDay[day] || 0,
      };
    }),
  };
};

module.exports = {
  getAnalyticsDashboard,
  trackPageView,
};
