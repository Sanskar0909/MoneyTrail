package com.moneytrail.storage;

import com.moneytrail.common.config.StorageProperties;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/**
 * MinIO SDK is S3-API compatible, so this same implementation works against local MinIO
 * in dev and real S3 in production — only endpoint/credentials change.
 */
@Component
public class S3FileStorageClient implements FileStorageClient {

    private final MinioClient minioClient;
    private final StorageProperties properties;

    public S3FileStorageClient(MinioClient minioClient, StorageProperties properties) {
        this.minioClient = minioClient;
        this.properties = properties;
    }

    @Override
    public String putObject(String objectKey, InputStream content, long contentLength, String contentType) {
        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(properties.bucket())
                    .object(objectKey)
                    .stream(content, contentLength, -1)
                    .contentType(contentType)
                    .build());
            return objectKey;
        } catch (Exception e) {
            throw new StorageException("Failed to store object " + objectKey, e);
        }
    }

    @Override
    public InputStream getObject(String objectKey) {
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(properties.bucket())
                    .object(objectKey)
                    .build());
        } catch (Exception e) {
            throw new StorageException("Failed to fetch object " + objectKey, e);
        }
    }

    @Override
    public void deleteObject(String objectKey) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(properties.bucket())
                    .object(objectKey)
                    .build());
        } catch (Exception e) {
            throw new StorageException("Failed to delete object " + objectKey, e);
        }
    }
}
