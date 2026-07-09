from django.contrib import admin

from .models import (
    BrandDNA,
    ClientProfile,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoverySliderResponse,
    DiscoveryVisualStyle,
    Moodboard,
    ProjectActivity,
    ProjectDiscovery,
)


admin.site.register(ClientProfile)
admin.site.register(BrandDNA)
admin.site.register(Moodboard)
admin.site.register(ProjectActivity)
admin.site.register(ProjectDiscovery)
admin.site.register(DiscoverySliderResponse)
admin.site.register(DiscoveryEmotion)
admin.site.register(DiscoveryCompetitor)
admin.site.register(DiscoveryVisualStyle)
