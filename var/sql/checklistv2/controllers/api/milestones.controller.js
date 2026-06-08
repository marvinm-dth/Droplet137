const {
  Milestone,
  MilestoneRelationship,
  MilestoneUser
} = require('../../models/table.model');
const { q, qMilestone } = require('./_queries');
// =============================================
exports.getAll = async (req, res) => {
  try {
    const milestones = await Milestone.getAll(qMilestone.full);
    res.json({ success: true, message: "", data: milestones });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const milestone = await Milestone.getById(milestoneId, qMilestone.full);
    res.json({ success: true, message: "", data: milestone });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { projectId, milestoneName, parentId } = req.body;

    const entry = {};

    if(projectId !== null) entry.project_id = projectId
    if(milestoneName !== null) entry.name_en = milestoneName

    const newMilestone = await Milestone.insert(entry, qMilestone.full);

    if(parentId !== null) {
      await MilestoneRelationship.insert({parent_id: parentId, child_id: newMilestone.id});
    }

    res.json({ success: true, message: "", data: newMilestone });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.update = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    const updateBody = req.body;

    const updates = {};
    if (updateBody.name_en !== undefined) updates.name_en = updateBody.name_en;
    if (updateBody.name_zh !== undefined) updates.name_zh = updateBody.name_zh;
    if (updateBody.special_notes_en !== undefined) updates.special_notes_en = updateBody.special_notes_en;
    if (updateBody.special_notes_zh !== undefined) updates.special_notes_zh = updateBody.special_notes_zh;

    await Milestone.update(milestoneId, updates);
    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
}


exports.delete = async (req, res) => {
  try {
    const { milestoneId } = req.params;
    await Milestone.delete(milestoneId);
    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
}


// =================================================

exports.createRelationship = async (req, res) => {
  try {
    const { selfId, targetId } = req.body;

    const entry = {};

    entry.child_id = selfId;
    entry.parent_id = targetId;

    await MilestoneRelationship.insert(entry);

    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    if(error.code === "23505") return res.status(200).json({ success: true, message: error.message })
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.deleteRelationship = async (req, res) => {
  try {
    const { selfId, targetId, targetIds } = req.body;

    const filter = {};
    filter.child_id = selfId;
    if(targetId) {
      filter.parent_id = targetId;
      await MilestoneRelationship.deleteMany(filter);
    } else if (targetIds) {
      await MilestoneRelationship.deleteManyIn(filter, ["parent_id", targetIds]);
    }

    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
};



exports.updateRelationship = async (req, res) => {
  try {
    const { selfId, targetId, targetIds, action } = req.body;

    const filter = {};
    filter.child_id = selfId;

    const updates = {};
    
    switch (action) {
      case "ignore":
        updates.ignored = true;
        break;
      case "ignoreUndo":
        updates.ignored = false;
        break;
    }

    if(targetId) {
      filter.parent_id = targetId;
      await MilestoneRelationship.updateMany(filter, updates);
    } else if (targetIds) {
      await MilestoneRelationship.updateManyIn(filter, updates, ["parent_id", targetIds]);
    }

    res.json({ success: true, message: "", data: [] });
  } catch (error) {
    console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
    res.status(500).json({ success: false, message: error.message });
  }
}



exports.updateUsers = async (req, res) => {
  try {
      const { milestoneId } = req.params;
      const { userIds } = req.body;

      await MilestoneUser.deleteMany({milestone_id: milestoneId});

      if (userIds.length) {
        const newUserMilestones = userIds.map((userId) => ({user_id: userId, milestone_id: milestoneId}));
        await MilestoneUser.insertMany(newUserMilestones);
      }

      const milestoneUsers = await Milestone.getById(milestoneId, "users:dev_users(id, name)");

      res.json({success: true, message: "", data: milestoneUsers});
  } catch (error) {
      console.log(`\x1b[31mError: ${error.message}\x1b[0m`);
      res.status(500).json({ success: false, message: error.message });
  }
}