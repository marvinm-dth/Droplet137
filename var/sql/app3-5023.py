from flask import Flask, render_template, redirect, url_for, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from faker import Faker
from faker.providers import DynamicProvider
import os
from supabase import create_client, Client
from flask_cors import CORS
import base64
from io import BytesIO
from PIL import Image
import requests


SUPABASE_URL = "http://137.184.148.164:8000"
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


dth_info_description = DynamicProvider(
     provider_name = "description", 
     elements=["The VIN label is on and readable", "The trailer is black with no primer showing", "Belly pan on the bottom of the trailer is installed",
                  "The trailer light plug is wired up and completed", "The breakaway box and switch are installed"])
dth_info_stages = DynamicProvider(
    provider_name = "stages",
    elements = [1,2,3,4,5,6,7]
)
dth_info_desc_chinese = DynamicProvider(
    provider_name = 'desc_chinese',
    elements = ["VIN 标签已贴在上面，并且清晰可读", "拖车是黑色的，没有底漆显示出来", "拖车底部的铁皮已安装", "拖车灯插头已连接完成",
                     "应急断电盒和开关已安装好"]
)

dth_info_image = DynamicProvider(
    provider_name = "image_url",
    elements = ["https://wallpaperaccess.com/full/2315968.jpg", "https://th.bing.com/th/id/OIP.EM31H_PHiA1sQ8tx0STdjQHaHk?pid=ImgDet&w=184&h=188&c=7&dpr=1.3",
                "https://th.bing.com/th/id/OIP.1oH94MDA5e_G86Rmv5mEZAHaJP?pid=ImgDet&w=184&h=229&c=7&dpr=1.3"])

fake = Faker()
fake.add_provider(dth_info_description)
fake.add_provider(dth_info_stages)
fake.add_provider(dth_info_desc_chinese)
fake.add_provider(dth_info_image)

app = Flask(__name__)
CORS(app)


"""**************************---SUPABASE CONNECTION--**************************"""
def create_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
class CustomDB:
    class Column:
        def __init__(self, col_type, primary_key=False):
            self.col_type = col_type
            self.primary_key = primary_key
    class Integer:
        pass
    class String:
        pass
    class ARRAY:
        """Simulating an array type (e.g., text[])"""
        def __init__(self, item_type):
            self.item_type = item_type
    class Boolean:
        pass
    class Datetime:
        pass
    class JSON:
        pass

    def _convert_datetime_fields(self, data):
        """Convert all datetime fields in the dictionary to Unix timestamps."""
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.timestamp()  # Convert datetime to Unix timestamp (numeric)
        print(f"Converted data: {data}")

    def __init__(self):
        print("Initializing database client...")
        self.client = create_supabase_client()
        print("Database client initialized.")

    def fetch_all(self, table_name):
        """Fetch all rows from a table."""
        print(f"Fetching all data from table: {table_name}")
        return self.client.table(table_name).select("*").execute()

    def fetch_one(self, table_name, record_id):
        print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").eq('id', record_id).execute()
    
    def fetch_project_id(self, table_name, project_id):
        print(f"Fetching data from table: {table_name} for ID: {project_id}")
        return self.client.table(table_name).select("*").eq('project_parent', project_id).execute()

    def insert(self, table_name, data):
        """Insert data into a table, handling both lists and datetime serialization."""
        print(f"Inserting data into table: {table_name}")
        print(f"Data to be inserted: {data}")

        # If data is a list of dictionaries, process each dictionary
        if isinstance(data, list):
            for item in data:
                self._convert_datetime_fields(item)
        else:
            # Process a single dictionary
            self._convert_datetime_fields(data)

        # Insert data into the table
        print("Inserting data...")
        return self.client.table(table_name).insert(data).execute()
    
    def update(self, table_name, record_id, updated_data):
        print(f"Updating table {table_name} with ID: {record_id}")
        self._convert_datetime_fields(updated_data)
        response = self.client.table(table_name).update(updated_data).eq('id', record_id).execute()
        print(f"Update response: {response}")
        return response.data
    

    def delete(self, table_name, record_id):
        print(f"Deleting record with ID: {record_id} from table: {table_name}")
        response = self.client.table(table_name).delete().eq('id', record_id).execute()
        print(f"Delete response: {response}")
        return response.data

    def test(self, table_name):
        return self.client.table(table_name).select("project_parent").execute()
    






# Instantiate the CustomDB class
db = CustomDB()

# Convert the image to base64
def image_to_base64(image: Image) -> str:
    print("Converting image to base64...")
    buffered = BytesIO()
    image.save(buffered, format="PNG")  # Save the image in PNG format to a buffer
    img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")  # Convert to base64 string
    print("Image conversion to base64 completed.")
    return img_base64

