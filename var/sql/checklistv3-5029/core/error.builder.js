class MyError extends Error {
  /**
   * @param {Object} options
   * @param {number} [options.statusCode=500] - HTTP status code
   * @param {string} options.message - Error message
   * @param {string} [options.errorCode] - Optional application-specific error code
   * @param {Object} [options.meta] - Optional extra data for context/debugging
   */
  constructor({
    statusCode = 500,
    errorCode = "INTERNAL_ERROR",
    message,
    meta = {},
    ...rest
  }) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.meta = meta;

    // Assign any additional dynamic keys
    Object.assign(this, rest);

    Error.captureStackTrace(this, this.constructor);
  }

  json() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      ...(Object.keys(this.meta).length && { meta: this.meta }),
    };
  }
}

module.exports = MyError;
