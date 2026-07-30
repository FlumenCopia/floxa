from django.urls import path

from .views import GeminiTestView


urlpatterns = [
    path("test/", GeminiTestView.as_view(), name="gemini-test"),
]
