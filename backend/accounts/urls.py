from django.urls import path

from .views import (
    ConsultantLoginView,
    ConsultantLogoutView,
    ConsultantMeView,
    ConsultantRegisterView,
    ConsultantTokenRefreshView,
    CsrfBootstrapView,
)


urlpatterns = [
    path("csrf/", CsrfBootstrapView.as_view(), name="csrf"),
    path("register/", ConsultantRegisterView.as_view(), name="register"),
    path("login/", ConsultantLoginView.as_view(), name="login"),
    path("me/", ConsultantMeView.as_view(), name="me"),
    path("token/refresh/", ConsultantTokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", ConsultantLogoutView.as_view(), name="logout"),
]
