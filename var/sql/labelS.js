const createElements = async (order, item, pageNum) => {
  const internalSku = await generateInternalSku(item, order.material_id);
  const qrText = `${internalSku}-${pageNum}`;
  const qrBuffer = await QRCode.toBuffer(qrText, { margin: 1 });

  const labelWidth = 600;
  const labelHeight = 300;

  const elements = [
    {
      type: "sidebar",
      text: "DTH ITEM",
      font: "Helvetica-Bold",
      fontSize: 0.08, // 8% of label height
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.10, height: 1.0 }, // 10% width, full height
      position: { x: 0, y: 0 },
    },
    {
      type: "item_name",
      text: (item.item_desc || "UNKNOWN ITEM").toUpperCase().substring(0, 20), // Limit to 20 chars
      font: "Helvetica-Bold",
      fontSize: 0.15, // 15% of label height
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.55, height: 0.4 },
      position: { x: 0.12, y: 0.05 },
    },
    {
      type: "order_id",
      text: order.order_id,
      font: "Helvetica",
      fontSize: 0.10, // 10% of label height
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.65 },
    },
    {
      type: "sku",
      text: internalSku,
      font: "Helvetica",
      fontSize: 0.10,
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.77 },
    },
    {
      type: "location",
      text: "Bay 1 | Shelf 4 | Bin 18",
      font: "Helvetica",
      fontSize: 0.075,
      fontColor: "black",
      fillColor: "white",
      bounds: { width: 0.55, height: 0.1 },
      position: { x: 0.12, y: 0.88 },
    },
    {
      type: "qr_code",
      image: qrBuffer,
      bounds: { width: 0.33, height: 0.66 }, // ~33% of width, ~66% of height
      position: { x: 0.65, y: 0.05 },
    },
  ];

  return { elements, labelWidth, labelHeight };
};

function renderElements(doc, elementData) {
  const { elements, labelWidth, labelHeight } = elementData;

  elements.forEach((el) => {
    const x = el.position.x * labelWidth;
    const y = el.position.y * labelHeight;
    const width = el.bounds.width * labelWidth;
    const height = el.bounds.height * labelHeight;

    if (el.type === "sidebar") {
      doc.rect(x, y, width, height).fill(el.fillColor);
      doc.save()
        .fillColor(el.fontColor)
        .font(el.font)
        .fontSize(el.fontSize * labelHeight)
        .rotate(90, { origin: [x + width / 2, y + height / 2] })
        .text(el.text, y - height / 2, -(x + width / 2), { align: "center" })
        .restore();
    } else if (el.type === "qr_code") {
      doc.image(el.image, x, y, { width, height });
    } else {
      doc.font(el.font)
        .fontSize(el.fontSize * labelHeight)
        .fillColor(el.fontColor)
        .text(el.text, x, y, { width, height });
    }
  });
}

// Example invocation within PDF generation
async function createLabelPdf(order, item) {
  const filePath = `./pdf/${order.order_id}.pdf`;
  ensureDirectoryExists(filePath);

  const doc = new PDFDocument({ size: [600, 300], margin: 0 });
  doc.pipe(fs.createWriteStream(filePath));

  for (let i = 1; i <= order.order_qty_requested; i++) {
    if (i > 1) doc.addPage({ size: [600, 300], margin: 0 });
    const elementData = await createElements(order, item, i);
    renderElements(doc, elementData);
  }

  doc.end();
  return filePath;
}
