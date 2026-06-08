const SBModel = require('./sb.model.js');
const { debugLog } = require('../helpers/debug.helper.js');
const logs = false;
// View Models
const defaultVm = ({data, parent = null} = {}) => Array.isArray(data) ? data : [data];

const taskItemVm = ({data, parent = null} = {}) => {
  // data is never empty
  const computedStatus = _computeStatus({data: data, entityType: "task_item", parent: parent});
  const computedDependencies = _computeDependendencies(computedStatus);
  
  const computedData = computedDependencies
  return computedData;
};

// Add computed values below
const taskChecklistVm = ({data, parent = null} = {}) => {
  // data is never empty
  const computedStatus = _computeStatus({data: data, entityType: "task_checklist", parent: parent, childName: "task_items", childrenVm: taskItemVm});
  const computedDependencies = _computeDependendencies(computedStatus);
  const computedChildOverview = _computeChildStatusOverview({data: computedDependencies, childName: "task_items"})

  const computedData = computedChildOverview
  return computedData;
  
};

const taskVm = ({data, parent = null} = {}) => {
  // data is never empty
  const computedStatus = _computeStatus({data: data, entityType: "task", parent: parent, childName: "task_checklist", childrenVm: taskChecklistVm});
  const computedDependencies = _computeDependendencies(computedStatus);

  computedDependencies.forEach((self) => {
    self.USERS_ARRAY = self.users.map(user => user.id);
  });
  
  const computedData = computedDependencies
  return computedData;
};

const milestoneVm = ({data, parent = null} = {}) => {
  // data is never empty
  const computedStatus = _computeStatus({data: data, entityType: "milestone", parent: parent, childName: "tasks", childrenVm: taskVm});
  const computedDependencies = _computeDependendencies(computedStatus);

  computedDependencies.forEach((self) => {
    self.USERS_ARRAY = self.users?.map(user => user.id);
  });
  
  const computedData = computedDependencies
  return computedData;
};

const projectVm = ({data, parent = null} = {}) => {
  // data is never empty
  const computedStatus = _computeStatus({data: data, entityType: "project", parent: parent, childName: "milestones", childrenVm: milestoneVm});
  const computedDependencies = _computeDependendencies(computedStatus);

  const computedData = computedDependencies;
  return computedData;
}

const workshopVm = ({data, parent = null} = {}) => {
  return Array.isArray(data) ? data : [data];
};

const userVm = ({data, parent = null} = {}) => {
  const dataArr = Array.isArray(data) ? data : [data]
  // data is never empty
  dataArr.forEach((user) => {
    if(user.tasks) _computeStatus({data: user.tasks, entityType: "task", parent: null, childName: "task_checklist", childrenVm: taskChecklistVm}) 
  });

  return dataArr;
};


function _computeStatus({data, entityType="undefined", parent=null, childName="", childrenVm=null}={}) {
  if(!data) return debugLog('warning', 'Data is empty in _computeStatus');
  const dataArr = Array.isArray(data) ? data : [data];
  try {
    dataArr.forEach((self) => {

      self.ENTITY_TYPE = entityType;
      self.STATUS = "inprogress";
      self.COMPLETED_AT = "";
      self.COMPLETED_BY = "";

      // _checkIfSelfStatus
      if(self.status) {
        self.STATUS = self.status === "approved" ? "completed" : self.status;
        self.COMPLETED_AT = self.status === "approved" ? self.reviewed_at : "";
        self.COMPLETED_BY = self.status === "approved" ? "self": "";
      }

      // _checkIfSelfForce
      if (self.force_completed) {
        self.STATUS = "completed";
        self.COMPLETED_AT = self.force_completed_at;
        self.COMPLETED_BY = "force";
      }

      // _checkIfParentForce
      if (parent && parent.STATUS === "completed") {
        self.STATUS = "completed";
        self.COMPLETED_AT = parent.force_completed_at;
        self.COMPLETED_BY = "parent";
      }

      // if there are children, map the children as well,
      if(childName && self[childName]?.length) {
        childrenVm({data: self[childName], parent: self})
        // _checkIfChildrenAllComplete - reevaluate status based on children completion;
        if(self.STATUS !== "completed") {
          const allChildComplete = self[childName].every(child => child.STATUS === "completed");
          const allHaveCompletedAt = self[childName].every(mc => mc.COMPLETED_AT !== undefined);
          
          if(allChildComplete) {
            self.STATUS = "completed";
            self.COMPLETED_BY = "children";

            if (allHaveCompletedAt) {
              self.COMPLETED_AT = new Date(Math.max.apply(null, self[childName].map((child) =>new Date(child.COMPLETED_AT).getTime()))).toISOString();
            }
          }
        }
      } else {
        self[childName] = [];
      }

      // console.log(parent?.STATUS, parent?.ENTITY_TYPE, self.ENTITY_TYPE, self.STATUS)
    })
    return dataArr;
  } catch (error) {
    debugLog("danger", error);
    return dataArr;
  }
}

