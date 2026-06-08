from flask import Flask, render_template, redirect, url_for, request, jsonify, send_from_directory, flash, session, Blueprint
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from dateutil import parser
from faker import Faker
from faker.providers import DynamicProvider
import os
from supabase import create_client, Client
from flask_cors import CORS
import base64
from io import BytesIO
import requests
import json
import random
from werkzeug.utils import secure_filename
from deep_translator import GoogleTranslator
from itertools import groupby
from operator import itemgetter
import ast
from flask_talisman import Talisman
import html
import json
import undetected_chromedriver as uc

import selenium
from selenium import webdriver

from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.expected_conditions import visibility_of_element_located
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains, ActionBuilder
from selenium.common.exceptions import NoSuchElementException
from bs4 import BeautifulSoup
import re
import base64

import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from scrapy import signals
from scrapy.signalmanager import dispatcher
import subprocess
import tempfile

SUPABASE_URL = "http://137.184.148.164:8000"
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


hd_status = DynamicProvider(
     provider_name = "order_status", 
     elements=["Open Order", "Missing Item", "Done"])

fake = Faker()
fake.add_provider(hd_status)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "change-me")  
#talisman = Talisman(app, content_security_policy=None, force_https=False)
CORS(app)

api = Blueprint('api', __name__, url_prefix='/api/v1')

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

AMAZON_SPIDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'amazon_spider'))
# Directory where images will be stored on the DigitalOcean Droplet
UPLOAD_FOLDER_IMG = '/var/sql/dth_materials/downloaded_images' 
UPLOAD_FOLDER_RECEIPT = '/var/sql/dth_materials/receipts'  
UPLOAD_FOLDER_ORDER_FILE = '/var/sql/dth_materials/order_file'  
UPLOAD_FOLDER_DELIVERY = '/var/sql/dth_materials/delivery'  
UPLOAD_FOLDER_RECEIVE = '/var/sql/dth_materials/receive'  
UPLOAD_FOLDER_RECEIVE_ITEM = '/var/sql/dth_materials/receive_items'  
FOLDER_FONT= '/var/sql/static/fonts'  
app.config['UPLOAD_FOLDER_IMG'] = UPLOAD_FOLDER_IMG
app.config['UPLOAD_FOLDER_RECEIPT'] = UPLOAD_FOLDER_RECEIPT
app.config['UPLOAD_FOLDER_ORDER_FILE'] = UPLOAD_FOLDER_ORDER_FILE
app.config['UPLOAD_FOLDER_DELIVERY'] = UPLOAD_FOLDER_DELIVERY
app.config['UPLOAD_FOLDER_RECEIVE'] = UPLOAD_FOLDER_RECEIVE
app.config['UPLOAD_FOLDER_RECEIVE_ITEM'] = UPLOAD_FOLDER_RECEIVE_ITEM
app.config['FOLDER_FONT'] = FOLDER_FONT

# Allowed file extensions for image uploads
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}


def set_chromedriver():
    os.environ["SELENIUM_MANAGER_DISABLED"] = "true"

    #Setting chrome options for removing notifications from the browser
    chrome_options = uc.ChromeOptions()
    prefs = {
        "profile.managed_default_content_settings.images": 2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts": 2,
        "profile.managed_default_content_settings.plugins": 2,
        # "profile.managed_default_content_settings.javascript": 2  # Optional: use with caution
    }

    chrome_options.add_experimental_option("prefs", prefs)
    chrome_options.headless = True
    #chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--blink-settings=imagesEnabled=false")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("start-maximized")
    try:
        driver = uc.Chrome(options=chrome_options)
    except:
        driver = uc.Chrome(options=chrome_options)

    driver.set_page_load_timeout(60)

    return driver

# Helper function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def translate_descriptions(description):
    # Use Deep Translator to translate
    translate_chinese = GoogleTranslator(source='auto', target='zh-CN')
    translate_english = GoogleTranslator(source='auto', target='en')

    english_text = translate_english.translate(description)
    chinese_text = translate_chinese.translate(description)

    return english_text, chinese_text

def find_id_by_upc(json_file, scanned_upc):
    for item in json_file:
        if scanned_upc in item['upc']:
            return item['material_id']
    return None
    

def create_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# User class
class User(UserMixin):
    def __init__(self, user_id, role, name):
        self.id = user_id
        self.role = role
        self.name = name

class CustomDB:
    def __init__(self):
        #print("Initializing database client...")
        self.client = create_supabase_client()
        print("Database client initialized.")

    def fetch_all(self, table_name):
        """Fetch all rows from a table."""
       # print(f"Fetching all data from table: {table_name}")
        return self.client.table(table_name).select("*").execute()

    def fetch_all_upc(self, table_name):
        """Fetch all rows from a table."""
       # print(f"Fetching all data from table: {table_name}")
        return self.client.table(table_name).select("material_id, upc").execute()

    def fetch_one(self, table_name, table_col, record_id):
        #print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").eq(table_col, record_id).execute()
    
    def fetch_two(self, table_name,  column_rec_id, record_id, col_rec2, record_2):
        #print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").eq(column_rec_id, record_id).eq(col_rec2, record_2).execute()
    
    def fetch_notif(self, table_name, table_col, record_id, read_rules):
        #print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").eq(table_col, record_id).eq("is_read", read_rules).execute()
    
    def fetch_one_delivery(self, table_name, table_col, record_id):
        #print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").gt("order_qty_remaining", 0) .eq(table_col, record_id).execute()
    
    def fetch_one_assign_items(self, table_name, table_col, record_id):
        #print(f"Fetching data from table: {table_name} for ID: {record_id}")
        return self.client.table(table_name).select("*").gt("quantity_remaining", 0) .eq(table_col, record_id).execute()
    
    def fetch_all_delivery(self, table_name):
        #print(f"Fetching data from table: {table_name}")
        return self.client.table(table_name).select("*").gt("order_qty_remaining", 0).execute()
    
    def fetch_project_id(self, table_name, project_id):
        #print(f"Fetching data from table: {table_name} for ID: {project_id}")
        return self.client.table(table_name).select("*").eq('sku_number', project_id).execute()
    
    def fetch_query(self, query):
        return self.client.postgrest.sql(query).execute()

    def insert(self, table_name, data):
        """Insert data into a table, handling both lists and datetime serialization."""
        #print(f"Inserting data into table: {table_name}")
        #print(f"Data to be inserted: {data}")

        # If data is a list of dictionaries, process each dictionary
        if isinstance(data, list):
            for item in data:
                self._convert_datetime_fields(item)
        else:
            # Process a single dictionary
            self._convert_datetime_fields(data)

        # Insert data into the table
        #print("Inserting data...")
        return self.client.table(table_name).insert(data).execute()
    
    def update(self, table_name, column_rec_id, record_id, updated_data):
        #print(f"Updating table {table_name} with ID: {record_id}")
        self._convert_datetime_fields(updated_data)
        response = self.client.table(table_name).update(updated_data).eq(column_rec_id, record_id).execute()
        #print(f"Update response: {response}")
        return response.data
    
    def update_notif(self, table_name, column_rec_id, record_id, col_rec2, record_2, updated_data):
        #print(f"Updating table {table_name} with ID: {record_id}")
        self._convert_datetime_fields(updated_data)
        response = self.client.table(table_name).update(updated_data).eq(column_rec_id, record_id).eq(col_rec2, record_2).execute()
        #print(f"Update response: {response}")
        return response.data
    
    def update_notif_with_approver(self, table_name, column_rec_id, record_id, col_rec2, record_2, col_rec3, record_3,updated_data):
        #print(f"Updating table {table_name} with ID: {record_id}")
        self._convert_datetime_fields(updated_data)
        response = self.client.table(table_name).update(updated_data).eq(column_rec_id, record_id).eq(col_rec2, record_2).eq(col_rec3, record_3).execute()
        #print(f"Update response: {response}")
        return response.data

    def delete(self, table_name, table_col, record_id):
        #print(f"Deleting record with ID: {record_id} from table: {table_name}")
        response = self.client.table(table_name).delete().eq(table_col, record_id).execute()
        #print(f"Delete response: {response}")
        return response.data

    def _convert_datetime_fields(self, data):
        """Convert all datetime fields in the dictionary to Unix timestamps."""
        for key, value in data.items():
            if isinstance(value, datetime):
                data[key] = value.timestamp()  # Convert datetime to Unix timestamp (numeric)
        #print(f"Converted data: {data}")

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

# Instantiate the CustomDB class
db = CustomDB()

def safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
    
def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

# User loader function
@login_manager.user_loader
def load_user(user_id):
    # Query Supabase for the user by their ID
    response = db.fetch_one("all_users", "eid", user_id)
    if response.data:
        user_data = response.data[0]
        response_name = db.fetch_one("all_employees", "employee_id", user_data['eid'])
        user_fullname = response_name.data[0]
        return User(user_id=user_data['eid'], role=user_data['role'], name=user_fullname['employee_name'])
    return None

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        # Query the Supabase table to get the user information
        response = db.fetch_one("all_users", "username", username)

        if response.data:
            user_data = response.data[0]
            #print(f"PASSWORD: {user_data['password']}. {password}")
            response_name = db.fetch_one("all_employees", "employee_id", user_data['eid'])
            user_fullname = response_name.data[0]
            if str(user_data['password']) == str(password):
                user = User(user_id=user_data['eid'], role=user_data['role'], name=user_fullname['employee_name'])
                login_user(user)
                return redirect(url_for('main'))

        flash('Invalid username or password')
    
    return render_template('login.html')


@app.route('/main', methods=['GET', 'POST'])
def main():
    return render_template("main.html", user=current_user)

# Logout route
@app.route('/logout')
@login_required
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/upload', methods=['POST'])
def upload_file():
    # Check if the file is part of the request
    if 'file' not in request.files:
        return 'No file part in the request', 400

    file = request.files['file']

    # Check if a file was selected
    if file.filename == '':
        return 'No selected file', 400

    # Check if the file type is allowed
    if file and allowed_file(file.filename):
        # Secure the filename to prevent path traversal
        filename = secure_filename(file.filename)
        
        # Save the file to the upload folder
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        try:
            file.save(file_path)

            return f'File uploaded successfully: {filename}', 200

        except Exception as e:
            return f"Error occurred while saving the file: {str(e)}", 500

    return 'File not allowed', 400

