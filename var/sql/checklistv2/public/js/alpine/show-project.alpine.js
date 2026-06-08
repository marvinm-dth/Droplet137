  document.addEventListener('alpine:init', () => {
  Alpine.data('projectPage', () => ({
    appLoading: false,
    initialFetching: false,
    authUser: {},
    projectId: 0,

    project: {},
    checklistTemplates: [],
    users: [],

    openTask: {},
    openTaskItem: {},

    isLightBoxOpen: false,
    lightboxImage: "",

    async _reload() {
      this.project = deepSort(await getData(`/checklists/api/projects/${this.projectId}/`), "id");
    },

    async start(projectId) {
      this.appLoading = true;
      this.initialFetching = true,
      this.projectId = projectId

      this._reload();
      this.authUser = await getData(`/checklists/api/myself/`);
      this.checklistTemplates = deepSort(await getData(`/checklists/api/checklist-templates/`), "id");
      this.users = await getData(`/checklists/api/users/`);

      this.initialFetching = false,
      this.appLoading = false;
    },



    async addMilestone(projectId, milestoneName, parentId=null) {
      this.appLoading = true;
      
      const entry = {
        projectId,
        milestoneName,
        parentId
      }

      const newMilestone = await postData('/checklists/api/milestones/', entry);
      
      // this.project.milestones.push(newMilestone);
      this._reload();

      notyf.success("Milestone added!")
      this.appLoading = false;
    },

    async addTask(milestone, taskName) {
      this.appLoading = true;
      // id, name, status, task_checklist, users]
      const entry = {
        milestoneId: milestone.id,
        taskName: taskName
      }

      const newTask = await postData('/checklists/api/tasks/', entry);
      
      // milestone.tasks.push(newTask);
      this._reload();

      notyf.success("Task added!")
      this.appLoading = false;
    },
    
    async addTaskChecklist(taskId, checklistTemplateId = null, taskChecklistName) {
      this.appLoading = true;

      const entry = {
        taskId,
        checklistId: checklistTemplateId,
        taskChecklistName
      }

      const taskChecklist = await postData('/checklists/api/task-checklists/', entry);
      
      // this.openTask.task_checklist.push(taskChecklist);
      this._reload();

      notyf.success("Checklist added!")
      this.appLoading = false;
    },

    async addCustomTaskItem(taskChecklistId) {
      this.appLoading = true;

      const entry = {
        taskChecklistId
      }

      const taskItem = await postData('/checklists/api/task-items/', entry);

      // this.openTask.task_checklist[0].task_items.push(taskItem);
      this._reload();

      notyf.success("Item added!")
      this.appLoading = false;
    },

    async addMilestoneDependency(selfId, targetId) {
      this.appLoading = true;

      const entry = {
        selfId,
        targetId
      }

      const taskItem = await postData('/checklists/api/milestones/relationships/', entry);

      this._reload();

      // notyf.success("Milestone added!")
      this.appLoading = false;
    },


    async deleteMilestone(milestoneId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/milestones/${milestoneId}/delete`);

      // this.project.milestones = this.project.milestones.filter((m) => m.id != milestoneId)
      this._reload();

      notyf.success("Milestone deleted!")
      this.appLoading = false;
    },

    async deleteTask(taskId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/tasks/${taskId}/delete`);

      // this.milestone.tasks = this.milestone.tasks.filter((t) => t.id != taskId)
      this._reload();

      notyf.success("Task deleted!")
      this.appLoading = false;
    },

    async deleteTaskChecklist(taskChecklistId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/task-checklists/${taskChecklistId}/delete`);

      // this.task.task_checklist = []
      this._reload();

      notyf.success("Checklist removed!");
      this.appLoading = false;
    },

    async deleteTaskItem(taskItemId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/task-items/${taskItemId}/delete/`);

      // this.task.task_checklist[0].task_items = this.task.task_checklist[0].task_items.filter((t) => t.id != taskItemId)
      this._reload();

      notyf.success("Item deleted!");
      this.appLoading = false;
    },

    async deleteMilestoneDependency(selfId, targetId) {
      this.appLoading = true;

      const filter = {};
      if(Array.isArray(targetId)) {
        filter.selfId = selfId,
        filter.targetIds = targetId;
      } else {
        filter.selfId = selfId,
        filter.targetId = targetId;
      }
    

      const taskItem = await postData('/checklists/api/milestones/relationships/delete/', filter);

      this._reload();


      // notyf.success("Detached dependency!")
      this.appLoading = false;
    }, 



    async updateTaskUsers(taskId, action = "update") {
      this.appLoading = true;

      switch (action) {
        case "update":
          const userIds = this.choices.getValue().map(c => c.value);
          const entry = {
            userIds
          };
          const taskUsers = await postData(`/checklists/api/tasks/${taskId}/users/`, entry);
          this.task.users = taskUsers.users
          
          notyf.success("Updated success");
          break;

        case "clear":
          // this.task.users = [];
          this.choices.removeActiveItems();
          break;
      }

      this.appLoading = false;
    },


    async updateMilestoneUsers(milestoneId, action = "update") {
      console.log("asdasd")
      switch (action) {
        case "update":
          const userIds = this.choices.getValue().map(c => c.value);
          const entry = {
            userIds
          };
          const milestoneUsers = await postData(`/checklists/api/milestones/${milestoneId}/users/`, entry);
          this.milestone.users = milestoneUsers.users
          break;

        case "clear":
          this.milestone.users = [];
          this.choices.removeActiveItems();
          break;
      }
    },

    async updateTaskItem(taskItem, action="update") {
      this.appLoading = true;
      let prevStatus = taskItem.STATUS;
      let updatedTaskItem = {};

      switch (action) {
        case "update":
            updatedTaskItem = await postData(`/checklists/api/task-items/${taskItem.id}/patch/`, taskItem);
            notyf.success("Updated success");
            break;
    
        case "cancel": 
        case "restore":
            updatedTaskItem = await postData(`/checklists/api/task-items/${taskItem.id}/status/`, { action });
            taskItem.STATUS = updatedTaskItem.status;
            notyf.success("Updated success");
            break;
    
        case "approve": 
        case "reject":
        case "rethink":
            this.appLoading = false;
            if (!confirm("Continue action?")) return;
            this.appLoading = true;

            const updates = { action, reviewer_comments: taskItem.reviewer_comments };
            updatedTaskItem = await postData(`/checklists/api/task-items/${taskItem.id}/status/`, updates);
            taskItem.STATUS = updatedTaskItem.status;
            notyf.success("Updated success");
            break;
    
      }
      
      if (["approve", "reject", "rethink"].includes(action)) {
          if (action === "approve") {
            taskItem.reviewer = this.authUser
              this.openTask.task_checklist[0] = {
                  ...this.openTask.task_checklist[0],
                  APPROVED_ITEMS: this.openTask.task_checklist[0].APPROVED_ITEMS + 1,
                  SUBMITTED_ITEMS: this.openTask.task_checklist[0].SUBMITTED_ITEMS - 1,
              };
          } else if (action === "reject") {
            taskItem.reviewer = this.authUser
              this.openTask.task_checklist[0] = {
                  ...this.openTask.task_checklist[0],
                  REJECTED_ITEMS: this.openTask.task_checklist[0].REJECTED_ITEMS + 1,
                  SUBMITTED_ITEMS: this.openTask.task_checklist[0].SUBMITTED_ITEMS - 1,
              };
          } else if (action === "rethink") {
              if (prevStatus === "approved" || prevStatus === "rejected") {
                  const key = prevStatus.toUpperCase() + "_ITEMS";
                  this.openTask.task_checklist[0] = {
                      ...this.openTask.task_checklist[0],
                      [key]: this.openTask.task_checklist[0][key] - 1,
                      SUBMITTED_ITEMS: this.openTask.task_checklist[0].SUBMITTED_ITEMS + 1,
                  };
              }
          }
      }

      this._reload();

      this.appLoading = false;
    },

    async updateMilestone(milestone, action="update") {
      this.appLoading = true;

      switch (action) {
        case "update":
            this.updateMilestoneUsers(milestone.id)
            updates = await postData(`/checklists/api/milestones/${milestone.id}/patch/`, milestone);
            notyf.success("Changes saved!");
            break;
      }

      this._reload();

      this.appLoading = false;
    },

    async updateMilestoneDependency(selfId, targetId, action="update") {
      this.appLoading = true;

      const payload = {};
      payload.action = action;
      
      if(Array.isArray(targetId)) {
        payload.selfId = selfId,
        payload.targetIds = targetId;
      } else {
        payload.selfId = selfId,
        payload.targetId = targetId;
      }
    

      await postData('/checklists/api/milestones/relationships/patch/', payload);

      this._reload();

      // notyf.success("Relationship updated!")
      this.appLoading = false;
    },

    

    async addReferenceVideoLink(taskItem, videoLink) {
      // this.appLoading = true;

      const entry = {
        taskItemId: taskItem.id,
        videoLink
      }

      const newRefVideos = await postData('/checklists/api/task-items/videos/reference/', entry);

      taskItem.reference_videos = (taskItem.reference_videos || []).concat(newRefVideos);

      notyf.success("Video link added!")
      // this.appLoading = false;
    },

    async uploadReferencePhotos(taskItem) {
      this.appLoading = true;

      if (!this.$el.files.length) return;
      const formData = new FormData();
      formData.append("taskItemId", taskItem.id);
      
      for (let i = 0; i < this.$el.files.length; i++) {
        formData.append("images", this.$el.files[i]);
      }

      const newRefPhotos = await postForm(`/checklists/api/task-items/photos/reference/`, formData)
      
      taskItem.reference_photos = (taskItem.reference_photos || []).concat(newRefPhotos);

      // notyf.success("Image uploaded");
      this.appLoading = false;
    },

    async uploadReferenceVideos(taskItem, videoItem) {
      if (!videoItem.file) return this.appLoading = false;

      videoItem.status = 'uploading';


      const formData = new FormData();
      formData.append("taskItemId", taskItem.id);
      formData.append("videos", videoItem.file);

      // const newRefVideos = await postForm(`/checklists/api/task-items/videos/reference/`, formData)
      
      // taskItem.reference_videos = (taskItem.reference_videos || []).concat(newRefVideos);

      // taskItem.toUploadVideos = taskItem.toUploadVideos.filter(v => v !== videoFile);
      // notyf.success("Video uploaded");
      // this.appLoading = false;

      const controller = new AbortController();
      videoItem.abortController = controller;


      try {
        const response = await axios.post(
          `/checklists/api/task-items/videos/reference/`,
          formData,
          {
            signal: controller.signal,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            onUploadProgress: (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              videoItem.progress = percent;
            }
          }
        );
    
        videoItem.status = 'uploaded';
        videoItem.abortController = null;

        // taskItem.reference_videos = (taskItem.reference_videos || []).concat(response.data.data);

        // Optionally remove the video after upload
        // taskItem.toUploadVideos = taskItem.toUploadVideos.filter(v => v !== videoItem);
    
        notyf.success("Video uploaded");
      } catch (error) {
        if (axios.isCancel(error) || error.name === 'CanceledError') {
        } else {
          videoItem.status = 'error';
          notyf.error("Upload failed");
        }
        videoItem.abortController = null;
      }
    },

    async addToUploadVideo(taskItem) {
      if(!taskItem?.toUploadVideos) taskItem.toUploadVideos = [];

      taskItem.toUploadVideos.push({
        file: this.$el.files[0],
        progress: 0,
        status: 'waiting', // 'waiting', 'uploading', 'done', 'error', 'cancelled'
        abortController: null
      });

      this.$el.value = '';
    },

    async deleteReferencePhoto(photoId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/task-items/photos/reference/${photoId}/delete/`)

      this.openTaskItem.reference_photos = this.openTaskItem.reference_photos.filter((p) => p.id != photoId)

      // notyf.success("Image deleted");
      this.appLoading = false;
    },

    async deleteReferenceVideo(referenceVideo) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/task-items/videos/reference/${referenceVideo.id}/delete/`)

      this.openTaskItem.reference_videos = this.openTaskItem.reference_videos.filter((v) => v.id != referenceVideo.id)

      // notyf.success("Image deleted");
      this.appLoading = false;
    },

    async updateReferenceVideos(taskItem) {
      this.appLoading = true;

      const updates = {
        reference_videos: taskItem.reference_videos,
      }
      await postData(`/checklists/api/task-items/videos/reference/multiple/patch/`, updates);

      // notyf.success("Reference videos updated")
      this.appLoading = false;
    },


    async forceComplete(entity, type, undo = false) {
      this.appLoading = true;

      const payload = {};
      payload.entityType = type;
      payload.entityId = entity.id;
      payload.undo = undo;

      await postData(`/checklists/api/special/force/`, payload);

      this._reload();

      if(undo) {
        notyf.success(`${type.capitalize()} reverted!`)
      } else {
        notyf.success(`${type.capitalize()} completed!`)
      }
      this.appLoading = false;
    },

    async factoryCreate(type, parentId, quantity = 0) {
      this.appLoading = true;

      const payload = {
        parentId,
        entityType: type,
        quantity: 5
    }

      await postData(`/checklists/api/special/factory/`, payload);

      this._reload();

      notyf.success(`${quantity} ${type}s created!`)
      this.appLoading = false;
    },


    initChoices(options) {
      this.choices = new Choices(this.$el, {
        removeItemButton: true,
        placeholder: true,
        searchEnabled: true,
        shouldSort: true
      });
      this.choices.setChoices(options);
    },

    initBsTables(rows, id = null) {
        const tableId = id || `#${this.$el.id}`;

        const formattedData = rows.map((item) => {
          return {
            taskId: this.task.id,
            id: item.id,
            title_en: item.title_en,
            status: item.status,
            force_completed: item.force_completed,
            last_action: "",
            action: "",
            reviewer: item.reviewer,
            submitter: item.submitter,

            STATUS: item.STATUS,
            COMPLETED_BY: item.COMPLETED_BY,
          }
        });

        $(tableId).bootstrapTable({
          search: true,
          showSearchClearButton: true,
          searchHighlight: true,
          searchAlign: 'left',

          pagination: true,
          pageSize: 10,
          paginationHAlign: "left",
          paginationDetailHAlign: "right",
          showExtendedPagination: true,
          striped: true,
          showFullscreen: true,
          sortReset: true,

          showColumns: true,

          uniqueId: 'id',
          buttonsClass:"primary",
        
          columns: [{
            field: 'id',
            title: 'Id',
            sortable: true,
            formatter: (val) => `#${val}`
          },{
            field: 'title_en',
            title: 'Title',
            sortable: true,
            formatter: (val, taskItem) => ['approved', 'cancelled', 'completed'].includes(taskItem.STATUS) ? `<span class="text-decoration-line-through">${val}</span>`:val
          }, {
            field: 'STATUS',
            title: 'Status',
            sortable: true,
            formatter: tableStatusFormatter,
            
          }, {
            field: 'last_action',
            title: 'Last Action',
            sortable: true,
            formatter: tableLastActionFormatter,
          }, {
            field: 'action',
            title: 'Action',
            formatter: tableActionFormatter,
          }],
          data: formattedData,
          onPostBody: function () {
            _addLastRow(tableId);
            Alpine.initTree(document.querySelector(tableId));
        }
        });
    },

    refreshBsTable(data) {
      const tableId = `#${this.$el.id}`;
      $(tableId).bootstrapTable('destroy');
      this.initBsTables(data, tableId);
    },

    setOpenTaskItem(taskItemId) {
      this.task.task_checklist[0].task_items.some((item) => {
        if(item.id == taskItemId) {
          this.openTaskItem = item;
          return true;
        }
      })
    },
  }))
})

