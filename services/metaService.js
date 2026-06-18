const jwt = require("jsonwebtoken");
const MetaAccount = require("../models/metaAccount");
const MetaAnalyticsDaily = require("../models/metaAnalyticsDaily");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_insights",
  // "read_insights",
  "business_management",
];
const TOKEN_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const requireMetaConfig = () => {
  const missing = ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"].filter(
    (key) => !process.env[key],
  );

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

const buildDayList = (startDate, endDate) => {
  const days = [];
  for (let day = startOfUtcDay(startDate); day <= endDate; day = addDays(day, 1)) {
    days.push(new Date(day));
  }
  return days;
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
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

const validateToken = async (accessToken) => {
  if (!accessToken) return false;
  const debug = await graphGet("/debug_token", {
    input_token: accessToken,
    access_token: getAppAccessToken(),
  });
  return debug?.data?.is_valid === true;
};

const refreshTokenIfNeeded = async (account) => {
  if (!account?.accessToken) return account;

  const shouldRefresh =
    account.tokenExpiresAt &&
    account.tokenExpiresAt.getTime() - Date.now() < TOKEN_REFRESH_WINDOW_MS;

  if (!shouldRefresh) return account;

  try {
    const refreshed = await exchangeLongLivedToken(account.accessToken);
    if (refreshed?.access_token) {
      account.accessToken = refreshed.access_token;
      account.tokenExpiresAt = getExpiryDate(refreshed.expires_in);
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

  const isValid = await validateToken(account.accessToken);
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
      const isValid = await validateToken(account.accessToken);
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
  if (!account || !account.accessToken || account.status === "disconnected") {
    const error = new Error("Connect Meta Login before fetching Pages");
    error.statusCode = 400;
    throw error;
  }

  await refreshTokenIfNeeded(account);

  const response = await graphGet("/me/accounts", {
    access_token: account.accessToken,
    fields:
      "id,name,access_token,picture{url},instagram_business_account{id,username}",
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
    const error = new Error("Selected Page was not found for this Meta account");
    error.statusCode = 404;
    throw error;
  }

  if (!page.instagramBusinessAccountId) {
    const error = new Error(
      "Selected Facebook Page does not have a linked Instagram Business Account",
    );
    error.statusCode = 400;
    throw error;
  }

  const account = await MetaAccount.findOneAndUpdate(
    { adminId },
    {
      adminId,
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return sanitizeAccount(account);
};

const metricValue = (insights, name) => {
  const item = (insights?.data || insights || []).find((row) => row.name === name);
  const value = item?.values?.[0]?.value ?? item?.value ?? 0;
  if (typeof value === "object" && value !== null) {
    return Object.values(value).reduce(
      (sum, itemValue) => sum + Number(itemValue || 0),
      0,
    );
  }
  return Number(value || 0);
};

const fetchInsights = async ({ id, accessToken, metrics, period, since, until }) => {
  try {
    return await graphGet(`/${id}/insights`, {
      access_token: accessToken,
      metric: metrics.join(","),
      period,
      since: toUnix(since),
      until: toUnix(addDays(until, 1)),
    });
  } catch (error) {
    console.warn(`Meta insights unavailable for ${id}:`, error.message);
    return { data: [] };
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

const getLastStoredFollowers = async (adminId) => {
  const latest = await MetaAnalyticsDaily.findOne({ adminId })
    .sort({ date: -1 })
    .lean();
  return latest?.followers || 0;
};

const syncAnalyticsRange = async ({ adminId, startDate, endDate }) => {
  const account = await getActiveAccount(adminId);
  const days = buildDayList(startDate, endDate);

  const [instagramInsights, pageInsights] = await Promise.all([
    fetchInsights({
      id: account.instagramBusinessAccountId,
      accessToken: account.accessToken,
      metrics: [
        "follower_count",
        "reach",
        "impressions",
        "profile_views",
        "website_clicks",
        "total_interactions",
      ],
      period: "day",
      since: startDate,
      until: endDate,
    }),
    fetchInsights({
      id: account.pageId,
      accessToken: account.accessToken,
      metrics: [
        "page_follows",
        "page_impressions",
        "page_impressions_unique",
        "page_post_engagements",
        "page_views_total",
        "page_website_clicks_logged_in_unique",
      ],
      period: "day",
      since: startDate,
      until: endDate,
    }),
  ]);

  const igFollowers = mapDailyInsights(instagramInsights, "follower_count");
  const igReach = mapDailyInsights(instagramInsights, "reach");
  const igImpressions = mapDailyInsights(instagramInsights, "impressions");
  const igProfileViews = mapDailyInsights(instagramInsights, "profile_views");
  const igWebsiteClicks = mapDailyInsights(instagramInsights, "website_clicks");
  const igEngagement = mapDailyInsights(instagramInsights, "total_interactions");
  const pageFollowers = mapDailyInsights(pageInsights, "page_follows");
  const pageReach = mapDailyInsights(pageInsights, "page_impressions_unique");
  const pageImpressions = mapDailyInsights(pageInsights, "page_impressions");
  const pageEngagement = mapDailyInsights(pageInsights, "page_post_engagements");
  const pageProfileVisits = mapDailyInsights(pageInsights, "page_views_total");
  const pageWebsiteClicks = mapDailyInsights(
    pageInsights,
    "page_website_clicks_logged_in_unique",
  );

  let previousFollowers = await getLastStoredFollowers(adminId);
  await Promise.all(
    days.map(async (date) => {
      const day = formatDay(date);
      const followers =
        igFollowers[day] || pageFollowers[day] || previousFollowers || 0;
      previousFollowers = followers || previousFollowers;

      return MetaAnalyticsDaily.updateOne(
        { adminId, date },
        {
          $set: {
            adminId,
            date,
            followers,
            reach: (igReach[day] || 0) + (pageReach[day] || 0),
            impressions: (igImpressions[day] || 0) + (pageImpressions[day] || 0),
            engagement: (igEngagement[day] || 0) + (pageEngagement[day] || 0),
            profileVisits:
              (igProfileViews[day] || 0) + (pageProfileVisits[day] || 0),
            websiteClicks:
              (igWebsiteClicks[day] || 0) + (pageWebsiteClicks[day] || 0),
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

  return days.map((date) => {
    const day = formatDay(date);
    const row = byDay[day] || {};
    return {
      date: day,
      followers: row.followers || 0,
      reach: row.reach || 0,
      impressions: row.impressions || 0,
      engagement: row.engagement || 0,
      profileVisits: row.profileVisits || 0,
      websiteClicks: row.websiteClicks || 0,
    };
  });
};

const sumDaily = (daily, key) =>
  daily.reduce((total, row) => total + Number(row[key] || 0), 0);

const getInstagramMediaCount = async (account) => {
  try {
    const media = await graphGet(`/${account.instagramBusinessAccountId}/media`, {
      access_token: account.accessToken,
      fields: "id,media_type",
      limit: 100,
    });
    const items = media.data || [];
    return {
      totalPosts: items.length,
      totalReels: items.filter((item) => item.media_type === "REELS").length,
    };
  } catch (error) {
    console.warn("Meta media count unavailable:", error.message);
    return { totalPosts: 0, totalReels: 0 };
  }
};

const getOverview = async ({ adminId, query }) => {
  const range = parseDateRange(query);
  let syncError = null;
  try {
    await syncAnalyticsRange({ adminId, ...range });
  } catch (error) {
    syncError = error.message;
    console.warn("Meta analytics sync failed; using stored history:", error.message);
  }

  const daily = await getStoredDaily({ adminId, ...range });
  const account = await MetaAccount.findOne({ adminId, status: "active" });
  const mediaCount = account ? await getInstagramMediaCount(account) : {};
  const latest = daily[daily.length - 1] || {};

  return {
    syncError,
    overview: {
      followers: latest.followers || 0,
      reach: sumDaily(daily, "reach"),
      impressions: sumDaily(daily, "impressions"),
      engagement: sumDaily(daily, "engagement"),
      profileVisits: sumDaily(daily, "profileVisits"),
      websiteClicks: sumDaily(daily, "websiteClicks"),
      totalPosts: mediaCount.totalPosts || 0,
      totalReels: mediaCount.totalReels || 0,
    },
    daily,
  };
};

const getMetricSeries = async ({ adminId, query, metric }) => {
  const range = parseDateRange(query);
  try {
    await syncAnalyticsRange({ adminId, ...range });
  } catch (error) {
    console.warn(`Meta ${metric} sync failed; using stored history:`, error.message);
  }
  const daily = await getStoredDaily({ adminId, ...range });
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
  caption,
  postedDate,
  likes,
  comments,
  insights,
}) => {
  const reach =
    metricValue(insights, "reach") || metricValue(insights, "post_impressions_unique");
  const impressions =
    metricValue(insights, "impressions") || metricValue(insights, "post_impressions");
  const engagement =
    metricValue(insights, "total_interactions") ||
    metricValue(insights, "post_engaged_users") ||
    Number(likes || 0) + Number(comments || 0);

  return {
    id,
    thumbnail: thumbnail || "",
    platform,
    caption: caption || "",
    postedDate,
    likes: Number(likes || 0),
    comments: Number(comments || 0),
    reach,
    impressions,
    engagement,
    engagementRate: reach > 0 ? Number(((engagement / reach) * 100).toFixed(2)) : 0,
  };
};

const getPosts = async ({ adminId, limit = 50 }) => {
  const account = await getActiveAccount(adminId);
  const posts = [];

  try {
    const instagramMedia = await graphGet(`/${account.instagramBusinessAccountId}/media`, {
      access_token: account.accessToken,
      fields:
        "id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count",
      limit,
    });

    const instagramPosts = await Promise.all(
      (instagramMedia.data || []).map(async (item) => {
        const insights = await getMediaInsights({
          mediaId: item.id,
          accessToken: account.accessToken,
        });
        return normalizePost({
          platform: "Instagram",
          id: item.id,
          thumbnail: item.thumbnail_url || item.media_url,
          caption: item.caption,
          postedDate: item.timestamp,
          likes: item.like_count,
          comments: item.comments_count,
          insights,
        });
      }),
    );
    posts.push(...instagramPosts);
  } catch (error) {
    console.warn("Instagram posts unavailable:", error.message);
  }

  try {
    const pagePosts = await graphGet(`/${account.pageId}/posts`, {
      access_token: account.accessToken,
      fields:
        "id,message,created_time,full_picture,picture,likes.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique,post_engaged_users)",
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
          insights: item.insights,
        }),
      ),
    );
  } catch (error) {
    console.warn("Facebook posts unavailable:", error.message);
  }

  return posts.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));
};

const disconnect = async (adminId) => {
  const account = await getLatestAccount(adminId);
  if (!account) return null;

  try {
    if (account.accessToken) {
      await graphDelete("/me/permissions", { access_token: account.accessToken });
    }
  } catch (error) {
    console.warn("Meta permission revoke skipped:", error.message);
  }

  account.status = "disconnected";
  account.accessToken = "";
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
  handleOAuthCallback,
  parseDateRange,
  sanitizeAccount,
  selectPage,
};
