const express = require('express');
const router = express.Router();
const EmployeeModel = require('../models/employee');


router.get('/', async (req, res) => {
    try {
        const data = await EmployeeModel.getAll();
        res.status(200).json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});


module.exports = router;
