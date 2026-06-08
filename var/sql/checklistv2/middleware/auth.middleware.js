const jwt = require('jsonwebtoken');

exports.authenticateToken = (req, res, next) => {
    // const myUser = { name: "Alex", id: 4, role: "manager"};
    // req.user = myUser;
    // res.locals.authUser = myUser;
    // return next();

    const token = req.cookies.jwtdth;
    if(req.path.includes('/logout/')) {
        next();
    }
    // to login page
    if(req.path.includes('/login/')) {
        if(token) return res.redirect("/checklists/"); // with token
        else return next(); // no token
    }

    // any route with no token
    if (!token) {
        req.flash("error", "You are not logged in.");
        return res.redirect("/login/");
    }


    // any route with token
    jwt.verify(token, process.env.JWT_SECRET, (err, claims) => {

        // expired token
        if (err) {
            req.flash("error", "Session expired.");
            return res.redirect("/login/");
        }

        // If token is valid
        req.user = claims.user;
        res.locals.authUser = claims.user;

        return next();
    });
};
