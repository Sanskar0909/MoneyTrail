package com.moneytrail.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "moneytrail.storage")
public record StorageProperties(String endpoint, String accessKey, String secretKey, String bucket) {
}
