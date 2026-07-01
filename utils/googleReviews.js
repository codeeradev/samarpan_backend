const Setting = require("../models/setting");
const axios = require("axios");

const GOOGLE_PLACE_ID = "ChIJHcqVl2wzEjkRuwleGvppVDI";

const GOOGLE_PLACES_API_KEY ="AIzaSyDxUrsUbdiRRIGFjreNUB98IsFXdC3tE48";

const ACCOUNT_ID = "101956102540015364943";
const LOCATION_ID = "7294201313474128016";


async function getAccessToken() {
  const { data } = await axios.post(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      client_id: process.env.CLIENT_ID_SAMARPAN,
      client_secret: process.env.CLIENT_SECRET_SAMARPAN,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return data.access_token;
}


async function fetchAllGoogleReviews() {
  const accessToken = await getAccessToken();
  let reviews = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/accounts/${ACCOUNT_ID}/locations/${LOCATION_ID}/reviews`
    );

    url.searchParams.set("pageSize", "50");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    reviews.push(...(response.data.reviews || []));

    pageToken = response.data.nextPageToken || "";
  } while (pageToken);

  return reviews;
}

function getRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }

  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }

  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }

  return "Just now";
}
module.exports = {
  fetchAllGoogleReviews,
  getRelativeTime,
};
