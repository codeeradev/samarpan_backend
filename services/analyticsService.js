const AnalyticsVisitor = require("../models/analyticsVisitor");
const AnalyticsVisitorDay = require("../models/analyticsVisitorDay");
const AnalyticsVisitorPage = require("../models/analyticsVisitorPage");

const ANALYTICS_TIMEZONE = process.env.MAIL_TIMEZONE || "Asia/Kolkata";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizePage = (value) => {
  const page = normalizeText(value);
  return page ? (page.startsWith("/") ? page : `/${page}`) : "/";
};

const buildDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getDayKeyDaysAgo = (base, daysAgo) => {
  const date = new Date(base);
  date.setDate(date.getDate() - daysAgo);
  return buildDayKey(date);
};

const pageSections = [
  { key: "blog-categories", title: "Blog Categories", matcher: (page) => page === "/#blog" },
  {
    key: "blog-listing-pages",
    title: "Blog Listing Pages",
    matcher: (page) => {
      const [path] = page.split("#");
      return path === "/blogs" || path.startsWith("/blogs?");
    },
  },
  {
    key: "blog-detail-pages",
    title: "Blog Detail Pages",
    matcher: (page) => page.split("?")[0].split("#")[0].startsWith("/blogs/"),
  },
  { key: "services", title: "Services", prefix: "/services" },
  { key: "cosmetic-procedures", title: "Cosmetic Procedures", prefix: "/cosmetic-procedures" },
  { key: "careers", title: "Careers", prefix: "/careers" },
];

const getPageSection = (page) => {
  const normalizedPage = normalizePage(page);
  const cleanPage = normalizedPage.split("?")[0].split("#")[0];

  return pageSections.find(
    (section) =>
      (typeof section.matcher === "function" && section.matcher(normalizedPage)) ||
      (section.prefix && (cleanPage === section.prefix || cleanPage.startsWith(`${section.prefix}/`))),
  );
};

const getRangeVisitorStats = async (startDay, endDay) => {
  const [result] = await AnalyticsVisitorDay.aggregate([
    { $match: { day: { $gte: startDay, $lte: endDay } } },
    { $group: { _id: "$visitorId", pageViews: { $sum: "$pageViews" } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unique: { $sum: { $cond: [{ $eq: ["$pageViews", 1] }, 1, 0] } },
        repeated: { $sum: { $cond: [{ $gt: ["$pageViews", 1] }, 1, 0] } },
      },
    },
  ]).allowDiskUse(true);

  return result || { total: 0, unique: 0, repeated: 0 };
};

