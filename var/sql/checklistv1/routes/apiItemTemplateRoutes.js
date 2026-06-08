const express = require('express');
const router = express.Router();
const ItemTemplateModel = require('../models/itemTemplate');


router.post('/new', async (req, res) => {
  try {
    const { checklist_template_id } = req.body;
    const data = await ItemTemplateModel.insertOne({ checklist_template_id });
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
    const data = await ItemTemplateModel.update(id, updateData);

    res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});



router.post('/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await ItemTemplateModel.delete(id);
    res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});





module.exports = router;
