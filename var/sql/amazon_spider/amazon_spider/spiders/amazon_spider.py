import scrapy
import requests
import base64
import re

class DynamicSpider(scrapy.Spider):
    name = 'dynamic'
    allowed_domains = []

    def __init__(self, start_url=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not start_url:
            raise ValueError("You must provide a start_url")
        self.start_urls = [start_url]
        # Optionally parse the domain to restrict allowed_domains
        domain = scrapy.utils.url.parse_url(start_url).netloc
        self.allowed_domains = [domain]

    def parse(self, response):
        title = response.css("#productTitle::text").get("").strip()
        price_text = response.css(
            "#corePriceDisplay_desktop_feature_div .a-price-whole::text"
        ).get() or response.css(".offer-price::text").get() or ""
        price = float(price_text.replace(",", "").strip().lstrip("$") or 0)

        units_per_case = 1
        product_id = None

        for row, val in zip(response.css("#detailBullets_feature_div > ul > li > span > span.a-text-bold"), response.css("#detailBullets_feature_div > ul > li > span > span:nth-child(2)")):
            text_val = row.css("::text").get("")
            new_val = val.css("::text").get("")
            if "ASIN" in text_val:
                product_id = new_val

        for row in response.css("table#productDetails_techSpec_section_1 tr"):
            hdr = row.css("th::text").get("")
            val = row.css("td::text").get("").replace('\u200e','').strip()
            if "Number of Items" in hdr:
                units_per_case = float(val or 1)
            elif "UPC" in hdr:
                product_id = val

         # look for digits immediately before “pack” (with or without space/hyphen)
        m = re.search(r'(\d+)(?=[\s\-]*pack)', title, re.IGNORECASE)
        if m:
            units_per_case = int(m.group(1))

        img_url = response.css("#landingImage::attr(src)").get()
        # try to inline the image as base64
        try:
            img_resp = requests.get(img_url, timeout=5)
            img_resp.raise_for_status()
            b64 = base64.b64encode(img_resp.content).decode("ascii")
            mime = img_resp.headers.get("Content-Type","image/jpeg")
            img_data = f"data:{mime};base64,{b64}"
        except Exception:
            img_data = None

        yield {
            "supplier_name": "Amazon",
            "product_id":    product_id,
            "sku":           title,
            "price":         price,
            "details":       "",
            "pack_size":     units_per_case,
            "item_image":    img_data
        }
