const express = require('express');
const router = express.Router();
const ChecklistModel = require('../models/checklist');


router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await ChecklistModel.getById(id);

        data.all_items.sort((a, b) => a.id - b.id);

        res.status(200).json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});


router.get('/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const data = await ChecklistModel.getByFilter({ status });
        res.status(200).json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});

//assign a new checklist
router.post('/new', async (req, res) => {
    const { project_id, checklist_template_id } = req.body;
    try {
        const checklist_data = await ChecklistModel.insertOne({ project_id, checklist_template_id });

        //gets a reference to which items are under the checklists added prior. 
        const { data: items, error: items_error } = await supabase
            .from("all_template_items")
            .select("id")
            .eq("checklist_template_id", checklist_template_id)
        if (items_error) res.status(400).json({ error: items_error.message })


        //for every items that are under the prior checklists add a record in the "all_items" table
        const dataToInsert = items.map((item) => ({ checklist_id: checklist_data[0].id, item_template_id: item.id }));

        const { data, error } = await supabase
            .from('all_items')
            .insert(dataToInsert);
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({ message: "Action Successful - CREATE NEW" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error: ${error}` });
    }
});

//update a checklist
router.post('/:id/update', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const data = await ChecklistModel.update(id, updateData)

        res.status(200).json({ message: `Checklist #${req.params.id} - updated` });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: `Server error:\n${error}` });
    }
});

//change checklist status
router.post('/:id/action', async (req, res) => {
    const { action } = req.body;

    const action_equavalent = {
        submit: "pending",
        reject: "rejected",
        approve: "approved",
        mark_complete: "completed",

        cancel_submit: "inprogress",
        cancel_reject: "pending",
        cancel_approve: "pending",
        cancel_complete: "inprogress"
    }

    const status = action_equavalent[action];

    try {
        const { id } = req.params;
        const updateData = { status }
        const data = await ChecklistModel.update(id, updateData);

        res.status(200).json(data);

    } catch (error) {
        console.log(error)
        res.status(500).json({ error: `Server error: ${error}` });
    }
});






module.exports = router;
