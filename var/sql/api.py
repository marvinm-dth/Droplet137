from flask import Blueprint, request, jsonify, send_from_directory, current_app
from werkzeug.security import check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
#from app3_5026 import app, db  # import your Flask app and CustomDB
import os, html, ast, json, requests, base64
from io import BytesIO

# API blueprint
api = Blueprint('api', __name__, url_prefix='/api/v1')

@api.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '')
    password = data.get('password', '')
    resp = current_app.db.fetch_one('all_users', 'username', username)
    if not resp.data or resp.data[0]['password'] != password:
        return jsonify({'msg': 'Invalid credentials'}), 401

    user = resp.data[0]
    # Make sure identity is a string (or int), not a dict:
    identity = str(user['eid'])
    # Put extra info like role here:
    additional = { 'role': user['role'] }

    token = create_access_token(
      identity=identity,
      additional_claims=additional
    )
    return jsonify({'access_token': token}), 200
# --------- Items ---------
@api.route('/items', methods=['GET'])
@jwt_required()
def get_items():
    return jsonify(current_app.db.fetch_all('home_depot_items').data or []), 200

@api.route('/items/<int:material_id>', methods=['GET'])
@jwt_required()
def get_item(material_id):
    resp = current_app.db.fetch_one('home_depot_items', 'material_id', material_id)
    return (jsonify(resp.data[0]), 200) if resp.data else (jsonify({'msg':'Not found'}), 404)

# --------- Orders ---------
@api.route('/orders', methods=['GET'])
@jwt_required()
def list_orders():
    return jsonify(current_app.db.fetch_all('home_depot_orders').data or []), 200

@api.route('/orders/<int:order_id>', methods=['GET'])
@jwt_required()
def get_order(order_id):
    order = current_app.db.fetch_one('home_depot_orders','order_id',order_id).data
    history = current_app.db.fetch_one('home_depot_order_history','order_id',order_id).data
    if not order:
        return jsonify({'msg':'Order not found'}), 404
    return jsonify({'order': order[0], 'history': history or []}), 200

@api.route('/orders', methods=['POST'])
@jwt_required()
def create_order():
    data = request.get_json() or {}
    result = current_app.db.insert('home_depot_orders', data)
    return jsonify(result.data or []), 201

@api.route('/orders/<int:order_id>', methods=['DELETE'])
@jwt_required()
def delete_order(order_id):
    current_app.db.delete('home_depot_orders','order_id',order_id)
    return jsonify({'msg':'Deleted'}), 200

# --------- File Upload ---------
@api.route('/upload', methods=['POST'])
@jwt_required()
def api_upload():
    if 'file' not in request.files:
        return jsonify({'msg':'No file'}), 400
    file = request.files['file']
    folder = current_app.db.config.get('UPLOAD_FOLDER_IMG')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, file.filename)
    file.save(path)
    return jsonify({'filename': file.filename}), 200

# --------- Barcode Search ---------
@api.route('/search_barcode', methods=['POST'])
@jwt_required()
def api_search_barcode():
    barcode = (request.get_json() or {}).get('barcode')
    if not barcode:
        return jsonify({'success':False,'msg':'No barcode'}),400
    mats = current_app.db.fetch_all('home_depot_items').data
    for m in mats:
        try: m['upc']=ast.literal_eval(html.unescape(m.get('upc','[]')))
        except: m['upc']=[]
    mat = next((m for m in mats if barcode in m['upc']), None)
    if not mat: return jsonify({'success':False,'msg':'Not found'}),404
    sup = current_app.db.fetch_one('dragon_tiny_homes_supplier','id',mat['supplier_id']).data
    sup_name = sup[0]['supplier_name'] if sup else 'Unknown'
    return jsonify({'success':True,'supplier_name':sup_name,**{k:mat[k] for k in ['material_id','internet_sku_number','item_desc','item_desc_mandarin','item_price','item_image','default_order_qty','keywords','keywords_ch']}}),200

# --------- External Data Fetch ---------
@api.route('/fetch_item_details', methods=['GET'])
@jwt_required()
def api_fetch_item_details():
    url = request.args.get('url'); supplier = request.args.get('supplier_name')
    # call existing Flask route logic using requests to local server or refactor function
    # For brevity, proxied call:
    resp = requests.get(f"{request.host_url}fetch_item_details?url={url}&supplier_name={supplier}")
    return (resp.json(), resp.status_code)

# --------- Dashboards ---------
@api.route('/dashboard', methods=['GET'])
@jwt_required()
def api_dashboard():
    return jsonify(current_app.db.fetch_all_delivery('home_depot_order_history').data or []),200

@api.route('/request_dashboard', methods=['GET'])
@jwt_required()
def api_request_dashboard():
    return jsonify(current_app.db.fetch_two('dth_material_request','is_added_to_order',False,'is_discarded',False).data or []),200

# --------- Material Requests ---------
@api.route('/materials', methods=['GET'])
@jwt_required()
def list_materials():
    return jsonify(current_app.db.fetch_all('home_depot_items').data or []),200

@api.route('/send_request_material', methods=['POST'])
@jwt_required()
def send_request_material():
    item = request.get_json().get('requestingItem',{})
    item.update({'is_added_to_order':False,'is_discarded':False})
    current_app.db.insert('dth_material_request',item)
    return jsonify({'success':True}),200

# --------- Pending Cart ---------
@api.route('/update_added_cart_pending_material', methods=['POST'])
@jwt_required()
def update_added_cart():
    pid=request.get_json().get('id'); current_app.db.update('dth_pending_material_request','id',pid,{'is_added_to_cart':True}); return jsonify({'success':True}),200

@api.route('/update_discard_pending_material', methods=['POST'])
@jwt_required()
def update_discard_cart():
    pid=request.get_json().get('id'); current_app.db.update('dth_pending_material_request','id',pid,{'is_discarded':True}); return jsonify({'success':True}),200

@api.route('/send_pending_request_material', methods=['POST'])
@jwt_required()
def send_pending_request():
    item=request.get_json().get('requestingItem',{}); item.update({'is_added_to_cart':False,'is_discarded':False}); current_app.db.insert('dth_pending_material_request',item); return jsonify({'success':True}),200

@api.route('/discard_request_material', methods=['POST'])
@jwt_required()
def discard_request_material():
    rid=request.get_json().get('request_material_id'); current_app.db.update('dth_material_request','id',rid,{'is_discarded':True}); return jsonify({'success':True}),200

@api.route('/discard_user_order_material', methods=['POST'])
@jwt_required()
def discard_user_order_material():
    rid=request.get_json().get('request_material_id'); current_app.db.update('dth_user_order','id',rid,{'is_discarded':True}); return jsonify({'success':True}),200

@api.route('/add_user_order', methods=['POST'])
@jwt_required()
def api_add_user_order():
    data=request.get_json(); data.update({'is_added_to_order':False,'is_discarded':False,'requesting_party':get_jwt_identity()['user_id'],'requesting_party_id':get_jwt_identity()['user_id']}); current_app.db.insert('dth_user_order',data); return jsonify({'success':True}),200

# --------- Receive Materials ---------
@api.route('/receive_materials', methods=['GET'])
@jwt_required()
def list_receive_materials():
    return jsonify(current_app.db.fetch_all('dth_receive_material').data or []),200

@api.route('/send_receive_material', methods=['POST'])
@jwt_required()
def api_send_receive_material():
    # form-data; handle like original route or proxy to HTML route
    return jsonify({'msg':'Not implemented in API'}),501