# Route for serving uploaded files
@app.route('/image/<filename>')
def uploaded_file_materials(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_IMG'], filename)

# Route for serving uploaded files
@app.route('/font/<filename>')
def font(filename):
    return send_from_directory(app.config['FOLDER_FONT'], filename)

# Route for serving uploaded files
@app.route('/receipt/<filename>')
def uploaded_receipt_materials(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_RECEIPT'], filename)

# Route for serving uploaded files
@app.route('/order_file/<filename>')
def uploaded_order_file_materials(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_ORDER_FILE'], filename)

# Route for serving uploaded files
@app.route('/delivery_file/<filename>')
def uploaded_delivery(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_DELIVERY'], filename)

# Route for serving uploaded files
@app.route('/receive/<filename>')
def uploaded_receive(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_RECEIVE'], filename)

# Route for serving uploaded files
@app.route('/receive_item/<filename>')
def uploaded_receive_item(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER_RECEIVE_ITEM'], filename)
    

"----------------------------------------- CREATE SECTION -------------------------------------------------------------------------"
@app.route("/select_supplier", methods=['GET', 'POST'])
@login_required
def select_supplier():
    supplier_res = db.fetch_all('dragon_tiny_homes_supplier')
    if supplier_res.data:
        supplier_data = supplier_res.data
        return render_template("select_supplier.html", supplier_data=supplier_data)
    
@app.route("/item_supplier", methods=['GET', 'POST'])
@login_required
def select_supplier_for_item():
    supplier_res = db.fetch_all('dragon_tiny_homes_supplier')
    if supplier_res.data:
        supplier_data = supplier_res.data
        return render_template("select_supplier_for_item.html", supplier_data=supplier_data, user=current_user)

@app.route('/add_order', methods=['GET', "POST"])
@login_required
def add_order():
    home_depot_items = db.fetch_all("home_depot_items")
    home_depot_order_history = db.fetch_all("home_depot_order_history")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")
    approver_res = db.fetch_all("all_users")
    approver_res_name = db.fetch_all("all_employees")
    request_material_res = db.fetch_two('dth_material_request', 'is_added_to_order', False, 'is_discarded', False)
    user_order_material_res = db.fetch_two('dth_user_order', 'is_added_to_order', False, 'is_discarded', False)
    pending_request_res = db.fetch_two('dth_pending_material_request', 'is_added_to_cart', False, 'is_discarded', False)


    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    approver_dict = {approver['employee_id']: approver['employee_name'] for approver in approver_res_name.data}
    approver_list = []
    for apr in approver_res.data:
        # Get the supplier_name from supplier_dict using supplier_id
        approver_name = approver_dict.get(apr['eid'], 'Unknown Approver')

        apr['employee_name'] = approver_name
        approver_list.append(apr)

    if home_depot_items.data:
        home_depot_data = combined_items
        home_depot_order_history_data = home_depot_order_history.data
        request_materials = request_material_res.data
        user_order_materials = user_order_material_res.data
        pending_request_materials = pending_request_res.data
        
        # Step 1: Create a dictionary from the order history for quick lookup
        order_history_dict = {order['sku_number']: order['order_qty_remaining'] for order in home_depot_order_history_data}
        for item in home_depot_data:
            item['below_reorder_point'] = int(item['inventory']) <= int(item['reorder_point'])

            # Look up the order_qty_remaining using the sku_number from the order history
            order_qty_remaining = order_history_dict.get(item['sku_number'], 0)  # Default to 0 if not found

            # Add order_qty_remaining to the item
            item['order_qty_remaining'] = order_qty_remaining
            
        supplier_data = supplier_res.data
        approver_data = approver_list
        
        print(user_order_materials)

        return render_template("add_order_v2.html", home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user, approver_data=approver_data, request_materials=request_materials, user_order_materials=user_order_materials, pending_request_materials=pending_request_materials)
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/submit-order', methods=['POST'])
def submit_order():
    data = request.json

    if data:
        suppliers = data['supplier_orders']
        for supplier in suppliers:
            #supplier_id = db.fetch_one("dragon_tiny_homes_supplier", "supplier_name", supplier['supplier_name']).data[0]['id']
            order_data = {"order_name": data['order_name'],
                        "user_id": data['user_id'],
                        "notes": data['notes'],
                        "total_amount": supplier['total_amount'],
                        "supplier_name": supplier['supplier_name'],
                        "supplier_id": supplier['supplier_id'],
                        "order_status": "Pending Approval"}
            order_insert = db.insert("home_depot_orders", order_data)

            for id, name in zip(data['approver_ids'], data['approver_names']):
                notif_data = {'category': "order",
                            "url": f"https://app.137.184.148.164.nip.io/approval_order/{order_insert.data[0]['order_id']}",
                            "requester_name": data['order_name'],
                            'requester_id': data['user_id'],
                            'approval_status': "pending",
                            'approver_name': name,
                            'approver_id': id,
                            "reference_id": order_insert.data[0]['order_id'],
                            "notification_message": "Requesting for order approval",
                            'is_read': False}
                approver_data = {'order_id': order_insert.data[0]['order_id'],
                                 'requested_by': data['order_name'],
                                 'requester_id': current_user.id,
                                 'approver_name': name,
                                 'approver_id': id,
                                 'approval_status': "pending"}
                notif_insert = db.insert('dth_notification', notif_data)
                approver_insert = db.insert('dth_approver', approver_data)
            
            order_history_data = supplier['items']
            keywords_text = ""
            for order in order_history_data:
                order.update(order_insert.data[0])
                desc_data = db.fetch_one("home_depot_items", "material_id", order['material_id'])

                if order['request_material_id'] == None:
                    pass
                else:
                    try:
                        db.update("dth_material_request", "id", order['request_material_id'], {"is_added_to_order": True})
                    except:
                        pass
                
                desc = desc_data.data[0]
                del order['request_material_id']
                del order['supplier_name']
                del order['supplier_id']
                del order['total_amount']
                del order['item_desc']
                del order['supplier_order_file']
                del order['supplier_receipt']
                del order['notes']
                del order['order_status']
                del order['material_keywords']
                order.update({"item_desc": desc['item_desc'],
                              "item_desc_mandarin": desc['item_desc_mandarin']})
                item_order_insert = db.insert("home_depot_order_history", order)
                keywords_text += (desc['keywords'] or '') + ", " + (desc['keywords_ch'] or '') + "," + (desc['item_desc'] or '') + "," + (desc['item_desc_mandarin'] or '') + "," 
            db.update("home_depot_orders", "order_id", order_insert.data[0]['order_id'], {"material_keywords": keywords_text})

        return jsonify({
            'message': 'Order added successfully',
            'redirect_url': '/orders'
        })
    return jsonify({"message": "Home Depot item not found"}), 404

@app.route('/barcode_scanner', methods=['GET', "POST"])
#@talisman(force_https=True)
def barcode_scanner():
    return render_template("barcode_scan.html")

@app.route('/search_barcode', methods=['GET', 'POST'])
def search_barcode():
    data = request.json
    barcode = data.get('barcode')

    if not barcode:
        return jsonify({'success': False, 'message': 'No barcode provided.'}), 400

    dth_materials = db.fetch_all('home_depot_items')
    dth_materials_data = dth_materials.data

    # Safely evaluate UPC fields
    for item_data in dth_materials_data:
        try:
            unescaped_upc = html.unescape(item_data['upc'])
            item_data['upc'] = ast.literal_eval(unescaped_upc)
        except Exception as e:
            print(f"Error processing UPC: {item_data.get('upc')} -> {e}")
            item_data['upc'] = []

    # Try to find the material ID
    material_id = find_id_by_upc(dth_materials_data, barcode)

    if not material_id:
        return jsonify({'success': False, 'message': 'UPC does not exist.'}), 404

    try:
        material_res = db.fetch_one("home_depot_items", "material_id", material_id)
        if not material_res or not material_res.data:
            return jsonify({'success': False, 'message': 'Material not found.'}), 404

        material_data = material_res.data[0]

        supplier_res = db.fetch_one("dragon_tiny_homes_supplier", "id", material_data['supplier_id'])
        supplier_data = supplier_res.data[0] if supplier_res and supplier_res.data else {"supplier_name": "Unknown"}

        return jsonify({
            'success': True,
            "material_id": material_data['material_id'],
            "supplier_name": supplier_data['supplier_name'],
            "internet_sku_number": material_data['internet_sku_number'],
            "item_desc": material_data['item_desc'],
            "item_desc_mandarin": material_data['item_desc_mandarin'],
            "item_price": material_data['item_price'],
            "item_image": material_data['item_image'],
            "default_order_qty": material_data['default_order_qty'],
            "keywords": material_data['keywords'],
            "keywords_ch": material_data['keywords_ch']
        })

    except Exception as e:
        print("Error during barcode lookup:", e)
        return jsonify({'success': False, 'message': 'Internal server error.'}), 500


@app.route('/approval_order/<int:order_id>', methods=['GET', "POST"])
@login_required
def approval_order(order_id):
    response_order = db.fetch_one("home_depot_orders", "order_id", order_id)
    response_order_history = db.fetch_one("home_depot_order_history", "order_id", order_id)
    if response_order.data:
        order_data = response_order.data[0]
        order_history_data = response_order_history.data
        return render_template("approval_order.html", order_data=order_data, order_history_data=order_history_data)
    return jsonify({"message": "Checklist item not found"}), 404

@app.route("/submit_approval_order/<int:order_id>", methods=['GET', "POST"])
def submit_approval_order(order_id):
    all_approver_res = db.fetch_one("dth_approver", 'order_id', order_id)
    approval_status = request.form.get('approval_status')
    approval_notes = request.form.get('approval_notes')

    if approval_status == "Approved":
        db.update_notif("dth_approver", "order_id", order_id, "approver_id", current_user.id, {"approval_status": "approved",
                                                                                               'approved_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                                                               'approval_note': approval_notes})

        db.update_notif_with_approver('dth_notification', 'category', 'order', 'reference_id', order_id, "approver_id", current_user.id ,{'approved_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                                                            "is_read": True,
                                                                                            "approval_status": approval_status,
                                                                                            })

        db.insert("dth_notification", {'url': f"https://app.137.184.148.164.nip.io/approval_order/{order_id}",
                                       "requester_name": current_user.name,
                                       "requester_id": current_user.id,
                                        "approval_status": "read only",
                                        "approver_name": request.form.get("order_name"),
                                        "approver_id": request.form.get("order_name_id"),
                                        "notification_message": f"{current_user.name} approved your order",
                                         "category":  "order",
                                         "reference_id": order_id,
                                         "is_read": False})
        
        all_approver_data = all_approver_res.data
        if all(approver['approval_status'] == 'approved' for approver in all_approver_data):
            db.update("home_depot_orders", "order_id", order_id, {"order_status": "Open Order"})

        return redirect(url_for('get_home_depot_orders'))
    else:
        db.update("home_depot_orders", "order_id", order_id, {"order_status": "Denied"})

        db.update_notif("dth_approver", "order_id", order_id, "approver_id", current_user.id, {"approval_status": "denied",
                                                                                        'approved_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                                                        'approval_note': approval_notes})
        
        db.update_notif_with_approver('dth_notification', 'category', 'order', 'reference_id', order_id, "approver_id", current_user.id, {'approved_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                                                                            "is_read": True,
                                                                                            "approval_status": approval_status,
                                                                                            })
        db.insert("dth_notification", {'url': f"https://app.137.184.148.164.nip.io/approval_order/{order_id}",
                                       "requester_name": current_user.name,
                                       "requester_id": current_user.id,
                                        "approval_status": "read only",
                                        "approver_name": request.form.get("order_name"),
                                        "approver_id": request.form.get("order_name_id"),
                                        "notification_message":f"{current_user.name} denied your order",
                                         "category":  "order",
                                         "reference_id": order_id,
                                         "is_read": False})
        return redirect(url_for('get_home_depot_orders'))


@app.route("/add_supplier", methods=['GET', 'POST'])
@login_required
def add_supplier():
    if current_user.role != "user":
        return render_template("add_supplier.html")
    else:
        return redirect(url_for('get_home_depot_orders'))

@app.route("/submit_supplier", methods=['POST'])
def submit_supplier():
    supplier_name = request.form.get("supplier_name")
    supplier_name_eng, supplier_name_mandarin = translate_descriptions(supplier_name)

    supp_insert = db.insert("dragon_tiny_homes_supplier", {"supplier_name": supplier_name_eng,
                                                           "supplier_name_mandarin": supplier_name_mandarin})
    supplier_id = supp_insert.data[0]['id']

    index = 0 
    while f"materials[{index}][material_id]" in request.form:
        supplier_material_id = request.form.get(f'materials[{index}][material_id]')
        description = request.form.get(f'materials[{index}][description]')
        item_desc, item_desc_mandarin = translate_descriptions(description)
        price = request.form.get(f'materials[{index}][price]')
        product_desc = request.form.get(f'materials[{index}][product_desc]')
        inventory_location = request.form.get(f'materials[{index}][inventory_location]')
        reorder_point = request.form.get(f'materials[{index}][reorder_point]')
        pack_size = request.form.get(f'materials[{index}][pack_size]')
        image = request.files.get(f'materials[{index}][image]')

        db.insert("home_depot_items", {"internet_sku_number": supplier_material_id,
                                       "item_desc": item_desc,
                                       "item_desc_mandarin": item_desc_mandarin,
                                       "item_price": price,
                                       "supplier_id": supplier_id,
                                       "reorder_point": int(reorder_point),
                                       "pack_size": int(pack_size),
                                       "item_image": f"https://app.137.184.148.164.nip.io/image/{str(supplier_name)}_{str(supplier_id)}.jpg"
                                       })
        
        if image:
            image_filename = os.path.join(app.config['UPLOAD_FOLDER_IMG'], f"{str(supplier_name)}_{str(supplier_id)}.jpg")
            image.save(image_filename)

        index += 1

    return jsonify({
        'message': 'Order added successfully',
        'redirect_url': '/item_supplier'
    })

@app.route('/fetch_item_details')
def fetch_item_details():
    url           = request.args.get('url')
    supplier_name = request.args.get('supplier_name')
    
    driver = set_chromedriver()

    if supplier_name == "Home Depot":
        driver.get(url)

        page = driver.page_source

        # Use BeautifulSoup to parse and prettify the HTML
        soup = BeautifulSoup(page, 'html.parser')
        prettified_html = soup.prettify()

        # 3. Find all script tags
        scripts = driver.find_elements(By.TAG_NAME, "script")

        # 4. Look for the one that contains "__APOLLO_STATE__"
        apollo_script = None
        for sc in scripts:
            text = sc.get_attribute("innerHTML")
            if "__APOLLO_STATE__" in text:
                apollo_script = text
                break

        if apollo_script:
            # 4. Extract the JSON object after the '=' and before the trailing ';'
            m = re.search(
                r'window\.__APOLLO_STATE__\s*=\s*(\{.*\});',
                apollo_script,
                re.DOTALL
            )
            if m:
                json_text = m.group(1)
                data = json.loads(json_text)              # now a Python dict
                #print(json.dumps(data, indent=2))         # pretty-print the parsed JSON
            else:
                pass
                # fallback: just print raw if the regex didn’t match
                #print(apollo_script)
        
        # 1) find the BaseProduct entry
        product = next(v for k, v in data.items() if k.startswith("base-catalog-"))

        # 2) item name
        name = product["identifiers"]["productLabel"]

        product_id = product["itemId"]

        description = product["details"]["description"]

        # 3) pricing block is under a key like 'pricing({...})'
        pricing = next(v for k, v in product.items() if k.startswith("pricing("))
        price = pricing["value"]
        try:
            units_per_case = pricing["alternate"]["unit"]["unitsPerCase"]
        except:
            units_per_case = 1

        # 4) images
        images = [img["url"].replace("<SIZE>", "600")  # swap in whatever size you like
                for img in product["media"]["images"]][0]
        
        resp = requests.get(images, timeout=5)
        resp.raise_for_status()
        b64 = base64.b64encode(resp.content).decode('ascii')
        mime = resp.headers.get('Content-Type', 'image/jpeg')

        driver.quit()
    
        return jsonify({
            'supplier_name':  supplier_name,
            'product_id':     product_id,
            'sku':            name,
            'description':    product,
            'price':          price,
            'details':        description,
            'pack_size':      units_per_case,
            'item_image':     f"data:{mime};base64,{b64}"
        })
    elif supplier_name == 'Amazon':
        # 1) paths
        repo_root      = os.path.abspath(os.path.dirname(__file__))      # /var/sql
        project_root   = os.path.join(repo_root, 'amazon_spider')        # /var/sql/amazon_spider
        output_path    = os.path.join(project_root, 'output.json')       # will live next to scrapy.cfg

        # remove old output.json if present
        if os.path.exists(output_path):
            os.remove(output_path)

        # 2) build the crawl command
        cmd = [
            'scrapy', 'crawl', 'dynamic',                               # spider name = dynamic
            '-a', f'start_url={url}',                                   # your spider’s arg
            '-O', output_path,                                          # uppercase -O infers format from .json
            '--nolog',                                                  # strip out all logs
            '-s', 'USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            '-s', 'ROBOTSTXT_OBEY=False',
        ]

        # 3) run it from the Scrapy project root
        proc = subprocess.run(
            cmd,
            cwd=project_root,     # <— this folder must contain scrapy.cfg
            capture_output=True,
            text=True,
            timeout=60,
        )
        app.logger.error("Scrapy stderr:\n%s", proc.stderr)

        if proc.returncode != 0:
            return jsonify({
                'error':   'crawl failed',
                'details': proc.stderr.strip()
            }), 500

        # 4) read back output.json and return it
        with open(output_path, 'r') as f:
            data = json.load(f)

        return jsonify(data[0])

    
@app.route("/add_material/<int:supplier_id>", methods=['GET', 'POST'])
@login_required
def add_material(supplier_id):
    if current_user.role == "user":
        print("You don't have access to add new materials")
        return redirect(url_for('get_home_depot_orders'))
    else:
        response =  db.fetch_one("dragon_tiny_homes_supplier", "id", supplier_id)
        if response:
            supplier_data = response.data[0]
            return render_template("add_material.html", supplier_data=supplier_data)
        
@app.route("/submit_material/<int:supplier_id>", methods=['POST'])
def submit_material(supplier_id):
    response = db.fetch_one("dragon_tiny_homes_supplier", "id", supplier_id)
    if response:
        supplier_data = response.data[0]
        supplier_name = supplier_data['supplier_name']
        supplier_id = supplier_data['id']

        supplier_sku_number = request.form.get("supplier_sku_number")
        description = request.form.get("item_desc")
        item_desc, item_desc_mandarin = translate_descriptions(description)
        item_price = request.form.get("price")
        product_details = request.form.get("product_details")
        item_details, item_details_mandarin  = translate_descriptions(product_details)
        inv_location = request.form.get("inv_location")
        keywords = request.form.get("keywords")
        reorder_point = request.form.get('reorder_point')
        pack_size = request.form.get("pack_size")
        image = request.files.get("image")

        db.insert("home_depot_items", {"internet_sku_number": supplier_sku_number,
                                       "item_desc": item_desc,
                                       "item_desc_mandarin": item_desc_mandarin,
                                       "item_details": item_details,
                                       "item_details_mandarin": item_details_mandarin,
                                       "inventory_location": inv_location,
                                       "keywords": keywords,
                                       "reorder_point": int(reorder_point),
                                       "pack_size": int(pack_size),
                                       "item_price": item_price,
                                       "supplier_id": supplier_id,
                                       "item_image": f"https://app.137.184.148.164.nip.io/image/{str(supplier_name)}_{str(supplier_sku_number)}.jpg"
                                       })
        
        if image:
            image_filename = os.path.join(app.config['UPLOAD_FOLDER_IMG'], f"{str(supplier_name)}_{str(supplier_sku_number)}.jpg")
            image.save(image_filename)

        return redirect(url_for('get_home_depot_items', supplier_id=supplier_id))

@app.route('/order/<int:order_id>/add_delivery', methods=['GET', "POST"])
@login_required
def add_delivery(order_id):
    response = db.fetch_one_delivery("home_depot_order_history","order_id", order_id)
    approver_res = db.fetch_all("all_users")
    approver_res_name = db.fetch_all("all_employees")

    approver_dict = {approver['employee_id']: approver['employee_name'] for approver in approver_res_name.data}
    approver_list = []
    for apr in approver_res.data:
        # Get the supplier_name from supplier_dict using supplier_id
        approver_name = approver_dict.get(apr['eid'], 'Unknown Approver')

        apr['employee_name'] = approver_name
        approver_list.append(apr)

    if response.data:
        approver_data = approver_list
        home_depot_data = response.data
        return render_template("add_delivery.html", home_depot_items=home_depot_data, order_id=order_id, user=current_user, approver_data=approver_data)
    else:
        db.update("home_depot_orders", "order_id", order_id, {"order_status": "Done"})
        flash("All Items has been delivered", 'success')
        return redirect(url_for('get_home_depot_orders')) 
    
@app.route("/approval_delivery/<int:delivery_id>", methods=['GET', "POST"])
@login_required
def approval_delivery(delivery_id):
    response = db.fetch_one("home_depot_delivery", "delivery_id", delivery_id) 
    response_images = db.fetch_one("dth_delivery_images", "delivery_id", delivery_id)
    if response:
        delivery_data = response.data[0]
        order_delivery_res = db.fetch_one('home_depot_delivery_history', 'delivery_id', delivery_data['delivery_id'])
        order_delivery_data = order_delivery_res.data
        images = response_images.data
        return render_template('approval_delivery.html', delivery_data=delivery_data, home_depot_items=order_delivery_data, user=current_user, images=images)

@app.route('/submit_delivery', methods=['GET', "POST"])
def submit_delivery():
    response = db.fetch_one_delivery("home_depot_order_history","order_id", request.form.get("order_id"))
    approver_name, approver_id = request.form.get("approver").split(',') 
    if response:
        order_delivery_data = response.data
        delivery = {"order_id": request.form.get("order_id"),
                    "receiver_name": request.form.get("receiver_name"),
                    #"receiver_id": request.form.get("receiver_id"),
                    "approver_name": approver_name,
                    "approver_id": approver_id}
        delivery_insert = db.insert("home_depot_delivery", delivery)
        delivery_data = delivery_insert.data[0]

        new_image = request.files.getlist('images') 

        for file in new_image:
            if file:
                # Save each file
                filename = secure_filename(file.filename)  # secure_filename ensures safe filenames
                file.save(os.path.join(app.config['UPLOAD_FOLDER_DELIVERY'], filename))
                db.insert("dth_delivery_images", {"delivery_id": delivery_data['delivery_id'],
                                                "image_url":f"https://app.137.184.148.164.nip.io/delivery_file/{filename}"})
                
        db.insert("dth_notification", {"url": f"https://app.137.184.148.164.nip.io/approval_delivery/{delivery_data['delivery_id']}",
                                       "requester_name": current_user.name,
                                       'requester_id': current_user.id,
                                       "approval_status": "pending",
                                       "approver_name": approver_name,
                                       "approver_id": approver_id,
                                       "notification_message": "Requesting for delivery approval",
                                       "category": "delivery",
                                       "is_read": False,
                                       "reference_id": delivery_data['delivery_id']})
        
        for deliv in order_delivery_data:
                remaining_qty = int(deliv['order_qty_remaining']) - (int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]")))
                notes_eng, notes_mandarin = translate_descriptions(request.form.get(f"items[{deliv['material_id']}][delivery_notes]"))
                log_description = f"Order {str(deliv['order_id'])} Delivery"
                log_desc, log_desc_mandarin = translate_descriptions(log_description)

                db.insert("home_depot_delivery_history", {"order_id": request.form.get("order_id"),
                                                        "order_date": deliv['order_date'],
                                                        "internet_sku_number": deliv['internet_sku_number'],
                                                        "item_desc": deliv['item_desc'],
                                                        "item_desc_mandarin": deliv['item_desc_mandarin'],
                                                        "item_image": deliv['item_image'],
                                                        "order_qty_requested": deliv['order_qty_requested'],
                                                        "order_qty_confirmed": deliv['order_qty_confirmed'],
                                                        "actual_item_price": deliv['actual_item_price'],
                                                        "order_qty_received": request.form.get(f"items[{deliv['material_id']}][order_qty_received]"),
                                                        "delivery_notes": notes_eng,
                                                        "delivery_notes_mandarin": notes_mandarin,
                                                        "material_id": deliv['material_id'],
                                                        "delivery_id": delivery_data['delivery_id'],
                                                        "delivery_date": delivery_data['delivery_date'],
                                                        "receiver_name": request.form.get("receiver_name"),
                                                        "supplier_order_number": deliv['supplier_order_number']
                                                        })


        confirming_data_status = db.fetch_one_delivery("home_depot_order_history","order_id", request.form.get("order_id"))

        if confirming_data_status:
            pass
        else:
            db.update("home_depot_orders", "order_id", request.form.get("order_id"), {"order_status": "Done"})

        return redirect(url_for('get_home_depot_orders'))
    
@app.route("/submit_delivery_approval", methods=['GET', "POST"])
def submit_delivery_approval():
    response = db.fetch_one_delivery("home_depot_order_history","order_id", request.form.get("order_id"))
    response_deliv = db.fetch_one("home_depot_delivery", "delivery_id", request.form.get("delivery_id"))

    if response:
        order_delivery_data = response.data
        delivery_data = response_deliv.data[0]

        if request.form.get("approval_status") == "Approved":
            db.update("home_depot_delivery", "delivery_id", delivery_data['delivery_id'], {"approval_status": request.form.get("approval_status"),
                                                                                           "approval_notes": request.form.get("approval_notes"),
                                                                                           "approval_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S')})
            db.insert("dth_notification", {"url": f"https://app.137.184.148.164.nip.io/approval_delivery/{delivery_data['delivery_id']}",
                                       "requester_name": current_user.name,
                                       'requester_id': current_user.id,
                                       "approval_status": request.form.get("approval_status"),
                                       "approver_name": delivery_data['receiver_name'],
                                       "approver_id": delivery_data['receiver_id'],
                                       "notification_message": "Your delivery has been approved",
                                       "category": "delivery",
                                       "is_read": False,
                                       "reference_id": delivery_data['delivery_id']})
            
            for deliv in order_delivery_data:
                remaining_qty = int(deliv['order_qty_remaining']) - (int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]")))
                notes_eng, notes_mandarin = translate_descriptions(request.form.get(f"items[{deliv['material_id']}][delivery_notes]"))
                log_description = f"Order {str(deliv['order_id'])} Delivery"
                log_desc, log_desc_mandarin = translate_descriptions(log_description)
                
                dth_item = db.fetch_one("home_depot_items", "material_id", deliv['material_id'])
                if dth_item:
                    inven_data = dth_item.data[0]
                    db.update("home_depot_items", "material_id", deliv['material_id'], {'inventory': int(inven_data['inventory']) +  (int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]")) * int(inven_data['pack_size']))})

                    db.insert("home_depot_inventory_logs", {"material_id": deliv['material_id'],
                                                            "name":  request.form.get("receiver_name"),
                                                            "item_desc": deliv['item_desc'],
                                                            "item_desc_mandarin": deliv['item_desc_mandarin'],
                                                            "item_image": deliv['item_image'],
                                                            "internet_sku_number": deliv['internet_sku_number'],
                                                            "previous_quantity": int(inven_data['inventory']),
                                                            "current_quantity": int(inven_data['inventory']) +  (int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]")) *  int(inven_data['pack_size'])),
                                                            "quantity_change": 0 + (int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]")) *  int(inven_data['pack_size'])),
                                                            "log_description": log_desc,
                                                            "log_description_mandarin": log_desc_mandarin})
                
                db.update("home_depot_order_history", "order_item_number", deliv['order_item_number'], {"order_qty_remaining": remaining_qty,
                                                                                                        "order_qty_received": int(deliv['order_qty_received']) + int(request.form.get(f"items[{deliv['material_id']}][order_qty_received]"))})
        else:
            db.update("home_depot_delivery", "delivery_id", delivery_data['delivery_id'], {"approval_status": request.form.get("approval_status"),
                                                                                           "approval_notes": request.form.get("approval_notes"),
                                                                                           "approval_date": datetime.now().strftime('%Y-%m-%d %H:%M:%S')})
            db.insert("dth_notification", {"url": f"https://app.137.184.148.164.nip.io/approval_delivery/{delivery_data['delivery_id']}",
                                       "requester_name": current_user.name,
                                       'requester_id': current_user.id,
                                       "approval_status": request.form.get("approval_status"),
                                       "approver_name": delivery_data['receiver_name'],
                                       "approver_id": delivery_data['receiver_id'],
                                       "notification_message": "Your delivery has been denied",
                                       "category": "delivery",
                                       "is_read": False,
                                       "reference_id": delivery_data['delivery_id']})
    return redirect(url_for('get_home_depot_orders'))

@app.route('/inventory_option',  methods=['GET', 'POST'])
def inventory_option():
    return render_template("inventory_option.html")
    
@app.route('/inventory', methods=['GET', "POST"])
@login_required
def inventory():
    home_depot_items = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")
    project_res = db.fetch_all("all_projects")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    if home_depot_items.data:
        home_depot_data = combined_items
        supplier_data = supplier_res.data
        project_data = project_res.data
        return render_template("inventory_v2.html", project_data=project_data,home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user)
    
@app.route('/inventory_onhand', methods=['GET', "POST"])
@login_required
def inventory_onhand():
    home_depot_items = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    if home_depot_items.data:
        home_depot_data = combined_items
        supplier_data = supplier_res.data
        return render_template("inventory_onhand_v2.html", home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user)
        
@app.route('/inventory/<int:material_id>', methods=['GET', "POST"])
@login_required
def inventory_qr(material_id):
    home_depot_items = db.fetch_one("home_depot_items", "material_id", material_id)
    if home_depot_items.data:
        material_data = home_depot_items.data[0]
        return render_template("inventory_logs_qr.html", material_data=material_data, user=current_user)
    
@app.route('/add_inventory_used_qr', methods=['GET', "POST"])
def add_inventory_used_qr():
    data = request.json
    name = data['inv_name']
    material_id = data['material_id']
    item_desc = data['item_desc']
    item_desc_mandarin = data['item_desc_mandarin']
    quantity_used = data['quantity_used']
    item_image = data['item_image']
    item_price = data['item_price']
    internet_sku_number = data['supplier_id']

    existing_inv_db = db.fetch_one("home_depot_items", "material_id", material_id)
    existing_inv = existing_inv_db.data[0]['inventory'] 

    new_inventory = (existing_inv or 0) - int(quantity_used)

    new_inv_data = db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})

    log_desc, log_desc_mandarin = translate_descriptions("Items used.")
    item_desc = existing_inv_db.data[0]['item_desc'] 
    item_desc_mandarin = existing_inv_db.data[0]['item_desc_mandarin'] 
    difference = 0 - int(quantity_used)

    log = {"name": name,
            "internet_sku_number": internet_sku_number,
            "item_price": item_price,
            "material_id": material_id,
            "log_description": log_desc,
            "log_description_mandarin": log_desc_mandarin,
            "item_desc": item_desc,
            "quantity_used": quantity_used,
            "item_desc_mandarin": item_desc_mandarin,
            "previous_quantity": existing_inv,
            "current_quantity": new_inventory,
            "quantity_change": difference}

    inventory_hist_insert = db.insert("home_depot_inventory_logs", log)

    return jsonify({
                    'message': 'Inventory added successfully',
                    'redirect_url': '/main'
                    })


@app.route('/add_inventory_used', methods=['GET', "POST"])
def add_inventory_used():
    data = request.json
    print(data)
    if data:
        name = data['requesting_party']
        id = data['requesting_party_id']
        project_id = data['project_id']
        project_name = data['project_name']

        logs = data['inventory_items']
        for log in logs:
            material_id = log['material_id']

            existing_inv_db = db.fetch_one("home_depot_items", "material_id", material_id)
            existing_inv = existing_inv_db.data[0]['inventory'] 

            new_inventory = (existing_inv or 0) - int(log['inventory_qty'])

            new_inv_data = db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})

            log_desc, log_desc_mandarin = translate_descriptions(f"Items used for project {project_name}.")
            item_desc = existing_inv_db.data[0]['item_desc'] 
            item_desc_mandarin = existing_inv_db.data[0]['item_desc_mandarin'] 
            difference = 0 - int(log['inventory_qty'])
            quantity_used = log['inventory_qty']

            del log['item_desc']
            del log['inventory_qty']
            del log['supplier_name']

            log.update({"name": name,
                        "log_description": log_desc,
                        "log_description_mandarin": log_desc_mandarin,
                        "item_desc": item_desc,
                        "item_desc_mandarin": item_desc_mandarin,
                        'quantity_used':quantity_used,
                        "previous_quantity": existing_inv,
                        "current_quantity": new_inventory,
                        "quantity_change": difference,
                        "project_id": project_id,
                        "project_name": project_name})

            inventory_hist_insert = db.insert("home_depot_inventory_logs", log)

        return jsonify({
                    'message': 'Inventory added successfully',
                    'redirect_url': '/inventory'
                    })
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/onhand_inventory_used_bar', methods=['GET', "POST"])
def onhand_inventory_used_bar():
    data = request.json
    log = data['requestingItem']
    material_id = log['material_id']

    existing_inv_db = db.fetch_one("home_depot_items", "material_id", material_id)
    existing_inv = int(existing_inv_db.data[0]['inventory'])

    new_inventory = int(log['inventory'])

    new_inv_data = db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})
    
    log_desc, log_desc_mandarin = translate_descriptions("Change onhand inventory.")
    item_desc = existing_inv_db.data[0]['item_desc'] 
    item_desc_mandarin = existing_inv_db.data[0]['item_desc_mandarin'] 
    difference = int(log['inventory']) -  existing_inv 

    del log['item_desc']
    del log['inventory']
    del log['supplier_name']

    
    log.update({"name": current_user.name,
                "log_description": log_desc,
                "log_description_mandarin": log_desc_mandarin,
                "item_desc": item_desc,
                "item_desc_mandarin": item_desc_mandarin,
                "previous_quantity": existing_inv,
                "current_quantity": new_inventory,
                "quantity_change": difference})
    print(log)
    inventory_hist_insert = db.insert("home_depot_inventory_logs", log)
    return data

@app.route('/onhand_inventory_used', methods=['GET', "POST"])
def onhand_inventory_used():
    data = request.json
    if data:
        name = data['inv_name']

        logs = data['selected_items']
        for log in logs:
            material_id = log['material_id']

            existing_inv_db = db.fetch_one("home_depot_items", "material_id", material_id)
            existing_inv = existing_inv_db.data[0]['inventory'] 

            new_inventory = int(log['onhand'])

            new_inv_data = db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})

            log_desc, log_desc_mandarin = translate_descriptions("Change onhand inventory.")
            item_desc = existing_inv_db.data[0]['item_desc'] 
            item_desc_mandarin = existing_inv_db.data[0]['item_desc_mandarin'] 
            difference = int(log['onhand']) -  existing_inv 

            del log['item_desc']
            del log['onhand']
            del log['supplier_name']

            log.update({"name": name,
                        "log_description": log_desc,
                        "log_description_mandarin": log_desc_mandarin,
                        "item_desc": item_desc,
                        "item_desc_mandarin": item_desc_mandarin,
                        "previous_quantity": existing_inv,
                        "current_quantity": new_inventory,
                        "quantity_change": difference})

            inventory_hist_insert = db.insert("home_depot_inventory_logs", log)

        return jsonify({
                    'message': 'Order added successfully',
                    'redirect_url': '/main'
                    })
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/return_inventory', methods=['GET', "POST"])
@login_required
def return_inventory():
    home_depot_items = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")
    project_res = db.fetch_all("all_projects")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    if home_depot_items.data:
        home_depot_data = combined_items
        supplier_data = supplier_res.data
        project_data = project_res.data
        return render_template("inventory_return.html", project_data=project_data,home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user)

@app.route('/add_return_inventory', methods=['GET', "POST"])
def add_return_inventory():
    data = request.json
    print(data)
    if data:
        name = data['requesting_party']
        id = data['requesting_party_id']
        project_id = data['project_id']
        project_name = data['project_name']

        logs = data['inventory_items']
        for log in logs:
            material_id = log['material_id']

            existing_inv_db = db.fetch_one("home_depot_items", "material_id", material_id)
            existing_inv = existing_inv_db.data[0]['inventory'] 

            new_inventory = (existing_inv or 0) + int(log['inventory_qty'])

            new_inv_data = db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})

            log_desc, log_desc_mandarin = translate_descriptions(f"Return items for project {project_name}.")
            item_desc = existing_inv_db.data[0]['item_desc'] 
            item_desc_mandarin = existing_inv_db.data[0]['item_desc_mandarin'] 
            difference = 0 + int(log['inventory_qty'])
            quantity_used = log['inventory_qty']

            del log['item_desc']
            del log['inventory_qty']
            del log['supplier_name']

            log.update({"name": name,
                        "log_description": log_desc,
                        "log_description_mandarin": log_desc_mandarin,
                        "quantity_used": quantity_used,
                        "item_desc": item_desc,
                        "item_desc_mandarin": item_desc_mandarin,
                        "previous_quantity": existing_inv,
                        "current_quantity": new_inventory,
                        "quantity_change": difference,
                        "project_id": project_id,
                        "project_name": project_name})

            inventory_hist_insert = db.insert("home_depot_inventory_logs", log)

        return jsonify({
                    'message': 'Inventory returned successfully',
                    'redirect_url': '/return_inventory'
                    })
    return jsonify({"message": "Checklist item not found"}), 404

"-------------------------------------------------- READ SECTION ----------------------------------------------------------------------"
@app.route("/api/dashboard")
def dashboard_data():
    response = db.fetch_all_delivery("home_depot_order_history")
    if response.data:
        result = response.data
        
        return jsonify(result)
    
@app.route("/api/request_dashboard")
def request_dashboard_data():
    response = db.fetch_two('dth_material_request', 'is_added_to_order', False, 'is_discarded', False)
    if response.data:
        result = response.data
        print(result)
        return jsonify(result)

@app.route('/dashboard', methods=['GET', "POST"])
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/unread-notifications-count/<user_id>', methods=['GET'])
def unread_notifications_count(user_id):
    response = db.fetch_notif("dth_notification", "approver_id", user_id, False)
    unread_count = len(response.data)
    return jsonify({'unread_count': unread_count})

@app.route('/dismiss-notification', methods=['POST'])
def dismiss_notification():
    data = request.json
    notification_id = data['notification_id']
    db.update("dth_notification", "id", notification_id, {"is_read": True})
    return jsonify({'success': True})

@app.route('/get-notifications/<user_id>', methods=['GET'])
def get_notifications(user_id):
    response = db.fetch_notif("dth_notification", "approver_id", user_id, False)
    notif_data = response.data
    return render_template("notifications.html", notif_data=notif_data, user=current_user)

# Read all home depot items
@app.route('/home_depot_items', methods=['GET', "POST"])
@login_required
def get_home_depot_items():
    response = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in response.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name
        item['qr_info'] = f"https://app.137.184.148.164.nip.io/home_depot_item/{str(item['material_id'])}"

        # CHANGE THIS
        item['qr_inventory'] = f"https://app.137.184.148.164.nip.io/inventory/{str(item['material_id'])}"

        # Add the combined item to the list
        combined_items.append(item)

    if response.data:
        home_depot_data = combined_items  # Assuming response.data contains the data from Supabase
        supplier_data = supplier_res.data
        return render_template("home_depot_items_v2.html", home_depot_data=home_depot_data, supplier_data=supplier_data, user=current_user)
    return jsonify({"message": "Checklist item not found"}), 404

# Read one home depot item
@app.route('/home_depot_item/<int:material_id>', methods=['GET', "POST"])
@login_required
def get_home_depot_item(material_id):
    response = db.fetch_one("home_depot_items","material_id", material_id)
    price_history_response = db.fetch_one("home_depot_item_price_history" ,"material_id", material_id)
    inv_history_response = db.fetch_one("home_depot_inventory_logs", "material_id", material_id)
    image_response = db.fetch_one("dth_material_images", "material_id", material_id)

    print(response.data[0])
    if response.data:
        item = response.data[0]
        price_history_data = price_history_response.data
        inventory_history_data = inv_history_response.data
        image_data = image_response.data

        for inv in inventory_history_data:
            if isinstance(inv['log_date'], str):
                # Use dateutil to parse the date
                inv['log_date'] = parser.parse(inv['log_date'])

            # Format datetime as desired (e.g., "Monday, 15 October 2024")
            inv['formatted_log_date'] = inv['log_date'].strftime("%b %d, %Y")

        for price in price_history_data:
            if isinstance(price['log_date'], str):
                # Use dateutil to parse the date
                price['log_date'] = parser.parse(price['log_date'])

            # Format datetime as desired (e.g., "Monday, 15 October 2024")
            price['formatted_log_date'] = price['log_date'].strftime("%b %d, %Y")

        # Sort inventory history data by 'log_date' in descending order (latest first)
        inventory_history_data.sort(key=lambda x: x['log_date'], reverse=True)
        price_history_data.sort(key=lambda x: x['log_date'], reverse=True)
        
        return render_template("hd_item.html", item=item, price_history_data=price_history_data, inventory_history_data=inventory_history_data, images=image_data)
    return jsonify({"message": "Home Depot item not found"}), 404

# Read all home depot orders
@app.route('/orders', methods=['GET', "POST"])
@login_required
def get_home_depot_orders():
    if current_user.role == "user":
        response = db.fetch_one("home_depot_orders", "user_id", current_user.id)
        if response.data:
            order_data= response.data  
            return render_template("main_page.html", order_data=order_data, user=current_user)
        else:
            response_all = db.fetch_all("home_depot_orders")
            if response_all.data:
                order_data= response_all.data  
                return render_template("main_page.html", order_data=order_data, user=current_user)
    else:
        response = db.fetch_all("home_depot_orders")
        if response.data:
            order_data= response.data  
            return render_template("main_page.html", order_data=order_data , user=current_user)
    return jsonify({"message": "Checklist item not found"}), 404

# Read one home depot order
@app.route('/order/<int:order_id>', methods=['GET'])
@login_required
def get_home_depot_order(order_id):
    response_order = db.fetch_one("home_depot_orders", "order_id", order_id)
    response_order_history = db.fetch_one("home_depot_order_history", "order_id", order_id)
    response_other_file = db.fetch_one("dth_order_other_files", "order_id", order_id)
    response_approver = db.fetch_one("dth_approver", "order_id", order_id)

    if response_order.data:
        order_data = response_order.data[0]
        order_history_data = response_order_history.data
        other_files = response_other_file.data
        approver_data = response_approver.data
        return render_template("order_number_v2.html", order_data=order_data, order_history_data=order_history_data, other_files=other_files, approver_data=approver_data)
    return jsonify({"message": "Checklist item not found"}), 404

@app.route("/view_delivery/<int:delivery_id>", methods=['GET', 'POST'])
@login_required
def view_delivery(delivery_id):
    response_delivery = db.fetch_one("home_depot_delivery_history", "delivery_id", delivery_id)
    response_images = db.fetch_one("dth_delivery_images", "delivery_id", delivery_id)

    if response_delivery.data:
        data = response_delivery.data
        images = response_images.data
        order_id = data[0]['order_id']
        receiver_name = data[0]['receiver_name']

        return render_template("view_delivery.html", home_depot_items=data, order_id=order_id, receiver_name=receiver_name, images=images)
    return jsonify({"message": "Checklist item not found"}), 404


# Read Delivery 
@app.route('/delivery/<int:order_id>', methods=['GET'])
def get_home_depot_delivery(order_id):
    response_order = db.fetch_one("home_depot_orders", "order_id", order_id)
    response_deliveries = db.fetch_one("home_depot_delivery", "order_id", order_id)

    if response_order.data:
        order_data = response_order.data[0]
        order_delivery_data = response_deliveries.data

        return render_template("delivery.html", order_data=order_data, order_delivery_data=order_delivery_data , user=current_user)
    return jsonify({"message": "Checklist item not found"}), 404

"------------------------------------------------------ UPDATE SECTION ---------------------------------------------------------------------------------"

@app.route('/order/update/<int:order_id>', methods=["GET", "POST",'PUT', 'OPTIONS'])
@login_required
def update_order(order_id):
    response_order = db.fetch_one("home_depot_orders", "order_id", order_id)
    response_order_history = db.fetch_one("home_depot_order_history", "order_id", order_id)
    response_other_file = db.fetch_one("dth_order_other_files", "order_id", order_id)
    if response_order.data:
        order_data = response_order.data[0]
        order_history_data = response_order_history.data
        other_files = response_other_file.data
        print(other_files)
        return render_template("update_order_v2.html", order_data=order_data, order_history_data=order_history_data, other_files=other_files)
    return jsonify({"message": "No data provided"}), 400


@app.route('/bulk_material_update', methods=["GET", "POST",'PUT', 'OPTIONS'])
@login_required
def bulk_update():
    response = db.fetch_all("home_depot_items")
    response_supp = db.fetch_all("dragon_tiny_homes_supplier")
    if response.data:
        home_depot_items = response.data 
        supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in response_supp.data}

        # Combine home_depot_items with supplier data using supplier_id
        combined_items = []
        for item in response.data:
            # Get the supplier_name from supplier_dict using supplier_id
            supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
            
            # Add supplier_name to the item dictionary
            item['supplier_name'] = supplier_name
            unescaped_upc = html.unescape(item['upc'])
            print(unescaped_upc)
            item['upc'] = ast.literal_eval(unescaped_upc)

             # Add the combined item to the list
            combined_items.append(item)

        print(combined_items)
        supplier_data = response_supp.data
        return render_template("update_bulk_material_v2.html",home_depot_items=combined_items, user=current_user, supplier_data=supplier_data)
    return jsonify({"message": "No data provided"}), 400

@app.route('/submit_bulk_material', methods=["GET", "POST",'PUT', 'OPTIONS'])
def submit_bulk_material():
    data = request.json
    if data:
        for material in data['update_materials']:
            response_material = db.fetch_one("home_depot_items", "material_id", material['material_id']).data[0]

            old_price = response_material['item_price']
            old_reorder_point = response_material['reorder_point']
            old_pack_size = response_material['pack_size']
            old_default_order_qty = response_material['default_order_qty']
            old_keywords = response_material['keywords']
            old_keywords_ch = response_material['keywords_ch']

            new_price = material['item_price']
            new_reorder_point = material['reorder_point']
            new_pack_size= material['pack_size']
            new_default_order_qty = material['default_order_qty']
            new_keywords, new_keywords_to_ch = translate_descriptions(material['keywords'])
            new_keywords_to_eng, new_keywords_ch = translate_descriptions(material['keywords_ch'])

            if float(old_price) != float(new_price):
                db.update("home_depot_items", "material_id", material['material_id'], {"item_price": new_price})
            if current_user.role != "user":
                if int(old_reorder_point) != int(new_reorder_point):
                    db.update("home_depot_items", "material_id", material['material_id'], {"reorder_point": new_reorder_point})
                if int(old_pack_size) != int(new_pack_size):
                    db.update("home_depot_items", "material_id", material['material_id'], {"pack_size": new_pack_size})
                if int(old_default_order_qty) != int(new_default_order_qty):
                    db.update("home_depot_items", "material_id", material['material_id'], {"default_order_qty": new_default_order_qty})
            if old_keywords != new_keywords:
                db.update("home_depot_items", "material_id", material['material_id'], {"keywords": new_keywords,
                                                                                       "keywords_eng_to_ch": new_keywords_to_ch})
            if old_keywords_ch != new_keywords_ch:
                db.update("home_depot_items", "material_id", material['material_id'], {"keywords_ch": new_keywords_ch,
                                                                                       "keywords_ch_to_eng": new_keywords_to_eng})
    return jsonify({
            'message': 'Materials updated successfully',
            'redirect_url': '/main'
        })

@app.route('/bulk_upc_update', methods=["GET", "POST",'PUT', 'OPTIONS'])
@login_required
def bulk_upc_update():
    response = db.fetch_all("home_depot_items") #, "upc", "[]")
    print(response)
    response_supp = db.fetch_all("dragon_tiny_homes_supplier")
    if response.data:
        home_depot_items = response.data 
        supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in response_supp.data}

        # Combine home_depot_items with supplier data using supplier_id
        combined_items = []
        for item in response.data:
            # Get the supplier_name from supplier_dict using supplier_id
            supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
            
            # Add supplier_name to the item dictionary
            item['supplier_name'] = supplier_name
            unescaped_upc = html.unescape(item['upc'])
            print(unescaped_upc)
            item['upc'] = ast.literal_eval(unescaped_upc)

             # Add the combined item to the list
            combined_items.append(item)

        supplier_data = response_supp.data
        return render_template("update_bulk_upc_v2.html",home_depot_items=combined_items, user=current_user, supplier_data=supplier_data)
    return jsonify({"message": "No data provided"}), 400

@app.route('/submit_upc_update', methods=["GET", "POST",'PUT', 'OPTIONS'])
def submit_upc_update():
    data = request.json
    item = data['requestingItem']

    material_id = item['material_id']

    db.update("home_depot_items", "material_id", material_id, {'upc': str(item["upc"])})
    return data

@app.route('/submit_bulk_upc', methods=["GET", "POST",'PUT', 'OPTIONS'])
def submit_bulk_upc():
    data = request.json
    items = data['update_materials']

    for item in items:
        db.update("home_depot_items", "material_id", item['material_id'], {'upc': str(item["upc"])})
    return jsonify({
            'message': 'Materials updated successfully',
            'redirect_url': '/main'
        })

# Route to handle the update of order details and items
@app.route('/update_order/<int:order_id>', methods=['POST'])
@login_required
def update_order_form(order_id):
    print(request.files)
    order_data_old = db.fetch_one("home_depot_orders", "order_id", order_id).data[0]
    order_history_old = db.fetch_one("home_depot_order_history", "order_id", order_id).data

    # Retrieve updated order name and Home Depot order number
    order_name_new = request.form.get('order_name')
    supplier_order_number = request.form.get('supplier_order_number')
    order_status_new = request.form.get("order_status")
    total_amount_new = request.form.get("total_amount")
    notes_new = request.form.get("notes")

    # Handle receipt file upload
    receipt_file = request.files.get('receipt')

    if (receipt_file) and (f"https://app.137.184.148.164.nip.io/receipt/receipt_{str(order_id)}.pdf" != order_data_old['supplier_receipt']):
        receipt_filename = f"receipt_{str(order_id)}.pdf"
        receipt_file.save(os.path.join(app.config['UPLOAD_FOLDER_RECEIPT'], receipt_filename))
        db.update("home_depot_orders", "order_id", order_id, {"supplier_receipt": f"https://app.137.184.148.164.nip.io/receipt/{receipt_filename}"})
    else:
        print("NO")

    # Handle quantity file upload
    qty_file = request.files.get('order_file')

    if (qty_file) and (f"https://app.137.184.148.164.nip.io/order_file/order_{str(order_id)}.pdf" != order_data_old['supplier_order_file']):
        qty_filename = f"order_{order_id}.pdf"
        qty_file.save(os.path.join(app.config['UPLOAD_FOLDER_ORDER_FILE'], qty_filename))
        db.update("home_depot_orders", "order_id", order_id, {"supplier_order_file": f"https://app.137.184.148.164.nip.io/order_file/{qty_filename}"})

    other_files = request.files.getlist("other_file[]")
    print(other_files)

    if other_files:
        for file in other_files:
            file_name = f"{order_id}_{file.filename}"
            
            file.save(os.path.join(app.config['UPLOAD_FOLDER_ORDER_FILE'], file_name))
            
            other_file_dict = {"order_id": order_id,
                               "file_name": file_name,
                               "file_url": f"https://app.137.184.148.164.nip.io/order_file/{file_name}"}
            db.insert("dth_order_other_files", other_file_dict)


    if order_data_old['order_name'] != order_name_new:
        order_name_change = db.update("home_depot_orders", "order_id", order_id, {"order_name": order_name_new})

    if order_data_old['supplier_order_number'] != supplier_order_number:
        home_depot_order_number_change = db.update("home_depot_orders", "order_id", order_id, {"supplier_order_number": supplier_order_number})

    if order_data_old['order_status'] != order_status_new:
        order_status_change = db.update("home_depot_orders", "order_id", order_id, {"order_status": order_status_new})

    if order_data_old['total_amount'] != total_amount_new:
        db.update("home_depot_orders", "order_id", order_id, {"total_amount": total_amount_new})

    if order_data_old['notes'] != notes_new:
        db.update('home_depot_orders', "order_id", order_id, {"notes": notes_new})

    for hist_old in order_history_old:
        new_price =  request.form.get(f'items[{hist_old["internet_sku_number"]}][actual_item_price]')
        #print(f"{new_price} is equal to {hist_old['actual_item_price']}: {str(new_price == hist_old['actual_item_price'])}")
        if (safe_float(hist_old['actual_item_price']) != float(new_price)) and (new_price is not None) and (new_price != ""):
            price_change = db.update("home_depot_order_history", "order_item_number", hist_old["order_item_number"], {"actual_item_price": new_price})
            price_history = db.insert("home_depot_item_price_history", {"internet_sku_number": hist_old['internet_sku_number'],
                                                                        "item_desc": hist_old['item_desc'],
                                                                        "item_desc_mandarin": hist_old['item_desc_mandarin'],
                                                                        "actual_item_price": new_price,
                                                                        "sku_number": hist_old['sku_number'],
                                                                        "item_image": hist_old['item_image'],
                                                                        "material_id": hist_old['material_id'],
                                                                        "order_id": order_id})
        
        new_order_qty_confirmed = request.form.get(f'items[{hist_old["internet_sku_number"]}][order_qty_confirmed]')
        if (safe_int(hist_old['order_qty_confirmed']) != int(new_order_qty_confirmed)) and (new_order_qty_confirmed is not None) and (new_order_qty_confirmed != ""):
            order_confirmed_change = db.update("home_depot_order_history", "order_item_number", hist_old["order_item_number"], {"order_qty_confirmed": new_order_qty_confirmed,
                                                                                                                                "order_qty_remaining": int(new_order_qty_confirmed) - (hist_old['order_qty_received'] + hist_old['order_qty_refunded'])})
        

        new_notes = request.form.get(f'items[{hist_old["internet_sku_number"]}][notes]')
        if (hist_old['notes'] != new_notes) and (new_notes is not None) and (new_notes != ""):
            notes_change = db.update("home_depot_order_history", "order_item_number", hist_old["order_item_number"], {"notes": new_notes})

    flash("Done Updating Orders")
    return redirect(url_for('get_home_depot_orders'))

@app.route("/upload_order_pdf", methods=['GET', 'POST'])
def upload_order_pdf():
    print(request.files)
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in the request'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected for uploading'}), 400

    # Save the file
    file_path = os.path.join(app.config['UPLOAD_FOLDER_ORDER_FILE'], file.filename)
    file.save(file_path)
    
    # Return a success response
    return jsonify({'message': 'File uploaded successfully'}), 200


