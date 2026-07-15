from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import (
    ConsultantRegisterSerializer,
    ConsultantLoginSerializer,
)
from rest_framework.permissions import IsAuthenticated




from .serializers import (
    ConsultantRegisterSerializer,
    ConsultantLoginSerializer,
    ConsultantSerializer,
)

from .serializers import ConsultantRegisterSerializer





class ConsultantRegisterView(APIView):
    def post(self, request):
        serializer = ConsultantRegisterSerializer(data=request.data)

        if serializer.is_valid():
            consultant = serializer.save()

            return Response(
                {
                    "message": "Consultant registered successfully",
                    "consultant": {
                        "id": consultant.id,
                        "name": consultant.name,
                        "email": consultant.email,
                    }
                },
                status=status.HTTP_201_CREATED
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

class ConsultantLoginView(APIView):
    def post(self, request):
        serializer = ConsultantLoginSerializer(data=request.data)

        if serializer.is_valid():
            return Response(
                serializer.validated_data,
                status=status.HTTP_200_OK
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )    

class ConsultantMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = ConsultantSerializer(request.user)

        return Response(serializer.data)    

    def patch(self, request):
        serializer = ConsultantSerializer(
            request.user,
            data=request.data,
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    


##logout functionality   
class ConsultantLogoutView(APIView): 
    class ConsultantLogoutView(APIView):
     permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")

        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(
                {"detail": "Logout successful."},
                status=status.HTTP_200_OK,
            )

        except Exception:
            return Response(
                {"detail": "Invalid refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
