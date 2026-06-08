from flask import Flask, render_template, request
from flask_cors import CORS

app = Flask(__name__)

# Initialize CORS
CORS(app)

@app.route('/')
def pre_inspection_form():
    return render_template('pre_inspection_form.html')

# Stage 1 Form
@app.route('/stage1', methods = ['GET', 'POST'])
def stage1():
    stage_1_tasks = [
        {"checklist_num": 1, "description": "The VIN label is on and readable", "description_chinese": "VIN 标签已贴在上面，并且清晰可读"},
        {"checklist_num": 2, "description": "The trailer is black with no primer showing", "description_chinese": "拖车是黑色的，没有底漆显示出来"},
        {"checklist_num": 3, "description": "Belly pan on the bottom of the trailer is installed", "description_chinese": "拖车底部的铁皮已安装"},
        {"checklist_num": 4, "description": "The trailer light plug is wired up and completed", "description_chinese": "拖车灯插头已连接完成"},
        {"checklist_num": 5, "description": "The breakaway box and switch are installed", "description_chinese": "应急断电盒和开关已安装好"},
        {"checklist_num": 6, "description": "There are three lights on the side of the trailer", "description_chinese": "拖车侧面有三盏灯"},
        {"checklist_num": 7, "description": "There are turning lights on the back of the trailer", "description_chinese": "背面有转向灯"},
        {"checklist_num": 8, "description": "There is a center marker light on the back of the trailer", "description_chinese": "背部有一个中央指示灯"},
        {"checklist_num": 9, "description": "Left turn signal works", "description_chinese": "左转向灯工作正常"},
        {"checklist_num": 10, "description": "Right turn signal works", "description_chinese": "右转向灯工作正常"},
        {"checklist_num": 11, "description": "Brake lights work", "description_chinese": "刹车灯正常工作"},
        {"checklist_num": 12, "description": "Running lights work", "description_chinese": "行车灯工作正常"},
        {"checklist_num": 13, "description": "Trailer brakes work", "description_chinese": "拖车刹车正常工作"},
        {"checklist_num": 14, "description": "Trailer Dimension 1", "description_chinese": "拖车尺寸 1"},
        {"checklist_num": 15, "description": "Trailer Dimension 2", "description_chinese": "拖车尺寸 2"},
        {"checklist_num": 16, "description": "Trailer Dimension 3", "description_chinese": "拖车尺寸 3"},
        {"checklist_num": 17, "description": "Trailer Dimension 4", "description_chinese": "拖车尺寸 4"},
        {"checklist_num": 18, "description": "Trailer Dimension 5", "description_chinese": "拖车尺寸 5"},
        {"checklist_num": 19, "description": "Trailer Dimension 6", "description_chinese": "拖车尺寸 6"},
        {"checklist_num": 20, "description": "Trailer Dimension 7", "description_chinese": "拖车尺寸 7"},
        {"checklist_num": 21, "description": "L brackets to hold floor joist are installed", "description_chinese": "安装底座与木梁连接固定铁支架"},
        {"checklist_num": 22, "description": "Size of the trailer main beam", "description_chinese": "拖车主梁的尺寸"},
        {"checklist_num": 23, "description": "Size of the trailer Ball", "description_chinese": "拖车球锁头的尺寸"},
        {"checklist_num": 24, "description": "Breakaway safety chains installed", "description_chinese": "紧急断开安全链已安装"},
        {"checklist_num": 25, "description": "Front Jack is installed", "description_chinese": "前支撑杆摇臂已安装"},
        {"checklist_num": 26, "description": "Two axles installed", "description_chinese": "已安装两个车轴"},
        {"checklist_num": 27, "description": "How many Bolts on each wheel?", "description_chinese": "每个轮子上有多少颗螺栓？"},
        {"checklist_num": 28, "description": "Wheels are installed and all lugs are tightened ", "description_chinese": "车轮已安装，所有轮毂螺栓已拧紧"}
    ]

    stage_1_5_tasks = [
        {"checklist_num": 1, "description": "2x4 are attached to mounting bracket with simpson screws", "description_chinese": "2x4 用螺栓固定木梁在铁支架旁"},
        {"checklist_num": 2, "description": "Double 2x4 is installed on the outside edge", "description_chinese": "底座外侧安装了双层2x4木料并连接一起"},
        {"checklist_num": 3, "description": "2x4 are shaved down so they are level", "description_chinese": "2x4 底座木梁剥削修整，使其水平"},
        {"checklist_num": 4, "description": "R3 1/2\" Pink Foam Board is installed on the outside cavity", "description_chinese": "R3 1/2\" 英寸的粉红色泡沫板已安装在底座外圈空腔内"},
        {"checklist_num": 5, "description": "Pink Foam Board is sealed with foam in a can", "description_chinese": "Pink Foam Board 用罐装泡沫密封链接"},
        {"checklist_num": 6, "description": "R19 fiberglass insulation is installed on the outside cavity", "description_chinese": "R19玻璃纤维绝缘材料已安装在底座外圈空腔内粉板上"},
        {"checklist_num": 7, "description": "3/4 OSB Plywood is cut and installed", "description_chinese": "3/4英寸的OSB胶合板已被切割并安装"},
        {"checklist_num": 8, "description": "Plywood cut line is straight on the inside Joist", "description_chinese": "内部横梁的切割线是直的"}
    ]

    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage1.html", stage_1_tasks=stage_1_tasks, stage_1_5_tasks=stage_1_5_tasks)

