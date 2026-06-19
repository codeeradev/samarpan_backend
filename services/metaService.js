const jwt = require("jsonwebtoken");
const MetaAccount = require("../models/metaAccount");
const MetaAnalyticsDaily = require("../models/metaAnalyticsDaily");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_messaging",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "business_management",
];
const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const requireMetaConfig = () => {
  const missing = [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_REDIRECT_URI",
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    const error = new Error(`Missing Meta config: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }
};

const getAppAccessToken = () =>
  `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;

const buildUrl = (path, params = {}) => {
  const url = new URL(`${GRAPH_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
};

const readGraphError = async (response) => {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  const message =
    body?.error?.message || body?.message || "Meta Graph API request failed";
  const error = new Error(message);
  error.statusCode = response.status >= 500 ? 502 : response.status;
  error.metaError = body?.error;
  throw error;
};

const graphGet = async (path, params = {}) => {
  const response = await fetch(buildUrl(path, params));
  if (!response.ok) {
    await readGraphError(response);
  }
  return response.json();
};

const graphDelete = async (path, params = {}) => {
  const response = await fetch(buildUrl(path, params), { method: "DELETE" });
  if (!response.ok) {
    await readGraphError(response);
  }
  return response.json();
};

const toUnix = (date) => Math.floor(date.getTime() / 1000);

const startOfUtcDay = (value = new Date()) => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDay = (date) => startOfUtcDay(date).toISOString().slice(0, 10);

const parseDateRange = (query = {}) => {
  const range = query.range || "30d";
  const today = startOfUtcDay();
  let startDate = today;
  let endDate = today;

  if (range === "today") {
    startDate = today;
  } else if (range === "7d") {
    startDate = addDays(today, -6);
  } else if (range === "90d") {
    startDate = addDays(today, -89);
  } else if (range === "custom") {
    startDate = startOfUtcDay(query.startDate || today);
    endDate = startOfUtcDay(query.endDate || today);
  } else {
    startDate = addDays(today, -29);
  }

  if (startDate > endDate) {
    const error = new Error("startDate must be before endDate");
    error.statusCode = 400;
    throw error;
  }

  return { startDate, endDate, range };
};

const META_MAX_INSIGHT_DAYS = 90;

const buildDayList = (startDate, endDate) => {
  const days = [];
  for (
    let day = startOfUtcDay(startDate);
    day <= endDate;
    day = addDays(day, 1)
  ) {
    days.push(new Date(day));
  }
  return days;
};

const buildDateChunks = (startDate, endDate) => {
  const chunks = [];
  let cursor = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);

  while (cursor <= end) {
    const chunkEnd = addDays(cursor, META_MAX_INSIGHT_DAYS - 1);
    chunks.push({
      startDate: new Date(cursor),
      endDate: chunkEnd > end ? new Date(end) : new Date(chunkEnd),
    });
    cursor = addDays(chunks[chunks.length - 1].endDate, 1);
  }

  return chunks;
};

const mergeDailyMaps = (...maps) =>
  maps.reduce((acc, map) => ({ ...acc, ...map }), {});

const pickMetricValue = (map, day, fallback = 0) =>
  map[day] !== undefined ? Number(map[day] || 0) : Number(fallback || 0);

const inDateRange = (dateValue, startDate, endDate) => {
  if (!dateValue || !startDate || !endDate) return true;
  const date = startOfUtcDay(new Date(dateValue));
  return date >= startOfUtcDay(startDate) && date <= startOfUtcDay(endDate);
};

const createOAuthUrl = (adminId) => {
  requireMetaConfig();
  const state = jwt.sign(
    {
      adminId: String(adminId),
      provider: "meta",
      nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID);
  url.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI);
  url.searchParams.set("scope", META_PERMISSIONS.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
};

const exchangeCodeForToken = async (code) => {
  requireMetaConfig();
  return graphGet("/oauth/access_token", {
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    redirect_uri: process.env.META_REDIRECT_URI,
    code,
  });
};

const exchangeLongLivedToken = async (accessToken) => {
  requireMetaConfig();
  return graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID,
    client_secret: process.env.META_APP_SECRET,
    fb_exchange_token: accessToken,
  });
};

const getExpiryDate = (expiresIn) => {
  if (!Number.isFinite(Number(expiresIn))) return null;
  return new Date(Date.now() + Number(expiresIn) * 1000);
};

const handleOAuthCallback = async ({ code, state }) => {
  if (!code || !state) {
    const error = new Error("Missing Meta OAuth code or state");
    error.statusCode = 400;
    throw error;
  }

  let decoded;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    const error = new Error("Invalid or expired Meta OAuth state");
    error.statusCode = 400;
    throw error;
  }

  if (decoded.provider !== "meta" || !decoded.adminId) {
    const error = new Error("Invalid Meta OAuth state");
    error.statusCode = 400;
    throw error;
  }

  const shortToken = await exchangeCodeForToken(code);
  const longToken = await exchangeLongLivedToken(shortToken.access_token);
  const tokenExpiresAt = getExpiryDate(longToken.expires_in);

  await MetaAccount.findOneAndUpdate(
    { adminId: decoded.adminId },
    {
      adminId: decoded.adminId,
      userAccessToken: longToken.access_token,
      accessToken: longToken.access_token,
      tokenExpiresAt,
      status: "pending",
      pageId: "",
      pageName: "",
      pagePicture: "",
      instagramBusinessAccountId: "",
      instagramUsername: "",
      connectedAt: null,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return { adminId: decoded.adminId, needsPageSelection: true };
};

const sanitizeAccount = (account) => {
  if (!account) return null;
  return {
    id: account._id,
    pageId: account.pageId,
    pageName: account.pageName,
    pagePicture: account.pagePicture,
    instagramBusinessAccountId: account.instagramBusinessAccountId,
    instagramUsername: account.instagramUsername,
    tokenExpiresAt: account.tokenExpiresAt,
    connectedAt: account.connectedAt,
    status: account.status,
  };
};

const getUserAccessToken = (account) =>
  account?.userAccessToken || account?.accessToken || "";

const getPageAccessToken = (account) => account?.accessToken || "";

const validateToken = async (accessToken) => {
  if (!accessToken) return false;
  const debug = await graphGet("/debug_token", {
    input_token: accessToken,
    access_token: getAppAccessToken(),
  });
  return debug?.data?.is_valid === true;
};

const refreshTokenIfNeeded = async (account) => {
  const userToken = getUserAccessToken(account);
  if (!userToken) return account;

  const shouldRefresh =
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_WINDOW_MS;

  if (!shouldRefresh) return account;

  try {
    const refreshed = await exchangeLongLivedToken(userToken);
    if (refreshed?.access_token) {
      account.userAccessToken = refreshed.access_token;
      account.tokenExpiresAt = getExpiryDate(refreshed.expires_in);
      if (!account.pageId) {
        account.accessToken = refreshed.access_token;
      }
      await account.save();
    }
  } catch (error) {
    console.warn("Meta token refresh skipped:", error.message);
  }

  return account;
};

const getLatestAccount = (adminId) =>
  MetaAccount.findOne({ adminId }).sort({ updatedAt: -1 });

const getActiveAccount = async (adminId) => {
  const account = await MetaAccount.findOne({ adminId, status: "active" });
  if (!account) {
    const error = new Error("No active Meta account connected");
    error.statusCode = 404;
    throw error;
  }

  await refreshTokenIfNeeded(account);

  const isValid = await validateToken(getUserAccessToken(account));
  if (!isValid) {
    account.status = "expired";
    await account.save();
    const error = new Error("Meta token is expired. Please reconnect.");
    error.statusCode = 401;
    throw error;
  }

  return account;
};

const getAccountStatus = async (adminId) => {
  const account = await getLatestAccount(adminId);
  if (!account || account.status === "disconnected") {
    return { connected: false, status: "disconnected", account: null };
  }

  if (account.status === "active") {
    try {
      await refreshTokenIfNeeded(account);
      const isValid = await validateToken(getUserAccessToken(account));
      if (!isValid) {
        account.status = "expired";
        await account.save();
      }
    } catch (error) {
      console.warn("Meta token validation failed:", error.message);
    }
  }

  return {
    connected: account.status === "active",
    needsPageSelection: account.status === "pending",
    status: account.status,
    account: sanitizeAccount(account),
  };
};

const getPages = async (adminId) => {
  const account = await getLatestAccount(adminId);
  if (
    !account ||
    !getUserAccessToken(account) ||
    account.status === "disconnected"
  ) {
    const error = new Error("Connect Meta Login before fetching Pages");
    error.statusCode = 400;
    throw error;
  }

  await refreshTokenIfNeeded(account);

  const response = await graphGet("/me/accounts", {
    access_token: getUserAccessToken(account),
    fields:
      "id,name,access_token,picture,instagram_business_account{id,username}",
    limit: 100,
  });

  return (response.data || []).map((page) => ({
    pageId: page.id,
    pageName: page.name,
    pagePicture: page.picture?.data?.url || "",
    instagramBusinessAccountId: page.instagram_business_account?.id || "",
    instagramUsername: page.instagram_business_account?.username || "",
    hasInstagramBusinessAccount: Boolean(page.instagram_business_account?.id),
    accessToken: page.access_token,
  }));
};

const selectPage = async ({ adminId, pageId }) => {
  if (!pageId) {
    const error = new Error("pageId is required");
    error.statusCode = 400;
    throw error;
  }

  const pages = await getPages(adminId);
  const page = pages.find((item) => item.pageId === pageId);
  if (!page) {
    const error = new Error(
      "Selected Page was not found for this Meta account",
    );
    error.statusCode = 404;
    throw error;
  }

  const existing = await getLatestAccount(adminId);
  const userAccessToken = getUserAccessToken(existing);

  const account = await MetaAccount.findOneAndUpdate(
    { adminId },
    {
      adminId,
      userAccessToken,
      pageId: page.pageId,
      pageName: page.pageName,
      pagePicture: page.pagePicture,
      instagramBusinessAccountId: page.instagramBusinessAccountId,
      instagramUsername: page.instagramUsername,
      accessToken: page.accessToken,
      tokenExpiresAt: null,
      status: "active",
      connectedAt: new Date(),
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return sanitizeAccount(account);
};

const metricValue = (insights, name) => {
  const item = (insights?.data || insights || []).find(
    (row) => row.name === name,
  );
  const value = item?.values?.[0]?.value ?? item?.value ?? 0;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce(
      (sum, itemValue) => sum + Number(itemValue || 0),
      0,
    );
  }
  return Number(value || 0);
};

const fetchInsights = async ({
  id,
  accessToken,
  metrics,
  period,
  since,
  until,
  additionalParams = {},
}) => {
  const baseParams = {
    access_token: accessToken,
    period,
    since: toUnix(since),
    until: toUnix(addDays(until, 1)),
  };

  try {
    const params = {
      ...baseParams,
      metric: metrics.join(","),
      ...additionalParams,
    };
    return await graphGet(`/${id}/insights`, params);
  } catch (error) {
    // Retry with individual metrics if combined fails
    try {
      const results = [];
      for (const metric of metrics) {
        try {
          const result = await graphGet(`/${id}/insights`, {
            ...baseParams,
            metric,
            ...additionalParams,
          });
          if (result.data) results.push(...result.data);
        } catch {
          // Skip individual metric on failure
        }
      }
      return { data: results };
    } catch (retryError) {
      console.warn(`Meta insights unavailable for ${id}:`, retryError.message);
      return { data: [] };
    }
  }
};

const mapDailyInsights = (insights, metricName) => {
  const metric = (insights.data || []).find((row) => row.name === metricName);
  return (metric?.values || []).reduce((acc, item) => {
    const day = item.end_time ? formatDay(item.end_time) : null;
    if (day) acc[day] = Number(item.value || 0);
    return acc;
  }, {});
};

const emptyPlatformMetrics = () => ({
  followers: 0,
  followerAdds: 0,
  reach: 0,
  impressions: 0,
  engagement: 0,
  profileVisits: 0,
  websiteClicks: 0,
});

const fetchPageFollowers = async (account) => {
  try {
    const page = await graphGet(`/${account.pageId}`, {
      access_token: getPageAccessToken(account),
      fields: "followers_count,fan_count",
    });
    return Number(page.followers_count || page.fan_count || 0);
  } catch (error) {
    console.warn("Meta page follower count unavailable:", error.message);
    return 0;
  }
};

const getPageMessageStats = async (account) => {
  try {
    const conversations = await graphGet(`/${account.pageId}/conversations`, {
      access_token: getPageAccessToken(account),
      fields: "message_count,unread_count",
      limit: 100,
    });
    const items = conversations.data || [];
    return {
      totalConversations: items.length,
      totalMessages: items.reduce(
        (sum, item) => sum + Number(item.message_count || 0),
        0,
      ),
      unreadMessages: items.reduce(
        (sum, item) => sum + Number(item.unread_count || 0),
        0,
      ),
    };
  } catch (error) {
    console.warn("Meta page messages unavailable:", error.message);
    return {
      totalConversations: 0,
      totalMessages: 0,
      unreadMessages: 0,
    };
  }
};

const syncAnalyticsRange = async ({ adminId, startDate, endDate }) => {
  const account = await getActiveAccount(adminId);
  const days = buildDayList(startDate, endDate);
  const chunks = buildDateChunks(startDate, endDate);
  const hasInstagram = Boolean(account.instagramBusinessAccountId);
  const pageAccessToken = getPageAccessToken(account);

  const fetchIgBasicInsights = (chunk) =>
    hasInstagram
      ? fetchInsights({
          id: account.instagramBusinessAccountId,
          accessToken: pageAccessToken,
          metrics: ["follower_count", "reach"],
          period: "day",
          since: chunk.startDate,
          until: chunk.endDate,
        })
      : Promise.resolve({ data: [] });

  const fetchIgDetailedInsights = (chunk) =>
    hasInstagram
      ? fetchInsights({
          id: account.instagramBusinessAccountId,
          accessToken: pageAccessToken,
          metrics: ["profile_views", "website_clicks", "total_interactions"],
          period: "day",
          since: chunk.startDate,
          until: chunk.endDate,
          additionalParams: { metric_type: "total_value" },
        })
      : Promise.resolve({ data: [] });

  const fetchPageInsights = (chunk) =>
    fetchInsights({
      id: account.pageId,
      accessToken: pageAccessToken,
      metrics: [
        "page_fan_adds",
        "page_impressions",
        "page_impressions_unique",
        "page_engaged_users",
        "page_views_total",
        "page_website_clicks_logged_in_unique",
      ],
      period: "day",
      since: chunk.startDate,
      until: chunk.endDate,
    });

  const [igBasicChunks, igDetailedChunks, pageInsightChunks, pageFollowersCount] =
    await Promise.all([
      Promise.all(chunks.map(fetchIgBasicInsights)),
      Promise.all(chunks.map(fetchIgDetailedInsights)),
      Promise.all(chunks.map(fetchPageInsights)),
      fetchPageFollowers(account),
    ]);

  const igFollowers = mergeDailyMaps(
    ...igBasicChunks.map((insights) =>
      mapDailyInsights(insights, "follower_count"),
    ),
  );
  const igReach = mergeDailyMaps(
    ...igBasicChunks.map((insights) => mapDailyInsights(insights, "reach")),
  );
  const igProfileViews = mergeDailyMaps(
    ...igDetailedChunks.map((insights) =>
      mapDailyInsights(insights, "profile_views"),
    ),
  );
  const igWebsiteClicks = mergeDailyMaps(
    ...igDetailedChunks.map((insights) =>
      mapDailyInsights(insights, "website_clicks"),
    ),
  );
  const igEngagement = mergeDailyMaps(
    ...igDetailedChunks.map((insights) =>
      mapDailyInsights(insights, "total_interactions"),
    ),
  );
  const pageFollowsDaily = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_fan_adds"),
    ),
  );
  const pageReach = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_impressions_unique"),
    ),
  );
  const pageImpressions = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_impressions"),
    ),
  );
  const pageEngagement = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_engaged_users"),
    ),
  );
  const pageProfileVisits = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_views_total"),
    ),
  );
  const pageWebsiteClicks = mergeDailyMaps(
    ...pageInsightChunks.map((insights) =>
      mapDailyInsights(insights, "page_website_clicks_logged_in_unique"),
    ),
  );

  const [priorRow, existingRows] = await Promise.all([
    MetaAnalyticsDaily.findOne({
      adminId,
      date: { $lt: startDate },
    })
      .sort({ date: -1 })
      .lean(),
    MetaAnalyticsDaily.find({
      adminId,
      date: { $gte: startDate, $lte: endDate },
    }).lean(),
  ]);

  const existingByDay = existingRows.reduce((acc, row) => {
    acc[formatDay(row.date)] = row;
    return acc;
  }, {});

  let previousIgFollowers = priorRow?.instagram?.followers || 0;
  const igFollowerAddsByDay = {};
  for (const date of days) {
    const day = formatDay(date);
    const existingIg = existingByDay[day]?.instagram || {};
    const igTotal = pickMetricValue(igFollowers, day, existingIg.followers);
    if (igFollowers[day] !== undefined) {
      igFollowerAddsByDay[day] =
        igTotal > 0 ? Math.max(0, igTotal - previousIgFollowers) : 0;
      if (igTotal > 0) previousIgFollowers = igTotal;
    } else {
      igFollowerAddsByDay[day] = Number(existingIg.followerAdds || 0);
      if (Number(existingIg.followers || 0) > 0) {
        previousIgFollowers = Number(existingIg.followers || 0);
      }
    }
  }

  const endDay = formatDay(endDate);
  await Promise.all(
    days.map(async (date) => {
      const day = formatDay(date);
      const existing = existingByDay[day] || {};
      const existingIg = { ...emptyPlatformMetrics(), ...(existing.instagram || {}) };
      const existingFb = { ...emptyPlatformMetrics(), ...(existing.facebook || {}) };

      const igFollowerTotal = pickMetricValue(
        igFollowers,
        day,
        existingIg.followers,
      );
      const igFollowerAdds = igFollowerAddsByDay[day] || 0;
      const fbFollowerAdds = pickMetricValue(
        pageFollowsDaily,
        day,
        existingFb.followerAdds,
      );
      const fbFollowerTotal =
        day === endDay
          ? pageFollowersCount
          : pickMetricValue(pageFollowsDaily, day, existingFb.followers, 0) ||
            existingFb.followers ||
            0;

      const instagram = {
        followers: igFollowerTotal,
        followerAdds: igFollowerAdds,
        reach: pickMetricValue(igReach, day, existingIg.reach),
        impressions: existingIg.impressions || 0,
        engagement: pickMetricValue(igEngagement, day, existingIg.engagement),
        profileVisits: pickMetricValue(
          igProfileViews,
          day,
          existingIg.profileVisits,
        ),
        websiteClicks: pickMetricValue(
          igWebsiteClicks,
          day,
          existingIg.websiteClicks,
        ),
      };
      const facebook = {
        followers: day === endDay ? pageFollowersCount : existingFb.followers || 0,
        followerAdds: fbFollowerAdds,
        reach: pickMetricValue(pageReach, day, existingFb.reach),
        impressions: pickMetricValue(
          pageImpressions,
          day,
          existingFb.impressions,
        ),
        engagement: pickMetricValue(
          pageEngagement,
          day,
          existingFb.engagement,
        ),
        profileVisits: pickMetricValue(
          pageProfileVisits,
          day,
          existingFb.profileVisits,
        ),
        websiteClicks: pickMetricValue(
          pageWebsiteClicks,
          day,
          existingFb.websiteClicks,
        ),
      };

      const followerAdds = igFollowerAdds + fbFollowerAdds;
      const totalFollowers =
        (day === endDay ? pageFollowersCount : 0) + igFollowerTotal;

      return MetaAnalyticsDaily.updateOne(
        { adminId, date },
        {
          $set: {
            adminId,
            date,
            followers: totalFollowers || existing.followers || 0,
            followerAdds,
            reach: instagram.reach + facebook.reach,
            impressions: instagram.impressions + facebook.impressions,
            engagement: instagram.engagement + facebook.engagement,
            profileVisits: instagram.profileVisits + facebook.profileVisits,
            websiteClicks: instagram.websiteClicks + facebook.websiteClicks,
            instagram,
            facebook,
          },
        },
        { upsert: true },
      );
    }),
  );
};

const getStoredDaily = async ({ adminId, startDate, endDate }) => {
  const days = buildDayList(startDate, endDate);
  const rows = await MetaAnalyticsDaily.find({
    adminId,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: 1 })
    .lean();

  const byDay = rows.reduce((acc, row) => {
    acc[formatDay(row.date)] = row;
    return acc;
  }, {});

  const daily = [];
  const dailyFacebook = [];
  const dailyInstagram = [];

  days.forEach((date) => {
    const day = formatDay(date);
    const row = byDay[day] || {};
    const facebook = { ...emptyPlatformMetrics(), ...(row.facebook || {}) };
    const instagram = { ...emptyPlatformMetrics(), ...(row.instagram || {}) };

    daily.push({
      date: day,
      followers: row.followers || 0,
      followerAdds:
        (facebook.followerAdds || 0) + (instagram.followerAdds || 0),
      reach: row.reach || 0,
      impressions: row.impressions || 0,
      engagement: row.engagement || 0,
      profileVisits: row.profileVisits || 0,
      websiteClicks: row.websiteClicks || 0,
    });
    dailyFacebook.push({ date: day, ...facebook });
    dailyInstagram.push({ date: day, ...instagram });
  });

  return { daily, dailyFacebook, dailyInstagram };
};

const sumDaily = (daily, key) =>
  daily.reduce((total, row) => total + Number(row[key] || 0), 0);

const buildPlatformOverview = (
  dailyPlatform,
  mediaCount = {},
  messageStats = {},
) => {
  return {
    followers: sumDaily(dailyPlatform, "followerAdds"),
    totalFollowers: Number(mediaCount.followers || 0),
    reach: sumDaily(dailyPlatform, "reach"),
    impressions: sumDaily(dailyPlatform, "impressions"),
    engagement: sumDaily(dailyPlatform, "engagement"),
    profileVisits: sumDaily(dailyPlatform, "profileVisits"),
    websiteClicks: sumDaily(dailyPlatform, "websiteClicks"),
    totalPosts: mediaCount.totalPosts || 0,
    totalReels: mediaCount.totalReels || 0,
    totalLikes: mediaCount.totalLikes || 0,
    totalComments: mediaCount.totalComments || 0,
    totalMessages: messageStats.totalMessages || 0,
    unreadMessages: messageStats.unreadMessages || 0,
    totalConversations: messageStats.totalConversations || 0,
  };
};

const getInstagramMediaCount = async (account, range = {}) => {
  if (!account.instagramBusinessAccountId) {
    return {
      totalPosts: 0,
      totalReels: 0,
      totalLikes: 0,
      totalComments: 0,
      followers: 0,
    };
  }

  try {
    const [media, igAccount] = await Promise.all([
      graphGet(`/${account.instagramBusinessAccountId}/media`, {
        access_token: getPageAccessToken(account),
        fields: "id,media_type,like_count,comments_count,timestamp",
        limit: 100,
      }),
      graphGet(`/${account.instagramBusinessAccountId}`, {
        access_token: getPageAccessToken(account),
        fields: "followers_count",
      }),
    ]);
    const items = (media.data || []).filter((item) =>
      inDateRange(item.timestamp, range.startDate, range.endDate),
    );
    return {
      totalPosts: items.length,
      totalReels: items.filter((item) => item.media_type === "REELS").length,
      totalLikes: items.reduce(
        (sum, item) => sum + Number(item.like_count || 0),
        0,
      ),
      totalComments: items.reduce(
        (sum, item) => sum + Number(item.comments_count || 0),
        0,
      ),
      followers: Number(igAccount.followers_count || 0),
    };
  } catch (error) {
    console.warn("Meta Instagram media count unavailable:", error.message);
    return {
      totalPosts: 0,
      totalReels: 0,
      totalLikes: 0,
      totalComments: 0,
      followers: 0,
    };
  }
};

const getFacebookMediaCount = async (account, range = {}) => {
  try {
    const posts = await graphGet(`/${account.pageId}/posts`, {
      access_token: getPageAccessToken(account),
      fields: "id,created_time,likes.summary(true),comments.summary(true)",
      limit: 100,
    });
    const items = (posts.data || []).filter((item) =>
      inDateRange(item.created_time, range.startDate, range.endDate),
    );
    return {
      totalPosts: items.length,
      totalReels: 0,
      totalLikes: items.reduce(
        (sum, item) => sum + Number(item.likes?.summary?.total_count || 0),
        0,
      ),
      totalComments: items.reduce(
        (sum, item) => sum + Number(item.comments?.summary?.total_count || 0),
        0,
      ),
      followers: await fetchPageFollowers(account),
    };
  } catch (error) {
    console.warn("Meta Facebook page media count unavailable:", error.message);
    return {
      totalPosts: 0,
      totalReels: 0,
      totalLikes: 0,
      totalComments: 0,
      followers: 0,
    };
  }
};

const getOverview = async ({ adminId, query }) => {
  const range = parseDateRange(query);
  let syncError = null;
  try {
    await syncAnalyticsRange({ adminId, ...range });
  } catch (error) {
    syncError = error.message;
    console.warn(
      "Meta analytics sync failed; using stored history:",
      error.message,
    );
  }

  const { daily, dailyFacebook, dailyInstagram } = await getStoredDaily({
    adminId,
    ...range,
  });
  const account = await MetaAccount.findOne({ adminId, status: "active" });
  const [instagramMediaCount, facebookMediaCount, pageMessageStats] = account
    ? await Promise.all([
        getInstagramMediaCount(account, range),
        getFacebookMediaCount(account, range),
        getPageMessageStats(account),
      ])
    : [{}, {}, {}];
  const facebookOverview = buildPlatformOverview(
    dailyFacebook,
    facebookMediaCount,
    pageMessageStats,
  );
  const instagramOverview = buildPlatformOverview(
    dailyInstagram,
    instagramMediaCount,
  );

  return {
    syncError,
    overview: {
      followers:
        sumDaily(dailyFacebook, "followerAdds") +
        sumDaily(dailyInstagram, "followerAdds"),
      totalFollowers:
        (facebookOverview.totalFollowers || 0) +
        (instagramOverview.totalFollowers || 0),
      reach: sumDaily(daily, "reach"),
      impressions: sumDaily(daily, "impressions"),
      engagement: sumDaily(daily, "engagement"),
      profileVisits: sumDaily(daily, "profileVisits"),
      websiteClicks: sumDaily(daily, "websiteClicks"),
      totalPosts:
        (instagramMediaCount.totalPosts || 0) + (facebookMediaCount.totalPosts || 0),
      totalReels: instagramMediaCount.totalReels || 0,
      totalLikes:
        (instagramMediaCount.totalLikes || 0) + (facebookMediaCount.totalLikes || 0),
      totalComments:
        (instagramMediaCount.totalComments || 0) +
        (facebookMediaCount.totalComments || 0),
      totalMessages: pageMessageStats.totalMessages || 0,
      unreadMessages: pageMessageStats.unreadMessages || 0,
    },
    platforms: {
      facebook: facebookOverview,
      instagram: instagramOverview,
    },
    daily,
    dailyByPlatform: {
      facebook: dailyFacebook,
      instagram: dailyInstagram,
    },
  };
};

const getMetricSeries = async ({ adminId, query, metric }) => {
  const range = parseDateRange(query);
  try {
    await syncAnalyticsRange({ adminId, ...range });
  } catch (error) {
    console.warn(
      `Meta ${metric} sync failed; using stored history:`,
      error.message,
    );
  }
  const { daily } = await getStoredDaily({ adminId, ...range });
  return daily.map((row) => ({ date: row.date, value: row[metric] || 0 }));
};

const getMediaInsights = async ({ mediaId, accessToken }) => {
  try {
    return graphGet(`/${mediaId}/insights`, {
      access_token: accessToken,
      metric: "reach,impressions,total_interactions",
    });
  } catch {
    return { data: [] };
  }
};

const normalizePost = ({
  platform,
  id,
  thumbnail,
  permalink,
  caption,
  postedDate,
  likes,
  comments,
  insights,
}) => {
  const reach =
    metricValue(insights, "reach") ||
    metricValue(insights, "post_impressions_unique");
  const impressions =
    metricValue(insights, "impressions") ||
    metricValue(insights, "post_impressions");
  const engagement =
    metricValue(insights, "total_interactions") ||
    metricValue(insights, "post_engaged_users") ||
    Number(likes || 0) + Number(comments || 0);

  return {
    id,
    thumbnail: thumbnail || "",
    permalink: permalink || "",
    platform,
    caption: caption || "",
    postedDate,
    likes: Number(likes || 0),
    comments: Number(comments || 0),
    reach,
    impressions,
    engagement,
    engagementRate:
      reach > 0 ? Number(((engagement / reach) * 100).toFixed(2)) : 0,
  };
};

const getPosts = async ({ adminId, limit = 50 }) => {
  const account = await getActiveAccount(adminId);
  const posts = [];

  try {
    if (account.instagramBusinessAccountId) {
      const instagramMedia = await graphGet(
        `/${account.instagramBusinessAccountId}/media`,
        {
          access_token: getPageAccessToken(account),
          fields:
            "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
          limit,
        },
      );

      const instagramPosts = (instagramMedia.data || []).map((item) =>
        normalizePost({
          platform: "Instagram",
          id: item.id,
          thumbnail: item.thumbnail_url || item.media_url,
          permalink: item.permalink,
          caption: item.caption,
          postedDate: item.timestamp,
          likes: item.like_count,
          comments: item.comments_count,
          insights: null,
        }),
      );
      posts.push(...instagramPosts);
    }
  } catch (error) {
    console.warn("Instagram posts unavailable:", error.message);
  }

  try {
    const pagePosts = await graphGet(`/${account.pageId}/posts`, {
      access_token: getPageAccessToken(account),
      fields:
        "id,message,created_time,full_picture,picture,likes.summary(true),comments.summary(true)",
      limit,
    });

    posts.push(
      ...(pagePosts.data || []).map((item) =>
        normalizePost({
          platform: "Facebook",
          id: item.id,
          thumbnail: item.full_picture || item.picture,
          caption: item.message,
          postedDate: item.created_time,
          likes: item.likes?.summary?.total_count,
          comments: item.comments?.summary?.total_count,
          insights: null,
        }),
      ),
    );
  } catch (error) {
    console.warn("Facebook page posts unavailable:", error.message);
  }

  return posts.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));
};

const getPostLikes = async ({ postId, accessToken, platform }) => {
  try {
    if (platform === "Facebook") {
      const response = await graphGet(`/${postId}/likes`, {
        access_token: accessToken,
        fields: "id,name",
        limit: 100,
      });
      return (response.data || []).map((user) => ({
        id: user.id,
        name: user.name,
      }));
    }
    return [];
  } catch (error) {
    console.warn(`Post likes unavailable for ${postId}:`, error.message);
    return [];
  }
};

const getPostComments = async ({ postId, accessToken, platform }) => {
  try {
    if (platform === "Facebook") {
      const response = await graphGet(`/${postId}/comments`, {
        access_token: accessToken,
        fields: "id,message,from{id,name},created_time",
        limit: 100,
      });
      return (response.data || []).map((comment) => ({
        id: comment.id,
        message: comment.message || "",
        fromName: comment.from?.name || "Unknown",
        fromId: comment.from?.id || "",
        createdTime: comment.created_time,
      }));
    }

    if (platform === "Instagram") {
      const response = await graphGet(`/${postId}/comments`, {
        access_token: accessToken,
        fields: "id,text,username,timestamp",
        limit: 100,
      });
      return (response.data || []).map((comment) => ({
        id: comment.id,
        message: comment.text || "",
        fromName: comment.username || "Unknown",
        fromId: "",
        createdTime: comment.timestamp,
      }));
    }

    return [];
  } catch (error) {
    console.warn(`Post comments unavailable for ${postId}:`, error.message);
    return [];
  }
};

const getPostCounts = async ({ postId, accessToken, platform }) => {
  try {
    if (platform === "Instagram") {
      const media = await graphGet(`/${postId}`, {
        access_token: accessToken,
        fields: "like_count,comments_count",
      });
      return {
        likeCount: Number(media.like_count || 0),
        commentCount: Number(media.comments_count || 0),
      };
    }

    if (platform === "Facebook") {
      const post = await graphGet(`/${postId}`, {
        access_token: accessToken,
        fields: "likes.summary(true),comments.summary(true)",
      });
      return {
        likeCount: Number(post.likes?.summary?.total_count || 0),
        commentCount: Number(post.comments?.summary?.total_count || 0),
      };
    }
  } catch (error) {
    console.warn(`Post counts unavailable for ${postId}:`, error.message);
  }

  return { likeCount: 0, commentCount: 0 };
};

const getPostDetails = async ({ adminId, postId, platform }) => {
  const account = await getActiveAccount(adminId);
  const accessToken = getPageAccessToken(account);

  const [likes, comments, counts] = await Promise.all([
    getPostLikes({ postId, accessToken, platform }),
    getPostComments({ postId, accessToken, platform }),
    getPostCounts({ postId, accessToken, platform }),
  ]);

  return {
    postId,
    platform,
    likeCount: counts.likeCount,
    commentCount: counts.commentCount,
    likes,
    comments,
  };
};

const disconnect = async (adminId) => {
  const account = await getLatestAccount(adminId);
  if (!account) return null;

  try {
    const token = getUserAccessToken(account);
    if (token) {
      await graphDelete("/me/permissions", { access_token: token });
    }
  } catch (error) {
    console.warn("Meta permission revoke skipped:", error.message);
  }

  account.status = "disconnected";
  account.accessToken = "";
  account.userAccessToken = "";
  account.tokenExpiresAt = null;
  await account.save();
  return sanitizeAccount(account);
};

module.exports = {
  createOAuthUrl,
  disconnect,
  getAccountStatus,
  getMetricSeries,
  getOverview,
  getPages,
  getPosts,
  getPostDetails,
  handleOAuthCallback,
  parseDateRange,
  sanitizeAccount,
  selectPage,
};