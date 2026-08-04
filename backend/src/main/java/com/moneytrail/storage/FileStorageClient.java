package com.moneytrail.storage;

import java.io.InputStream;

public interface FileStorageClient {

    /**
     * Streams the given content to storage and returns the object key it was stored under.
     */
    String putObject(String objectKey, InputStream content, long contentLength, String contentType);

    InputStream getObject(String objectKey);

    void deleteObject(String objectKey);
}
