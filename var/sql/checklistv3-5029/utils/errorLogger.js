const chalk = require("chalk");

function errorLogger({
  action,
  methodName,
  err,
  isCustom,
  errorCode,
}) {
  console.log(
    "\n" +
      chalk.bgRed.white.bold(
        " [ERROR HANDLER] " + chalk.red(` ${action} ${methodName}`)
      )
  );
  console.error(chalk.red("→ Known Error:  "), isCustom);
  console.error(chalk.red("→ Error Code:   "), errorCode);
  console.error(chalk.red("→ Message:      "), err.message);

  if (err.stack && process.env.NODE_ENV === "local") {
    console.error(chalk.gray("→ Stack:\n" + err.stack));
  }
}

module.exports = errorLogger;
