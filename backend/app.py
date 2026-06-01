"""
CryptoVault — Backend Flask
Executa a criptografia AES-128-GCM conforme o script encrypted128.py.
Rota /encrypt e /decrypt chamadas pelo frontend React.
"""

import io
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from Crypto.Random import get_random_bytes
from Crypto.Cipher import AES

app = Flask(__name__)
CORS(app)  # Permite requisições do frontend React (localhost:5173)


# ─── POST /encrypt ──────────────────────────────────────────────
# Recebe: multipart/form-data com campo "file"
# Retorna: JSON { key: "<hex>", encrypted: "<base64>", filename: "<nome>.encrypted" }

@app.route("/encrypt", methods=["POST"])
def encrypt():
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    file = request.files["file"]
    data = file.read()

    # Lógica do encrypted128.py — AES-128-GCM
    key = get_random_bytes(16)   # 16 bytes = 128 bits = 32 hex
    iv  = get_random_bytes(12)   # IV de 12 bytes (padrão GCM)

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(data)

    # Formato: [12 IV][ciphertext][16 tag]  — igual ao formato do browser
    encrypted_bytes = iv + ciphertext + tag

    return jsonify({
        "key":       key.hex(),
        "encrypted": base64.b64encode(encrypted_bytes).decode(),
        "filename":  file.filename + ".encrypted",
    })


# ─── POST /decrypt ──────────────────────────────────────────────
# Recebe: multipart/form-data com campos "file" e "key" (hex)
# Retorna: arquivo descriptografado (binary) ou JSON de erro

@app.route("/decrypt", methods=["POST"])
def decrypt():
    if "file" not in request.files or "key" not in request.form:
        return jsonify({"error": "Arquivo e chave são obrigatórios"}), 400

    file    = request.files["file"]
    key_hex = request.form["key"].strip()

    # Valida chave
    try:
        key = bytes.fromhex(key_hex)
        if len(key) != 16:
            raise ValueError()
    except Exception:
        return jsonify({"error": "Chave inválida. Use 32 caracteres hexadecimais (AES-128)."}), 400

    raw = file.read()

    if len(raw) < 28:  # mínimo: 12 IV + 0 ciphertext + 16 tag
        return jsonify({"error": "Arquivo inválido ou muito pequeno"}), 400

    # Lógica do decrypted128.py — lê formato [12 IV][ciphertext][16 tag]
    iv         = raw[:12]
    ciphertext = raw[12:-16]
    tag        = raw[-16:]

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)

    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    except Exception:
        return jsonify({"error": "Chave incorreta ou arquivo corrompido"}), 400

    original_name = file.filename
    if original_name.endswith(".encrypted"):
        original_name = original_name[:-len(".encrypted")]

    return send_file(
        io.BytesIO(plaintext),
        mimetype="application/octet-stream",
        as_attachment=True,
        download_name=original_name,
    )


if __name__ == "__main__":
    print("CryptoVault backend rodando em http://localhost:5000")
    app.run(debug=True, port=5000)
