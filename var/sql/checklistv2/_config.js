const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { authenticateToken } = require("./middleware/auth.middleware");
const { setFlash: startFlash } = require("./middleware/flash.middleware");
const { setLocals } = require("./middleware/locals.middleware");
const { setLogger } = require("./middleware/logger.middleware");
const { setSession: startSession } = require("./middleware/session.middleware");



exports.setupConfig = (app) => {
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use(startSession);
  app.use(startFlash);
  app.use(authenticateToken);
  app.use(setLogger);
}

exports.BASE_PATH = `${__dirname}`;
