(() => {
  const dataEl = document.getElementById("projects-data");
  const root = document.getElementById("projects-root");
  if (!root) return;

  let data = null;
  try {
    data = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};
  } catch (err) {
    root.textContent = "Failed to load projects data.";
    return;
  }

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  };

  const renderMessage = () => {
    const message = data?.message;
    if (!message) return null;
    return el("div", { class: "notice", text: message });
  };

  const renderErrors = () => {
    const errors = Array.isArray(data?.errors) ? data.errors : [];
    if (!errors.length) return null;
    return el(
      "div",
      { class: "notice notice-error" },
      errors.map((err) => el("div", { text: err }))
    );
  };

  const renderProjectList = (title, projects) => {
    const list = Array.isArray(projects) ? projects : [];
    if (!list.length) {
      return el("section", { class: "panel" }, [
        el("h2", { text: title }),
        el("p", { class: "subtle", text: "No projects found." }),
      ]);
    }

    return el("section", { class: "panel" }, [
      el("h2", { text: title }),
      el(
        "div",
        { class: "project-list" },
        list.map((project) =>
          el("a", { class: "project-card", href: `/projects/${project.project_code}` }, [
            el("div", { class: "project-card-title", text: project.project_code }),
            el("div", { class: "subtle", text: project.description || "" }),
            el("div", { class: "project-meta", text: `Updated: ${formatDate(project.updated_at)}` }),
          ])
        )
      ),
    ]);
  };

  const renderSelectedProject = () => {
    const project = data?.selected_project;
    if (!project) {
      return el("section", { class: "panel" }, [
        el("h2", { text: "Project details" }),
        el("p", { class: "subtle", text: "Select a project to view tickets." }),
      ]);
    }

    const tickets = Array.isArray(data?.ticket_pairs) ? data.ticket_pairs : [];
    return el("section", { class: "panel" }, [
      el("h2", { text: `Project ${project.project_code}` }),
      el("p", { text: project.description || "No description." }),
      el("div", { class: "project-meta", text: `Status: ${project.status}` }),
      el("div", { class: "project-meta", text: `Updated: ${formatDate(project.updated_at)}` }),
      el("h3", { text: "Tickets" }),
      tickets.length
        ? el(
            "div",
            { class: "ticket-list" },
            tickets.map((pair) => {
              const ticket = pair.base;
              if (!ticket) return null;
              return el("div", { class: "ticket-card" }, [
                el("div", { class: "ticket-title", text: ticket.name || ticket.dth_number || "Untitled ticket" }),
                el("div", { class: "subtle", text: ticket.template?.template_code || "" }),
                el("div", { class: "ticket-meta", text: `Status: ${ticket.status}` }),
              ]);
            })
          )
        : el("p", { class: "subtle", text: "No tickets yet." }),
    ]);
  };

  root.innerHTML = "";
  root.appendChild(
    el("div", { class: "projects-layout" }, [
      el("div", { class: "stack" }, [
        renderMessage(),
        renderErrors(),
        renderProjectList("Active projects", data?.projects),
        renderProjectList("Archived projects", data?.archived_projects),
      ]),
      el("div", { class: "stack" }, [renderSelectedProject()]),
    ])
  );
})();
