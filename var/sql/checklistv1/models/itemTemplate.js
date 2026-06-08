const supabase = require("../utils/supabaseClient");

class ItemTemplateModel {
  static tableName = 'all_template_items';

  // Insert a single item template
  static async insertOne(insertData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert([insertData])
        .select('*'); // Returns the inserted row(s)

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Insert multiple item templates
  static async insertMany(insertDataArray) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert(insertDataArray)
        .select('*'); // Returns the inserted rows

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Update: Update an item template by ID
  static async update(id, updateData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select('*') // Returns the updated row(s)
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Delete: Delete an item template by ID
  static async delete(id) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', id)
        .select('*'); // Returns the deleted row(s)

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get all item templates
  static async getAll() {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .order('id', { ascending: true }); // Returns all rows sorted by ID

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get an item template by ID
  static async getById(id) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*') // Returns the row matching the ID
        .eq('id', id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get item templates by filter
  static async getByFilter(filterData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*') // Returns rows matching the filter
        .match(filterData)
        .order('id', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ItemTemplateModel;
