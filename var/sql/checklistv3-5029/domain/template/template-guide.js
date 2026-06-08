exports.thowTemplateGuide = {
  tables: [
    {
      name: "dev_thows",
      ref: "@dev_thows",
      criteria_col: {
        id: "@id",
      },
      columns: [
        {
          name: "internal_name",
          value: "default",
        },
        {
          name: "name_en",
          value: "default",
        },
        {
          name: "name_zh",
          value: "default",
        },
      ],
    },
  ],
};

exports.projectTemplateGuide = {
  tables: [
    {
      name: "dev_projects",
      ref: "@dev_projects",
      criteria_col: {
        id: "@id",
      },
      columns: [
        {
          name: "name_en",
          value: "default",
        },
        {
          name: "name_zh",
          value: "default",
        },
      ],
    },
    {
      name: "dev_dynamic_fields",
      ref: "@dev_dynamic_fields",
      criteria_col: {
        entity_id: "@id",
        entity_type: "dev_projects",
      },
      columns: [
        { name: "entity_type", value: "default" },
        { name: "entity_id", value: "@dev_projects" },
        { name: "label_en", value: "default" },
        { name: "label_zh", value: "default" },
        { name: "value", value: "default" },
      ],
    },
    {
      name: "dev_media_attachments",
      ref: "@dev_media_attachments",
      criteria_col: {
        entity_id: "@dev_dynamic_fields",
        entity_type: "dev_dynamic_fields",
      },
      columns: [
        { name: "media_id", value: "default" },
        { name: "entity_type", value: "default" },
        { name: "entity_id", value: "@dev_dynamic_fields" },
        { name: "purpose", value: "default" },
      ],
    },
  ],
};