# Stage 2 Form
@app.route('/stage2', methods = ['GET', 'POST'])
def stage2():
    stage_2_tasks = [
        {"checklist_num": 1, "description": "The house is wrapped in construction paper", "description_chinese": "房屋已包裹防水纸"},
        {"checklist_num": 2, "description": "Cap staples are used to hold paper in place", "description_chinese": "使用防水绿色订书钉固定纸张在墙面"},
        {"checklist_num": 3, "description": "All seams and edges of building paper are taped with tyvek tape", "description_chinese": "防水纸的所有接缝，边缘，破损都用Tyvek白色防水胶带粘贴"},
        {"checklist_num": 4, "description": "Windows are installed ", "description_chinese": "窗户已安装"},
        {"checklist_num": 5, "description": "Screws are in all window holes", "description_chinese": "窗户的所有孔洞都有螺丝"},
        {"checklist_num": 6, "description": "Windows have black flashing tape on all 4 sides starting from bottom going to top", "description_chinese": "窗户的四周从底部到顶部都有防水黑胶带"},
        {"checklist_num": 7, "description": "Inside the window gap are filled with foam", "description_chinese": "窗户内部填充了泡沫"},
        {"checklist_num": 8, "description": "Black Ice and water shield is  on the Roof from low side to the high side", "description_chinese": "防水油毡纸覆盖在屋顶上，从低处到高处"},
        {"checklist_num": 9, "description": "Metal drip edge is installed around the Roof", "description_chinese": "屋顶周围安装了金属防水边固定油毡纸"}
    ]
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage2.html", stage_2_tasks=stage_2_tasks)

# Stage 3 Form
@app.route('/stage3', methods = ['GET', 'POST'])
def stage3():
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage3.html")

