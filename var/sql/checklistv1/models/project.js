const SBModel = require('./SBModel.js');

class ProjectModel extends SBModel {
  constructor() {
    super('all_projects');
  }
}

module.exports = new ProjectModel();
