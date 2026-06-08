const {
    ItemTemplate,
} = require('../../models/table.model');

const queryType = {
    full: `
        id, checklist_id,
        title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
        video_link, video_desc_en, video_desc_zh,
        require_photos, require_videos, require_comments,

        
        checklist_template:dev_checklist_templates(
            id,
            name_en, name_zh, description_en, description_zh
        )
    `,

    basic: `
        id, title_en
    `,
}
// =============================================
exports.getAll = async (req, res) => {
    try {
        const itemTemplates = await ItemTemplate.getAll(queryType.full);
        res.json({success: true, message: "", data: itemTemplates});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.getById = async (req, res) => {
    try {
        const { itemTemplateId } = req.params;
        const itemTemplate = await ItemTemplate.getById( itemTemplateId, queryType.basic);

        res.json({success: true, message: "", data: itemTemplate});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const { checklistId, itemTemplateTitle } = req.body;

        const entry = {}
        entry.checklist_id = checklistId;
        entry.title_en = itemTemplateTitle;

        const { id } = await ItemTemplate.insert(entry);

        res.json({success: true, message: "", data: id});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({success: false, message: error.message});
    }
};

exports.update = async (req, res) => {
    try {
        const { itemTemplateId } = req.params;
        const { title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
                video_link, video_desc_en, video_desc_zh,
                require_photos, require_videos, require_comments  } = req.body;

        const updates = {};
        if (title_en) updates.title_en = title_en;
        if (title_zh) updates.title_zh = title_zh;
        if (description_en) updates.description_en = description_en;
        if (description_zh) updates.description_zh = description_zh;
        if (notes_en) updates.notes_en = notes_en;
        if (notes_zh) updates.notes_zh = notes_zh;

        if (video_link) updates.video_link = video_link;
        if (video_desc_en) updates.video_desc_en = video_desc_en;
        if (video_desc_zh) updates.video_desc_zh = video_desc_zh;

        if (require_photos) updates.require_photos = require_photos;
        if (require_videos) updates.require_videos = require_videos;
        if (require_comments) updates.require_comments = require_comments;

        await ItemTemplate.update(itemTemplateId, updates);

        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.delete = async (req, res) => {
    try {
        const { itemTemplateId } = req.params;
        await ItemTemplate.delete( itemTemplateId );
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}