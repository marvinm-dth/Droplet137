const express = require('express');
const router = express.Router();
const ChecklistTemplateModel = require('../models/checklistTemplate');

router.get('/', async (req, res) => {
    try {
        const data = await ChecklistTemplateModel.getAll();
        res.status(200).json(data);

    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await ChecklistTemplateModel.getById(id);

        data.all_template_items.sort((a, b) => a.id - b.id);
        res.status(200).json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});

router.post('/:id/update', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const data = await ChecklistTemplateModel.update(id, updateData);

        res.status(200).json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

module.exports = router;
