from escpos.printer import File

DEVICE_PATH = "/dev/usb/lp0"  # or "/dev/lp0"

def main():
    p = None
    try:
        p = File(DEVICE_PATH)
        p.text("Dragon Tiny Homes\n")
        p.text("Raspberry Pi ESC/POS Test\n")
        p.text("------------------------------\n")
        p.text("If you see this, Python can\n")
        p.text("talk to the printer.\n")
        p.text("------------------------------\n")
        p.cut()
        # p._raw(b"\x1d\x56\x00")   # if you prefer raw cut
        print("Printed successfully.")
    except Exception as e:
        print("Error while printing:", e)
    finally:
        if p is not None:
            try:
                p.close()
            except Exception:
                pass

if __name__ == "__main__":
    main()
