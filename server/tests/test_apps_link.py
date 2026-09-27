"""routers/apps.py — 외부 GitHub 릴리스 연동 앱 (source_repo / source_asset) 테스트.

실행: cd server && venv/bin/python3 -m unittest tests.test_apps_link -v
네트워크 없이 돈다 — GitHub 조회·삭제는 전부 패치한다.
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

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from routers import apps  # noqa: E402

REPO = "600-g/shutdown-timer"
ASSET = "AutoShutdownTimer.zip"
LATEST_URL = f"https://github.com/{REPO}/releases/latest/download/{ASSET}"
RELEASE = {
    "tag_name": "v1.0.69",
    "published_at": "2026-09-15T01:02:03Z",
    "assets": [{"name": ASSET, "size": 600_000}, {"name": "other.zip", "size": 1}],
}
LINKED = {
    "id": "autotimer", "name": "종료타이머&알림", "version": "1.0", "description": "타이머&알림",
    "platform": "windows", "icon": "lucide:package", "color": "#0ea5e9", "visible": True, "order": 1,
    "downloads": 3, "source_repo": REPO, "source_asset": ASSET,
}
UPLOADED = {
    "id": "autotimer", "name": "종료타이머&알림", "version": "1.0", "description": "타이머&알림",
    "platform": "other", "icon": "lucide:package", "color": "#0ea5e9", "visible": True, "order": 1,
    "filename": "AutoTimer.zip", "size": 567258, "sha256": "abc", "release_tag": "app-autotimer",
    "release_id": 379254410, "asset_id": 536498291,
    "download_url": "https://github.com/600-g/app-releases/releases/download/app-autotimer/AutoTimer.zip",
    "uploaded_at": "2026-08-30T10:55:28+00:00", "downloads": 3,
}


async def _fake_latest(repo: str, *, force: bool = False, asset: str = "") -> dict | None:
    return RELEASE if repo == REPO else None


class PureHelpersTest(unittest.TestCase):
    def test_linked_download_url(self):
        self.assertEqual(apps._linked_download_url(REPO, ASSET), LATEST_URL)

    def test_apply_latest_fills_version_size_url_without_mutating(self):
        before = dict(LINKED)
        out = apps._apply_latest(LINKED, RELEASE)
        self.assertEqual(out["version"], "1.0.69")
        self.assertEqual(out["size"], 600_000)
        self.assertEqual(out["filename"], ASSET)
        self.assertEqual(out["download_url"], LATEST_URL)
        self.assertEqual(out["uploaded_at"], "2026-09-15T01:02:03Z")
        self.assertEqual(out["source_repo"], REPO)
        self.assertEqual(LINKED, before)  # 원본 불변

    def test_apply_latest_keeps_item_when_asset_missing(self):
        rel = {**RELEASE, "assets": [{"name": "nope.zip", "size": 1}]}
        self.assertIs(apps._apply_latest(LINKED, rel), LINKED)

    def test_apply_latest_keeps_item_when_release_none(self):
        self.assertIs(apps._apply_latest(LINKED, None), LINKED)

    def test_apply_latest_ignores_non_linked_item(self):
        self.assertIs(apps._apply_latest(UPLOADED, RELEASE), UPLOADED)

    def test_download_target(self):
        stale = {**LINKED, "download_url": "https://example.com/old.zip"}
        self.assertEqual(apps._download_target(stale), LATEST_URL)
        self.assertEqual(apps._download_target(UPLOADED), UPLOADED["download_url"])
        self.assertEqual(apps._download_target({"id": "x"}), "")


class RouterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "apps.json"
        self._write([LINKED])
        self.patches = [
            mock.patch.object(apps, "APPS_PATH", self.path),
            mock.patch.object(apps, "require_admin", lambda *a, **k: None),
            mock.patch.object(apps, "_fetch_latest_release", _fake_latest),
            mock.patch.object(apps, "_repo_is_private", mock.AsyncMock(return_value=False)),
            mock.patch.dict(apps._latest_cache, {}, clear=True),
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

    def test_public_list_shows_latest_and_persists(self):
        r = self.client.get("/api/apps")
        self.assertEqual(r.status_code, 200)
        item = r.json()["items"][0]
        self.assertEqual(item["version"], "1.0.69")
        self.assertEqual(item["size"], 600_000)
        self.assertNotIn("source_repo", item)  # 공개 뷰엔 내부 필드 없음
        saved = self._read()[0]
        self.assertEqual(saved["version"], "1.0.69")
        self.assertEqual(saved["source_repo"], REPO)

    def test_put_keeps_link_fields(self):
        r = self.client.put("/api/apps", json={"items": [{"id": "autotimer", "name": "새이름", "visible": True}]})
        self.assertEqual(r.status_code, 200)
        saved = self._read()[0]
        self.assertEqual(saved["name"], "새이름")
        self.assertEqual(saved["source_repo"], REPO)
        self.assertEqual(saved["source_asset"], ASSET)

    def test_download_redirects_to_latest_and_counts(self):
        r = self.client.get("/api/apps/autotimer/download", follow_redirects=False)
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r.headers["location"], LATEST_URL)
        self.assertEqual(self._read()[0]["downloads"], 4)

    def test_link_endpoint_rejects_bad_repo(self):
        r = self.client.post("/api/apps/link", json={"id": "x", "source_repo": "bad", "source_asset": "a.zip"})
        self.assertEqual(r.status_code, 400)

    def test_link_rejects_missing_asset(self):
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(apps.link_release_source({"id": "x", "source_repo": REPO, "source_asset": "nope.zip"}))
        self.assertEqual(cm.exception.status_code, 400)
        self.assertIn("nope.zip", cm.exception.detail)

    def test_link_rejects_unknown_repo(self):
        with self.assertRaises(HTTPException) as cm:
            asyncio.run(apps.link_release_source({"id": "x", "source_repo": "600-g/none", "source_asset": ASSET}))
        self.assertEqual(cm.exception.status_code, 400)

    def test_link_converts_uploaded_app(self):
        """업로드 앱 → 연동 전환: 옛 릴리스 삭제, 다운로드 수·이름 승계, 파일 필드 교체."""
        self._write([UPLOADED])
        with mock.patch.object(apps.gh_releases, "delete_release", new=mock.AsyncMock()) as d:
            res = asyncio.run(apps.link_release_source(
                {"id": "autotimer", "source_repo": REPO, "source_asset": ASSET, "platform": "windows"}
            ))
        d.assert_awaited_once_with(379254410)
        item = res["item"]
        self.assertEqual(item["name"], "종료타이머&알림")
        self.assertEqual(item["platform"], "windows")
        self.assertEqual(item["version"], "1.0.69")
        self.assertEqual(item["downloads"], 3)
        self.assertEqual(item["download_url"], LATEST_URL)
        self.assertNotIn("release_id", item)
        self.assertNotIn("asset_id", item)
        self.assertTrue(item["visible"])
        self.assertEqual(self._read()[0]["source_repo"], REPO)

    def test_link_creates_new_app_visible_by_default(self):
        self._write([])
        res = asyncio.run(apps.link_release_source({"source_repo": REPO, "source_asset": ASSET, "name": "타이머"}))
        item = res["item"]
        self.assertEqual(item["id"], "autoshutdowntimer")
        self.assertTrue(item["visible"])
        self.assertEqual(item["order"], 1)
        self.assertEqual(res["count"], 1)


if __name__ == "__main__":
    unittest.main()
