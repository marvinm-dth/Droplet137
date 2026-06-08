const referenceOffcanvas = new bootstrap.Offcanvas(document.querySelector("#referenceOffcanvas"));
const submissionOffcanvas = new bootstrap.Offcanvas(document.querySelector("#submissionOffcanvas"));
const cameraOffcanvas = new bootstrap.Offcanvas(document.querySelector("#cameraOffcanvas"));

document.querySelector("#submissionOffcanvas").addEventListener("hide.bs.offcanvas", () => {
    gotoStep(1);
})


document.addEventListener('alpine:init', () => {
    // DASHBOARD
    Alpine.data('activeProjects', () => ({
        projects: [],
        projectName: "",

        fetchInit() {
            fetch("/checklists/api/projects/")
            .then(res => res.json())
            .then(res => {
                this.projects = res.data
            })
            .catch(error => alert("Request Denied: Server is unreachable:"));
        },

        add (el) {
            this.projects.push({name: this.projectName, id: Date.now()})
            this.projectName = "";
        }
    }))

    // PROJECT PAGE COMPONENT
    Alpine.data('projectPage', () => ({
        fetching: false,
        project: {},
        users: [],
        openTaskItem: {},


        initChoices(options) {
            const choices = new Choices(this.$el, {
                removeItemButton: true,
                placeholder: true,
                searchEnabled: true,
                shouldSort: true
            });
            choices.setChoices(options);
            this.choices = choices;
        },
        
        async start(projectId) {
            this.fetching = true;
            try {
                this.user = await fetchData(`/checklists/api/users/`);
                this.project = deepSort(await fetchData(`/checklists/api/projects/${projectId}/`), "id");
            }
            catch (error) { alert(error) }
            finally { this.fetching = false }
        },

        

        addMilestone() {
            const newMilestone = {
                id: Date.now(),
                name: this.inputVal,
                tasks: [],
            }
            this.inputVal = "";
            this.project.milestones.push(newMilestone);
            notyf.success("Added milestones")
        },

        deleteMilestone() {
            if(!confirm("Continue deleting?")) return;

            this.project.milestones = this.project.milestones
                .filter((m) => m.id != this.milestone.id)
                .sort((a,b) => a.id-b.id);
                
            notyf.success("Removed milestones")
        },

        addTask() {
            // id, name, status, task_checklist, users]
            const newTask = {
                id: Date.now(),
                name: this.inputVal,
                task_checklist: [],
                status: "inprogress",
                users: [],
            }

            this.inputVal = "";
            this.milestone.tasks.push(newTask);
            notyf.success("Added milestones")
        },

        deleteTask() {
            if(!confirm("Continue deleting?")) return;
            
            this.milestone.tasks = this.milestone.tasks
                .filter((t) => t.id != this.task.id)
                .sort((a,b) => a.id-b.id);
                
            notyf.success("Removed task")
        },

        updateChoices(action = "update") {
            switch (action) {
                case "update":
                    const userChoices = this.choices
                        .getValue()
                        .map(c => ({id: c.value, name: c.label}));
                    this.task.users = userChoices;
                    notyf.success("Updated success");
                    break;

                case "clear":
                    this.task.users = [];
                    this.choices.removeActiveItems();
                    break;
            }
            console.log(this.task.users);
        },

        deleteChecklist() {
            if(!confirm("Continue deleting?")) return;
            
            this.task.task_checklist = []
            notyf.success("Removed checklist");
        },
    }))

    Alpine.data('taskPage', () => ({
        fetching: false,
        task: {},
        openTaskItem: {},
        appLoading: false,

        async start(taskId) {
            this.fetching = true;
            try {
                this.task = deepSort(await fetchData(`/checklists/api/tasks/${taskId}/`), "id");
            }
            catch (error) { alert(error) }
            finally { this.fetching = false }
        },

        async submitOpenItem() {
            const payload = {
                submittedComments: this.openTaskItem.submitted_comments,
                action: "submit",
            }

            fetch(`/checklists/api/task-items/${this.openTaskItem.id}/submit/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            .then(response => response.json())
            .then(data => {
                
            })
            .catch(err => console.error('Upload error', err));
        },

        async undoSubmitOpenItem() {
            this.appLoading = true;

            const payload = {
                action: "submitUndo",
            }
            await fetch(`/checklists/api/task-items/${this.openTaskItem.id}/submit/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                .then(response => response.json())
                .then(data => {
                    
                })
                .catch(err => console.error('Upload error', err));
            this.appLoading = false;
        },

        async deletePhoto() {
            this.appLoading = true;

            await fetch(`/checklists/api/task-items/photo/${this.image.id}/delete/`, { method: 'POST' })
                .then(res => res.json())
                .then(res => {
                    if(!res.success) throw new Error(res.message);

                    const tobeDeleteIndex = this.openTaskItem.submitted_photos.indexOf(this.image);
                    if ( tobeDeleteIndex > -1) {
                        this.openTaskItem.submitted_photos.splice(tobeDeleteIndex, 1);
                    }
                    notyf.success("Delete Image");

                })
                .catch(err => alert(err));

            this.appLoading = false;
        },

        capturedImages: [],
        cameraActive: false,
        _facingMode: "environment",
        _cameraInactivityTimer: null,
        _resetCountDown: 10, //sec

        initCamera() {
            this.capturedImages = this.openTaskItem.submitted_photos;

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

        rotateCamera () {
            this._facingMode = (this._facingMode === "user") ? "environment" : "user";
        },

        snapImage() {
            if(!this.cameraActive) return;
            const formData = new FormData();
            Webcam.snap(async data_uri => {
                
                const res = await fetch(data_uri);
                const blob = await res.blob();

                formData.append(`submittedPhoto`, new File([blob], `taskItem_${this.openTaskItem.id}_${Date.now()}.jpg`, { type: 'image/jpeg' })); 

                this.appLoading = true;
                await fetch(`/checklists/api/task-items/${this.openTaskItem.id}/photo/upload/`, { method: 'POST', body: formData })
                .then(response => response.json())
                .then(res => {
                    if (!res.success) throw new Error();
                    this.capturedImages.push(
                        {id: res.data.id,original_path: data_uri, thumbnail_path: data_uri}
                    );
                })
                .catch(err => console.error('Upload error', err));

                this.appLoading = false;
                this._resetOnIdle();
            });
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
})

function deepSort(obj, key) {
    if (Array.isArray(obj)) {
        return obj.map(item => deepSort(item, key))
                .sort((a, b) => (a[key] > b[key] ? 1 : -1));
    } else if (typeof obj === 'object' && obj !== null) {
        for (let prop in obj) {
            obj[prop] = deepSort(obj[prop], key);
        }
    }
    return obj;
}
