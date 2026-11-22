"""Local HTTPS registries for the confined package-client regression tests."""

import base64
import gzip
import hashlib
import http.server
import io
import json
import pathlib
import re
import ssl
import subprocess
import sys
import tarfile
import zipfile


def npm_package():
    files = {
        "package/package.json": b'{"name":"grida-proxy-package","version":"1.0.0"}',
        "package/payload.bin": b"x" * (9 * 1024 * 1024),
    }
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for name, data in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            tar.addfile(entry, io.BytesIO(data))
    # Level zero keeps the bytes transferred above the former 8 MiB limit.
    return gzip.compress(archive.getvalue(), compresslevel=0, mtime=0)


def python_wheel():
    dist = "grida_proxy_wheel-1.0.0.dist-info"
    files = {
        "grida_proxy_wheel.py": b"value = 1\n",
        f"{dist}/METADATA": b"Metadata-Version: 2.1\nName: grida-proxy-wheel\nVersion: 1.0.0\n",
        f"{dist}/WHEEL": b"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    }
    record = []
    for name, data in files.items():
        digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=")
        record.append(f"{name},sha256={digest.decode()},{len(data)}\n")
    files[f"{dist}/RECORD"] = ("".join(record) + f"{dist}/RECORD,,\n").encode()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as wheel:
        for name, data in files.items():
            wheel.writestr(name, data)
    return archive.getvalue()


def serve(root):
    config = root / "openssl.cnf"
    config.write_text(
        "[req]\ndistinguished_name=dn\nprompt=no\n"
        "[dn]\nCN=Registry fixture\n"
        "[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n"
        "[server]\nbasicConstraints=critical,CA:FALSE\n"
        "keyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n"
        "subjectAltName=DNS:registry.example.test,DNS:files.example.test\n"
    )

    def openssl(*args):
        generated = subprocess.run(["openssl", *args], capture_output=True)
        if generated.returncode:
            raise RuntimeError(generated.stderr.decode())

    ca_key = root / "ca-key.pem"
    ca_certificate = root / "ca.pem"
    key = root / "key.pem"
    request = root / "registry.csr"
    certificate = root / "registry.pem"
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-sha256",
            "-keyout", ca_key, "-out", ca_certificate, "-config", config, "-extensions", "ca")
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-sha256", "-keyout", key, "-out", request,
            "-config", config)
    openssl("x509", "-req", "-in", request, "-CA", ca_certificate, "-CAkey", ca_key, "-set_serial", "2",
            "-days", "1", "-sha256", "-out", certificate, "-extfile", config, "-extensions", "server")

    registry = "registry.example.test"
    files = "files.example.test"
    tarball_path = "/grida-proxy-package/-/grida-proxy-package-1.0.0.tgz"
    wheel_path = "/grida_proxy_wheel-1.0.0-py3-none-any.whl"
    tarball = npm_package()
    npm_meta = {
        "name": "grida-proxy-package",
        "dist-tags": {"latest": "1.0.0"},
        "versions": {
            "1.0.0": {
                "name": "grida-proxy-package",
                "version": "1.0.0",
                "dist": {
                    "tarball": f"https://{registry}{tarball_path}",
                    "integrity": "sha512-" + base64.b64encode(hashlib.sha512(tarball).digest()).decode(),
                },
            }
        },
    }
    responses = {
        (registry, "/grida-proxy-package"): ("application/json", json.dumps(npm_meta).encode()),
        (registry, tarball_path): ("application/octet-stream", tarball),
        (registry, "/simple/grida-proxy-wheel/"): (
            "text/html",
            f'<a href="https://{files}{wheel_path}">{wheel_path[1:]}</a>'.encode(),
        ),
        (files, wheel_path): ("application/octet-stream", python_wheel()),
    }

    class Registry(http.server.BaseHTTPRequestHandler):
        def do_HEAD(self):
            self.reply(False)

        def do_GET(self):
            self.reply(True)

        def reply(self, send_body):
            response = responses.get((self.headers.get("Host"), self.path))
            if response is None:
                self.send_error(404)
                return
            kind, body = response
            size = len(body)
            range_ = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
            if range_:
                first, last = range_.groups()
                start = int(first) if first else max(0, size - int(last))
                end = min(int(last) + 1, size) if first and last else size
                if start >= end:
                    self.send_error(416)
                    return
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end - 1}/{size}")
                body = body[start:end]
            else:
                self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            if send_body:
                self.wfile.write(body)

        def log_message(self, _format, *_arguments):
            pass

    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Registry) as server:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certificate, key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        print(server.server_port, flush=True)
        server.serve_forever()


if __name__ == "__main__":
    serve(pathlib.Path(sys.argv[1]))