@app.route("/update_material/<int:material_id>", methods=['GET', 'POST'])
@login_required
def update_material(material_id):
    response =  db.fetch_one("home_depot_items", "material_id", material_id)
    if response:
        item_data = response.data[0]
        unescaped_upc = html.unescape(item_data['upc'])
        print(unescaped_upc)
        item_data['upc'] = ast.literal_eval(unescaped_upc)
        return render_template("update_material.html", item = item_data, user=current_user)
    
@app.route("/update_material/<int:material_id>/submit", methods=["GET",'POST'])
@login_required
def submit_update_material(material_id):
    res_old = db.fetch_one("home_depot_items", "material_id", material_id)

    material_old_data = res_old.data[0]
    old_supplier_sku = material_old_data['internet_sku_number']
    old_item_desc = material_old_data["item_desc"]
    old_item_desc_mandarin = material_old_data["item_desc_mandarin"]
    old_item_price = material_old_data['item_price']
    old_item_detail = material_old_data["item_details"]
    old_item_details_mandarin = material_old_data['item_details_mandarin']
    old_inventory = material_old_data['inventory']
    old_inventory_location = material_old_data['inventory_location']
    old_keywords = material_old_data['keywords']
    old_keywords_ch = material_old_data['keywords_ch']
    old_reorder_point = material_old_data['reorder_point']
    old_pack_size = material_old_data['pack_size']
    old_default_order_qty = material_old_data['default_order_qty']
    old_upc = material_old_data['upc']
    old_reorder = material_old_data['is_reorder']
    old_label_size = material_old_data['label_size']

    new_supplier_sku = request.form.get("supplier_sku_number")
    form_item_desc = request.form.get("item_desc")
    new_item_desc, new_item_desc_mandarin = translate_descriptions(form_item_desc)
    new_item_price = request.form.get("price")
    form_item_detail = request.form.get("product_details")
    new_item_detail, new_item_details_mandarin = translate_descriptions(form_item_detail)
    new_inventory_location = request.form.get("inv_location")
    keywords_eng = request.form.get("keywords")
    new_keywords, new_keywords_to_ch = translate_descriptions(keywords_eng)
    keywords_ch = request.form.get("keywords_ch")
    new_keywords_to_eng, new_keywords_ch = translate_descriptions(keywords_ch)
    new_image = request.files.get("image")
    new_reorder_point = request.form.get("reorder_point")
    new_pack_size = request.form.get("pack_size")
    new_default_order_qty = request.form.get('default_order_qty')
    new_upc = request.form.getlist('upc[]')
    new_reorder = request.form.get("reorder_enabled")
    new_label_size = request.form.get("label_size")
    print(new_upc)

    supplier = db.fetch_one("dragon_tiny_homes_supplier", "id", material_old_data['supplier_id']).data[0]
    supplier_name = supplier['supplier_name']
    
    if current_user.role != 'user':
        new_inventory = request.form.get("inventory")

        if int(new_inventory) != int(old_inventory):
            db.update("home_depot_items", "material_id", material_id, {"inventory": new_inventory})

            db.insert("home_depot_inventory_logs", {"name": current_user.name,
                                                    "internet_sku_number": new_supplier_sku,
                                                    "item_desc": new_item_desc,
                                                    "item_desc_mandarin": new_item_desc_mandarin,
                                                    "log_description": "Stock Adjustment",
                                                    "log_description_mandarin": "库存调整",
                                                    "material_id": material_id,
                                                    "item_image": material_old_data['item_image'],
                                                    "previous_quantity": old_inventory,
                                                    "current_quantity": new_inventory,
                                                    "quantity_change": int(new_inventory) - int(old_inventory)})

    if int(old_supplier_sku) != int(new_supplier_sku):
        db.update("home_depot_items", "material_id", material_id, {"internet_sku_number": new_supplier_sku})

    if str(old_upc) != str(new_upc):
        db.update("home_depot_items", "material_id", material_id, {"upc": new_upc})

    if current_user.role != "user":
        if int(old_reorder_point) != int(new_reorder_point):
            db.update("home_depot_items", "material_id", material_id, {"reorder_point": new_reorder_point})
        
        if int(old_pack_size) != int(new_pack_size):
            db.update("home_depot_items", "material_id", material_id, {"pack_size": new_pack_size})

        if int(old_default_order_qty) != int(new_default_order_qty):
            db.update("home_depot_items", "material_id", material_id, {"default_order_qty": new_default_order_qty})

    if (old_item_desc != new_item_desc) or (old_item_desc_mandarin != new_item_desc_mandarin):
        db.update("home_depot_items", "material_id", material_id, {"item_desc": new_item_desc,
                                                                   "item_desc_mandarin":new_item_desc_mandarin })
    
    if float(old_item_price) != float(new_item_price):
        db.update("home_depot_items", "material_id", material_id, {"item_price": old_item_price})

    if (old_item_detail != new_item_detail) or (old_item_details_mandarin != new_item_details_mandarin):
        db.update("home_depot_items", "material_id", material_id, {"item_details": new_item_detail,
                                                                   "item_details_mandarin":new_item_details_mandarin })
    
    if str(old_inventory_location) != str(new_inventory_location):
        db.update("home_depot_items", "material_id", material_id, {"inventory_location": new_inventory_location})

    if str(old_keywords) != str(new_keywords):
        db.update("home_depot_items", "material_id", material_id, {"keywords": new_keywords,
                                                                   "keywords_eng_to_ch": new_keywords_to_ch})
        
    if str(old_keywords_ch) != str(new_keywords_ch):
        db.update("home_depot_items", "material_id", material_id, {"keywords_ch": new_keywords_ch,
                                                                   "keywords_ch_to_eng": new_keywords_to_eng})
    
    if old_reorder != new_reorder:
        db.update("home_depot_items", "material_id", material_id, {"is_reorder": new_reorder})

    if old_label_size != new_label_size:
        db.update("home_depot_items", "material_id", material_id, {"label_size": new_label_size})
        
    if new_image:
        image_filename = os.path.join(app.config['UPLOAD_FOLDER_IMG'], f"{str(supplier_name)}_{str(new_supplier_sku)}.jpg")
        new_image.save(image_filename)
        db.update("home_depot_items", "material_id", material_id, {"item_image": f"https://app.137.184.148.164.nip.io/image/{str(supplier_name)}_{str(new_supplier_sku)}.jpg"})

    uploaded_files = request.files.getlist('images')  # 'images' matches the name attribute in the form

    for file in uploaded_files:
        if file:
            # Save each file
            filename = secure_filename(file.filename)  # secure_filename ensures safe filenames
            file.save(os.path.join(app.config['UPLOAD_FOLDER_IMG'], filename))
            db.insert("dth_material_images", {"material_id": material_id,
                                              "image_url":f"https://app.137.184.148.164.nip.io/image/{filename}"})

    return redirect(url_for('get_home_depot_items', supplier_id=material_old_data['supplier_id']))

