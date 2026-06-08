document.addEventListener('alpine:init', () => {
  Alpine.data('adminDashboard', () => ({
    appLoading: false,
    initialFetching: false,
    authUser: null,

    projects: [],
    taskChecklists: [],

    async start() {
      this.appLoading = true;
      this.initialFetching = true,

      this.authUser = await getData(`/checklists/api/myself/`);
      this.projects = await getData(`/checklists/api/projects/`);
      this.taskChecklists = await getData(`/checklists/api/task-checklists/`);

      this.initialFetching = false,
      this.appLoading = false;
    },
  }))
})
