"""
Media service for handling photo and video uploads.
"""
from datetime import datetime, timedelta
from typing import Optional
import uuid
import io

import boto3
from botocore.config import Config
from PIL import Image

from app.core.config import settings


class MediaService:
    """Service for media storage and processing."""
    
    def __init__(self):
        self.s3_client = self._create_s3_client()
    
    def _create_s3_client(self):
        """Create S3 client with configuration."""
        config = Config(
            signature_version='s3v4',
            retries={'max_attempts': 3}
        )
        
        client_kwargs = {
            'config': config,
            'region_name': settings.S3_REGION
        }
        
        if settings.S3_ENDPOINT_URL:
            client_kwargs['endpoint_url'] = settings.S3_ENDPOINT_URL
        
        if settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY:
            client_kwargs['aws_access_key_id'] = settings.S3_ACCESS_KEY
            client_kwargs['aws_secret_access_key'] = settings.S3_SECRET_KEY
        
        return boto3.client('s3', **client_kwargs)
    
    def generate_upload_url(
        self,
        media_id: uuid.UUID,
        content_type: str,
        expires_in: int = 3600
    ) -> tuple[str, str]:
        """Generate a pre-signed URL for direct upload to S3."""
        key = self._generate_key(media_id, content_type)
        
        url = self.s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': settings.S3_BUCKET_NAME,
                'Key': key,
                'ContentType': content_type
            },
            ExpiresIn=expires_in
        )
        
        return url, key
    
    def generate_download_url(
        self,
        key: str,
        expires_in: int = 3600
    ) -> str:
        """Generate a pre-signed URL for downloading media."""
        return self.s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': settings.S3_BUCKET_NAME,
                'Key': key
            },
            ExpiresIn=expires_in
        )
    
    async def upload_media(
        self,
        media_id: uuid.UUID,
        content: bytes,
        content_type: str
    ) -> str:
        """Upload media directly to S3."""
        key = self._generate_key(media_id, content_type)
        
        self.s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=content_type
        )
        
        return key
    
    async def generate_thumbnail(
        self,
        original_key: str,
        media_id: uuid.UUID,
        max_size: tuple[int, int] = (300, 300)
    ) -> Optional[str]:
        """Generate and upload a thumbnail for an image."""
        try:
            # Download original
            response = self.s3_client.get_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=original_key
            )
            image_data = response['Body'].read()
            
            # Create thumbnail
            image = Image.open(io.BytesIO(image_data))
            image.thumbnail(max_size, Image.Resampling.LANCZOS)
            
            # Convert to JPEG
            output = io.BytesIO()
            if image.mode in ('RGBA', 'P'):
                image = image.convert('RGB')
            image.save(output, format='JPEG', quality=80)
            output.seek(0)
            
            # Upload thumbnail
            thumbnail_key = f"thumbnails/{media_id}.jpg"
            self.s3_client.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=thumbnail_key,
                Body=output.getvalue(),
                ContentType='image/jpeg'
            )
            
            return thumbnail_key
            
        except Exception as e:
            print(f"Error generating thumbnail: {e}")
            return None
    
    async def delete_media(self, key: str) -> bool:
        """Delete media from S3."""
        try:
            self.s3_client.delete_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=key
            )
            return True
        except Exception:
            return False
    
    def _generate_key(self, media_id: uuid.UUID, content_type: str) -> str:
        """Generate a unique S3 key for media."""
        # Determine extension from content type
        extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/quicktime': 'mov'
        }
        ext = extensions.get(content_type, 'bin')
        
        # Organize by date
        now = datetime.utcnow()
        date_path = now.strftime('%Y/%m/%d')
        
        return f"media/{date_path}/{media_id}.{ext}"
    
    def validate_file_type(self, content_type: str, media_type: str) -> bool:
        """Validate that content type is allowed."""
        if media_type == 'photo':
            return content_type in settings.ALLOWED_IMAGE_TYPES
        elif media_type == 'video':
            return content_type in settings.ALLOWED_VIDEO_TYPES
        return False
    
    def validate_file_size(self, size: int, media_type: str) -> bool:
        """Validate file size is within limits."""
        if media_type == 'photo':
            max_size = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
        elif media_type == 'video':
            max_size = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
        else:
            return False
        
        return size <= max_size


# Singleton instance
media_service = MediaService()
