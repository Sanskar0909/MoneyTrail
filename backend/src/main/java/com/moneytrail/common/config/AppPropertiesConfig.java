package com.moneytrail.common.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({StorageProperties.class, UploadProperties.class, PipelineProperties.class})
public class AppPropertiesConfig {
}
