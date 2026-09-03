from django.urls import path, re_path
from . import consumers

websocket_urlpatterns = [
    re_path(
        r"^ws/support/consultant/?$",
        consumers.ConsultantNotificationConsumer.as_asgi(),
    ),
    re_path(
        r"^ws/support/(?P<portal_token>[0-9a-fA-F-]+)/?$",
        consumers.SupportConsumer.as_asgi(),
    ),
]
