const util = require("util")

exports.jsonview = (req, res, next) => {
    const originalRender = res.render;
    const originalRedirect = res.redirect;


    res.redirect = function(reloadUrl) {
        if(req.query.request) {
            return res.json({
                method: req.method,
                url: req.url,
                // headers: req.headers,
                query: req.query,
                params: req.params,
                body: req.body
            });
        }
        return originalRedirect.call(res, reloadUrl);
    }
    

    res.render = function(view, options = {}, callback) {
        if (req.query.json) {
            return res.json(options);
        } 
        return originalRender.call(res, view, options, callback);
    };
    next();
}