from escpos.printer import File
from PIL import Image

DEVICE_PATH = "/dev/usb/lp0"   # or "/dev/lp0"
IMG_PATH = "logo.png"          # or "data/logo.png"

def main():
    p = None
    try:
        img = Image.open(IMG_PATH)
        img = img.convert("1")   # 1-bit black/white

        max_width = 576
        if img.width > max_width:
            scale = max_width / float(img.width)
            new_height = int(img.height * scale)
            img = img.resize((max_width, new_height))

        p = File(DEVICE_PATH)
        p.set(align="center")
        p.text("Image test start (bitImageRaster)\n")
        p.text("------------------------------\n")

        p.image(img, impl="bitImageRaster")

        p.text("\n------------------------------\n")
        p.text("Image test end\n")
        p.cut()
    finally:
        if p is not None:
            try:
                p.close()
            except Exception:
                pass

if __name__ == "__main__":
    main()
