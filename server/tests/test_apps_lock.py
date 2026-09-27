"""routers/apps.py — 다운로드 잠금 + 비공개 저장소 연동 테스트.

실행: cd server && venv/bin/python3 -m unittest tests.test_apps_lock -v
네트워크 없이 돈다 — GitHub 조회는 전부 패치한다.
"""
from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from routers import apps  # noqa: E402

REPO = "600-g/private-game"
ASSET = "Setup.exe"
SIGNED = "https://objects.githubusercontent.com/signed?x=1"
RELEASE = {"tag_name": "client-v1.5", "published_at": "2026-09-28T00:00:00Z",
           "assets": [{"name": ASSET, "size": 78_000_000, "id": 42}]}
LOCKED = {
    "id": "game", "name": "게임", "version": "1.5", "platform": "windows", "icon": "lucide:package",
    "color": "#22c55e", "visible": True, "order": 1, "downloads": 0,
    "source_repo": REPO, "source_asset": ASSET, "source_private": True,
    "locked": True, "lock_code": "abcd",
}


async def _fake_latest(repo, *, force=False, asset=""):
    return RELEASE if repo == REPO else None


class LockTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "apps.json"
        self._write([LOCKED])
        self.patches = [
            mock.patch.object(apps, "APPS_PATH", self.path),
            mock.patch.object(apps, "require_admin", lambda *a, **k: None),
            mock.patch.object(apps, "_fetch_latest_release", _fake_latest),
            mock.patch.object(apps, "_private_asset_url", mock.AsyncMock(return_value=SIGNED)),
            mock.patch.object(apps, "_repo_is_private", mock.AsyncMock(return_value=True)),
            mock.patch.dict(apps._latest_cache, {}, clear=True),
            mock.patch.dict(apps._dl_failures, {}, clear=True),
            mock.patch.dict(apps._dl_locked, {}, clear=True),
        ]
        for p in self.patches:
            p.start()
        app = FastAPI()
        app.include_router(apps.router)
        self.client = TestClient(app)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _write(self, items):
        self.path.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")

    def _read(self):
        return json.loads(self.path.read_text(encoding="utf-8"))["items"]

    def test_public_view_shows_locked_but_never_code(self):
        item = self.client.get("/api/apps").json()["items"][0]
        self.assertTrue(item["locked"])
        self.assertNotIn("lock_code", item)
        self.assertEqual(item["version"], "1.5")  # client-v1.5 → 1.5

    def test_get_download_shows_code_page_without_counting(self):
        r = self.client.get("/api/apps/game/download", follow_redirects=False)
        self.assertEqual(r.status_code, 200)
        self.assertIn('name="code"', r.text)
        self.assertNotIn("abcd", r.text)
        self.assertEqual(self._read()[0]["downloads"], 0)

    def test_wrong_code_401(self):
        r = self.client.post("/api/apps/game/download", data={"code": "zzzz"}, follow_redirects=False)
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self._read()[0]["downloads"], 0)

    def test_right_code_redirects_to_signed_url_and_counts(self):
        r = self.client.post("/api/apps/game/download", data={"code": "abcd"}, follow_redirects=False)
        self.assertEqual(r.status_code, 303)
        self.assertEqual(r.headers["location"], SIGNED)
        self.assertEqual(self._read()[0]["downloads"], 1)

    def test_bruteforce_locks_out_even_right_code(self):
        for _ in range(apps._DL_FAIL_LIMIT):
            self.client.post("/api/apps/game/download", data={"code": "0000"})
        r = self.client.post("/api/apps/game/download", data={"code": "abcd"}, follow_redirects=False)
        self.assertEqual(r.status_code, 429)

    def test_unlocked_private_get_redirects_to_signed(self):
        self._write([{**LOCKED, "locked": False}])
        r = self.client.get("/api/apps/game/download", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], SIGNED)

    def test_put_keeps_lock_when_fields_absent(self):
        r = self.client.put("/api/apps", json={"items": [{"id": "game", "name": "새이름", "visible": True}]})
        self.assertEqual(r.status_code, 200)
        saved = self._read()[0]
        self.assertTrue(saved["locked"])
        self.assertEqual(saved["lock_code"], "abcd")
        self.assertTrue(saved["source_private"])

    def test_put_changes_code_and_unlock(self):
        self.client.put("/api/apps", json={"items": [{"id": "game", "name": "게임", "visible": True,
                                                      "locked": True, "lock_code": " wxyz "}]})
        self.assertEqual(self._read()[0]["lock_code"], "wxyz")
        self.client.put("/api/apps", json={"items": [{"id": "game", "name": "게임", "visible": True, "locked": False}]})
        self.assertFalse(self._read()[0]["locked"])

    def test_put_rejects_lock_without_code(self):
        r = self.client.put("/api/apps", json={"items": [{"id": "game", "name": "게임", "visible": True,
                                                          "locked": True, "lock_code": ""}]})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self._read()[0]["lock_code"], "abcd")

    def test_link_private_with_lock(self):
        self._write([])
        res = asyncio.run(apps.link_release_source({
            "id": "game", "source_repo": REPO, "source_asset": ASSET, "locked": True, "lock_code": "abcd"}))
        item = res["item"]
        self.assertTrue(item["source_private"])
        self.assertTrue(item["locked"])
        self.assertEqual(item["version"], "1.5")


