const session = require('express-session');

exports.setSession = session({ 
    secret: 'E9a2$8cNf!mXh4Q6P@zKjR7YVwLbTuv3D', // Replace with a strong secret key
    resave: false, // Prevents saving the session if it wasn’t modified
    saveUninitialized: false, // Prevents saving uninitialized sessions
    cookie: {
        secure: false, // Set to `true` if using HTTPS
    }
})