@app.route("/sample_bar", methods=['GET', 'POST'])
def sample():
    return render_template("pdfsamp.html")
"------------------------------------------------------ DELETE SECTION ---------------------------------------------------------------------------------"

@app.route('/order/delete/<int:order_id>', methods=['DELETE', 'OPTIONS'])
def delete_order(order_id):
    #print(f"Received DELETE request to remove order item with ID: {order_id}")
    response_3 = db.delete("home_depot_delivery_history", "order_id" ,order_id)
    response_2 = db.delete("home_depot_delivery", "order_id" ,order_id)
    response = db.delete("home_depot_orders", "order_id" ,order_id)
    #response_history = db.delete("home_depot_order_history", "order_id", order_id)
    return "DONE"

########################################################################################################################################
"------------------------------------------          REQUEST MATERIAL SECTION --------------------------------------------------------"
@app.route('/request_material', methods=['GET', "POST"])
@login_required
def request_material():
    home_depot_items = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    if home_depot_items.data:
        home_depot_data = combined_items
        supplier_data = supplier_res.data
        return render_template("request_material.html", home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user)
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/update_added_cart_pending_material', methods=['POST', 'GET'])
def update_added_cart_pending_material():
    data = request.get_json() or {}
    pending_id = data.get('id')

    db.update('dth_pending_material_request', "id", pending_id, {'is_added_to_cart': True})
    return data

