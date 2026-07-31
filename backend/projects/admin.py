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
    PaymentTransaction,
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


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "project",
        "milestone",
        "amount",
        "currency",
        "status",
        "razorpay_order_id",
        "razorpay_payment_id",
        "created_at",
        "verified_at",
    )
    list_filter = ("status", "currency", "created_at", "verified_at")
    search_fields = (
        "project__company_name",
        "razorpay_order_id",
        "razorpay_payment_id",
    )
    readonly_fields = (
        "razorpay_order_id",
        "razorpay_payment_id",
        "created_at",
        "updated_at",
        "verified_at",
    )


admin.site.register(Moodboard)
admin.site.register(ProjectActivity)
admin.site.register(ProjectDiscovery)
admin.site.register(DiscoverySliderResponse)
admin.site.register(DiscoveryEmotion)
admin.site.register(DiscoveryCompetitor)
admin.site.register(DiscoveryVisualStyle)
