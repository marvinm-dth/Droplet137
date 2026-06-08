const {
    Workshop,
    Project,
    Milestone,
    Task,
    Subtask,
    Microtask,
    TaskChecklist,
    TaskItem,
    Checklist,
    Item,
    UserTask,
    User,
    } = require('../models/table.model'); 
const jwt = require('jsonwebtoken');


exports.login = async (req, res) => {
    try {
        res.render("login")
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
};

exports.authenticate = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = (await User.getByFilter({name: username}, "id, role, name"))[0];
        // if (username === 'alex' && password === 'alex') {
        if (user) {
            const token = jwt.sign({user: user}, process.env.JWT_SECRET, {
                expiresIn: '24h',
            });
            res.cookie('jwtdth', token, { httpOnly: true, secure: false, maxAge: null });
            req.flash('success', 'Logged in successfully');

            if (user.role === "manager") return res.redirect('/checklists/admin/');
            return res.redirect('/checklists/');
        } else {
            req.flash('error', 'Invalid credentials');
            res.redirect('/login/');
            // res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({success: false, message: error.message});
    }
};

exports.logout = async (req, res) => {
    try {
        res.clearCookie("jwtdth");
        req.flash('success', 'Logged out successfully');
        res.redirect('/login/');
    } catch (error) {
        req.flash('error', 'Error happened while logging out');
        res.redirect('/login/');
    }
};