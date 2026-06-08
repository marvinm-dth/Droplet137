const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/', (req, res) => {
    res.redirect("/checklists/manage")
});

router.get('/pdf', (req, res) => {
    res.sendFile(path.join(__dirname, `../pages/manager/checklists-pdf.html`));
});

router.get('/manage', async (req, res) => {
    res.sendFile(path.join(__dirname, `../pages/manager/checklists-manage.html`));
});

router.get('/review', async (req, res) => {
    res.sendFile(path.join(__dirname, `../pages/manager/checklists-review.html`));
});

router.get('/fill', (req, res) => {
    res.sendFile(path.join(__dirname, `../pages/staff/checklists-fill.html`));
});


module.exports = router;