# Define a function to populate the all_checklists table
def populate_all_checklists():
    print("Populating all_checklists table...")
    populate_data = []

    for i in range(0, 5):
        image_url = fake.image_url()
        print(f"Fetching image from URL: {image_url}")

        # Fetch the image
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))

        # Get the base64 string
        image_base64 = image_to_base64(img)

        populate_data.append({
            "creator": fake.name(), 
            "description": fake.description(),
            "stage": fake.stages(),
            "desc_chinese": fake.desc_chinese(),
            "base64img": image_base64,
            "general_id": f"GNT-{str(fake.random_int())}",
            "specific_id":f"TASK-{str(fake.random_int())}",
            "project_parent":f"DTH{str(fake.random_int())}",
            "task_parent": f"TASK-{str(fake.bothify(text='??##'))}",
            "is_approved": fake.boolean(),
            "approved_by": fake.name(),
            "approved_time": datetime.now(),
            "rejected_reasons_history": [f"{fake.name()}:{str(int(datetime.now().timestamp()))}:{fake.sentence()}" for _ in range(fake.random_int(max=3))],
            "rejected_reason_current": fake.sentence(),
            "export_to_cell": fake.sentence(),   
            "item": fake.random_int(max=10),
            "notes": [f"{fake.random_int()}:{fake.sentence()}" for _ in range(fake.random_int(max=15))],
            "task_id_generic": f"TIG-{str(fake.stages())}-{str(fake.random_int())}",
            "override_translation": fake.sentence()
        })
    
    print("Inserting populate data...")
    response = db.insert("all_checklists", populate_data)
    print(f"Populate response: {response}")










"""**************************---MODELS--**************************"""
#not in-use
class AllChecklists:
    # creator = db.Column(db.String, primary_key=False)
    # description = db.Column(db.String, primary_key=False)
    # stage = db.Column(db.Integer, primary_key=False)
    # desc_chinese = db.Column(db.String, primary_key=False)
    # base64img = db.Column(db.String, primary_key=False)
    # general_id = db.Column(db.String, primary_key=False)
    # specific_id = db.Column(db.String, primary_key=False)
    # project_parent = db.Column(db.String, primary_key=False)
    # task_parent = db.Column(db.ARRAY(db.String), primary_key=False)
    # is_approved = db.Column(db.Boolean, primary_key=False)
    # approved_by = db.Column(db.String, primary_key=False)
    # approved_time = db.Column(db.Datetime, primary_key=False)
    # rejected_reasons_history = db.Column(db.ARRAY(db.JSON), primary_key=False)
    # rejected_reasons_current = db.Column(db.String, primary_key=False)
    # export_to_cell = db.Column(db.String, primary_key=False)
    # notes = db.Column(db.String, primary_key=False)
    # item = db.Column(db.Integer, primary_key=False)
    # task_id_generic = db.Column(db.String, primary_key=False)
    # override_translation = db.Column(db.String, primary_key=False)

    table_name = "all_checklists"

    @staticmethod
    def get_all():
        return db.fetch_all(AllChecklists.table_name)

    @staticmethod
    def test():
        return db.test(AllChecklists.table_name)


"""**************************---ROUTES--**************************"""
# Route to populate the database
@app.route('/populate')
def populate():
    print("Populating the database via route...")
    populate_all_checklists()  # Populate the table with initial data
    return "Database populated!"

# Read - Get a specific checklist item by ID
@app.route('/checklist/<int:checklist_id>', methods=['GET'])
def get_checklist(checklist_id):
    response = db.fetch_one("all_checklists", checklist_id)
    if response.data:
        data = response.data  # Assuming response.data contains the data from Supabase
        return jsonify({"data": response.data})
    return jsonify({"message": "Checklist item not found"}), 404

# Read - Get a specific checklist item by ID
@app.route('/checklist/<string:project_parent>', methods=['GET'])
def fetch_project_id(project_parent):
    response = db.fetch_project_id("all_checklists", project_parent)
    print(response)
    if response.data:
        return jsonify({"data": response.data})
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/checklist/update/<int:checklist_id>', methods=['PUT', 'OPTIONS'])
def update_checklist(checklist_id):
    print(f"Received PUT request to update checklist item with ID: {checklist_id}")
    data = request.get_json()
    if data:
        response = db.update("all_checklists", checklist_id, data)
        return jsonify({"message": "Checklist item updated successfully", "data": response}), 200
    return jsonify({"message": "No data provided"}), 400

@app.route('/checklist/delete/<int:checklist_id>', methods=['DELETE', 'OPTIONS'])
def delete_checklist(checklist_id):
    print(f"Received DELETE request to remove checklist item with ID: {checklist_id}")
    response = db.delete("all_checklists", checklist_id)
    return jsonify({"message": "Checklist item deleted successfully"}), 200 if response else jsonify({"message": "Delete failed"}), 400

# Route to display all checklists
@app.route('/')
def index():
    print("Fetching all data to display...")
    response = db.fetch_all("all_checklists")
    return jsonify(response.data)


@app.route('/test')
def test():

    response = db.test("all_checklists")
    return jsonify(response.data)

    try:
        response = AllChecklists.test()
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500











if __name__ == '__main__':
    print("Starting the app...")
    app.run(host='0.0.0.0', port=5023)
