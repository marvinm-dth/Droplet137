const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { createClient } = require("@supabase/supabase-js");
const { Parser } = require('json2csv');
const multer = require('multer');
require("dotenv").config();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/proofs');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ dest: './uploads/proofs' });


const app = express();
const port = 5024;


app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const supabaseUrl = "http://137.184.148.164:8000";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);





app.get('/checklists/pdf', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/manager/checklists-pdf.html`));
});

app.get('/checklists', (req, res) => {
  res.redirect("/checklists/manage")
});

app.get('/checklists/manage', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/manager/checklists-manage.html`));
});

app.get('/checklists/review', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/manager/checklists-review.html`));
});

app.get('/checklist-templates/edit', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/manager/checklist-templates-edit.html`));
});


// app.get('/checklists/staff', (req, res) => {
//   res.sendFile(path.join(__dirname, `/pages/staff/checklists-staff-dashboard.html`));
// });

app.get('/checklists/fill', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/staff/checklists-fill.html`));
});


app.get('/photo/view', (req, res) => {
  res.sendFile(path.join(__dirname, `/pages/photo-view.html`));
});



app.get('/api/projects/:project_id/checklists', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists')
      .select("*, all_template_checklists(*))")
      .eq("project_id", req.params.project_id)
      .order('id', { ascending: true })
      
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});



app.get('/api/projects/:project_id/checklists/id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists')
      .select("id")
      .eq("project_id", req.params.project_id)
      .order('id', { ascending: true })

    let ids = data;

    if(!error) ids = data.map(item => item.id);

    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(ids);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});




app.get('/api/checklists/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists')
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
      .eq("id", req.params.id)
      .single();

      console.log(data);
    data.all_items.sort((a, b) => a.id - b.id);

      
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.get('/api/checklists/status/:status', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists')
      .select(`*,
        all_projects(*),
        all_template_checklists(*),
        all_items(*, all_template_items(*)),
        assignee:all_employees!assigned_to(employee_name)
        `)
      .eq("status", req.params.status)
      .order('id', { ascending: true })
      
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

//assign a new checklist
app.post('/api/checklists/new', async (req, res) => {
  const {project_id, checklist_template_id} = req.body;
  try {
    //inserts a new checklist instance in the "all_checklists" table
    const { data: checklist_data, error: checklist_error } = await supabase
      .from('all_checklists')
      .insert([{
        project_id,
        checklist_template_id
      }])
      .select();
    if (checklist_error) res.status(400).json({ error: checklist_error.message })


    //gets a reference to which items are under the checklists added prior. 
    const {data: items, error: items_error} = await supabase
      .from("all_template_items")
      .select("id")
      .eq("checklist_template_id", checklist_template_id)
    if (items_error) res.status(400).json({ error: items_error.message })


    //for every items that are under the prior checklists add a record in the "all_items" table
    const dataToInsert = items.map((item) => ({checklist_id: checklist_data[0].id, item_template_id: item.id}));
    
    const { data, error } = await supabase
    .from('all_items')
    .insert(dataToInsert);
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({message: "Action Successful - CREATE NEW"});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

//update a checklist
app.post('/api/checklists/:id/update', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
      
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json({message: `Checklist #${req.params.id} - updated`});
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error:\n${error}` });
  }
});

//change checklist status
app.post('/api/checklists/:id/action', async (req, res) => {
  const { action } = req.body;

  const action_equavalent = {
    submit: "pending",
    reject: "rejected",
    approve: "approved",
    mark_complete: "completed",

    cancel_submit: "inprogress",
    cancel_reject: "pending",
    cancel_approve: "pending",
    cancel_complete: "inprogress"
  }

  const status = action_equavalent[action];

   try {
    const { data, error } = await supabase
      .from('all_checklists')
      .update({
        status
      })
      .eq("id", req.params.id)
      .select()
      .single();
    
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: `Server error: ${error}` });
  }
});


// app.get('/api/items', async (req, res) => {
//   try {
//     const { data, error } = await supabase
//       .from('all_template_checklists')
//       .select("*")
//       .order('id', { ascending: true });
    
//     if (error) return res.status(400).json({ error: error.message }); 
//     else res.status(200).json(data);

//   } catch (error) {
//     res.status(500).json({ error: `Server error: ${error}` });
//   }
// });

app.post('/api/items/:id/update', upload.single('photo_path'), async (req, res) => {
  const id = req.params.id
  const {staff_notes, old_photo_path} = req.body;
  const photo_path = (req.file && req.file.path) ? "/"+req.file.path : req.body.photo_path || "";
 
  try {
    const { data, error } = await supabase
      .from('all_items')
      .update({
        photo_path,
        staff_notes,
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) return res.status(400).json({ error: error.message });
    if (old_photo_path){
      try{
        const absolutePath = path.join(__dirname, old_photo_path);
        await fs.access(absolutePath);
        await fs.unlink(absolutePath);
        console.log(`File: ${old_photo_path} is deleted`); 
      } catch (error) {
        console.log(error);
      }
    }
      
    res.status(200).json(data);

  } catch (error) {
    console.log(error)
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.post('/api/items/:id/action', async (req, res) => {
  const { action, action_doer, action_date } = req.body;
  
  const action_equavalent = {
    submit: "pending",
    reject: "rejected",
    approve: "approved",
    mark_complete: "completed",

    cancel_submit: "inprogress",
    cancel_reject: "pending",
    cancel_approve: "pending",
    cancel_complete: "inprogress"
  }

  const status = action_equavalent[action];

  const updateData = {};

  if(action) updateData['status'] = status;

  if(action === "cancel_submit" || action === "cancel_complete") {
    updateData["completed_by"] = null;
    updateData["completed_on"] = null;
  } else if (action === "cancel_approve") {
    updateData["approved_by"] = null;
    updateData["approved_on"] = null;
  } else if (action === "cancel_reject") {
    updateData["rejected_by"] = null;
    updateData["rejected_on"] = null;
  }
 
  if(action === "submit") {
    if(action_doer) updateData['completed_by'] = action_doer;
    if(action_date) updateData['completed_on'] = action_date;
  } else if (action === "approve") {
    if(action_doer) updateData['approved_by'] = action_doer;
    if(action_date) updateData['approved_on'] = action_date;
  } else if (action === "reject") {
    if(action_doer) updateData['rejected_by'] = action_doer;
    if(action_date) updateData['rejected_on'] = action_date;
  } else if (action === "mark_complete") {
    if(action_doer) updateData['completed_by'] = updateData['approved_by'] = action_doer;
    if(action_date) updateData['completed_on'] = updateData['approved_on'] = action_date;
  }

  try {
    // const { data, error } = await supabase
    //   .from('all_items')
    //   .update({
    //     is_approved,
    //     is_rejected,
    //     is_inspected,
    //     status
    //   })
    //   .eq("id", req.params.id)
    //   .select()
    //   .single();

    const { data, error } = await supabase
      .from('all_items')
      .update(updateData)
      .eq("id", req.params.id)
      .select(`*,
        all_template_items(*),
        completer:all_employees!completed_by(employee_name),
        approver:all_employees!approved_by(employee_name),
        rejector:all_employees!rejected_by(employee_name)
      `)
      .single();
    
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: `Server error: ${error}` });
  }
});







//CHECKLIST TEMPLATES
app.get('/api/checklist-templates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_template_checklists')
      .select("*")
      .order('id', { ascending: true });
      
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.get('/api/checklist-templates/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_template_checklists')
      .select("*, all_template_items(*)")
      .eq("id", req.params.id)
      .single();
    
    data.all_template_items.sort((a, b) => a.id - b.id);
    return (error) ? res.status(400).json({ error: error.message }) : res.status(200).json(data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.post('/api/checklist-templates/:id/update', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_template_checklists')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) return res.status(400).json({ error: error.message }); 
    else res.status(200).json(data);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});



//ITEM TEMPLATES
app.post('/api/item-templates/new', async (req, res) => {
  const {checklist_template_id} = req.body;
  try {
    const { data, error } = await supabase
      .from('all_template_items')
      .insert([{checklist_template_id}])
    
    if (error) return res.status(400).json({ error: error.message }); 
    else res.status(200).json(data);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.post('/api/item-templates/:id/update', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_template_items')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) return res.status(400).json({ error: error.message }); 
    else res.status(200).json(data);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});

app.post('/api/item-templates/:id/delete', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_template_items')
      .delete()
      .eq('id', req.params.id)
    
    if (error) return res.status(400).json({ error: error.message }); 
    else res.status(200).json(data);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});


app.get('/api/employees', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_employees')
      .select("name:employee_name, id:employee_id")
      .order('employee_name', { ascending: true });
    
    if (error) return res.status(400).json({ error: error.message }); 
    else res.status(200).json(data);

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: `Server error: ${error}` });
  }
});







app.get('/csv/items', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('all_checklists_assignments')
      .select(`
        *,
        all_checklists_templates(*),
        all_projects(*),
        all_tasks(*),
        assignee:all_employees!assigned_to(employee_name),
        assigner:all_employees!assigned_by(employee_name),
        evaluator:all_employees!evaluated_by(employee_name)
      `)

    if (error) return res.status(500).json({ error: error.message });

    console.log(data);

    const formatted = data.map((row) => {
      return {
        "ID": row.id,
        "Project Name": row.all_projects.project_name, 
        "Model": row.all_projects.model,
        "Completed": row.is_approved,
        "Assigned To": row.assignee.employee_name,
        "Assigned By": row.assigner.employee_name,
        "Evaluator": (row.evaluator && row.evaluator.employee_name) || "none",
        "Task": row.all_checklists_templates.description_en
      };
    });
    
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(formatted);

    res.header('Content-Type', 'text/csv');
    res.attachment('assignments.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});