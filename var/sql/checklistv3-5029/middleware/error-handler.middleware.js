const chalk = require("chalk");
const MyError = require("../core/error.builder");

const errorHandler = (err, req, res, next) => {
  const environment = process.env.NODE_ENV || "development";

  const isCustom = err instanceof MyError;
  const statusCode = isCustom ? err.statusCode : 500;
  const errorCode = isCustom
    ? err.errorCode || "INTERNAL_ERROR"
    : "INTERNAL_ERROR";
  const message = isCustom ? err.message : "Something went wrong";

  // 🧾 Structured Logging
  console.log(
    "\n" +
      chalk.bgRed.white.bold(" [ERROR HANDLER] ") +
      chalk.red(` ${req.method} ${req.originalUrl}`)
  );
  console.error(chalk.red("→ Known Error:  "), isCustom);
  console.error(chalk.red("→ Status Code:  "), statusCode);
  console.error(chalk.red("→ Error Code:   "), errorCode);
  console.error(chalk.red("→ Message:      "), err.message);

  // Log request body even if empty or undefined
  const safeBody = req.body && typeof req.body === "object" ? req.body : {};
  console.error(chalk.red("→ Request Body:"));
  console.error(
    chalk.gray(
      Object.keys(safeBody).length > 0
        ? JSON.stringify(safeBody, null, 2)
        : "(empty)"
    )
  );


  if (err.stack && environment === "local" && !err.noStack) {
    console.error(chalk.gray("→ Stack:\n" + err.stack));
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorCode,
  });
};

module.exports = errorHandler;
