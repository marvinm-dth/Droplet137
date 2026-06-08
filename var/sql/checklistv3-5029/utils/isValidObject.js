function isValidObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

module.exports = isValidObject;
