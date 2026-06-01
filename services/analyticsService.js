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

const getVisitorStats = async (match = {}) => {
  const result = await AnalyticsEvent.aggregate([
    { $match: match },
    { $group: { _id: "$visitorId", pageViews: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unique: {
          $sum: { $cond: [{ $eq: ["$pageViews", 1] }, 1, 0] },
        },
        repeated: {
          $sum: { $cond: [{ $gt: ["$pageViews", 1] }, 1, 0] },
        },
      },
    },
  ]);

  return result[0] || { total: 0, unique: 0, repeated: 0 };
};

const pageSections = [
  { key: "blogs", title: "Blogs", prefix: "/blogs" },
  { key: "services", title: "Services", prefix: "/services" },
  {
    key: "cosmetic-procedures",
    title: "Cosmetic Procedures",
    prefix: "/cosmetic-procedures",
  },
  { key: "careers", title: "Careers", prefix: "/careers" },
];

const getPageSection = (page) => {
  const cleanPage = normalizePage(page).split("?")[0].split("#")[0];

  return pageSections.find(
    (section) =>
      cleanPage === section.prefix || cleanPage.startsWith(`${section.prefix}/`),
  );
};

const buildPageSummaries = (pageStatsRaw) => {
  const sectionMap = new Map();
  const directPages = [];

  for (const row of pageStatsRaw) {
    const page = normalizePage(row.page);
    const section = getPageSection(page);
    const pageSummary = {
      page,
      pageViews: row.pageViews,
      visitors: row.visitors,
    };

    if (!section) {
      directPages.push(pageSummary);
      continue;
    }

    const existing = sectionMap.get(section.key) || {
      key: section.key,
      title: section.title,
      pageViews: 0,
      visitorIds: new Set(),
      pages: [],
    };

    existing.pageViews += row.pageViews;
    for (const visitorId of row.visitorIds || []) {
      existing.visitorIds.add(visitorId);
    }
    existing.pages.push(pageSummary);
    sectionMap.set(section.key, existing);
  }

  const pageGroups = Array.from(sectionMap.values()).map((section) => ({
    key: section.key,
    title: section.title,
    pageViews: section.pageViews,
    visitors: section.visitorIds.size,
    pages: section.pages.sort((a, b) => {
      if (b.pageViews !== a.pageViews) return b.pageViews - a.pageViews;
      return a.page.localeCompare(b.page);
    }),
  }));

  return {
    topPages: directPages
      .sort((a, b) => {
        if (b.pageViews !== a.pageViews) return b.pageViews - a.pageViews;
        return a.page.localeCompare(b.page);
      })
      .slice(0, 10),
    pageGroups: pageGroups.sort((a, b) => {
      if (b.pageViews !== a.pageViews) return b.pageViews - a.pageViews;
      return a.title.localeCompare(b.title);
    }),
  };
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
    pageStatsRaw,
    dailyVisitorsRaw,
  ] = await Promise.all([
    getVisitorStats(),
    getVisitorStats({
      createdAt: { $gte: todayStart, $lte: todayEnd },
    }),
    getVisitorStats({
      createdAt: { $gte: last7Start, $lte: todayEnd },
    }),
    getVisitorStats({
      createdAt: { $gte: last30Start, $lte: todayEnd },
    }),
    AnalyticsEvent.countDocuments({}),
    AnalyticsEvent.aggregate([
      {
        $group: {
          _id: "$page",
          pageViews: { $sum: 1 },
          visitorIds: { $addToSet: "$visitorId" },
        },
      },
      {
        $project: {
          _id: 0,
          page: "$_id",
          pageViews: 1,
          visitorIds: 1,
          visitors: { $size: "$visitorIds" },
        },
      },
      { $sort: { pageViews: -1, page: 1 } },
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
  const { topPages, pageGroups } = buildPageSummaries(pageStatsRaw);

  return {
    totals: {
      totalVisitors,
      todaysVisitors,
      last7DaysVisitors,
      last30DaysVisitors,
      totalPageViews,
    },
    topPages,
    pageGroups,
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
