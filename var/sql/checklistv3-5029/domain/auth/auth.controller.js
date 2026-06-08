const BaseController = require("../../core/base.controller");
const userModel = require("./../user/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const myError = require("../../core/error.builder");
const sessionModel = require("../session/session.model");

const ACCESS_EXPIRATION = "15m";
const REFRESH_EXPIRATION = "30d";

class AuthController {
  register = async (req, res) => {
    try {
      const { username, password } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await userModel.insertOne({
        entry: { name: username, password: hashedPassword },
      });

      return res.status(201).json({
        success: true,
        errorCode: "create_user_success",
        message: "User registered",
        user: newUser,
      });
    } catch (error) {
      throw error;
    }
  };

  login = async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await userModel.findOne({
        filters: { name: username },
        columns: "*",
      });

      if (!user || user?.is_suspended) throw new Error("Invalid credentials");

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) throw new Error("Invalid credentials");

      const payload = { id: user.id, name: user.name };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: ACCESS_EXPIRATION,
      });

      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH, {
        expiresIn: REFRESH_EXPIRATION,
      });

      res.cookie("dth-jwt-refresh", refreshToken, {
        httpOnly: true,
        secure: false,
        maxAge: null,
      });

      const userAgent = req.headers["user-agent"] || "Unknown device";
      await sessionModel.insertOne({
        entry: {
          user_id: user.id,
          token: refreshToken,
          user_agent: userAgent,
        },
      });

      return res.status(200).json({
        success: true,
        code: "login_success",
        message: "Login successful",
        data: { user: { name: user.name, id: user.id }, token: accessToken },
      });
    } catch (error) {
      console.log(error);
      throw new myError({
        statusCode: 401,
        errorCode: "invalid_credentials",
        message: error.message,
      });
    }
  };

  // will bypass password check
  loginAnon = async (req, res) => {
    try {
      const { username } = req.body;
      const user = await userModel.findOne({
        filters: { name: username },
        columns: "*",
      });

      if (!user || user?.is_suspended) throw new Error("Invalid credentials");

      const payload = { id: user.id, name: user.name };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: ACCESS_EXPIRATION,
      });

      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH, {
        expiresIn: REFRESH_EXPIRATION,
      });

      res.cookie("dth-jwt-refresh", refreshToken, {
        httpOnly: true,
        secure: false,
        maxAge: null,
      });

      const userAgent = req.headers["user-agent"] || "Unknown device";
      await sessionModel.insertOne({
        entry: {
          user_id: user.id,
          token: refreshToken,
          user_agent: userAgent,
        },
      });

      return res.status(200).json({
        success: true,
        code: "login_success",
        message: "Login successful",
        data: { user: { name: user.name, id: user.id }, token: accessToken },
      });
    } catch (error) {
      throw new myError({
        statusCode: 401,
        errorCode: "invalid_credentials",
        message: error.message,
      });
    }
  };

  // refresh
  refresh = async (req, res) => {
    try {
      const refreshToken = req.cookies["dth-jwt-refresh"];
      if (!refreshToken) throw new Error("No refresh token");

      let payload;
      try {
        payload = jwt.verify(refreshToken, process.env.JWT_REFRESH);
      } catch (error) {
        const userAgent = req.headers["user-agent"];
        const session = await sessionModel.findOne({
          filters: {
            token: refreshToken,
            user_agent: userAgent,
          },
          columns: "id",
        });
        if (session) {
          await sessionModel.deleteOne({ filters: { id: session.id } });
        }
        throw new Error("Invalid refresh token");
      }

      const { id, name } = payload;
      const userAgent = req.headers["user-agent"];

      const session = await sessionModel.findOne({
        filters: {
          user_id: id,
          token: refreshToken,
          user_agent: userAgent,
        },
        columns: "id, is_revoked",
      });

      if (!session || session.is_revoked) {
        if (session) {
          await sessionModel.deleteOne({ filters: { id: session.id } });
        }
        throw new Error("Revoked or missing session");
      }

      const accessToken = jwt.sign({ id, name }, process.env.JWT_SECRET, {
        expiresIn: ACCESS_EXPIRATION,
      });

      return res.status(200).json({
        success: true,
        errorCode: "refresh_successful",
        message: "Refreshed",
        data: { user: { id, name }, token: accessToken },
      });
    } catch (err) {
      res.clearCookie("dth-jwt-refresh");
      throw new myError({
        statusCode: 401,
        errorCode: "INVALID_REFRESH_TOKEN",
        message: "Login required",
        redirectTo: "/",
      });
    }
  };

  logout = async (req, res) => {
    res.clearCookie("dth-jwt-refresh");
    res.status(204).json({
      success: true,
      errorCode: "SESSION_END",
      message: "Logged out",
    });
  };
}

module.exports = new AuthController();