# Stage 4 Form
@app.route('/stage4', methods = ['GET', 'POST'])
def stage4():
    stage_4_tasks = [
        {"checklist_num": 1, "description": "Drain and Waste Pipes installed to drawing specifications", "description_chinese": "排水管道按照图纸规格安装"},
        {"checklist_num": 2, "description": "Drain and Waste Connections  are flowing in correction directions", "description_chinese": "排水连接流向正确"},
        {"checklist_num": 3, "description": "Drain and Waste Vent Stack goes out of the roof ", "description_chinese": "排水通风管穿过屋顶"},
        {"checklist_num": 4, "description": "Drain and Waste trap under Shower has 4\" minimum after trap", "description_chinese": "淋浴的排水在反水弯后至少有4英寸"},
        {"checklist_num": 5, "description": "Laundry is 2\" PVC with 16\" Stand pipe", "description_chinese": "洗衣房的管道是2英寸的PVC管，带有16英寸的立管"},
        {"checklist_num": 6, "description": "At least 4\" Run after any trap", "description_chinese": "在任何陷阱之后至少有4英寸的管道延伸"},
        {"checklist_num": 7, "description": "Bathroom sink stubbed out", "description_chinese": "浴室下水已经预留完毕"},
        {"checklist_num": 8, "description": "Kitchen sink stubbed out", "description_chinese": "厨房水槽下水已经预留完毕"},
        {"checklist_num": 9, "description": "Drain and Waste lines connected under the trailer ", "description_chinese": "排水管道连接在房车底部"},
        {"checklist_num": 10, "description": "Drain and Waste lines are plugged and filled with water", "description_chinese": "排水管道已经堵塞并注满水"},
        {"checklist_num": 11, "description": "1/2\" PEX is installed according to the drawing", "description_chinese": "1/2英寸的PEX管已按照图纸安装"},
        {"checklist_num": 12, "description": "All PEX connections are crimped", "description_chinese": "所有PEX连接已经压紧铁筘"},
        {"checklist_num": 13, "description": "PEX lines have water inlet", "description_chinese": "PEX管线已预留入水口"},
        {"checklist_num": 14, "description": "PEX lines have stub out for water spigot", "description_chinese": "PEX管线有出水龙头口"},
        {"checklist_num": 15, "description": "PEX lines are stubbed out for water heater", "description_chinese": "PEX管线已经为热水器留有冷热水口"},
        {"checklist_num": 16, "description": "PEX lines are stubbed out for kitchen sink", "description_chinese": "PEX管线已为厨房留有冷热水口"},
        {"checklist_num": 17, "description": "PEX lines are stubbed out for bathroom sink", "description_chinese": "PEX管线已为浴室留有冷热水口"},
        {"checklist_num": 18, "description": "PEX lines is installed for bathroom toilet", "description_chinese": "PEX管线已安装用于浴室马桶上水口"},
        {"checklist_num": 19, "description": "Shower mixing valve is mounted ", "description_chinese": "淋浴混合阀安装"},
        {"checklist_num": 20, "description": "Shower mixing valve is connected to PEX line ", "description_chinese": "淋浴混合阀连接到PEX管线"},
        {"checklist_num": 21, "description": "Shower mixing valve has pipe sealant on connections", "description_chinese": "淋浴混合阀连接处有管道密封剂生胶带"},
        {"checklist_num": 22, "description": "PEX lines are connected to laundry to Laundry", "description_chinese": "PEX管道预留洗衣机冷热水口"},
        {"checklist_num": 23, "description": "PEX lines have been put under 80 PSI of air pressure for 4 hours", "description_chinese": "PEX管道已经憋了80 PSI的空气压力4小时"},
        {"checklist_num": 24, "description": "Nail plates over all plumbing that goes through wood", "description_chinese": "铁片保护钉在所有穿过木头的管道上"},
    ]
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage4.html", stage_4_tasks=stage_4_tasks)

