const supabase = require("./supabase");
const {
  supabaseErrorHandler,
  modelErrorWrapper,
  joiValidateData,
  transformFetchedData,
} = require("../utils/model.utils");
const isValidObject = require("../utils/isValidObject");

class BaseModel {
  table;
  insertSchema;
  updateSchema;
  transformations;

  raw = () => {
    return supabase.from(this.table);
  };

  all = async ({
    columns = "*",
    filters = {},
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  } = {}) => {
    try {
      let query = supabase
        .from(this.table)
        .select(columns)
        .order("id", { ascending: true });

      if (isValidObject(filters)) query = query.match(filters);
      const { data, error, status } = await query;

      if (error) throw supabaseErrorHandler(error, status);

      return transformFetchedData({
        transformations: this.transformations,
        data,
        includeTransform,
        excludeTransform,
        disableTransform,
      });
    } catch (err) {
      throw modelErrorWrapper(err, "Error fetching all rows");
    }
  };

  findOne = async ({
    columns = "*",
    filters,
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    try {
      const { data, error, status } = await supabase
        .from(this.table)
        .select(columns)
        .match(filters)
        .maybeSingle();

      if (error) throw supabaseErrorHandler(error, status);
      return transformFetchedData({
        transformations: this.transformations,
        data,
        includeTransform,
        excludeTransform,
        disableTransform,
      });
    } catch (err) {
      throw modelErrorWrapper(err, "Error fetching single row");
    }
  };

  findMany = async ({
    columns = "*",
    filters,
    order = ["id", { ascending: true }],
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    try {
      const { data, error, status } = await supabase
        .from(this.table)
        .select(columns)
        .match(filters)
        .order(order[0], order[1]);

      if (error) throw supabaseErrorHandler(error, status);
      return transformFetchedData({
        transformations: this.transformations,
        data,
        includeTransform,
        excludeTransform,
        disableTransform,
      });
    } catch (err) {
      throw modelErrorWrapper(err, "Error fetching multiple rows");
    }
  };

  findManyFromArray = async ({
    columns = "*",
    filters,
    array,
    arrayFilter = "id",
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    try {
      let query = supabase
        .from(this.table)
        .select(columns)
        .in(arrayFilter, array)
        .order("id", { ascending: true });

      if (isValidObject(filters)) query = query.match(filters);
      const { data, error, status } = await query;

      if (error) throw supabaseErrorHandler(error, status);
      return transformFetchedData({
        transformations: this.transformations,
        data,
        includeTransform,
        excludeTransform,
        disableTransform,
      });
    } catch (err) {
      throw modelErrorWrapper(err, "Error fetching multiple rows");
    }
  };

  findManyFromArrayNot = async ({
    columns = "*",
    filters,
    array,
    arrayFilter = "id",
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    try {
      let query = supabase
        .from(this.table)
        .select(columns)
        .not(arrayFilter, "in", `(${array.join(",")})`)
        .order("id", { ascending: true });

      if (isValidObject(filters)) query = query.match(filters);
      const { data, error, status } = await query;

      if (error) throw supabaseErrorHandler(error, status);
      return transformFetchedData({
        transformations: this.transformations,
        data,
        includeTransform,
        excludeTransform,
        disableTransform,
      });
    } catch (err) {
      throw modelErrorWrapper(err, "Error fetching multiple rows");
    }
  };

  findOneForeign = async ({
    foreignModel,
    columns = "*",
    internalKey,
    foreignInternalKey,
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    const { [foreignInternalKey]: targetId } = await this.findOne({
      filters: { id: internalKey },
      columns: foreignInternalKey,
      disableTransform: true,
    });

    if (!targetId) throw new Error("No internal foreign key found.");

    const data = await foreignModel.findOne({
      columns,
      filters: { id: targetId },
      includeTransform,
      excludeTransform,
      disableTransform,
    });

    return data;
  };

  findManyForeign = async ({
    foreignModel,
    columns = "*",
    order,
    filters,
    includeTransform = [],
    excludeTransform = [],
    disableTransform = false,
  }) => {
    const data = await foreignModel.findMany({
      columns,
      filters,
      order,
      includeTransform,
      excludeTransform,
      disableTransform,
    });

    return data;
  };

  insertOne = async ({ columns = "*", entry }) => {
    try {
      entry = joiValidateData(this.insertSchema, entry);

      const { data, error, status } = await supabase
        .from(this.table)
        .insert([entry])
        .select(columns)
        .maybeSingle();

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error inserting single row");
    }
  };

  insertMany = async ({ columns = "*", entries }) => {
    try {
      entries = joiValidateData(this.insertSchema, entries);
      const { data, error, status } = await supabase
        .from(this.table)
        .insert(entries)
        .select(columns)
        .order("id", { ascending: true });

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error inserting multiple rows");
    }
  };

  updateOne = async ({ columns = "*", filters, updates }) => {
    try {
      console.log(updates);

      updates = joiValidateData(this.updateSchema, updates);
      const { data, error, status } = await supabase
        .from(this.table)
        .update(updates)
        .match(filters)
        .select(columns)
        .maybeSingle();

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error updating single row");
    }
  };

  updateMany = async ({ columns = "*", filters, updates }) => {
    try {
      updates = joiValidateData(this.updateSchema, updates);
      const { data, error, status } = await supabase
        .from(this.table)
        .update(updates)
        .match(filters)
        .select(columns)
        .order("id", { ascending: true });

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error updating multiple rows");
    }
  };

  deleteOne = async ({ columns = "*", filters }) => {
    try {
      const { data, error, status } = await supabase
        .from(this.table)
        .delete()
        .match(filters)
        .select(columns)
        .maybeSingle();

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error deleting single row");
    }
  };

  deleteMany = async ({ columns = "*", filters }) => {
    try {
      const { data, error, status } = await supabase
        .from(this.table)
        .delete()
        .match(filters)
        .select(columns)
        .order("id", { ascending: true });

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(err, "Error deleting multiple rows");
    }
  };

  deleteManyFromArray = async ({
    columns = "*",
    filters,
    array,
    arrayFilter = "id",
  }) => {
    try {
      let query = supabase
        .from(this.table)
        .delete()
        .in(arrayFilter, array)
        .select(columns)
        .order("id", { ascending: true });

      if (isValidObject(filters)) query = query.match(filters);
      const { data, error, status } = await query;

      if (error) throw supabaseErrorHandler(error, status);
      return data;
    } catch (err) {
      throw modelErrorWrapper(
        err,
        "Error deleting multiple rows from an array"
      );
    }
  };
}

module.exports = BaseModel;
