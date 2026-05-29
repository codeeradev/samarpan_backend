function generateSlug(title = "") {
  return title
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // remove special chars
    .trim()
    .replace(/\s+/g, "-") // spaces -> hyphen
    .replace(/-+/g, "-") // multiple hyphens -> one
    .toLowerCase();
}

module.exports = generateSlug;