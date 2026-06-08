const {
    TaskChecklist,
    TaskItem,
    ChecklistTemplate,
    TaskItemReferencePhotos,
    TaskItemReferenceVideos
} = require('../../models/table.model');
const { q, qTaskChecklist, qTask } = require('./_queries');
// =============================================
exports.getAll = async (req, res) => {
    try {
        const taskChecklists = await TaskChecklist.getAll(qTaskChecklist.full);
        res.json({success: true, message: "", data: taskChecklists});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.getById = async (req, res) => {
    try {
        const { taskChecklistId } = req.params;
        const taskChecklist = await TaskChecklist.getById( taskChecklistId, qTaskChecklist.full);

        res.json({success: true, message: "", data: taskChecklist});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const {taskId, checklistId, taskChecklistName} = req.body;
        
        const { id: newTaskChecklistId } = await TaskChecklist.insert({task_id: taskId}, qTaskChecklist.full);

        const updates = {}
        if(taskChecklistName) updates.name_en = taskChecklistName || "New task checklist...";

        // using template
        if(checklistId) {
            const template = await ChecklistTemplate.getById(checklistId, `name_en, name_zh, description_en, description_zh,
                items:dev_item_templates(
                    id,
                    title_en, title_zh, description_en, description_zh, notes_en, notes_zh,
                    require_photos, require_videos, require_comments,

                    reference_photos:dev_item_reference_photo_templates(id, original_path, thumbnail_path, scaled_path),
                    reference_videos:dev_item_reference_video_templates(id, video_link, video_desc_en, video_desc_zh)
                )
            `);
            updates.name_en = template.name_en;
            updates.name_zh = template.name_zh;
            updates.description_en = template.description_en;
            updates.description_zh = template.description_zh;

            // Sort items and format for insertion to task_item table
            const newTaskItems = template.items.sort((a,b) => a.id-b.id).map(({id, ...item}) => ({...item, task_checklist_id: newTaskChecklistId}));

            // makes a list of promise to run concurrently, I tried using "for..." loop and it was slow.

            // seperate items to be inserted in reference_photos, reference_videos, and task_item tables
            const taskItemInsertions = newTaskItems.map(async (taskItem) => {
              const { reference_photos, reference_videos, ...cleanTaskItem } = taskItem;
          
              const { id: newTaskItemId } = await TaskItem.insert(cleanTaskItem, "id");
          
              const newTaskItemsReferencePhotos = reference_photos
                  .map(({original_path, thumbnail_path, scaled_path}) => ({ original_path, thumbnail_path, scaled_path, task_item_id: newTaskItemId }));
          
              const newTaskItemsReferenceVideos = reference_videos
                  .map(({video_link, video_desc_en, video_desc_zh}) => ({ video_link, video_desc_en, video_desc_zh, task_item_id: newTaskItemId }));

              if (newTaskItemsReferencePhotos.length > 0 || newTaskItemsReferenceVideos.length > 0) {
                  await Promise.all([
                    TaskItemReferencePhotos.insertMany(newTaskItemsReferencePhotos),
                    TaskItemReferenceVideos.insertMany(newTaskItemsReferenceVideos)
                  ])
              }
          });

          await Promise.all(taskItemInsertions);
        } 
        
        const newTaskChecklist = await TaskChecklist.update(newTaskChecklistId, updates, qTaskChecklist.full);

        res.json({success: true, message: "", data: newTaskChecklist});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({success: false, message: error.message});
    }
};

exports.update = async (req, res) => {
    try {
        const { taskChecklistId } = req.params;
        const { name_en, name_zh, description_en, description_zh } = req.body;

        const updates = {};
        if (name_en) updates.name_en = name_en;
        if (name_zh) updates.name_zh = name_zh;
        if (description_en) updates.description_en = description_en;
        if (description_zh) updates.description_zh = description_zh;

        await TaskChecklist.update(taskChecklistId, updates, qTaskChecklist.full);

        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.delete = async (req, res) => {
    try {
        const { taskChecklistId } = req.params;
        await TaskChecklist.delete( taskChecklistId , qTaskChecklist.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}