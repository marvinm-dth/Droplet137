const express = require('express');
const router = express.Router();
const multer = require('multer');
const ItemModel = require('../models/item');
const fs = require('fs').promises;
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/proofs');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// const upload = multer({ dest: './uploads/proofs' });
const upload = multer({ storage });


router.post('/:id/update', upload.single('photo_path'), async (req, res) => {
    try {
        const { id } = req.params
        const { staff_notes, old_photo_path } = req.body;
        const photo_path = (req.file && req.file.path) ? "/" + req.file.path : req.body.photo_path || "";

        const updateData = { photo_path, staff_notes };
        const data = await ItemModel.update(id, updateData);

        //delete old photo
        if (old_photo_path) {
            try {
                const absolutePath = path.join(__dirname, old_photo_path);
                await fs.access(absolutePath);
                await fs.unlink(absolutePath);
                console.log(`File: ${old_photo_path} is deleted`);
            } catch (error) {
                console.log(error);
            }
        }

        res.status(200).json(data);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: `Server error: ${error}` });
    }
});

router.post('/:id/action', async (req, res) => {
    const { action, action_doer, action_date } = req.body;

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

    const updateData = {};

    if (action) updateData['status'] = status;

    if (action === "cancel_submit" || action === "cancel_complete") {
        updateData["completed_by"] = null;
        updateData["completed_on"] = null;
    } else if (action === "cancel_approve") {
        updateData["approved_by"] = null;
        updateData["approved_on"] = null;
    } else if (action === "cancel_reject") {
        updateData["rejected_by"] = null;
        updateData["rejected_on"] = null;
    }

    if (action === "submit") {
        if (action_doer) updateData['completed_by'] = action_doer;
        if (action_date) updateData['completed_on'] = action_date;
    } else if (action === "approve") {
        if (action_doer) updateData['approved_by'] = action_doer;
        if (action_date) updateData['approved_on'] = action_date;
    } else if (action === "reject") {
        if (action_doer) updateData['rejected_by'] = action_doer;
        if (action_date) updateData['rejected_on'] = action_date;
    } else if (action === "mark_complete") {
        if (action_doer) updateData['completed_by'] = updateData['approved_by'] = action_doer;
        if (action_date) updateData['completed_on'] = updateData['approved_on'] = action_date;
    }

    try {
        const { id } = req.params;
        const data = await ItemModel.update(id, updateData);
        res.status(200).json(data);

    } catch (error) {
        console.log(error)
        res.status(500).json({ error: `Server error: ${error}` });
    }
});


module.exports = router;
