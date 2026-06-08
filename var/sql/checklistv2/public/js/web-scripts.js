String.prototype.capitalize = function () {
  if (this.length === 0) return "";
  return this.charAt(0).toUpperCase() + this.slice(1);
};

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

let notyf = new Notyf({
    types: [
          {
            type: 'success',
            background: 'var(--bs-success)',
            duration: 2000,
            dismissible: true,
            position: {
              y: "top"
            }

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

async function getData(url) {
    try {
        const response = await fetch(url)
        const res = await response.json();
        if(res.success) return res.data
        throw new Error(res.message);
    } catch (error) {
        notyf.open({
            type: 'offline',
            message: "No Internet Connection! Check your network."
        });
        console.log(`Error occured while fetching:\n${url}\nError: ${error.message}`);
    }
}


async function postData(url, payload) {
  try {
      const response = await fetch(url, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)})
      const res = await response.json();
      if(res.success) return res.data
      throw new Error(res.message);
  } catch (error) {
      notyf.open({
          type: 'error',
          message: "Something went wrong!"
      });
      console.log(`Error occured while fetching:\n${url}\nError: ${error.message}`);
  }
}

async function postForm(url, payload) {
  try {
      const response = await fetch(url, { method: "POST", body: payload})
      const res = await response.json();
      if(res.success) return res.data
      throw new Error(res.message);
  } catch (error) {
      notyf.open({
          type: 'offline',
          message: "No Internet Connection! Check your network."
      });
      console.log(`Error occured while fetching:\n${url}\nError: ${error.message}`);
  }
}

// Defines All List Js


function statusBadgeFormatter(status, completed_by) {
  const error = `
    <span class="badge text-bg-light border border-dark-subtle rounded-pill small ">Undefined</span>
  `;
  const badges = {
      "waiting": `<span class="badge badge-${status} rounded-pill small">${status}</span>`,
      "inprogress": `<span class="badge badge-${status} rounded-pill small border border-dark-subtle">${status}</span>`,
      "submitted": `<span class="badge badge-${status} rounded-pill small">${status}</span>`,
      "approved": `<span class="badge badge-${status} rounded-pill small" title="${completed_by}">${status}</span>`,
      "completed": `<span class="badge badge-${status} rounded-pill small" title="${completed_by}">${status}</span>`,
      "rejected": `<span class="badge badge-${status} rounded-pill small">needs rework</span>`,
      "cancelled": `<span class="badge badge-${status} rounded-pill small">${status}</span>`
  };
  return badges[status] || error;
}

function statusIconFormatter(status, btnSm = true) {
  const error = `
    <span class="btn btn-light border border-dark-subtle" title="Status: Undefined">
          <i class="bi bi-question-circle"></i>
    </span>
  `;
  const icons = {
      "inprogress": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-dark text-black"
                            ><i class="bi bi-wrench-adjustable"></i> ${status.capitalize()}
                    </span>`,
      "submitted": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-warning"
                            ><i class="bi bi-send-check"></i> ${status.capitalize()}
                    </span>`,
      "approved": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-success"
                            ><i class="bi bi-check2-circle"></i> ${status.capitalize()}
                    </span>`,
      "completed": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-success"
                            ><i class="bi bi-check2-circle"></i> ${status.capitalize()}
                    </span>`,
      "rejected": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-danger"
                            ><i class="bi bi-arrow-repeat"></i> ${status.capitalize()}
                    </span>`,
      "cancelled": `<span class="btn ${btnSm ? "btn-sm": ""} disabled btn-outline-secondary"
                            ><i class="bi bi-slash-square"></i> ${status.capitalize()}
                    </span>`,
  };
  return icons[status] || error;
}



function forceCompleteLinkFormatter(entity, entityName, btnSm = true, entityAlias = null) {
  const error = `
      <a href="#" class="link-danger small link-underline-opacity-0">
              Undefine
              </a>
  `;

  // if button entity is completed but 
  const use = (entity.STATUS === "completed" && entity.COMPLETED_BY !== "force") ? "disabled" : String(entity.force_completed);


  const buttons = {
      "disabled": `<a class="link-secondary small"
                          title="Completed via ${entity.COMPLETED_BY}"
                          style="cursor: help;">
                          Completed
                          </a>`,
    // cancel
      "true": `<a href="#" class="link-primary small link-underline-opacity-0"
                        @click.prevent="forceComplete(${entityAlias || entityName}, '${entityName}', true)">
                        Undo
                        </a>`,
      "false": `<a href="#" class="link-warning text-warning-emphasis small link-underline-opacity-0"
                        @click.prevent="forceComplete(${entityAlias || entityName}, '${entityName}')">
                        Force
                        </a>`,
  };

  return buttons[use] || error;
}

function forceCompleteActionButtonFormatter(entity, entityName, btnSm = true, entityAlias = null) {
  const error = `
      <button class="btn btn-sm btn-warning"
              title="Undefined status">
              <i class="bi bi-question-circle"></i>
              </button>
  `;

  // if button entity is completed but 
  const use = (entity.STATUS === "completed" && entity.COMPLETED_BY !== "force") ? "disabled" : String(entity.force_completed);


  const buttons = {
      "disabled": `<button  class="btn btn-success ${btnSm ? "btn-sm": ""}  opacity-50"
                          title="Completed via ${entity.COMPLETED_BY}"
                          style="cursor: help;">
                          <i class="bi bi-calendar2-check"></i>
                          </button>`,
    // cancel
      "true": `<button  class="btn btn-secondary ${btnSm ? "btn-sm": ""}"
                        title="Undo Force Complete"
                        @click="forceComplete(${entityAlias || entityName}, '${entityName}', true)">
                        <i class="bi bi-backspace"></i>
                        </button>`,
      "false": `<button  class="btn btn-warning ${btnSm ? "btn-sm": ""}"
                        title="Force Complete"
                        @click="forceComplete(${entityAlias || entityName}, '${entityName}')">
                        <i class="bi bi-calendar2-check"></i>
                        </button>`,
  };

  return buttons[use] || error;
}



function utc2Georgia(utcStr) {
  const date = new Date(utcStr);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.month} ${parts.day} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}
