const supabase = require("../utils/supabaseClient");

class ItemModel {
  static tableName = 'all_items';

  // Insert a single item
  static async insertOne(insertData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert([insertData])
        .select(); // Returns the inserted item(s)

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Insert multiple items
  static async insertMany(insertDataArray) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert(insertDataArray)
        .select(); // Returns the inserted item(s)

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Update: Update an item by ID
  static async update(id, updateData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select(`*,
        all_template_items(*),
        completer:all_employees!completed_by(employee_name),
        approver:all_employees!approved_by(employee_name),
        rejector:all_employees!rejected_by(employee_name)
      `)
        .single(); // Ensure only one item is returned

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Delete: Delete an item by ID
  static async delete(id) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get all items
  static async getAll() {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .order('id', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get an item by ID
  static async getById(id) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select(`*,
        checklist:all_checklists(name),
        template_item:all_template_items(*),
        completer:all_employees!completed_by(employee_id),
        approver:all_employees!approved_by(employee_id),
        rejector:all_employees!rejected_by(employee_id)
      `)
        .eq('id', id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get items by filter
  static async getByFilter(filters) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select(`*,
        checklist:all_checklists(name),
        template_item:all_template_items(*),
        completer:all_employees!completed_by(employee_name),
        approver:all_employees!approved_by(employee_name),
        rejector:all_employees!rejected_by(employee_name)
      `)
        .match(filters)
        .order('id', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ItemModel;
