"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from projects.views import (
    ClientPortalActivityMarkReadView,
    ClientPortalActivityView,
    ClientPortalAgreementView,
    ClientPortalAssetDownloadView,
    ClientPortalBrandDNAView,
    ClientPortalConceptFeedbackView,
    ClientPortalConceptView,
    ClientPortalDeliverableView,
    ClientPortalGeneratedAgreementAcceptView,
    ClientPortalGeneratedAgreementPDFView,
    ClientPortalGeneratedAgreementView,
    ClientPortalLogoutView,
    ClientPortalMoodboardSelectView,
    ClientPortalMoodboardView,
    ClientPortalPasswordVerifyView,
    ClientPortalPaymentMilestoneView,
    ClientPortalProjectAgreementPDFView,
    ClientPortalProjectAgreementSignView,
    ClientPortalProjectView,
    ClientPortalSignOffView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path(
        "api/client-portal/<uuid:portal_token>/",
        ClientPortalProjectView.as_view(),
        name="client-portal-project",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/brand-dna/",
        ClientPortalBrandDNAView.as_view(),
        name="client-portal-brand-dna",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/verify-password/",
        ClientPortalPasswordVerifyView.as_view(),
        name="client-portal-verify-password",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/logout/",
        ClientPortalLogoutView.as_view(),
        name="client-portal-logout",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/moodboards/",
        ClientPortalMoodboardView.as_view(),
        name="client-portal-moodboards",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/moodboards/<int:moodboard_id>/select/",
        ClientPortalMoodboardSelectView.as_view(),
        name="client-portal-moodboard-select",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/moodboards/<int:asset_id>/image/",
        ClientPortalAssetDownloadView.as_view(),
        {"asset_type": "moodboard-image"},
        name="client-portal-moodboard-image",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/concepts/",
        ClientPortalConceptView.as_view(),
        name="client-portal-concepts",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/concepts/<int:concept_id>/feedback/",
        ClientPortalConceptFeedbackView.as_view(),
        name="client-portal-concept-feedback",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/concepts/<int:asset_id>/image/",
        ClientPortalAssetDownloadView.as_view(),
        {"asset_type": "concept-image"},
        name="client-portal-concept-image",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/concepts/<int:asset_id>/file/",
        ClientPortalAssetDownloadView.as_view(),
        {"asset_type": "concept-file"},
        name="client-portal-concept-file",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/deliverables/",
        ClientPortalDeliverableView.as_view(),
        name="client-portal-deliverables",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/deliverables/<int:asset_id>/file/",
        ClientPortalAssetDownloadView.as_view(),
        {"asset_type": "deliverable-file"},
        name="client-portal-deliverable-file",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/agreement/",
        ClientPortalAgreementView.as_view(),
        name="client-portal-agreement",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/agreement/file/",
        ClientPortalAssetDownloadView.as_view(),
        {"asset_type": "agreement-file"},
        name="client-portal-agreement-file",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/agreement/pdf/",
        ClientPortalProjectAgreementPDFView.as_view(),
        name="client-portal-project-agreement-pdf",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/agreement/sign/",
        ClientPortalProjectAgreementSignView.as_view(),
        name="client-portal-project-agreement-sign",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/generated-agreement/",
        ClientPortalGeneratedAgreementView.as_view(),
        name="client-portal-generated-agreement",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/generated-agreement/pdf/",
        ClientPortalGeneratedAgreementPDFView.as_view(),
        name="client-portal-generated-agreement-pdf",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/generated-agreement/accept/",
        ClientPortalGeneratedAgreementAcceptView.as_view(),
        name="client-portal-generated-agreement-accept",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/payments/",
        ClientPortalPaymentMilestoneView.as_view(),
        name="client-portal-payments",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/sign-off/",
        ClientPortalSignOffView.as_view(),
        name="client-portal-sign-off",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/activities/",
        ClientPortalActivityView.as_view(),
        name="client-portal-activities",
    ),
    path(
        "api/client-portal/<uuid:portal_token>/activities/mark-read/",
        ClientPortalActivityMarkReadView.as_view(),
        name="client-portal-activities-mark-read",
    ),
    path("api/projects/", include("projects.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
