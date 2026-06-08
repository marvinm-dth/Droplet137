const entityRelationModel = require("../domain/entity-relation/entity-relation.model");
const BaseModel = require("./base.model");
const supabase = require("./supabase");
const debug = false;

function logger(label, payload) {
  const timestamp = new Date().toISOString();
  // console.log(`[${timestamp}] ${label}:`, JSON.stringify(payload, null, 2));
  console.log(`[${timestamp}] performing: ${label}:`);
}

const defaultComputedValues = {
  status: "ongoing",
  completed_at: null,
  completed_by: [],
};

// change here
const transformTest = async ({ data, a = "3", b = "4" }) => {
  const transformation = (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj.computed };

    dataObj.computed = {
      a,
      b,
    };
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

const simulateStatusFromSelfComplete = async ({ data }) => {
  const transformation = (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj.computed };

    if (true) {
      dataObj.computed = {
        status: Math.floor(Math.random() + 0.5) ? "completed" : "ongoing",
        completed_at: null,
        completed_by: ["self", ...dataObj?.computed?.completed_by],
      };
    }
  };

  if (debug) logger("deriveStatusFromSelfComplete", data);

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

// table.status
const deriveStatusFromSelfComplete = async ({ data }) => {
  const transformation = (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj.computed };

    if (dataObj?.status === "approved") {
      dataObj.computed = {
        status: "completed",
        completed_at: dataObj?.completed_at,
        completed_by: ["self", ...dataObj?.computed?.completed_by],
      };
    }
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

const deriveStatusFromForceComplete = async ({ data }) => {
  const transformation = (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj?.computed };
    if (dataObj?.force_completed) {
      dataObj.computed = {
        status: "completed",
        completed_at: dataObj?.force_completed_at,
        completed_by: ["force", ...dataObj?.computed?.completed_by],
      };
    }
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

const deriveStatusFromAscendantForceComplete = async ({
  data,
  model,
  aTree = [],
}) => {
  const transformation = async (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj.computed };

    const queryTree = aTree
      .slice()
      .reverse()
      .reduce((acc, item) => {
        if (item === "workshop") return acc;
        return `dev_${item}s(force_completed, force_completed_at, ${acc})`;
      }, "force_completed");

    const temporaryModel = new BaseModel();
    temporaryModel.table = model.table;

    const ascendantData = await temporaryModel.findOne({
      filters: { id: dataObj.id },
      columns: queryTree,
    });

    const ascendantForceCompleted = JSON.stringify(ascendantData).includes(
      '"force_completed":true'
    );

    let latestCompletion = data?.force_completed_at || null;

    const checkSelfAndParentIfComplete = (data, path) => {
      if (
        !latestCompletion ||
        (data?.force_completed_at &&
          new Date(latestCompletion).getTime() <
            new Date(data?.force_completed_at).getTime())
      ) {
        latestCompletion = data?.force_completed_at;
      }

      if (!path.length) return;
      checkSelfAndParentIfComplete(data[`dev_${path[0]}s`], path.slice(1));
    };

    checkSelfAndParentIfComplete(ascendantData, aTree);

    if (ascendantForceCompleted) {
      dataObj.computed = {
        ...dataObj.completed,
        status: "completed",
        completed_at: latestCompletion,
        completed_by: ["ascendant", ...dataObj?.computed?.completed_by],
      };
    }
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return await transformation(data);
  }
};

const deriveStatusFromDescendantsStatus = async ({
  data,
  model,
  dTree = [],
}) => {
  const transformation = async (dataObj) => {
    dataObj.computed = { ...defaultComputedValues, ...dataObj?.computed };

    const queryTree = dTree
      .slice()
      .reverse()
      .reduce(
        (acc, item) =>
          `dev_${item}s(force_completed, force_completed_at, ${acc})`,
        "force_completed"
      );

    const temporaryModel = new BaseModel();
    temporaryModel.table = model.table;

    const descendantData = await temporaryModel.findOne({
      filters: { id: dataObj.id },
      columns: queryTree,
    });

    if (
      Array.isArray(descendantData[`dev_${dTree[0]}s`]) &&
      !descendantData[`dev_${dTree[0]}s`].length
    )
      return;

    let latestCompletion;

    const checkSelfAndChildIfComplete = (data, path) => {
      if (
        !latestCompletion ||
        (data?.force_completed_at &&
          new Date(latestCompletion).getTime() <
            new Date(data?.force_completed_at).getTime())
      ) {
        latestCompletion = data?.force_completed_at;
      }

      if (data?.force_completed) return true;

      if (!path.length) return false;

      const children = data[`dev_${path[0]}s`];
      if (!children || children.length === 0) return false;

      return children.every((node) =>
        checkSelfAndChildIfComplete(node, path.slice(1))
      );
    };

    const descendantCompleted = checkSelfAndChildIfComplete(
      descendantData,
      dTree
    );

    if (descendantCompleted) {
      dataObj.computed = {
        ...dataObj.computed,
        status: "completed",
        completed_at: latestCompletion,
        completed_by: ["descendant", ...dataObj?.computed?.completed_by],
      };
    }
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return await transformation(data);
  }
};

const deriveStatusFromDependency = async ({ data, model }) => {
  const transformation = async (dataObj) => {
    const blockers = await entityRelationModel.getBlocking({
      targetModel: model,
      targetId: dataObj.id,
      includeTransform: [
        "deriveStatusFromSelfComplete",
        "deriveStatusFromForceComplete",
        "deriveStmDatusFromAscendantForceComplete",
        "deriveStatusFroescendantsStatus",
        "deriveStatusFromDependency",
      ],
    });

    const blockersIncomplete = blockers.some(
      (relation) => relation.computed.status !== "completed"
    );

    if (blockers.length && blockersIncomplete) {
      dataObj.computed = {
        ...dataObj.computed,
        status: "upcoming",
        completed_at: null,
        completed_by: [],
      };
    }
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return await transformation(data);
  }
};

const includeAscendantData = async ({ data, model, aTree }) => {
  const transformation = async (dataObj) => {
    dataObj.ascendant = {};
    aTree.forEach((node) => {
      dataObj.ascendant[node] = {};
    });

    const queryTree = aTree
      .slice()
      .reverse()
      .reduce(
        (acc, item) => `${item}:dev_${item}s(id, name_en, name_zh, ${acc})`,
        "id"
      );

    const temporaryModel = new BaseModel();
    temporaryModel.table = model.table;

    const ascendantData = await temporaryModel.findOne({
      columns: queryTree,
      filters: { id: dataObj.id },
      excludeTransform: ["includeAscendantData"],
    });

    const constructAscendant = (data, ascendantData, path) => {
      const [head, ...rest] = path;
      if (rest.length > 0) {
        constructAscendant(data, ascendantData[head], rest);
        delete ascendantData[head][rest[0]];
      }
      data.ascendant[head] = ascendantData[head];
    };

    constructAscendant(dataObj, ascendantData, aTree);
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

const includeDescendantData = async ({ data, model, dTree }) => {
  const transformation = async (dataObj) => {
    dataObj.descendant = {};
    dTree.forEach((node) => {
      dataObj.descendant[node] = [];
    });

    // Recursive GraphQL-like query builder for descendants
    const buildQueryTree = (tree) => {
      if (tree.length === 0) return "id, name_en, name_zh";
      const [head, ...rest] = tree;
      return `${head}:dev_${head}s(id, name_en, name_zh, ${buildQueryTree(
        rest
      )})`;
    };

    const queryTree = buildQueryTree(dTree);

    const temporaryModel = new BaseModel();
    temporaryModel.table = model.table;

    const descendantData = await temporaryModel.findOne({
      columns: queryTree,
      filters: { id: dataObj.id },
      excludeTransform: ["includeDescendantData"],
    });

    const constructDescendant = (data, nodeData, path) => {
      const [currentKey, ...rest] = path;
      const items = nodeData[currentKey];

      if (!Array.isArray(items)) return;

      // Ensure this level exists in descendant object
      if (!data.descendant[currentKey]) {
        data.descendant[currentKey] = [];
      }

      for (const item of items) {
        // Create a shallow copy and remove its nested children
        const cleanItem = { ...item };
        if (rest.length > 0) {
          const nextKey = rest[0];
          delete cleanItem[nextKey]; // remove nested children
        }

        // Push cleaned item to current level
        data.descendant[currentKey].push(cleanItem);

        // Recurse into next level using original item (with children)
        constructDescendant(data, item, rest);
      }
    };

    constructDescendant(dataObj, descendantData, dTree);
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

// will not work
const includeRelationData = async ({ data, model }) => {
  const transformation = async (dataObj) => {
    const blocking = await entityRelationModel.getBlocking({
      targetModel: model,
      targetId: dataObj?.id,
      includeTransform: [
        "deriveStatusFromSelfComplete",
        "deriveStatusFromForceComplete",
        "deriveStatusFromAscendantForceComplete",
        "deriveStatusFromDescendantsStatus",
        "deriveStatusFromDependency",
      ],
    });

    const blockers = await entityRelationModel.getBlocking({
      targetModel: model,
      targetId: dataObj?.id,
      includeTransform: [
        "deriveStatusFromSelfComplete",
        "deriveStatusFromForceComplete",
        "deriveStatusFromAscendantForceComplete",
        "deriveStatusFromDescendantsStatus",
        "deriveStatusFromDependency",
      ],
    });

    dataObj.relations = {
      blockers: blocking,
      blocking: blockers,
    };
  };

  if (Array.isArray(data)) {
    return await Promise.all(data.map(transformation));
  } else {
    return transformation(data);
  }
};

module.exports = {
  simulateStatusFromSelfComplete, //
  transformTest,

  deriveStatusFromSelfComplete, //
  deriveStatusFromForceComplete, //
  deriveStatusFromAscendantForceComplete, //
  deriveStatusFromDescendantsStatus, //
  deriveStatusFromDependency,

  includeAscendantData, //
  includeDescendantData, //
  includeRelationData, //
};
