from django.contrib import admin

from .models import (
    Agreement,
    BrandDNA,
    ClientProfile,
    Concept,
    Deliverable,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoverySliderResponse,
    DiscoveryVisualStyle,
    Moodboard,
    PaymentMilestone,
    ProjectAgreement,
    ProjectAgreementAppendix,
    ProjectActivity,
    ProjectDiscovery,
)


admin.site.register(ClientProfile)
admin.site.register(BrandDNA)
admin.site.register(Concept)
admin.site.register(Deliverable)
admin.site.register(Agreement)
admin.site.register(ProjectAgreement)
admin.site.register(ProjectAgreementAppendix)
admin.site.register(PaymentMilestone)
admin.site.register(Moodboard)
admin.site.register(ProjectActivity)
admin.site.register(ProjectDiscovery)
admin.site.register(DiscoverySliderResponse)
admin.site.register(DiscoveryEmotion)
admin.site.register(DiscoveryCompetitor)
admin.site.register(DiscoveryVisualStyle)
