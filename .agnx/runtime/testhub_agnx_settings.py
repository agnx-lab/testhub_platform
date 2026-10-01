"""
场景：Agnx 嵌入用 Django settings — SQLite + 内存 Channel；精简重依赖 App。
用法：DJANGO_SETTINGS_MODULE=testhub_agnx_settings（PYTHONPATH 含本目录 + 仓根）。
"""
from __future__ import annotations

import os
from pathlib import Path

from backend.settings import *  # noqa: F401,F403

_DATA_ROOT = Path(os.environ.get("AGNX_TESTHUB_DATA_ROOT") or (Path(__file__).resolve().parent / "data"))
_DATA_ROOT.mkdir(parents=True, exist_ok=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(_DATA_ROOT / "testhub.sqlite3"),
    }
}

# 默认启用全模块；设 AGNX_TESTHUB_LIGHT=1 可跳过 UI/APP/压测（无重依赖时）
_LIGHT = os.environ.get("AGNX_TESTHUB_LIGHT", "").strip() in ("1", "true", "True", "yes")
_HEAVY_APPS = {
    "apps.ui_automation.apps.UiAutomationConfig",
    "apps.app_automation.apps.AppAutomationConfig",
    "apps.perf_testing.apps.PerfTestingConfig",
}
if _LIGHT:
    INSTALLED_APPS = [app for app in INSTALLED_APPS if app not in _HEAVY_APPS]  # noqa: F405
    ROOT_URLCONF = "testhub_agnx_urls"
else:
    ROOT_URLCONF = "testhub_agnx_urls_full"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

X_FRAME_OPTIONS = "SAMEORIGIN"

_frontend_origin = os.environ.get("AGNX_TESTHUB_FRONTEND_ORIGIN", "http://127.0.0.1:13080")
if _frontend_origin not in CORS_ALLOWED_ORIGINS:  # noqa: F405
    CORS_ALLOWED_ORIGINS = [*CORS_ALLOWED_ORIGINS, _frontend_origin]  # noqa: F405

if _frontend_origin not in CSRF_TRUSTED_ORIGINS:  # noqa: F405
    CSRF_TRUSTED_ORIGINS = [*CSRF_TRUSTED_ORIGINS, _frontend_origin]  # noqa: F405

DEBUG = True
ALLOWED_HOSTS = ["*"]
JUDGE_MOCK = True

# SQLite 不支持 COMMENT；上游模型大量 db_comment / db_table_comment
from django.db.backends.sqlite3.schema import DatabaseSchemaEditor as _SqliteEditor

def _noop_comment(self, *args, **kwargs):
    return None

_SqliteEditor.alter_db_table_comment = _noop_comment
_SqliteEditor._alter_column_comment_sql = lambda self, *args, **kwargs: None