# Stage 5 Form
@app.route('/stage5', methods = ['GET', 'POST'])
def stage5():
    stage_5_tasks = [
        {"checklist_num": 1, "description": "The electric panel is installed", "description_chinese": "电表箱已安装"},
        {"checklist_num": 2, "description": "6/3 service entrance wire is installed  in the box to the outside", "description_chinese": "6/3总入电黑线已安装在外部墙与电表箱中"},
        {"checklist_num": 3, "description": "The electric panel is grounded to the trailer (wire type)", "description_chinese": "电表箱内连接底部拖车避雷线地线（电线类型）"},
        {"checklist_num": 4, "description": "The roof is grounded to the trailer (wire type)", "description_chinese": "屋顶连接到底部拖车避雷线（电线类型）"},
        {"checklist_num": 5, "description": "Two individual circuits in the kitchen 12/2 wire", "description_chinese": "厨房中有两个独立电路，使用12/2黄电线。"},
        {"checklist_num": 6, "description": "One 220v circuit in the kitchen for a cook top 12/3 wire", "description_chinese": "厨房中有一个用于灶具的220伏特电路，使用12/3黄电线。"},
        {"checklist_num": 7, "description": "One ciruit in the bathroom with 1 gang box close to sink 12/2 wire", "description_chinese": "浴室中有一条电路，首先串联靠近水槽保险插座，使用12/2黄电线。"},
        {"checklist_num": 8, "description": "One 2 gang light switch box in bathroom connected to sink outlet", "description_chinese": "浴室中安装双电盒"},
        {"checklist_num": 9, "description": "Wining in bathroom switch box for lights and a fan", "description_chinese": "浴室双电盒内用于从水槽旁保险插座串联灯开关和风扇的布线。"},
        {"checklist_num": 10, "description": "Vent fan is installed in the bathroom with wires tucked away", "description_chinese": "浴室安装了排气扇，并且电线剥皮处与连接盖帽全部在详中没有遗漏外面"},
        {"checklist_num": 11, "description": "Vent fan exhaust duck goes outside", "description_chinese": "排气扇的排气管道留在外墙口可延伸。"},
        {"checklist_num": 12, "description": "One circuit for out door outlet next to door 12/2", "description_chinese": "户外门旁边有一个用于插座的电路，使用12/2黄电线。"},
        {"checklist_num": 13, "description": "One exterior light above the door 12/2", "description_chinese": "户外门上方有一个外部灯，使用12/2黄电线。"},
        {"checklist_num": 14, "description": "Box for the smoke detector installed in main living area 14/2", "description_chinese": "主要起居区安装了烟雾探测器的盒子，使用14/2白电线。"},
        {"checklist_num": 15, "description": "Outlets spaced around liiving area according to drawing  ", "description_chinese": "根据图纸在起居区周围安装了插座。"},
        {"checklist_num": 16, "description": "Light switches are placed according to the drawing", "description_chinese": "灯开关的位置按照图纸上安置。"},
        {"checklist_num": 17, "description": "All boxes with multiple wires have the ground wires twisted and crimped", "description_chinese": "所有带有多根电线的盒子都将接地线扭曲并压接铜筘。"},
        {"checklist_num": 18, "description": "One circuit next to the laundry 12/2", "description_chinese": "洗衣机旁边有一条电路，使用12/2黄电线。"},
        {"checklist_num": 19, "description": "Electric panel has correct breakers installed for the wire type", "description_chinese": "电表箱内已安装正确空气开关以适应电线类型。"},
        {"checklist_num": 20, "description": "Wires going into the electric panel are secured", "description_chinese": "进入电表箱的电线已经固定。"},
        {"checklist_num": 21, "description": "Ground bar is installed in the electric panel", "description_chinese": "电表箱中安装了零线排。"},
        {"checklist_num": 22, "description": "Wires are stapled within 6\" of each box", "description_chinese": "每个电线盒子附近距离不超过6英寸处用夹子子固定电线。"},
        {"checklist_num": 23, "description": "All holes in the top plate are filled with fire calking", "description_chinese": "顶棚上木梁的所有穿电线孔洞都用防火胶填充。"},
        {"checklist_num": 24, "description": "Plug next to the water heater connected to outdoor outlet 12/2", "description_chinese": "从室外插座串联热水器旁边的插座，使用12/2黄电线。"},
        {"checklist_num": 25, "description": "Wire for the AC is stubbed out 12/2", "description_chinese": "空调的电线已经预留好，使用12/2黄电线。"},
        {"checklist_num": 26, "description": "Nail plates over any wires that are close to the edge", "description_chinese": "在靠近竖梁边缘的任何电线上方安装铁皮护板。"},
        {"checklist_num": 27, "description": "There is no more than 1/2\" of wire sheathing in each electric box", "description_chinese": "每个电线和和电表箱中的未剥皮电线护套不得超过1/2英寸剩余。"},
    ]
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage5.html", stage_5_tasks=stage_5_tasks)

# Stage 6 Form
@app.route('/stage6', methods = ['GET', 'POST'])
def stage6():
    stage_6_tasks = [
        {"checklist_num": 1, "description": "Minimum of R13 fiberglass is installed in all of the wall cavities", "description_chinese": "所有墙壁四周都安装了至少R13级别的玻璃纤维绝缘材料。"},
        {"checklist_num": 2, "description": "1/2\" pink foam board s installed in the floor", "description_chinese": "地面底部安装了1/2英寸的粉色泡沫板。"},
        {"checklist_num": 3, "description": "Foam in a can seals all of the pink foam boards in the floor", "description_chinese": "罐装发泡链接地面底部上所有粉色泡沫保温板。"},
        {"checklist_num": 4, "description": "Minimum of R19 fiberglass is installed in the floor", "description_chinese": "地面底部中安装了至少R19级别的玻璃纤维绝缘材料在粉色泡沫保温板上。"},
        {"checklist_num": 5, "description": "Minimum of R19 fiberglass is installed in the roof bays", "description_chinese": "屋顶夹层中安装了至少R19级别的玻璃纤维绝缘材料。"},
        {"checklist_num": 6, "description": "Wheel wells are completely covered in pink foam board ", "description_chinese": "车轮毂先用绿色防水木包裹然后再完全被粉色泡沫板覆盖。"},
        {"checklist_num": 7, "description": "Any remaining gaps and cracks are filled with foam", "description_chinese": "任何剩余的缝隙和裂缝都用泡沫或保温棉填充。。"},
        {"checklist_num": 8, "description": "All windows and doors have expanding foam around them", "description_chinese": "所有窗户和门周围都有膨胀泡沫填充。"}
    ]
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage6.html", stage_6_tasks=stage_6_tasks)

