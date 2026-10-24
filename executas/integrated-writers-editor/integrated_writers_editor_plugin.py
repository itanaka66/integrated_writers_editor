"""Minimal stdio Executa for Integrated Writers Editor."""

import json
import sys

MANIFEST = {
    "name": "tool-dev-integrated-writers-editor",
    "version": "0.1.0",
    "tools": [
        {
            "name": "ping",
            "description": "Check that the Integrated Writers Editor Executa is responding.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False
            }
        }
    ]
}


def invoke(method: str, args: dict) -> dict:
    if method == "ping":
        return {
            "success": True,
            "data": {
                "pong": True,
                "app": "integrated-writers-editor"
            }
        }
    return {"success": False, "error": f"unknown method: {method}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        req = json.loads(line)
        try:
            method = req.get("method")

            if method == "describe":
                result = MANIFEST
            elif method == "health":
                result = {"status": "ready"}
            elif method == "invoke":
                params = req.get("params", {})
                result = invoke(
                    params["tool"],
                    params.get("arguments", {})
                )
            else:
                raise ValueError(f"unknown rpc: {method}")

            response = {
                "jsonrpc": "2.0",
                "id": req.get("id"),
                "result": result
            }
        except Exception as exc:
            response = {
                "jsonrpc": "2.0",
                "id": req.get("id"),
                "error": {
                    "code": -32601,
                    "message": str(exc)
                }
            }

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()