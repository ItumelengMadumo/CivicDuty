import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import Compressor from 'compressorjs';

import { environment } from '@env/environment';
import { LocalMedia } from '../models';

@Injectable({
    providedIn: 'root'
})
export class MediaService {

    /**
     * Process media file for storage and upload.
     * Compresses images and extracts metadata.
     */
    async processMedia(blob: Blob, type: 'photo' | 'video'): Promise<LocalMedia> {
        const id = uuidv4();

        if (type === 'photo') {
            return this.processImage(id, blob);
        } else {
            return this.processVideo(id, blob);
        }
    }

    /**
     * Process and compress an image.
     */
    private async processImage(id: string, blob: Blob): Promise<LocalMedia> {
        // Compress the image
        const compressed = await this.compressImage(blob);

        // Get dimensions
        const dimensions = await this.getImageDimensions(compressed);

        // Generate thumbnail
        const thumbnail = await this.generateThumbnail(compressed);

        return {
            id,
            mediaType: 'photo',
            mimeType: 'image/jpeg',
            fileSize: compressed.size,
            width: dimensions.width,
            height: dimensions.height,
            blob: compressed,
            thumbnailBlob: thumbnail,
            uploadStatus: 'pending'
        };
    }

    /**
     * Process a video file.
     */
    private async processVideo(id: string, blob: Blob): Promise<LocalMedia> {
        // Get video metadata
        const metadata = await this.getVideoMetadata(blob);

        // Generate video thumbnail
        const thumbnail = await this.generateVideoThumbnail(blob);

        return {
            id,
            mediaType: 'video',
            mimeType: blob.type || 'video/mp4',
            fileSize: blob.size,
            width: metadata.width,
            height: metadata.height,
            duration: metadata.duration,
            blob,
            thumbnailBlob: thumbnail,
            uploadStatus: 'pending'
        };
    }

    /**
     * Compress image using Compressor.js
     */
    private compressImage(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            new Compressor(blob as File, {
                quality: environment.compressionQuality,
                maxWidth: 2048,
                maxHeight: 2048,
                mimeType: 'image/jpeg',
                success: (result) => resolve(result),
                error: (err) => reject(err)
            });
        });
    }

    /**
     * Get image dimensions.
     */
    private getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
                URL.revokeObjectURL(img.src);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Generate a thumbnail for an image.
     */
    private generateThumbnail(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }

                // Calculate thumbnail dimensions
                const maxSize = environment.thumbnailMaxSize;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round(width * maxSize / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (thumbnailBlob) => {
                        if (thumbnailBlob) {
                            resolve(thumbnailBlob);
                        } else {
                            reject(new Error('Failed to create thumbnail'));
                        }
                        URL.revokeObjectURL(img.src);
                    },
                    'image/jpeg',
                    0.8
                );
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Get video metadata.
     */
    private getVideoMetadata(blob: Blob): Promise<{ width: number; height: number; duration: number }> {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            video.onloadedmetadata = () => {
                resolve({
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: Math.round(video.duration)
                });
                URL.revokeObjectURL(video.src);
            };

            video.onerror = () => {
                reject(new Error('Failed to load video metadata'));
                URL.revokeObjectURL(video.src);
            };

            video.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Generate a thumbnail from a video.
     */
    private generateVideoThumbnail(blob: Blob): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';

            video.onloadeddata = () => {
                // Seek to 1 second or 10% of video, whichever is smaller
                video.currentTime = Math.min(1, video.duration * 0.1);
            };

            video.onseeked = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Could not get canvas context'));
                    return;
                }

                // Calculate thumbnail dimensions
                const maxSize = environment.thumbnailMaxSize;
                let width = video.videoWidth;
                let height = video.videoHeight;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * maxSize / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round(width * maxSize / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(video, 0, 0, width, height);

                canvas.toBlob(
                    (thumbnailBlob) => {
                        if (thumbnailBlob) {
                            resolve(thumbnailBlob);
                        } else {
                            reject(new Error('Failed to create video thumbnail'));
                        }
                        URL.revokeObjectURL(video.src);
                    },
                    'image/jpeg',
                    0.8
                );
            };

            video.onerror = () => {
                reject(new Error('Failed to load video'));
                URL.revokeObjectURL(video.src);
            };

            video.src = URL.createObjectURL(blob);
        });
    }

    /**
     * Create object URL for a blob.
     */
    createObjectUrl(blob: Blob): string {
        return URL.createObjectURL(blob);
    }

    /**
     * Revoke object URL.
     */
    revokeObjectUrl(url: string): void {
        URL.revokeObjectURL(url);
    }

    /**
     * Validate file type.
     */
    isValidImageType(file: File): boolean {
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        return validTypes.includes(file.type);
    }

    /**
     * Validate video type.
     */
    isValidVideoType(file: File): boolean {
        const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
        return validTypes.includes(file.type);
    }

    /**
     * Validate file size.
     */
    isValidFileSize(file: File, type: 'photo' | 'video'): boolean {
        const maxSize = type === 'photo'
            ? environment.maxImageSizeMB * 1024 * 1024
            : environment.maxVideoSizeMB * 1024 * 1024;
        return file.size <= maxSize;
    }
}
