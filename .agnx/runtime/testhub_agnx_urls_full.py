"""
场景：Agnx 嵌入完整 URL — 含 UI / APP 自动化（压测仍可选，默认一并挂上路由）。
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
import os

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/auth/", include("apps.users.urls")),
    path("api/projects/", include("apps.projects.urls")),
    path("api/testcases/", include("apps.testcases.urls")),
    path("api/testsuites/", include("apps.testsuites.urls")),
    path("api/executions/", include("apps.executions.urls")),
    path("api/reports/", include("apps.reports.urls")),
    path("api/reviews/", include("apps.reviews.urls")),
    path("api/versions/", include("apps.versions.urls")),
    path("api/defects/", include("apps.defects.urls")),
    path("api/assistant/", include("apps.assistant.urls")),
    path("api/users/", include("apps.users.urls")),
    path("api/requirement-analysis/", include("apps.requirement_analysis.urls")),
    path("api/ui-automation/", include("apps.ui_automation.urls")),
    path("api/app-automation/", include("apps.app_automation.urls")),
    path("api/", include("apps.api_testing.urls")),
    path("api/core/", include("apps.core.urls")),
    path("api/data-factory/", include("apps.data_factory.urls")),
    path("api/llm-judge/", include("apps.llm_judge.urls")),
    path("api/monitor/", include("apps.monitor.urls")),
    path("api/mcp/", include("apps.mcp.urls")),
]

# 压测：依赖装齐后默认挂载
try:
    urlpatterns.append(path("api/perf-testing/", include("apps.perf_testing.urls")))
except Exception:
    pass

if getattr(settings, "ANALYTICS_ENABLED", False):
    urlpatterns.append(path("api/analytics/", include("apps.analytics.urls")))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_FILES_URL, document_root=settings.STATIC_FILES_ROOT)

# APP 自动化静态报告 / 模板
urlpatterns += [
    path(
        "app-automation-templates/<path:path>",
        __import__("django.views.static", fromlist=["serve"]).serve,
        {"document_root": os.path.join(settings.BASE_DIR, "apps", "app_automation", "Template")},
    ),
    path(
        "app-automation-reports/<path:path>",
        __import__("django.views.static", fromlist=["serve"]).serve,
        {"document_root": os.path.join(settings.MEDIA_ROOT, "app-automation", "allure-reports")},
    ),
]
