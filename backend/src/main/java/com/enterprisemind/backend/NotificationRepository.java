package com.enterprisemind.backend;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository
        extends JpaRepository<AppNotification, String> {

    boolean existsByEventKey(String eventKey);

    long countByReadFalse();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AppNotification notification "
            + "set notification.read = true where notification.read = false")
    int markAllRead();
}