function _addLastRow(tableId) {
  let $tbody = $(`${tableId} tbody`);
  
  // Remove existing last row if it already exists (to prevent duplicates)
  $tbody.find('.custom-last-row').remove();

  // Append a new last row with full width colspan
  $tbody.append(`
      <tr class="table-secondary">
        <td colspan="100%" class="text-center py-1">
          <button class="btn btn-sm btn-purple px-2 py-1" @click="factoryCreate('task_item', task.task_checklist[0]?.id, 5);" title="Add new item">5</button>
          <button class="btn btn-sm btn-purple px-2 py-1" @click="factoryCreate('task_item', task.task_checklist[0]?.id, 10);" title="Add new item">10</button>
          <button class="btn btn-sm btn-primary px-2 py-1" @click="addCustomTaskItem(task.task_checklist[0]?.id);" title="Add new item"><i class="bi bi-plus-lg"></i></button>
        </td>
      </tr>
  `);
}

// table Formatters
function tableStatusFormatter(status, taskItem) {
  const error = `
    <span class="btn btn-sm btn-light border border-dark-subtle" title="Status: Undefined">
          <i class="bi bi-question-circle"></i>
    </span>
  `;
  const icons = {
      "inprogress": `<button class="btn btn-sm btn-light border border-dark-subtle" title="Status: Inprogress"
                            data-bs-target="#reviewSubmissionModal"
                            data-bs-toggle="modal"
                            @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                            ><i class="bi bi-wrench-adjustable"></i>
                            <span class="position-absolute invisible">inprogress<span>
                    </button>`,
      "submitted": `<button class="btn btn-sm btn-warning" title="Status: Submitted"
                            data-bs-target="#reviewSubmissionModal"
                            data-bs-toggle="modal"
                            @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                            ><i class="bi bi-send-check"></i>
                            <span class="position-absolute invisible">submitted<span>
                    </button>`,
      "approved": `<button class="btn btn-sm btn-success" title="Status: Approved"
                            data-bs-target="#reviewSubmissionModal"
                            data-bs-toggle="modal"
                            @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                            ><i class="bi bi-check2-circle"></i>
                            <span class="position-absolute invisible">approved<span>
                    </button>`,

      "completed": `<button class="btn btn-sm btn-success" title="Status: Approved"
                          data-bs-target="#reviewSubmissionModal"
                          data-bs-toggle="modal"
                          @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                          ><i class="bi bi-check2-circle"></i>
                          <span class="position-absolute invisible">approved<span>
                  </button>`,

      "rejected": `<button class="btn btn-sm btn-danger" title="Status: Rejected"
                            data-bs-target="#reviewSubmissionModal"
                            data-bs-toggle="modal"
                            @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                            ><i class="bi bi-arrow-repeat"></i>
                            <span class="position-absolute invisible">rejected<span>
                    </button>`,
      "cancelled": `<button class="btn btn-sm btn-secondary" title="Status: Cancelled"
                            data-bs-target="#reviewSubmissionModal"
                            data-bs-toggle="modal"
                            @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                            ><i class="bi bi-slash-square"></i>
                            <span class="position-absolute invisible">cancelled<span>
                    </button>`,
  };
  return icons[status] || error;
}

