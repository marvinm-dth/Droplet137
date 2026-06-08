const MyError = require("../core/error.builder");

const notFoundHandler = (req, res, next) => {
  next(new MyError({
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errorCode: "ROUTE_NOT_FOUND",
    noStack: true,
  }));
};

module.exports = notFoundHandler;
