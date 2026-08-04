package com.moneytrail.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "moneytrail.upload")
public record UploadProperties(List<String> allowedContentTypes, long maxFileSizeBytes) {
}
