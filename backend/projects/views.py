from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project
from .serializers import ProjectSerializer, ProjectCreateSerializer
from rest_framework.pagination import PageNumberPagination


class ProjectPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50

class ProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        projects = Project.objects.filter(
            consultant=request.user,
            is_archived=False,
        ).select_related("client")

        search = request.query_params.get("search", "").strip()

        if search:
            projects = projects.filter(
                Q(title__icontains=search)
                | Q(company_name__icontains=search)
                | Q(sector__icontains=search)
                | Q(status__icontains=search)
                | Q(client__name__icontains=search)
                | Q(client__email__icontains=search)
            )

        projects = projects.order_by("-created_at")

        paginator = ProjectPagination()
        paginated_projects = paginator.paginate_queryset(projects, request)

        serializer = ProjectSerializer(paginated_projects, many=True)

        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ProjectCreateSerializer(
            data=request.data,
            context={"request": request},
        )

        if serializer.is_valid():
            project = serializer.save()
            response_serializer = ProjectSerializer(project)

            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)




class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            project = Project.objects.get(
                id=pk,
                consultant=request.user,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProjectSerializer(project)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