function tableLastActionFormatter(lastAction, taskItem) {
  if (["inprogress"].includes(taskItem.STATUS)) {
    return "";
  }
  if (["submitted"].includes(taskItem.STATUS)) {
    return `Submitted: ${taskItem.submitter?.name || "No Record"}`
  }
  if (["approved", "completed"].includes(taskItem.STATUS)) {
    return `Approved: ${taskItem.reviewer?.name || "No Record"}`
  }
  if (["rejected"].includes(taskItem.STATUS)) {
    return `Rejected: ${taskItem.reviewer?.name || "No Record"}`
  }
  if (["cancelled"].includes(taskItem.STATUS)) {
    return `Cancelled: ${taskItem.reviewer?.name || "No Record"}`
  }
  return "";
}

function tableActionFormatter(action, taskItem) {

  const error = `
      <button class="btn btn-sm btn-warning"
              title="Undefined status">
              <i class="bi bi-question-circle"></i>
              </button>
  `;

  const use = (taskItem.STATUS === "completed" && taskItem.COMPLETED_BY !== "force") ? "disabled" : String(taskItem.force_completed);

  const buttons = {
      "disabled": `<button  class="btn btn-success btn-sm  opacity-50"
                          title="Completed via ${taskItem.COMPLETED_BY}"
                          style="cursor: help;">
                          <i class="bi bi-calendar2-check"></i>
                          </button>`,
    // cancel
      "true": `<button  class="btn btn-secondary btn-sm"
                        title="Undo Force Complete"
                        @click="forceComplete({id: ${taskItem.id}}, 'task_item', true)">
                        <i class="bi bi-backspace"></i>
                        </button>`,
      "false": `<button  class="btn btn-warning btn-sm"
                        title="Force Complete"
                        @click="forceComplete({id: ${taskItem.id}}, 'task_item')">
                        <i class="bi bi-calendar2-check"></i>
                        </button>`,
  };

  return `
    <div class="d-flex justify-content-around align-items-center gap-2 px-2">
        <button class="btn btn-sm btn-light border border-dark-subtle" title="Open task item"
                data-bs-target="#taskItemModal"
                data-bs-toggle="modal"
                @click="setOpenTaskItem(${taskItem.id}); console.log('OPEN_TASK_ITEM: #', ${taskItem.id})"
                > 
            <i class="bi bi-folder"></i>
        </button>

        ${buttons[use] || error}

        <button class="btn btn-sm btn-danger" title="Delete Item"
                @click="deleteTaskItem(${taskItem.id})"
                >
                <i class="bi bi-x"></i>
        </button>
    </div>

  `;
}