class TagVersionTest(unittest.TestCase):
    def test_tag_version(self):
        self.assertEqual(apps._tag_version("v1.0.70"), "1.0.70")
        self.assertEqual(apps._tag_version("client-v1.5"), "1.5")
        self.assertEqual(apps._tag_version("latest"), "latest")


if __name__ == "__main__":
    unittest.main()


UPLOADED = {
    "id": "app-a1b2", "name": "수동앱", "version": "1.0", "platform": "windows", "icon": "lucide:package",
    "color": "#0ea5e9", "visible": True, "order": 1, "downloads": 7, "filename": "old.zip", "size": 10,
    "release_tag": "app-a1b2", "release_id": 11, "asset_id": 22, "locked": True, "lock_code": "abcd",
    "download_url": "https://github.com/600-g/app-releases/releases/download/app-a1b2/old.zip",
}
STORED = {"filename": "new.zip", "size": 3, "content_type": "application/octet-stream", "sha256": "x",
          "release_tag": "app-a1b2", "release_id": 11, "asset_id": 33,
          "download_url": "https://github.com/600-g/app-releases/releases/download/app-a1b2/new.zip",
          "uploaded_at": "2026-09-28T00:00:00+00:00"}


class ReplaceUploadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "apps.json"
        self.path.write_text(json.dumps({"items": [UPLOADED, {**LOCKED, "order": 2}]}, ensure_ascii=False), encoding="utf-8")
        self.store = mock.AsyncMock(return_value=STORED)
        self.patches = [
            mock.patch.object(apps, "APPS_PATH", self.path),
            mock.patch.object(apps, "require_admin", lambda *a, **k: None),
            mock.patch.object(apps, "_store_asset", self.store),
            mock.patch.object(apps, "_delete_old_asset", mock.AsyncMock()),
            mock.patch.object(apps, "_asset_location", mock.AsyncMock(return_value=SIGNED)),
        ]
        for p in self.patches:
            p.start()
        app = FastAPI()
        app.include_router(apps.router)
        self.client = TestClient(app)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _read(self):
        return json.loads(self.path.read_text(encoding="utf-8"))["items"]

    def _upload(self, **form):
        return self.client.post("/api/apps/upload", files={"file": ("새파일.zip", b"abc")}, data=form)

    def test_replace_keeps_id_order_downloads_lock(self):
        r = self._upload(app_id="app-a1b2", name="수동앱", version="1.1", replace="true")
        self.assertEqual(r.status_code, 200, r.text)
        items = self._read()
        self.assertEqual(len(items), 2)  # 새 앱이 생기지 않는다
        it = items[0]
        self.assertEqual(it["id"], "app-a1b2")
        self.assertEqual(it["asset_id"], 33)
        self.assertEqual(it["version"], "1.1")
        self.assertEqual((it["order"], it["downloads"]), (1, 7))
        self.assertTrue(it["locked"])
        self.assertEqual(it["lock_code"], "abcd")

    def test_replace_unknown_id_404(self):
        r = self._upload(app_id="nope", name="x", replace="true")
        self.assertEqual(r.status_code, 404)
        self.store.assert_not_awaited()

    def test_replace_linked_app_rejected(self):
        r = self._upload(app_id="game", name="게임", replace="true")
        self.assertEqual(r.status_code, 400)
        self.store.assert_not_awaited()

    def test_new_upload_with_lock(self):
        r = self._upload(app_id="fresh", name="새앱", locked="true", lock_code="9999")
        self.assertEqual(r.status_code, 200, r.text)
        it = next(x for x in self._read() if x["id"] == "fresh")
        self.assertTrue(it["locked"])
        self.assertEqual(it["lock_code"], "9999")

    def test_new_upload_lock_without_code_rejected(self):
        r = self._upload(app_id="fresh", name="새앱", locked="true")
        self.assertEqual(r.status_code, 400)
        self.store.assert_not_awaited()

    def test_uploaded_download_uses_fresh_asset_url(self):
        self.path.write_text(json.dumps({"items": [{**UPLOADED, "locked": False}]}), encoding="utf-8")
        r = self.client.get("/api/apps/app-a1b2/download", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], SIGNED)