@app.route('/update_discard_pending_material', methods=['POST', 'GET'])
def update_discard_pending_material():
    data = request.get_json() or {}
    pending_id = data.get('id')
    db.update('dth_pending_material_request', "id", pending_id, {'is_discarded': True})
    return data

@app.route('/send_pending_request_material', methods=['POST'])
def send_pending_request_material():
    data = request.json
    item = data['requestingItem']

    # Suppose you have another dictionary:
    other_dict = {'is_added_to_cart': False, 'is_discarded': False}

    # Merge other_dict into data
    item.update(other_dict)
    db.insert("dth_pending_material_request", item)
    return data


@app.route('/send_request_material', methods=['POST'])
def send_request_material():
    data = request.json
    item = data['requestingItem']

    # Suppose you have another dictionary:
    other_dict = {'is_added_to_order': False, 'is_discarded': False}

    # Merge other_dict into data
    item.update(other_dict)
    db.insert("dth_material_request", item)
    return data


@app.route('/discard_request_material', methods=['POST'])
def discard_request_material():
    data = request.json
    request_material_id = data['request_material_id']
    db.update("dth_material_request", "id", request_material_id, {"is_discarded": True})
    return jsonify({'success': True})

@app.route('/discard_user_order_material', methods=['POST'])
def discard_user_order_material():
    data = request.json
    request_material_id = data['request_material_id']
    db.update("dth_user_order", "id", request_material_id, {"is_discarded": True})
    return jsonify({'success': True})

