document.addEventListener('alpine:init', () => {
  Alpine.data('workerDashboard', () => ({
    appLoading: false,
    initialFetching: false,
    authUser: null,

    projects: [],
    tasks: [],

    openProject: {},
    openMilestone: {},

    async start() {
      this.appLoading = true;
      this.initialFetching = true,

      this.authUser = await getData(`/checklists/api/myself/`);
      this.projects = await getData(`/checklists/api/myself/projects/`);
      this.tasks = await getData(`/checklists/api/myself/tasks/`);

      // const time = this.task?.task_checklist[0].task_items[0].submitted_at
      console.log(this.tasks);
      // console.log(utc2Georgia(time));

      this.initialFetching = false,
      this.appLoading = false;
    },

    // filterProjects(projects, mode) {
    //   if (project.STATUS !== "complete") return false;

    //   const now = new Date();
    
    //   const startOfToday = new Date(now);
    //   startOfToday.setHours(0, 0, 0, 0);
    
    //   const endOfToday = new Date(startOfToday);
    //   endOfToday.setDate(endOfToday.getDate() + 1);
    
    //   const startOfWeek = new Date(now);
    //   startOfWeek.setDate(now.getDate() - startOfWeek.getDay()); // Sunday
    //   startOfWeek.setHours(0, 0, 0, 0);
    
    //   const endOfWeek = new Date(startOfWeek);
    //   endOfWeek.setDate(endOfWeek.getDate() + 7);
    
    //   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    //   const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    //   return projects.filter((project) => {
    //     const completedAtStr = project.force_completed
    //       ? project.force_completed
    //       : project.LATEST_COMPLETED_ITEM?.COMPLETED_AT;
    
    //     if (!completedAtStr) return false;
    
    //     const completedDate = new Date(completedAtStr);
    
    //     switch (mode) {
    //       case "today":
    //         return completedDate >= startOfToday && completedDate < endOfToday;
    
    //       case "thisWeek":
    //         return completedDate >= startOfWeek && completedDate < endOfWeek;
    
    //       case "thisMonth":
    //         return completedDate >= startOfMonth && completedDate < startOfNextMonth;
    
    //       case "all":
    //       default:
    //         return true;
    //     }
    //   });
    // },


    filterTasks(tasks, mode) {

      const now = new Date();
    
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
    
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
    
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
    
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
    
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
      const result = tasks.filter((task) => {
        if(task.STATUS !== "completed") return false;

        const completedAtStr = task.COMPLETED_AT
    
        if (!completedAtStr) return false;
    
        const completedDate = new Date(completedAtStr);
    
        switch (mode) {
          case "today":
            return completedDate >= startOfToday && completedDate < endOfToday;
    
          case "thisWeek":
            return completedDate >= startOfWeek && completedDate < endOfWeek;
    
          case "thisMonth":
            return completedDate >= startOfMonth && completedDate < startOfNextMonth;
    
          case "all":
          default:
            return true;
        }
      });

      return result.sort((a, b) => new Date(b.COMPLETED_AT) - new Date(a.COMPLETED_AT));;
    }
  }))
})
