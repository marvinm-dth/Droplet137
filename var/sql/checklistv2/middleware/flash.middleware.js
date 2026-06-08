const flash = require('connect-flash');

exports.setFlash = (req, res, next) => {
    flash()(req, res, () => {
        res.locals.flash = {
            success: req.flash('success'),
            error: req.flash('error')
        };
        next();
    });
};