const buildPageSummaries = (pageStatsRaw, sectionStatsRaw) => {
  const sectionsByKey = new Map(sectionStatsRaw.map((row) => [row._id, row]));
  const pagesBySection = new Map();
  const directPages = [];

  for (const row of pageStatsRaw) {
    const page = normalizePage(row.page);
    const section = getPageSection(page);
    const pageSummary = { page, pageViews: row.pageViews, visitors: row.visitors };

    if (!section) {
      directPages.push(pageSummary);
      continue;
    }

    const pages = pagesBySection.get(section.key) || [];
    pages.push(pageSummary);
    pagesBySection.set(section.key, pages);
  }

  const pageGroups = pageSections
    .filter((section) => pagesBySection.has(section.key))
    .map((section) => {
      const pages = pagesBySection.get(section.key);
      const stats = sectionsByKey.get(section.key);

      return {
        key: section.key,
        title: section.title,
        pageViews: stats?.pageViews || pages.reduce((sum, row) => sum + row.pageViews, 0),
        visitors: stats?.visitors || pages.reduce((sum, row) => sum + row.visitors, 0),
        pages: pages.sort((a, b) => b.pageViews - a.pageViews || a.page.localeCompare(b.page)),
      };
    });

  return {
    topPages: directPages
      .sort((a, b) => b.pageViews - a.pageViews || a.page.localeCompare(b.page))
      .slice(0, 10),
    pageGroups: pageGroups.sort((a, b) => b.pageViews - a.pageViews || a.title.localeCompare(b.title)),
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

  const now = new Date();
  const sectionKey = getPageSection(cleanPage)?.key || null;
  const day = buildDayKey(now);

  // Repeated page visits update counters instead of creating new event documents.
  await Promise.all([
    AnalyticsVisitor.updateOne(
      { visitorId: cleanVisitorId },
      { $inc: { totalPageViews: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { firstSeenAt: now } },
      { upsert: true },
    ),
    AnalyticsVisitorPage.updateOne(
      { visitorId: cleanVisitorId, page: cleanPage },
      {
        $inc: { pageViews: 1 },
        $set: { lastSeenAt: now, sectionKey },
        $setOnInsert: { firstSeenAt: now },
      },
      { upsert: true },
    ),
    AnalyticsVisitorDay.updateOne(
      { visitorId: cleanVisitorId, day },
      { $inc: { pageViews: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { firstSeenAt: now } },
      { upsert: true },
    ),
  ]);
};

const getAnalyticsDashboard = async () => {
  const now = new Date();
  const today = buildDayKey(now);
  const last7Start = getDayKeyDaysAgo(now, 6);
  const last30Start = getDayKeyDaysAgo(now, 29);
  const last7Days = Array.from({ length: 7 }, (_, index) => getDayKeyDaysAgo(now, 6 - index));

  const [total, unique, repeated, todaysVisitors, last7DaysVisitors, last30DaysVisitors, totalPageViewsRaw, pageStatsRaw, sectionStatsRaw, dailyVisitorsRaw] = await Promise.all([
    AnalyticsVisitor.countDocuments(),
    AnalyticsVisitor.countDocuments({ totalPageViews: 1 }),
    AnalyticsVisitor.countDocuments({ totalPageViews: { $gt: 1 } }),
    getRangeVisitorStats(today, today),
    getRangeVisitorStats(last7Start, today),
    getRangeVisitorStats(last30Start, today),
    AnalyticsVisitor.aggregate([{ $group: { _id: null, total: { $sum: "$totalPageViews" } } }]),
    AnalyticsVisitorPage.aggregate([
      { $group: { _id: "$page", pageViews: { $sum: "$pageViews" }, visitors: { $sum: 1 } } },
      { $project: { _id: 0, page: "$_id", pageViews: 1, visitors: 1 } },
    ]).allowDiskUse(true),
    AnalyticsVisitorPage.aggregate([
      { $match: { sectionKey: { $ne: null } } },
      { $group: { _id: { sectionKey: "$sectionKey", visitorId: "$visitorId" }, pageViews: { $sum: "$pageViews" } } },
      { $group: { _id: "$_id.sectionKey", pageViews: { $sum: "$pageViews" }, visitors: { $sum: 1 } } },
    ]).allowDiskUse(true),
    AnalyticsVisitorDay.aggregate([
      { $match: { day: { $in: last7Days } } },
      { $group: { _id: "$day", visitors: { $sum: 1 } } },
    ]),
  ]);

  const visitorsByDay = dailyVisitorsRaw.reduce((acc, row) => {
    acc[row._id] = row.visitors;
    return acc;
  }, {});
  const { topPages, pageGroups } = buildPageSummaries(pageStatsRaw, sectionStatsRaw);

  return {
    totals: {
      totalVisitors: { total, unique, repeated },
      todaysVisitors,
      last7DaysVisitors,
      last30DaysVisitors,
      totalPageViews: totalPageViewsRaw[0]?.total || 0,
    },
    topPages,
    pageGroups,
    dailyVisitors: last7Days.map((day) => ({ day, visitors: visitorsByDay[day] || 0 })),
  };
};

module.exports = { getAnalyticsDashboard, trackPageView };
