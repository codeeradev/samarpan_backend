const jwt = require("jsonwebtoken");
const MetaAccount = require("../models/metaAccount");
const MetaAnalyticsDaily = require("../models/metaAnalyticsDaily");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const META_PERMISSIONS = [
  "public_profile",
  // "user_posts",
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

const fetchConnectedUser = async (accessToken) => {
  try {
    return await graphGet("/me", {
      access_token: accessToken,
      fields: "id,name,picture{url}",
    });
  } catch (error) {
    console.warn("Meta user profile unavailable:", error.message);
    return null;
  }
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
  const connectedUser = await fetchConnectedUser(longToken.access_token);

  await MetaAccount.findOneAndUpdate(
    { adminId: decoded.adminId },
    {
      adminId: decoded.adminId,
      userId: connectedUser?.id || "",
      userName: connectedUser?.name || "",
      userPicture: connectedUser?.picture?.data?.url || "",
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return { adminId: decoded.adminId, needsPageSelection: true };
};

const sanitizeAccount = (account) => {
  if (!account) return null;
  return {
    id: account._id,
    userId: account.userId,
    userName: account.userName,
    userPicture: account.userPicture,
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
      userId: existing?.userId || "",
      userName: existing?.userName || "",
      userPicture: existing?.userPicture || "",
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (!account.userId && userAccessToken) {
    const connectedUser = await fetchConnectedUser(userAccessToken);
    if (connectedUser) {
      account.userId = connectedUser.id || "";
      account.userName = connectedUser.name || "";
      account.userPicture = connectedUser.picture?.data?.url || "";
      account.userAccessToken = userAccessToken;
      await account.save();
    }
  }

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
}) => {
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

const emptyPlatformMetrics = () => ({
  followers: 0,
  reach: 0,
  impressions: 0,
  engagement: 0,
  profileVisits: 0,
  websiteClicks: 0,
});

const buildDailyEngagementFromPosts = (posts, days) => {
  const byDay = {};
  days.forEach((date) => {
    byDay[formatDay(date)] = { ...emptyPlatformMetrics() };
  });

  posts.forEach((post) => {
    const day = formatDay(post.postedDate);
    if (!byDay[day]) return;
    const likes = Number(post.likes || 0);
    const comments = Number(post.comments || 0);
    byDay[day].engagement += likes + comments;
  });

  return byDay;
};

const fetchProfileFollowers = async (account) => {
  if (!account.userId) return 0;
  try {
    const profile = await graphGet(`/${account.userId}`, {
      access_token: getUserAccessToken(account),
      fields: "friends.summary(true), followers_count",
    });
    return (
      Number(profile.followers_count || 0) ||
      Number(profile.friends?.summary?.total_count || 0)
    );
  } catch (error) {
    console.warn("Meta profile follower count unavailable:", error.message);
    return 0;
  }
};

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

const fetchProfilePostsRaw = async (account, limit = 100) => {
  if (!account.userId) return [];
  try {
    const response = await graphGet(`/${account.userId}/posts`, {
      access_token: getUserAccessToken(account),
      fields:
        "id,name,picture{url},message,created_time,full_picture,picture,likes.summary(true),comments.summary(true)",
      limit,
    });

    console.log(account.userId);
    console.log(account.userName);
    console.log("PROFILE POSTS RESPONSE");
    console.dir(response, { depth: null });
    return response.data || [];
  } catch (error) {
    console.error("PROFILE POSTS ERROR");
    console.error(error.message);

    console.warn("Meta profile posts unavailable:", error.message);
    return [];
  }
};

const getProfileMediaCount = async (account) => {
  const items = await fetchProfilePostsRaw(account);
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
    followers: await fetchProfileFollowers(account),
  };
};

const syncAnalyticsRange = async ({ adminId, startDate, endDate }) => {
  const account = await getActiveAccount(adminId);
  const days = buildDayList(startDate, endDate);
  const hasInstagram = Boolean(account.instagramBusinessAccountId);
  const pageAccessToken = getPageAccessToken(account);

  const [
    instagramInsights,
    pageInsights,
    profilePostsRaw,
    profileFollowersCount,
    pageFollowersCount,
  ] = await Promise.all([
    hasInstagram
      ? fetchInsights({
          id: account.instagramBusinessAccountId,
          accessToken: pageAccessToken,
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
        })
      : Promise.resolve({ data: [] }),
    fetchInsights({
      id: account.pageId,
      accessToken: pageAccessToken,
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
    fetchProfilePostsRaw(account),
    fetchProfileFollowers(account),
    fetchPageFollowers(account),
  ]);

  const profilePosts = profilePostsRaw.map((item) => ({
    postedDate: item.created_time,
    likes: item.likes?.summary?.total_count,
    comments: item.comments?.summary?.total_count,
  }));
  const profileDailyEngagement = buildDailyEngagementFromPosts(
    profilePosts,
    days,
  );

  const igFollowers = mapDailyInsights(instagramInsights, "follower_count");
  const igReach = mapDailyInsights(instagramInsights, "reach");
  const igImpressions = mapDailyInsights(instagramInsights, "impressions");
  const igProfileViews = mapDailyInsights(instagramInsights, "profile_views");
  const igWebsiteClicks = mapDailyInsights(instagramInsights, "website_clicks");
  const igEngagement = mapDailyInsights(
    instagramInsights,
    "total_interactions",
  );
  const pageFollowsDaily = mapDailyInsights(pageInsights, "page_follows");
  const pageReach = mapDailyInsights(pageInsights, "page_impressions_unique");
  const pageImpressions = mapDailyInsights(pageInsights, "page_impressions");
  const pageEngagement = mapDailyInsights(
    pageInsights,
    "page_post_engagements",
  );
  const pageProfileVisits = mapDailyInsights(pageInsights, "page_views_total");
  const pageWebsiteClicks = mapDailyInsights(
    pageInsights,
    "page_website_clicks_logged_in_unique",
  );

  let previousFollowers = await getLastStoredFollowers(adminId);
  await Promise.all(
    days.map(async (date) => {
      const day = formatDay(date);
      const instagram = {
        followers: igFollowers[day] || 0,
        reach: igReach[day] || 0,
        impressions: igImpressions[day] || 0,
        engagement: igEngagement[day] || 0,
        profileVisits: igProfileViews[day] || 0,
        websiteClicks: igWebsiteClicks[day] || 0,
      };
      const facebook = {
        followers:
          pageFollowsDaily[day] ||
          (day === formatDay(endDate) ? pageFollowersCount : 0),
        reach: pageReach[day] || 0,
        impressions: pageImpressions[day] || 0,
        engagement: pageEngagement[day] || 0,
        profileVisits: pageProfileVisits[day] || 0,
        websiteClicks: pageWebsiteClicks[day] || 0,
      };
      const facebookProfile = {
        ...(profileDailyEngagement[day] || emptyPlatformMetrics()),
        followers: day === formatDay(endDate) ? profileFollowersCount : 0,
      };
      const followers =
        instagram.followers + facebook.followers + facebookProfile.followers ||
        previousFollowers ||
        0;
      previousFollowers = followers || previousFollowers;

      return MetaAnalyticsDaily.updateOne(
        { adminId, date },
        {
          $set: {
            adminId,
            date,
            followers,
            reach: instagram.reach + facebook.reach + facebookProfile.reach,
            impressions:
              instagram.impressions +
              facebook.impressions +
              facebookProfile.impressions,
            engagement:
              instagram.engagement +
              facebook.engagement +
              facebookProfile.engagement,
            profileVisits:
              instagram.profileVisits +
              facebook.profileVisits +
              facebookProfile.profileVisits,
            websiteClicks:
              instagram.websiteClicks +
              facebook.websiteClicks +
              facebookProfile.websiteClicks,
            instagram,
            facebook,
            facebookProfile,
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
  const dailyFacebookProfile = [];
  const dailyInstagram = [];

  days.forEach((date) => {
    const day = formatDay(date);
    const row = byDay[day] || {};
    const facebook = { ...emptyPlatformMetrics(), ...(row.facebook || {}) };
    const facebookProfile = {
      ...emptyPlatformMetrics(),
      ...(row.facebookProfile || {}),
    };
    const instagram = { ...emptyPlatformMetrics(), ...(row.instagram || {}) };

    daily.push({
      date: day,
      followers: row.followers || 0,
      reach: row.reach || 0,
      impressions: row.impressions || 0,
      engagement: row.engagement || 0,
      profileVisits: row.profileVisits || 0,
      websiteClicks: row.websiteClicks || 0,
    });
    dailyFacebook.push({ date: day, ...facebook });
    dailyFacebookProfile.push({ date: day, ...facebookProfile });
    dailyInstagram.push({ date: day, ...instagram });
  });

  return { daily, dailyFacebook, dailyFacebookProfile, dailyInstagram };
};

const sumDaily = (daily, key) =>
  daily.reduce((total, row) => total + Number(row[key] || 0), 0);

const buildPlatformOverview = (
  dailyPlatform,
  mediaCount = {},
  messageStats = {},
) => {
  const latest =
    dailyPlatform[dailyPlatform.length - 1] || emptyPlatformMetrics();
  return {
    followers: mediaCount.followers || latest.followers || 0,
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

const getInstagramMediaCount = async (account) => {
  if (!account.instagramBusinessAccountId) {
    return { totalPosts: 0, totalReels: 0, totalLikes: 0, totalComments: 0 };
  }

  try {
    const media = await graphGet(
      `/${account.instagramBusinessAccountId}/media`,
      {
        access_token: getPageAccessToken(account),
        fields: "id,media_type,like_count,comments_count",
        limit: 100,
      },
    );
    const items = media.data || [];
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
    };
  } catch (error) {
    console.warn("Meta Instagram media count unavailable:", error.message);
    return { totalPosts: 0, totalReels: 0, totalLikes: 0, totalComments: 0 };
  }
};

const getFacebookMediaCount = async (account) => {
  try {
    const posts = await graphGet(`/${account.pageId}/posts`, {
      access_token: getPageAccessToken(account),
      fields: "id,likes.summary(true),comments.summary(true)",
      limit: 100,
    });
    const items = posts.data || [];
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

  const { daily, dailyFacebook, dailyFacebookProfile, dailyInstagram } =
    await getStoredDaily({
      adminId,
      ...range,
    });
  const account = await MetaAccount.findOne({ adminId, status: "active" });
  const [
    instagramMediaCount,
    facebookMediaCount,
    profileMediaCount,
    pageMessageStats,
  ] = account
    ? await Promise.all([
        getInstagramMediaCount(account),
        getFacebookMediaCount(account),
        getProfileMediaCount(account),
        getPageMessageStats(account),
      ])
    : [{}, {}, {}, {}];
  const latest = daily[daily.length - 1] || {};

  const facebookPageOverview = buildPlatformOverview(
    dailyFacebook,
    facebookMediaCount,
    pageMessageStats,
  );
  const facebookProfileOverview = buildPlatformOverview(
    dailyFacebookProfile,
    profileMediaCount,
  );
  const instagramOverview = buildPlatformOverview(
    dailyInstagram,
    instagramMediaCount,
  );

  return {
    syncError,
    overview: {
      followers: latest.followers || 0,
      reach: sumDaily(daily, "reach"),
      impressions: sumDaily(daily, "impressions"),
      engagement: sumDaily(daily, "engagement"),
      profileVisits: sumDaily(daily, "profileVisits"),
      websiteClicks: sumDaily(daily, "websiteClicks"),
      totalPosts:
        (instagramMediaCount.totalPosts || 0) +
        (facebookMediaCount.totalPosts || 0) +
        (profileMediaCount.totalPosts || 0),
      totalReels: instagramMediaCount.totalReels || 0,
      totalLikes:
        (instagramMediaCount.totalLikes || 0) +
        (facebookMediaCount.totalLikes || 0) +
        (profileMediaCount.totalLikes || 0),
      totalComments:
        (instagramMediaCount.totalComments || 0) +
        (facebookMediaCount.totalComments || 0) +
        (profileMediaCount.totalComments || 0),
      totalMessages: pageMessageStats.totalMessages || 0,
      unreadMessages: pageMessageStats.unreadMessages || 0,
    },
    platforms: {
      facebookPage: facebookPageOverview,
      facebookProfile: facebookProfileOverview,
      facebook: facebookPageOverview,
      instagram: instagramOverview,
    },
    daily,
    dailyByPlatform: {
      facebookPage: dailyFacebook,
      facebookProfile: dailyFacebookProfile,
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

      console.log("IG MEDIA RESPONSE");
      console.dir(instagramMedia, { depth: null });

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
})
      );
      posts.push(...instagramPosts);
    }
  } catch (error) {
    console.warn("Instagram posts unavailable:", error.message);
  }

  try {
    const profilePostsRaw = await fetchProfilePostsRaw(account, limit);
    posts.push(
      ...profilePostsRaw.map((item) =>
        normalizePost({
          platform: "Facebook Profile",
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
    console.warn("Facebook profile posts unavailable:", error.message);
  }

  try {
    const pagePosts = await graphGet(`/${account.pageId}/posts`, {
      access_token: getPageAccessToken(account),
      fields:
        "id,message,created_time,full_picture,picture,likes.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique,post_engaged_users)",
      limit,
    });

    posts.push(
      ...(pagePosts.data || []).map((item) =>
        normalizePost({
          platform: "Facebook Page",
          id: item.id,
          thumbnail: item.full_picture || item.picture,
          caption: item.message,
          postedDate: item.created_time,
          likes: item.likes?.summary?.total_count,
          comments: item.comments?.summary?.total_count,
          insights: null,
          insights: item.insights,
        }),
      ),
    );
  } catch (error) {
    console.warn("Facebook page posts unavailable:", error.message);
  }

  return posts.sort((a, b) => new Date(b.postedDate) - new Date(a.postedDate));
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
  handleOAuthCallback,
  parseDateRange,
  sanitizeAccount,
  selectPage,
};
