const {
    Project,
} = require('../../models/table.model'); 
const { q, qProject } = require('./_queries');

// =============================================
exports.getAll = async (req, res) => {
    try {
        const projects = await Project.getAll(qProject.full);
        res.json({success: true, message: "", data: projects});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await Project.getById( projectId, qProject.full );
        res.json({success: true, message: "", data: project});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    try {
        const { workshopId, projectName, modelId } = req.body;

        const { id } = await Project.insert({ name: projectName, workshop_id: workshopId, model_id: modelId }, qProject.full);

        res.json({success: true, message: "", data: [{id}]});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
};


exports.update = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { projectName, modelId, workshopId } = req.body;

        const updates = {};
        if (projectName) updates.name = projectName;
        if (workshopId) updates.workshop_id = workshopId;
        if (modelId) updates.model_id = modelId;

        await Project.update(projectId, updates, qProject.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}


exports.delete = async (req, res) => {
    try {
        const { projectId } = req.params;
        await Project.delete( projectId , qProject.full);
        res.json({success: true, message: "", data: []});
    } catch (error) {
        console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
        res.status(500).json({ success: false, message: error.message });
    }
}