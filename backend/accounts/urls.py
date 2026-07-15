from django.urls import path
from .views import ConsultantLoginView, ConsultantRegisterView,ConsultantMeView,ConsultantLogoutView

from rest_framework_simplejwt.views import TokenRefreshView


urlpatterns = [
    path("register/", ConsultantRegisterView.as_view(), name="register"),

        path("login/", ConsultantLoginView.as_view(), name="login"),
    path("me/", ConsultantMeView.as_view(), name="me"),

     path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
     path("logout/", ConsultantLogoutView.as_view(), name="logout"),


]