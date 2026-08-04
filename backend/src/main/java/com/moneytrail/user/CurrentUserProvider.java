package com.moneytrail.user;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The single place that answers "who is the current user?".
 *
 * <p>Auth is deferred, so this returns the seeded user's id from configuration. When Spring
 * Security lands, this class reads the authenticated principal instead — and because every
 * service depends on this seam rather than a hardcoded id, nothing else has to change.
 *
 * <p>Never bypass this by hardcoding an owner id elsewhere.
 */
@Component
public class CurrentUserProvider {

    private final Long currentUserId;

    public CurrentUserProvider(@Value("${moneytrail.auth.seeded-user-id}") Long currentUserId) {
        this.currentUserId = currentUserId;
    }

    public Long currentUserId() {
        return currentUserId;
    }
}
