const {
    ChecklistTemplate,
} = require('../../models/table.model');

const queryType = {
    full: `
        id,
        name_en, name_zh, description_en, description_zh,
        items:dev_item_templates(
            id, checklist_id,
            title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
            require_photos, require_videos, require_comments
        )
    `,

    basic: `
        id, name_en
    `,
}
// =============================================
exports.getAll = async (req, res) => {
    try {
        const checklistTemplates = await ChecklistTemplate.getAll(queryType.full);
        res.json({success: true, message: "", data: checklistTemplates});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.getById = async (req, res) => {
    try {
        const { checklistTemplateId } = req.params;
        const checklistTemplate = await ChecklistTemplate.getById( checklistTemplateId, queryType.basic);

        res.json({success: true, message: "", data: checklistTemplate});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const { checklistTemplateName } = req.body;

        const entry = {}
        entry.name_en = checklistTemplateName;

        const { id } = await ChecklistTemplate.insert(entry);

        res.json({success: true, message: "", data: id});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({success: false, message: error.message});
    }
};

exports.update = async (req, res) => {
    try {
        const { checklistTemplateId } = req.params;
        const { name_en, name_zh, description_en, description_zh, type } = req.body;

        const updates = {};
        if (name_en) updates.name_en = name_en;
        if (name_zh) updates.name_zh = name_zh;
        if (description_en) updates.description_en = description_en;
        if (description_zh) updates.description_zh = description_zh;
        if (type) updates.type = type;

        await ChecklistTemplate.update(checklistTemplateId, updates);

        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.delete = async (req, res) => {
    try {
        const { checklistTemplateId } = req.params;
        await ChecklistTemplate.delete( checklistTemplateId );
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}