@app.route('/add_user_order', methods=['POST'])
def add_user_order():
    data = request.json
    print(data)
    to_insert_data = {"requesting_party": current_user.name,
                      "requesting_party_id": current_user.id,
                      "material_id": data['sku_num'],
                      "supplier_name": data['supplier_name'],
                      "internet_sku_number": data['internet_num'],
                      "item_desc": data['description_english'],
                      "item_desc_mandarin": data['description_mandarin'], 
                      "item_price": data['price'],
                        "item_image": data['image'],
                        "quantity_requested": data['default_qty'],
                    "is_added_to_order": False,
                    "is_discarded": False,
                    "notes": data['notes']
                  }
    db.insert("dth_user_order", to_insert_data)
    return jsonify({'success': True})

@app.route('/receive_material', methods=['GET', "POST"])
@login_required
def receive_material():
    home_depot_items = db.fetch_all("home_depot_items")
    supplier_res = db.fetch_all("dragon_tiny_homes_supplier")

    supplier_dict = {supplier['id']: supplier['supplier_name'] for supplier in supplier_res.data}

    # Combine home_depot_items with supplier data using supplier_id
    combined_items = []
    for item in home_depot_items.data:
        # Get the supplier_name from supplier_dict using supplier_id
        supplier_name = supplier_dict.get(item['supplier_id'], 'Unknown Supplier')
        
        # Add supplier_name to the item dictionary
        item['supplier_name'] = supplier_name

        # Add the combined item to the list
        combined_items.append(item)

    if home_depot_items.data:
        home_depot_data = combined_items
        supplier_data = supplier_res.data
        return render_template("receive_material.html", home_depot_items=home_depot_data, supplier_data=supplier_data, user=current_user)
    return jsonify({"message": "Checklist item not found"}), 404

