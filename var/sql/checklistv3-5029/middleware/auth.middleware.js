const jwt = require("jsonwebtoken");
const myError = require("../core/error.builder");

const JWT_SECRET = process.env.JWT_SECRET;
const isLocal = process.env.NODE_ENV === "local";

exports.verifyToken = (req, res, next) => {
  if (isLocal) {
    req.user = { id: 1, name: "admin" };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new myError({
      statusCode: 401,
      errorCode: "MISSING_ACCESS_TOKEN",
      message: "Missing access token.",
      redirectTo: "/",
    });
  }

  const token = authHeader.split(" ")[1];
  const refreshToken = req.cookies["dth-jwt-refresh"];

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    req.user = claims.user;
    next();
  } catch (error) {
    if (!refreshToken) {
      throw new myError({
        statusCode: 401,
        errorCode: "MISSING_REFRESH_TOKEN",
        message: "Login required",
        redirectTo: "/",
      });
    } else {
      throw new myError({
        statusCode: 401,
        errorCode:
          error.name === "TokenExpiredError" ? "EXPIRED_TOKEN" : "TOKEN_ERROR",
        message:
          error.name === "TokenExpiredError"
            ? "Token is expired"
            : "Authentication token is invalid.",
      });
    }
  }
};
