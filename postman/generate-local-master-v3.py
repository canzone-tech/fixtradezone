#!/usr/bin/env python3
"""Generate FixTradeZone local Postman MASTER v3 from the accepted v2 base.

v3 preserves every v2 request and appends release-closeout auth recovery,
CAPTCHA, password-change and email-delivery diagnostics. It performs no network
or DB I/O.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

HERE = Path(__file__).resolve().parent
BASE_GENERATOR = HERE / "generate-local-master-v2.py"
COLLECTION_NAME = "FixTradeZone-Local-API-MASTER-v3.postman_collection.json"
ENVIRONMENT_NAME = "FixTradeZone-Local-v3.postman_environment.json"

STATE_CHANGE_GUARD = """if (String(pm.environment.get('allowStateChanges')).toLowerCase() !== 'true') {\n  throw new Error('MANUAL state-changing request blocked. Set allowStateChanges=true only for the module you are intentionally accepting.');\n}"""


def load_v2() -> ModuleType:
    spec = importlib.util.spec_from_file_location("ftz_postman_v2", BASE_GENERATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load MASTER v2 generator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request(
    name: str,
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    bearer_variable: str | None = None,
    state_change: bool = False,
    description: str | None = None,
) -> dict[str, Any]:
    headers: list[dict[str, str]] = []
    if body is not None:
        headers.append({"key": "Content-Type", "value": "application/json"})
    if bearer_variable:
        headers.append(
            {"key": "Authorization", "value": f"Bearer {{{{{bearer_variable}}}}}"}
        )

    payload: dict[str, Any] = {
        "name": name,
        "request": {
            "method": method,
            "header": headers,
            "url": f"{{{{baseUrl}}}}{path}",
        },
        "response": [],
    }

    if description:
        payload["request"]["description"] = description
    if body is not None:
        payload["request"]["body"] = {
            "mode": "raw",
            "raw": json.dumps(body, indent=2),
            "options": {"raw": {"language": "json"}},
        }
    if state_change:
        payload["event"] = [
            {
                "listen": "prerequest",
                "script": {
                    "type": "text/javascript",
                    "exec": STATE_CHANGE_GUARD.splitlines(),
                },
            }
        ]

    return payload


def environment_keys(environment: dict[str, Any]) -> set[str]:
    return {
        str(item.get("key"))
        for item in environment.get("values", [])
        if item.get("key")
    }


def first_existing(keys: set[str], candidates: list[str]) -> str:
    for candidate in candidates:
        if candidate in keys:
            return candidate
    raise RuntimeError(
        "MASTER v2 environment is missing expected auth token variable: "
        + ", ".join(candidates)
    )


def add_env(environment: dict[str, Any], key: str, value: str = "") -> None:
    values = environment.setdefault("values", [])
    if any(item.get("key") == key for item in values):
        return
    values.append(
        {
            "key": key,
            "value": value,
            "type": "default",
            "enabled": True,
        }
    )


def main() -> int:
    v2 = load_v2()
    collection = json.loads(
        v2.materialize(v2.COLLECTION_GZIP_B64, v2.COLLECTION_SHA256)
    )
    environment = json.loads(
        v2.materialize(v2.ENVIRONMENT_GZIP_B64, v2.ENVIRONMENT_SHA256)
    )

    keys = environment_keys(environment)
    superadmin_token = first_existing(
        keys,
        [
            "superAdminAccessToken",
            "superadminAccessToken",
            "superAdminToken",
            "superadminToken",
        ],
    )

    for key in [
        "passwordResetEmail",
        "passwordResetToken",
        "newTestPassword",
        "currentTestPassword",
        "smtpTestRecipient",
    ]:
        add_env(environment, key)

    folder_name = "23 Release Security & Email"
    collection["item"] = [
        folder for folder in collection.get("item", []) if folder.get("name") != folder_name
    ]

    collection["item"].append(
        {
            "name": folder_name,
            "item": [
                request(
                    "Health — MySQL + Redis + Email Status",
                    "GET",
                    "/health",
                    description="Readiness must report MySQL and Redis up; email exposes mode/configured only.",
                ),
                request(
                    "CAPTCHA Issue — LOGIN",
                    "POST",
                    "/auth/captcha",
                    body={"purpose": "LOGIN"},
                    description="Safe CAPTCHA issuance smoke test for the Redis-backed public rate-limit path. Do not hammer the endpoint during acceptance.",
                ),
                request(
                    "Request Password Reset (MANUAL)",
                    "POST",
                    "/auth/password-reset/request",
                    body={"email": "{{passwordResetEmail}}"},
                    state_change=True,
                    description="Generic response prevents account enumeration. Sends mail only for one eligible verified ACTIVE account.",
                ),
                request(
                    "Complete Password Reset (MANUAL)",
                    "POST",
                    "/auth/password-reset/complete",
                    body={
                        "token": "{{passwordResetToken}}",
                        "newPassword": "{{newTestPassword}}",
                    },
                    state_change=True,
                    description="Single-use reset token. Success revokes all active sessions for the user.",
                ),
                request(
                    "Change Signed-in Password (MANUAL)",
                    "POST",
                    "/auth/change-password",
                    body={
                        "currentPassword": "{{currentTestPassword}}",
                        "newPassword": "{{newTestPassword}}",
                    },
                    bearer_variable=superadmin_token,
                    state_change=True,
                    description="Use only in the dedicated auth acceptance step; success revokes all sessions and requires login again.",
                ),
                request(
                    "Email Delivery Status — Superadmin",
                    "GET",
                    "/admin/communication/email/status",
                    bearer_variable=superadmin_token,
                    description="Safe diagnostics only; SMTP password is never returned.",
                ),
                request(
                    "Send SMTP/Email Test — Superadmin (MANUAL)",
                    "POST",
                    "/admin/communication/email/test",
                    body={"to": "{{smtpTestRecipient}}"},
                    bearer_variable=superadmin_token,
                    state_change=True,
                    description="Controlled transport test to an address you own. SMTP acceptance is followed by inbox verification.",
                ),
            ],
        }
    )

    collection.setdefault("info", {})["name"] = "FixTradeZone Local API MASTER v3"
    environment["name"] = "FixTradeZone Local v3"

    out_dir = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("/tmp/fixtradezone-postman-v3")
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    collection_bytes = (
        json.dumps(collection, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    )
    environment_bytes = (
        json.dumps(environment, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    )

    collection_path = out_dir / COLLECTION_NAME
    environment_path = out_dir / ENVIRONMENT_NAME
    collection_path.write_bytes(collection_bytes)
    environment_path.write_bytes(environment_bytes)

    request_count = sum(
        len(folder.get("item", [])) for folder in collection.get("item", [])
    )
    collection_sha = hashlib.sha256(collection_bytes).hexdigest()
    environment_sha = hashlib.sha256(environment_bytes).hexdigest()

    print(f"Collection:  {collection_path}")
    print(f"Environment: {environment_path}")
    print(f"Folders:     {len(collection.get('item', []))}")
    print(f"Requests:    {request_count}")
    print(f"Collection SHA256:  {collection_sha}")
    print(f"Environment SHA256: {environment_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
