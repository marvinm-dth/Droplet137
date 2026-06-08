// This is a base model.
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { debugLog } = require('../helpers/debug.helper');

// const supabaseUrl = process.env.SUPABASE_URL;
const supabaseUrl = "http://137.184.148.164:8000/";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const logging = false;

class SBModel {
  constructor(table, entityViewModel) {
    if (!table) throw new Error("Table name must be provided.");
    this.table = table;
    this.entityViewModel = entityViewModel;
  }

  #logs(method, payload = {}) {
    console.log(`\x1b[36m[LOG] ${method} called`);
    console.log(`Table: `);
    for (const [key, value] of Object.entries(payload)) {
      console.log(`${key}: ${value}`);
    }
    console.log(`\x1b[ in "${this.table}"0m`);
  }

  #mapToViewModel(data, initialQuery = "*", caller) {
    // return if empty
    if (!(data && (Array.isArray(data) ? data.length : Object.keys(data).length))) return [];
    try {
      const computedData = this.entityViewModel({data: data, parent: null});
      return Array.isArray(data) ? computedData : computedData[0];
    } catch (error) {
      debugLog("danger", `Error while mapping data:`)
      debugLog("danger", `Table: `, this.table)
      debugLog("danger", `Message: `, error.message)
      debugLog("danger", `Caller: `, caller)
      // debugLog("error", `Initial Query: `, initialQuery)
      return data;
    }
  }

  raw(){
    return supabase.from(this.table);
  }


  // Get all records
  async getById(id, fields = "id") {
    const methodName = "getById";
    if(logging) this.#logs(methodName, { id, fields });

    const { data, error } = await supabase
      .from(this.table)
      .select(fields)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "getById")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "getById" in "${this.table}"`)
    }

    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Get all records
  async getAll(fields = "id") {
    const methodName = "getAll";
    if(logging) this.#logs(methodName, { fields });


    const { data, error } = await supabase
      .from(this.table)
      .select(fields)
      .order('id', { ascending: true });;

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "getAll")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "getAll" in "${this.table}"`)
    }
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Get records by a filter
  async getByFilter(filter, fields = "id") {
    const methodName = "getByFilter";
    if(logging) this.#logs(methodName, { filter, fields });

    const { data, error } = await supabase
      .from(this.table)
      .select(fields)
      .match(filter)
      .order('id', { ascending: true });

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "getByFilter")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "getByFilter" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Insert a new record
  async insert(record, fields = "id") {
    const methodName = "insert";
    if(logging) this.#logs(methodName, { record, fields });

    const { data, error } = await supabase
      .from(this.table)
      .insert(record)
      .select(fields)
      .maybeSingle();

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "insert")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "insert" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }


  async insertMany(records, fields = "id") {
    const methodName = "insertMany";
    if(logging) this.#logs(methodName, { records, fields });


    const { data, error } = await supabase
      .from(this.table)
      .insert(records)
      .select(fields);

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "insertMany")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "insertMany" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Update a record by ID
  async update(id, updates, fields = "id") {
    const methodName = "update";
    if(logging) this.#logs(methodName, { id, updates, fields });
    const { data, error } = await supabase
      .from(this.table)
      .update(updates)
      .eq("id", id)
      .select(fields)
      .maybeSingle();

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "update")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "update" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Update a record by ID
  async updateMany(filter, updates, fields = "id") {
    const methodName = "delete";
    if(logging) this.#logs(methodName, { filter, updates, fields });

    const { data, error } = await supabase
      .from(this.table)
      .update(updates)
      .match(filter)
      .select(fields);

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "updateMany")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "updateMany" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  async updateManyIn(filter, updates, filterIn, fields = "id") {
    const methodName = "delete";
    if(logging) this.#logs(methodName, { filter, updates, fields });

    const { data, error } = await supabase
      .from(this.table)
      .update(updates)
      .match(filter)
      .in(filterIn[0], filterIn[1])
      .select(fields);

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "updateMany")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "updateMany" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  // Delete a record by ID
  async delete(id, fields = "id") {
    const methodName = "delete";
    if(logging) this.#logs(methodName, { id, fields });const { data, error } = await supabase

      .from(this.table)
      .delete()
      .eq("id", id)
      .select(fields)
      .maybeSingle()

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "delete")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "delete" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  async deleteMany(filter, fields = "id") {
    const methodName = "deleteMany";
    if(logging) this.#logs(methodName, { filter, fields });

    const { data, error } = await supabase
      .from(this.table)
      .delete()
      .match(filter)
      .select(fields);

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "deleteMany")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "deleteMany" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }

  async deleteManyIn(filter, filterIn, fields = "id") {
    const methodName = "deleteMany";
    if(logging) this.#logs(methodName, { filter, fields });

    const { data, error } = await supabase
      .from(this.table)
      .delete()
      .match(filter)
      .in(filterIn[0], filterIn[1])
      .select(fields);

    if (error) {
      debugLog("error", `Error while fetching data:`)
      debugLog("error", `Function: `, "deleteMany")
      debugLog("error", `Table: `, this.table)
      debugLog("error", `Message: `, error.message)
      throw error;
    }

    if(!data) {
      debugLog("warning", `No fetched data for "deleteMany" in "${this.table}"`)
    }

    
    return fields === "id" ? data : this.#mapToViewModel(data, fields, methodName);
  }
}

module.exports = SBModel;