# Stage 7 Form
@app.route('/stage7', methods = ['GET', 'POST'])
def stage7():
    stage_7_tasks = [
        {"checklist_num": 1, "description": "Vin number placard on trailer frame", "description_chinese": "拖车框架上有VIN号码牌。"},
        {"checklist_num": 2, "description": "Chains on the trailer", "description_chinese": "拖车上有链条。"},
        {"checklist_num": 3, "description": "Outdoor light installed and working", "description_chinese": "室外灯已安装并且正常工作。"},
        {"checklist_num": 4, "description": "Outdoor outlet installed with outdoor cover", "description_chinese": "室外插座已安装，并安装了室外盖板。"},
        {"checklist_num": 5, "description": "AC has disconnect or cover box ", "description_chinese": "空调装置有断开开关或者保护盒。"},
        {"checklist_num": 6, "description": "Hot water heater is installed", "description_chinese": "热水器已安装。"},
        {"checklist_num": 7, "description": "Ground wires are screwed into the trailer frame", "description_chinese": "避雷线地线被螺丝固定在拖车框架上。"},
        {"checklist_num": 8, "description": "Ground wire is screwed into the roof", "description_chinese": "避雷线顶线被螺丝固定在屋顶上。"},
        {"checklist_num": 9, "description": "Fire extinguisher is mounted next to the door", "description_chinese": "灭火器被安装在门旁边。"},
        {"checklist_num": 10, "description": "Smoke detector is installed and working", "description_chinese": "烟雾探测器已安装并正常工作。"},
        {"checklist_num": 11, "description": "Plumbing under kitchen sink is connected", "description_chinese": "厨房水槽下的管道已连接。"},
        {"checklist_num": 12, "description": "Plumbing for bathroom sink is connected", "description_chinese": "浴室水槽的管道已连接。"},
        {"checklist_num": 13, "description": "Bathroom has a GFCI outlet", "description_chinese": "浴室有一个GFCI保险插座。"},
        {"checklist_num": 14, "description": "Bathroom has a humidistat", "description_chinese": "浴室有一个排风控制器。"},
        {"checklist_num": 15, "description": "Kitchen has two GFCI outlets", "description_chinese": "厨房有两个GFCI保险插座。"},
        {"checklist_num": 16, "description": "Electric panel is labeled", "description_chinese": "电表箱已标记空气开关英文说明。"},
        {"checklist_num": 17, "description": "Egress window is installed with hardware removed", "description_chinese": "安装了出口窗户，并已移除硬件。"},
        {"checklist_num": 18, "description": "Exit sign is on the egress window", "description_chinese": "粘贴安全出口红色标志位于出口窗户上。"},
        {"checklist_num": 19, "description": "Railing in the loft is installed ", "description_chinese": "阁楼的栏杆已安装。"},
        {"checklist_num": 20, "description": "All of the lights are hooked and tested", "description_chinese": "所有的灯都已连接并测试过。"},
        {"checklist_num": 21, "description": "All of the GFCI are Green and tested", "description_chinese": "所有的GFCI保险插座都显示为绿色并已测试。"},
        {"checklist_num": 22, "description": "Manuals for all of the appliances are in the Home", "description_chinese": "所有家电的说明书和遥控器都在。"},
        {"checklist_num": 23, "description": "Home has been tested with water", "description_chinese": "房屋下水口憋水，用水箱注水，显示水位线"}
    ]
    if request.method == 'POST':
        data = request.form
        return 'HELLO WORLD'
    return render_template("stage7.html", stage_7_tasks=stage_7_tasks)

@app.route('/stage_1_form_submit', methods=['POST'])
def submit():
    info_sample = request.form['trailer_1_done']
    info_sample2 = request.form['trailer_3_inspected']
    info_sample3 = request.form['trailer_17_inspected']
    return f"NOTE SAMPLE, {info_sample}, {info_sample2}, {info_sample3}"

if __name__ == '__main__':
     app.run(host='0.0.0.0', port=5020)