function _computeDependendencies(data) {
  const dataArr = Array.isArray(data) ? data : [data];
  try {
    // go back to using statusStore if performance is bad
    const statusHash = Object.fromEntries(dataArr.map(rec => [rec.id, rec.STATUS]));
    dataArr.forEach((self) => {
      if(self.dependencies?.length) {
        self.dependencies.forEach((dep) => {
          Object.assign(dep, {
            ...dep.data,
            STATUS: statusHash[dep.data.id],
          });
          delete dep.data;
        })
  
        const allDepComplete = self.dependencies.filter((d) => !d.ignored).every((dep) => dep.STATUS === "completed");
        if(!allDepComplete) self.STATUS = "waiting";
      };

      self.DEPENDENCY_ARRAY = self.dependencies?.map((dep) => dep.id) || [];
      self.AVAILABLE_DEPENDENCY_ARRAY = dataArr.filter((m) => m.id !== self.id && !self.DEPENDENCY_ARRAY.includes(m.id))
                                                .map((m) => ({id: m.id, name_en: m.name_en}));
    });
    return dataArr;
  } catch (error) {
    debugLog("danger", error.message);
    return dataArr;
  }
}


function _computeChildStatusOverview({data, childName=""}={}) {
  const dataArr = Array.isArray(data) ? data : [data];
  try {
    // data is task_checklist array typically.
    dataArr.forEach(self => {
      const _totalItemsWhitelist = ['inprogress', 'submitted', 'approved', 'rejected', 'completed'];
      self.TOTAL_ACTIVE_ITEMS = self[childName]?.filter((item) => _totalItemsWhitelist.includes(item.STATUS)).length || 0;
      self.TOTAL_ITEMS = self[childName]?.length || 0;

      self.INPROGRESS_ITEMS = self[childName]?.filter((item) => item.STATUS === "inprogress").length || 0;
      self.SUBMITTED_ITEMS = self[childName]?.filter((item) => item.STATUS === "submitted").length || 0;
      self.APPROVED_ITEMS = self.STATUS === "completed" ? self.TOTAL_ACTIVE_ITEMS : self[childName]?.filter((item) => item.status === "approved").length || 0;
      self.COMPLETD_ITEMS = self.STATUS === "completed" ? self.TOTAL_ACTIVE_ITEMS : self[childName]?.filter((item) => item.STATUS === "completed").length || 0;
      self.REJECTED_ITEMS = self[childName]?.filter((item) => item.STATUS === "rejected").length || 0;
      self.CANCELLED_ITEMS = self[childName]?.filter((item) => item.STATUS === "cancelled").length || 0;

      const _completeItemsWhitelist = [self.COMPLETD_ITEMS]
      const _sumOfCompleteItems = _completeItemsWhitelist.reduce((acc, curr) => acc + curr, 0);

      self.COMPLETE_PERCENT = _sumOfCompleteItems/self.TOTAL_ACTIVE_ITEMS * 100;
    });
    return dataArr;
  } catch (error) {
    debugLog("danger", error.message);
    return dataArr;
  }
}

// add a new model by adding a new record below
const tableNames = [
  { model: "Workshop", table: 'dev_workshops'},
  { model: "Project", table: 'dev_projects', vm: projectVm},
  { model: "Milestone", table: 'dev_milestones', vm: milestoneVm},
  { model: "Task", table: 'dev_tasks', vm: taskVm},

  { model: "TaskChecklist", table: 'dev_task_checklists', vm: taskChecklistVm},
  { model: "TaskItem", table: 'dev_task_items', vm: taskItemVm},
  { model: "TaskItemReferencePhotos", table: 'dev_task_item_reference_photos'},
  { model: "TaskItemReferenceVideos", table: 'dev_task_item_reference_videos'},

  { model: "ChecklistTemplate", table: 'dev_checklist_templates'},
  { model: "ItemTemplate", table: 'dev_item_templates'},
  { model: "ItemReferencePhotosTemplates", table: 'dev_item_reference_photos_templates'},
  { model: "ItemReferenceVideoTemplates", table: 'dev_item_reference_video_templates'},

  { model: "TaskItemSubmittedPhotos", table: 'dev_task_item_submitted_photos'},
  { model: "TaskItemSubmittedVideos", table: 'dev_task_item_submitted_videos'},

  { model: "User", table: 'dev_users', vm: userVm},
  { model: "TaskUser", table: 'dev_task_users'},
  { model: "MilestoneUser", table: 'dev_milestone_users'},


  { model: "MilestoneRelationship", table: 'dev_milestone_relationships'},



  { model: "Notification", table: 'dev_notifications'},

];


const models = {};
tableNames.forEach(({model, table, vm = defaultVm}) => {
  class TableModel extends SBModel {
      constructor() {
          super(table, vm);
      }
  }
  models[model] = new TableModel();
});


module.exports = {...models};