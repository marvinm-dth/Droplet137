# run.py
from threading import Thread
from werkzeug.serving import make_server

from app import app


def _serve(port: int) -> None:
    server = make_server("0.0.0.0", port, app, threaded=True)
    server.serve_forever()


if __name__ == "__main__":
    # You can still run this with sudo for printer access:
    #   sudo $(which python) run.py
    Thread(target=_serve, args=(5082,), daemon=True).start()
    _serve(5085)
