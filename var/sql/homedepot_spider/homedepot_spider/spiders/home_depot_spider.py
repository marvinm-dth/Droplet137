import scrapy
import requests
import base64
import re
import json

class DynamicSpider(scrapy.Spider):
    name = 'dynamic_hd'
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
        # Extract all inline script contents
        try:
            scripts = response.xpath('//script/text()').getall()
        except Exception as e:
            self.logger.error(f"Failed to extract scripts: {e}")
            return

        # Find the one containing window.__APOLLO_STATE__
        try:
            apollo_script = next((s for s in scripts if 'window.__APOLLO_STATE__' in s), None)
            if not apollo_script:
                self.logger.warning('No Apollo state script found')
                return
        except Exception as e:
            self.logger.error(f"Error finding Apollo script: {e}")
            return

        # Regex out the JSON object
        try:
            match = re.search(r"window\.__APOLLO_STATE__\s*=\s*(\{.*?\});", apollo_script, re.DOTALL)
            if not match:
                self.logger.warning('Apollo state regex did not match')
                return
            state = json.loads(match.group(1))
        except Exception as e:
            self.logger.error(f"Failed to parse Apollo state JSON: {e}")
            return

        # Locate the BaseProduct entry
        try:
            product = next(v for k, v in state.items() if k.startswith('base-catalog-'))
        except StopIteration:
            self.logger.warning('No BaseProduct entry found in Apollo state')
            return
        except Exception as e:
            self.logger.error(f"Error locating BaseProduct entry: {e}")
            return

        # Core fields with try/except
        try:
            supplier_name = product.get('identifiers', {}).get('brandName', '')
        except Exception as e:
            self.logger.error(f"Error extracting supplier_name: {e}")
            supplier_name = ''

        try:
            sku = product.get('identifiers', {}).get('productLabel', '')
        except Exception as e:
            self.logger.error(f"Error extracting sku: {e}")
            sku = ''

        try:
            product_id = product.get('itemId', '')
        except Exception as e:
            self.logger.error(f"Error extracting product_id: {e}")
            product_id = ''

        try:
            details = product.get('details', {}).get('description', '')
        except Exception as e:
            self.logger.error(f"Error extracting details: {e}")
            details = ''

        # Pricing
        try:
            pricing = next(v for k, v in product.items() if k.startswith('pricing('))
            price = pricing.get('value')
            units_per_case = (
                pricing.get('alternate', {})
                    .get('unit', {})
                    .get('unitsPerCase', 1)
            )
        except StopIteration:
            self.logger.warning('No pricing info found')
            price = None
            units_per_case = 1
        except Exception as e:
            self.logger.error(f"Error extracting pricing: {e}")
            price = None
            units_per_case = 1

        # Image -> base64
        try:
            images = product.get('media', {}).get('images', [])
            image_data = None
            if images:
                img_url = images[0].get('url', '').replace('<SIZE>', '600')
                try:
                    resp = requests.get(img_url, timeout=5)
                    resp.raise_for_status()
                    b64 = base64.b64encode(resp.content).decode('ascii')
                    mime = resp.headers.get('Content-Type', 'image/jpeg')
                    image_data = f"data:{mime};base64,{b64}"
                except Exception as e:
                    self.logger.error(f"Failed to fetch image: {e}")
        except Exception as e:
            self.logger.error(f"Error processing images: {e}")
            image_data = None

        # Yield in JSON structure matching your Flask output
        yield {
            'supplier_name': supplier_name,
            'product_id':    product_id,
            'sku':           sku,
            'description':   sku,
            'price':         price,
            'details':       details,
            'pack_size':     units_per_case,
            'item_image':    image_data
        }

