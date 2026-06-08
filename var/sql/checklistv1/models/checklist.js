const supabase = require("../utils/supabaseClient");

class ChecklistModel {
  static tableName = 'all_checklists';

  // Insert a single checklist
  static async insertOne(insertData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert([insertData])
        .select();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Insert multiple checklists
  static async insertMany(insertDataArray) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .insert(insertDataArray)
        .select();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Update: Update a checklist entry by ID
  static async update(id, updateData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Delete: Delete a checklist entry by ID
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

  // Read: Get all checklist entries
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

  // Read: Get a checklist by ID
  static async getById(id) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select(`*,
        all_projects(project_name),
        all_template_checklists(name, description_en, description_cn),
        all_items(*,
          all_template_items(*),
          completer:all_employees!completed_by(employee_id),
          approver:all_employees!approved_by(employee_id),
          rejector:all_employees!rejected_by(employee_id)
        ),
        worker:all_employees!who_did_the_work(employee_id),
        evaluator:all_employees!who_is_checking(employee_id),
        assignee:all_employees!assigned_to(employee_id)
      `)
        .eq('id', id)
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Read: Get checklists by filter
  static async getByFilter(filterData) {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select(`*,
        all_projects(*),
        all_template_checklists(*),
        all_items(*, all_template_items(*)),
        assignee:all_employees!assigned_to(employee_name)
        `)
        .match(filterData)
        .order('id', { ascending: true });

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw err;
    }
  }
}

module.exports = ChecklistModel;
