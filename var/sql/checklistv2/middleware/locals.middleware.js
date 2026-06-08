
require('dotenv').config();

exports.setLocals = (req, res, next) => {
    const SERVER_URL = process.env.SERVER_IP_DOMAIN;
    const PROTOCOL = "http://";
    res.locals.servers = {
        bill: PROTOCOL + SERVER_URL +":"+ process.env.BILLING_SERVER_PORT,
        chat: PROTOCOL + SERVER_URL +":"+ process.env.CHAT_SERVER_PORT,
        checklist: PROTOCOL + SERVER_URL +":"+ process.env.CHECKLIST_SERVER_PORT,
        costing: PROTOCOL + SERVER_URL +":"+ process.env.COSTING_SERVER_PORT,
        file: PROTOCOL + SERVER_URL +":"+ process.env.FILE_SHARING_PORT,
        inventory: PROTOCOL + SERVER_URL +":"+ process.env.INVENTORY_SERVER_PORT,
        map: PROTOCOL + SERVER_URL +":"+ process.env.MAP_SERVER_PORT,
        project: PROTOCOL + SERVER_URL +":"+ process.env.PROJECT_MANAGEMENT_SERVER_PORT,
        sales: PROTOCOL + SERVER_URL +":"+ process.env.SALES_DASHBOARD_SERVER_PORT,
        wiki: PROTOCOL + SERVER_URL +":"+ process.env.WIKI_SERVER_PORT,
    }
    next();
};


