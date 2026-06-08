const MyError = require("../../core/error.builder");
const supabase = require("../../core/supabase");
const templateModel = require("./template.model");

class TemplateService {
  #parseReferences = (obj, insertRefs) => {
    const parsed = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "object") {
        parsed[key] = this.#parseReferences(value, insertRefs);
      } else if (typeof value === "string" && value.startsWith("@")) {
        parsed[key] = insertRefs[value];
      } else {
        parsed[key] = value;
      }
    }
    return parsed;
  };

  #parseFilters = (obj, insertRefs) => {
    const parsedFilters = {};
    let parsedArray = {};

    for (const key in obj) {
      const value = obj[key];

      if (typeof value === "string" && value == "@id") {
        parsedFilters[key] = insertRefs[value];
      } else if (typeof value === "string" && value.startsWith("@")) {
        parsedArray = { col: key, value: insertRefs[value] };
      } else {
        parsedFilters[key] = value;
      }
    }

    return { filters: parsedFilters, array: parsedArray };
  };

  templatize = async (templateGuide, entityId) => {
    try {
      const templateJson = { records: [] };
      const insertRefs = { "@id": entityId };

      for (const table of templateGuide.tables) {
        // iterate each table and save the needed records

        // make a query to use for supabase
        const cols = table.columns.map((col) => col.name);
        cols.push("id");
        const select = cols.join(",");

        // parse the criteria to proper suapbase filter
        const { filters, array } = this.#parseFilters(
          table.criteria_col,
          insertRefs
        );

        const query = supabase.from(table.name).select(select);

        if (Object.keys(filters).length) query.match(filters);
        if (Object.keys(array).length) query.in(array.col, array.value);

        const { data: toTemplateArray, error } = await query;
        // data should have the records(plural, array) of the data to be templatize for each table

        if (error) throw error;
        if (!toTemplateArray.length) {
          console.log(
            ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n",
            `[WARN]: No record in ${table.name} matched the criteria for templating\n`,
            ">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n"
          );
          continue;
        }

        for (const record of toTemplateArray) {
          const entry = {};

          const colsToSave = table.columns;
          for (const col of colsToSave) {
            if (col.value.startsWith("@")) {
              // entry: {id: @value_reference} == record: {id: actualValue};
              entry[col.name] = `${col.value}_${record[col.name]}`;
            } else {
              // entry: {id: actualValue} == record: {id: actualValue};
              entry[col.name] = record[col.name];
            }
          }

          // pseudo template ID for foreign key reference
          const ref = `${table.ref}_${record.id}`;
          // store the id of the newly insert record
          if (!insertRefs[table.ref]) insertRefs[table.ref] = [];
          insertRefs[table.ref].push(record.id);
          // each saved record should have...
          templateJson.records.push({
            table: table.name, //table it is from
            ref, //it pseudo id for foreign reference
            entry, //its data/column/fields
          });
        }
      }

      return templateJson;
    } catch (err) {
      console.log(err);
      throw err;
    }
  };

  insertUsingTemplate = async (templateId) => {
    try {
      const template = await templateModel.findOne({
        filters: { id: templateId },
      });

      if (!template)
        throw new MyError({
          statusCode: 404,
          message: "Missing template",
          errorCode: "TEMPLATE_NOT_FOUND",
        });
      // check if template exists

      const insertRefs = {}; //local variable to store insert ids for referencing foreign relationships
      const insertedRecords = []; //the http return
      const toBeInsertedArray = template.value.records;

      for (const record of toBeInsertedArray) {
        const parsedEntry = this.#parseReferences(record.entry, insertRefs);

        const { data: inserted, error } = await supabase
          .from(record.table)
          .insert(parsedEntry)
          .select("id")
          .single();
        if (error) {
          error.error = "supabase_operation_error";
          throw error;
        }

        // store the id of the newly insert record
        insertRefs[record.ref] = inserted.id;

        // http return
        insertedRecords.push({ table: record.table, record: inserted });
      }

      return insertedRecords;
    } catch (err) {
      console.log(err);
      throw err;
    }
  };
}

module.exports = new TemplateService();