@app.route('/send_receive_material', methods=['POST'])
def send_receive_material():
    receiver_name = request.form.get("requesting_party")
    receiver_id = request.form.get("requesting_party_id")
    global_images = request.files.getlist('global_images[]')
    receive_materials_str = request.form.get('receive_materials')

    print("Files received:", list(request.files.keys()))
    for key in request.files:
        file = request.files.get(key)
        print(f"Key: {key}, Filename: {file.filename}")

    if not receive_materials_str:
        return jsonify({'error': 'Missing receive_materials data'}), 400

    try:
        # Convert the JSON string to a Python list/dict
        receive_materials = json.loads(receive_materials_str)
    except json.JSONDecodeError as e:
        return jsonify({'error': 'Invalid JSON in receive_materials'}), 400

    to_insert_data = {"receiver_name": receiver_name,
                      "receiver_id": receiver_id,
                      "status": "Ongoing"
                    }
    receive_data = db.insert("dth_receive_material", to_insert_data)
    
    for image in global_images:
        filename = secure_filename(image.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER_RECEIVE'], filename)
        image.save(file_path)
        to_insert_img_data = {"receive_id" : receive_data.data[0]['id'],
                              "image": f"https://app.137.184.148.164.nip.io/receive/{filename}"}
        db.insert("dth_receive_material_photo", to_insert_img_data)

    for material in receive_materials:
        to_insert_material = {"receive_id": receive_data.data[0]['id'],
                              "material_id": int(material.get('material_id')),
                              "item_desc": material.get('item_desc'),
                              "received_quantity": material.get('received_quantity'),
                              "quantity_remaining": material.get('received_quantity'),
                              "item_image": material.get('item_image'),}
        receive_material_data = db.insert("dth_receive_material_items", to_insert_material)
        receive_materials_images = request.files.getlist(material.get('material_id'))
        for receive_image in receive_materials_images:
            filename = secure_filename(receive_image.filename)
            to_insert_material_img = {"receive_item_id": receive_material_data.data[0]['id'],
                                      "image": f"https://app.137.184.148.164.nip.io/receive_item/{filename}"}
            file_path = os.path.join(app.config['UPLOAD_FOLDER_RECEIVE_ITEM'], filename)
            receive_image.save(file_path)
            receive_material_data_img = db.insert("dth_receive_material_item_photo", to_insert_material_img)
    return jsonify({
            'message': 'Receive added successfully',
            'redirect_url': '/main'
        })

@app.route('/assign_item/<int:receive_id>', methods=['GET', "POST"])
@login_required
def assign_item(receive_id):
    dth_receive = db.fetch_one("dth_receive_material", "id", receive_id)
    receive_data = dth_receive.data[0]

    dth_receive_photo = db.fetch_one("dth_receive_material_photo", "receive_id", receive_id)
    receive_data_photos = dth_receive_photo.data

    dth_orders = db.fetch_all_delivery("home_depot_order_history")
    orders_data = dth_orders.data

    dth_receive_items = db.fetch_one_assign_items("dth_receive_material_items", "receive_id", receive_id)
    receive_data_items = dth_receive_items.data

    grouped_data = []

    for receive_item in receive_data_items:
        material_id = receive_item.get("material_id")
        item_desc = receive_item.get("item_desc")
        item_image = receive_item.get("item_image")
        received_quantity = receive_item.get("received_quantity")
        quantity_remaining = receive_item.get("quantity_remaining")
        receive_item_id = receive_item.get("id")

        dth_receive_item_photo = db.fetch_one("dth_receive_material_item_photo", "receive_item_id", receive_item_id)
        receive_item_photos = dth_receive_item_photo.data
        
        # Filter orders_data to include only orders with the same material_id
        # and include only the order_number and order_qty_remaining fields.
        matching_orders = [
            {
                "order_number": order.get("order_id"),
                "order_qty_remaining": order.get("order_qty_remaining")
            }
            for order in orders_data
            if order.get("material_id") == material_id
        ]
        
        grouped_data.append({
            "material_id": material_id,
            "item_desc": item_desc,
            "item_image": item_image,
            "receive_item_photos": receive_item_photos,
            "received_quantity": received_quantity,
            "quantity_remaining": quantity_remaining,
            "orders": matching_orders  # This will be an empty list if there are no matches.
        })
    
    print(grouped_data)
    # For example, you can print or return the grouped data:
    return render_template("assign_item.html", user=current_user, receive_data=receive_data, receive_data_photos=receive_data_photos, grouped_data=grouped_data)

@app.route('/submit_assign_item', methods=['POST'])
def submit_assign_item():
    data = request.json
    print("-----------------------------------------")
    print(data)
    print("-----------------------------------------")

    data_orders = data['orders']

    for order in data_orders:
        if order['order_id'] == "No Order Number":
            delivery_items = order['items']
            for item in delivery_items:
                material = db.fetch_one("home_depot_items", "material_id", item['material_id'])
                material_data = material.data[0]
                description_log = f"Receive ID ({data['receive_id']}) material"
                log_desc, log_desc_mandarin = translate_descriptions(description_log)
                to_insert_inventory_log = {'internet_sku_number': material_data['internet_sku_number'],
                                        'item_desc': material_data['item_desc'],
                                        'item_desc_mandarin': material_data['item_desc_mandarin'],
                                        'name': current_user.name,
                                        'quantity_used': 0,
                                        'item_price': material_data['item_price'],
                                        'item_image': material_data['item_image'],
                                        'material_id': item['material_id'],
                                        'log_description': log_desc,
                                        'log_description_mandarin': log_desc_mandarin,
                                        'previous_quantity': int(material_data['inventory']),
                                        'quantity_change': int(item['qty']) * int(material_data['pack_size']),
                                        'current_quantity': int(material_data['inventory']) + (int(item['qty']) * int(material_data['pack_size'])),
                                        'approver_name': current_user.name,
                                        'approver_id': current_user.id
                                        }
                submit_inventory_log = db.insert("home_depot_inventory_logs", to_insert_inventory_log)
                submit_inventory_log_data = submit_inventory_log.data[0]
                db.update('home_depot_items', "material_id", item['material_id'], {'inventory': submit_inventory_log_data['current_quantity']})

                print(item['receive_item_id'])
                current_receive_item = db.fetch_one("dth_receive_material_items", 'material_id', item['receive_item_id'])
                current_receive_item_data_mtr = current_receive_item.data
                filtered_data = [item for item in current_receive_item_data_mtr if str(item.get("receive_id")) == str(data['receive_id'])]
                print(current_receive_item_data_mtr)
                current_receive_item_update = db.fetch_one("dth_receive_material_items", 'id', filtered_data[0]['id'])
                current_receive_item_update_data = current_receive_item_update.data[0]
                db.update("dth_receive_material_items", 'id', filtered_data[0]['id'], {'quantity_assigned': int(current_receive_item_update_data['quantity_assigned']) + int(item['qty']),
                                                                                       "quantity_remaining": int(current_receive_item_update_data['quantity_remaining']) - + int(item['qty'])})
        else:
            to_insert_delivery = {'order_id': order['order_id'],
                                'receiver_name': data['receiver_name'],
                                'delivery_date': data['receive_date'],
                                'approver_id': current_user.id,
                                'approver_name': current_user.name,
                                'receive_id': data['receive_id']}
            insert_delivery = db.insert("home_depot_delivery", to_insert_delivery)
            insert_delivery_data = insert_delivery.data[0]

            delivery_items = order['items']
            for item in delivery_items:
                material = db.fetch_one("home_depot_items", "material_id", item['material_id'])
                material_price = db.fetch_two('home_depot_order_history', 'material_id', item['material_id'], 'order_id', order['order_id'])
                material_data = material.data[0]
                material_price_data = material_price.data[0]
                to_insert_delivery_history = {'delivery_id': insert_delivery_data['delivery_id'],
                                            'order_id': order['order_id'],
                                            'sku_number': material_data['material_id'],
                                            'internet_sku_number': material_data['internet_sku_number'],
                                            'item_desc': material_data['item_desc'],
                                            'item_desc_mandarin': material_data['item_desc_mandarin'],
                                            'item_price': material_data['item_price'],
                                            'item_image': material_data['item_image'],
                                            'actual_item_price': material_price_data['actual_item_price'],
                                            'order_qty_received': int(item['qty']),
                                            'receiver_name': data['receiver_name'],
                                            'material_id': item['material_id'],
                                            'supplier_order_number': material_price_data['supplier_order_number'],
                                            'receive_id': data['receive_id'],
                                            'receive_item_id': item['receive_item_id']
                                            }
                insert_delivery_history = db.insert('home_depot_delivery_history', to_insert_delivery_history)
                insert_delivery_history_data = insert_delivery_history.data[0]

                description_log = f"Receive ID ({data['receive_id']}) material"
                log_desc, log_desc_mandarin = translate_descriptions(description_log)
                to_insert_inventory_log = {'internet_sku_number': material_data['internet_sku_number'],
                                        'item_desc': material_data['item_desc'],
                                        'item_desc_mandarin': material_data['item_desc_mandarin'],
                                        'name': current_user.name,
                                        'quantity_used': 0,
                                        'item_price': material_data['item_price'],
                                            'item_image': material_data['item_image'],
                                            'material_id': item['material_id'],
                                            'log_description': log_desc,
                                            'log_description_mandarin': log_desc_mandarin,
                                            'previous_quantity': int(material_data['inventory']),
                                            'quantity_change': int(item['qty']) * int(material_data['pack_size']),
                                            'current_quantity': int(material_data['inventory']) + (int(item['qty']) * int(material_data['pack_size'])),
                                            'approver_name': current_user.name,
                                            'approver_id': current_user.id
                                        }
                submit_inventory_log = db.insert("home_depot_inventory_logs", to_insert_inventory_log)
                submit_inventory_log_data = submit_inventory_log.data[0]
                db.update('home_depot_items', "material_id", item['material_id'], {'inventory': submit_inventory_log_data['current_quantity']})

                print(item['receive_item_id'])
                current_receive_item = db.fetch_one("dth_receive_material_items", 'material_id', item['receive_item_id'])
                current_receive_item_data_mtr = current_receive_item.data
                print(current_receive_item_data_mtr)
                filtered_data = [item for item in current_receive_item_data_mtr if str(item.get("receive_id")) == str(data['receive_id'])]
                current_receive_item_update = db.fetch_one("dth_receive_material_items", 'id', filtered_data[0]['id'])
                current_receive_item_update_data = current_receive_item_update.data[0]
                db.update("dth_receive_material_items", 'id', filtered_data[0]['id'], {'quantity_assigned': int(current_receive_item_update_data['quantity_assigned']) + int(item['qty']),
                                                                                        "quantity_remaining": int(current_receive_item_update_data['quantity_remaining']) - + int(item['qty'])})

                order_history_res = db.fetch_two("home_depot_order_history", 'order_id', order['order_id'], 'material_id', item['material_id'])
                order_history_data = order_history_res.data[0]
                db.update('home_depot_order_history', 'order_item_number', order_history_data['order_item_number'], {'order_qty_received': int(order_history_data['order_qty_received']) + int(item['qty']),
                                                                                                                    'order_qty_remaining': int(order_history_data['order_qty_remaining']) - int(item['qty']) })
            check_order_status = db.fetch_one('home_depot_order_history', 'order_id', order['order_id'])
            if all(item["order_qty_remaining"] == 0 for item in check_order_status.data):
                db.update("home_depot_orders", "order_id", order['order_id'], {"order_status": "Done"})
        
    check_receive_status = db.fetch_one('dth_receive_material_items', 'receive_id', data['receive_id'])
    if all(item["received_quantity"] <= item["quantity_assigned"] for item in check_receive_status.data):
            db.update("dth_receive_material", "id",  data['receive_id'], {"status": "Assigned"})
    return jsonify({
            'message': '',
            'redirect_url': '/manage_receive_item'
        })

@app.route('/receive_option',  methods=['GET', 'POST'])
def receive_option():
    return render_template("receive_option.html")

@app.route('/manage_receive_item',  methods=['GET', 'POST'])
def manage_receive_item():
    receive_res = db.fetch_all("dth_receive_material")
    receive_data = receive_res.data
    return render_template("manage_receive_item.html", user=current_user, receive_data=receive_data)

# Route to display all checklists
@app.route('/')
def index():
    print("Redirect to Login")
    return redirect(url_for('login'))

import api

if __name__ == '__main__':
    print("Starting the app...")
    app.run(host='0.0.0.0',
    port=5023,
    ssl_context=('/etc/letsencrypt/live/inventory.orcagroup.io/fullchain.pem', '/etc/letsencrypt/live/inventory.orcagroup.io/privkey.pem')
    )
