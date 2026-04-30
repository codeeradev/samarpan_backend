const GOOGLE_PLACE_ID =
  process.env.GOOGLE_PLACE_ID || "ChIJHcqVl2wzEjkRuwleGvppVDI";
const GOOGLE_REVIEW_FIELDS = "name,rating,reviews";
const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  "AIzaSyDxUrsUbdiRRIGFjreNUB98IsFXdC3tE48";

const normalizeGoogleReview = (review = {}, index = 0) => ({
  id:
    review.id ||
    `${review.author_name || "google-reviewer"}-${review.time || index}`,
  authorName: review.author_name || "Google Reviewer",
  authorUrl: review.author_url || "",
  profilePhotoUrl: review.profile_photo_url || "",
  rating:
    typeof review.rating === "number" ? review.rating : Number(review.rating || 0),
  relativeTimeDescription: review.relative_time_description || "",
  text: review.text || "",
  time: typeof review.time === "number" ? review.time : null,
  language: review.language || review.original_language || "",
});

async function fetchGoogleReviews() {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("Google Places API key is not configured");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", GOOGLE_PLACE_ID);
  url.searchParams.set("fields", GOOGLE_REVIEW_FIELDS);
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Places request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.status !== "OK") {
    throw new Error(
      payload.error_message || `Google Places API returned ${payload.status}`,
    );
  }

  return {
    source: "google",
    placeId: GOOGLE_PLACE_ID,
    placeName: payload.result?.name || "",
    rating:
      typeof payload.result?.rating === "number"
        ? payload.result.rating
        : Number(payload.result?.rating || 0),
    reviews: Array.isArray(payload.result?.reviews)
      ? payload.result.reviews.map((review, index) =>
          normalizeGoogleReview(review, index),
        )
      : [],
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchGoogleReviews,
};
