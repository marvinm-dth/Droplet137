notyf = new Notyf({
  position: {
    x: 'center',
    y: 'top',
  },
  types: [
      {
          type: 'success',
          background: 'var(--bs-success)',
          duration: 2000,
          dismissible: true

      },
      {
        type: 'offline',
        background: 'var(--bs-danger)',
        icon: '<i class="bi bi-wifi-off"></i>', // Optional: FontAwesome icon
        duration: 5000,
        dismissible: true
    }
  ]
});


document.addEventListener('alpine:init', () => {


  Alpine.data('taskPage', () => ({
    appLoading: false,
    initialFetching: false,
    authUser: null,

    task: {},

    openTask: {},
    openTaskItem: {},

    isLightBoxOpen: false,
    lightboxImage: "",

    async start(taskId) {
      this.appLoading = true;
      this.initialFetching = true,

      this.authUser = await getData(`/checklists/api/myself/`);
      this.task = await getData(`/checklists/api/tasks/${taskId}/`);
      this.openTask = this.task;

      this.initialFetching = false,
      this.appLoading = false;
    },

    async updateTaskItem(taskItem, action = "update") {
      this.appLoading = true;
      let updatedTaskItem = {};

      let updates = {};
      switch (action) {
        case "submit":
        case "submitUndo":
          updates = { action, submitted_comments: taskItem.submitted_comments };

          updatedTaskItem = await postData(`/checklists/api/task-items/${taskItem.id}/status/`, updates);
          taskItem.STATUS = updatedTaskItem.status;
          notyf.success("Updated success");
          break;
      }

      console.log(this.openTask);

      if (action === "submit") {
        taskItem.submitter = this.authUser
        this.openTask.task_checklist[0] = {
          ...this.openTask.task_checklist[0],
          INPROGRESS_ITEMS: this.openTask.task_checklist[0].INPROGRESS_ITEMS - 1,
          SUBMITTED_ITEMS: this.openTask.task_checklist[0].SUBMITTED_ITEMS + 1,
        };
      } else if (action === "submitUndo") {
        taskItem.submitter = {}
        this.openTask.task_checklist[0] = {
          ...this.openTask.task_checklist[0],
          INPROGRESS_ITEMS: this.openTask.task_checklist[0].INPROGRESS_ITEMS + 1,
          SUBMITTED_ITEMS: this.openTask.task_checklist[0].SUBMITTED_ITEMS - 1,
        };
      }

      this.appLoading = false;
    },

    capturedImages: [],
    cameraActive: false,
    _facingMode: "environment",
    _cameraInactivityTimer: 0,
    _resetCountDown: 10, //sec

    initCamera(taskItem) {
      this.capturedImages = taskItem.submitted_photos;

      // 4:3 or 16:9 ratio; 16MP camera
      Webcam.set({
        width: this.$el.offsetWidth,
        height: this.$el.offsetHeight,
        dest_width: 3264,
        dest_height: 2448,
        image_format: 'jpeg',
        jpeg_quality: 90,
        constraints: {
          facingMode: this._facingMode,
        }
      });
      Webcam.attach(this.$el.id);
      this._resetOnIdle();

      this.$el.closest(".offcanvas").addEventListener("hidden.bs.offcanvas", () => {
        clearTimeout(this._cameraInactivityTimer);
        this.capturedImages = [];
        this.cameraActive = false;
        Webcam.reset();
      })
    },

    rotateCamera(taskItem) {
      this._facingMode = (this._facingMode === "user") ? "environment" : "user";
    },

    async snapImage(taskItem) {
      this.appLoading = true;

      const data_uri = await new Promise(resolve => {
        Webcam.snap(resolve);
      });

      const res = await fetch(data_uri);
      const blob = await res.blob();

      const formData = new FormData();
      formData.append("taskItemId", taskItem.id)
      formData.append(
        `images`,
        new File([blob], `taskItem_${this.openTaskItem.id}_${Date.now()}.jpg`, { type: 'image/jpeg' })
      );

      const newSubmittedPhoto = await postForm(`/checklists/api/task-items/photos/submitted/`, formData);

      taskItem.submitted_photos = (taskItem.submitted_photos || []).concat(newSubmittedPhoto);

      this._resetOnIdle();

      this.appLoading = false;
    },

    async uploadSubmittedPhotos(taskItem) {
      this.appLoading = true;

      if (!this.$el.files.length) return;
      const formData = new FormData();
      formData.append("taskItemId", taskItem.id);

      for (let i = 0; i < this.$el.files.length; i++) {
        formData.append("images", this.$el.files[i]);
      }

      const newRefPhotos = await postForm(`/checklists/api/task-items/photos/submitted/`, formData)

      taskItem.submitted_photos = (taskItem.submitted_photos || []).concat(newRefPhotos);

      notyf.success("Image uploaded");
      this.appLoading = false;
    },

    async deleteSubmittedPhoto(photoId) {
      if (!confirm("Continue deleting?")) return;
      this.appLoading = true;

      await postData(`/checklists/api/task-items/photos/submitted/${photoId}/delete/`)

      this.openTaskItem.submitted_photos = this.openTaskItem.submitted_photos.filter((p) => p.id != photoId)

      notyf.success("Image deleted");
      this.appLoading = false;
    },


    _resetOnIdle() {
      if (this._cameraInactivityTimer) {
        clearTimeout(this._cameraInactivityTimer);
      }

      this._cameraInactivityTimer = setTimeout(() => {
        Webcam.reset();
        this.cameraActive = false;
        cameraOffcanvas.hide();
        submissionOffcanvas.show();
      }, this._resetCountDown * 1000);
    }
  }))
});

const referenceOffcanvas = new bootstrap.Offcanvas(document.querySelector("#referenceOffcanvas"));
const submissionOffcanvas = new bootstrap.Offcanvas(document.querySelector("#submissionOffcanvas"));
const cameraOffcanvas = new bootstrap.Offcanvas(document.querySelector("#cameraOffcanvas"));





