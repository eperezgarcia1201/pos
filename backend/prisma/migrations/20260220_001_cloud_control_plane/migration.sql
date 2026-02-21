-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'America/Chicago',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `edgeBaseUrl` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stores_code_key`(`code`),
    INDEX `stores_tenantId_idx`(`tenantId`),
    INDEX `stores_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_nodes` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `nodeKey` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OFFLINE',
    `softwareVersion` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_nodes_nodeKey_key`(`nodeKey`),
    INDEX `store_nodes_storeId_idx`(`storeId`),
    INDEX `store_nodes_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_node_bootstrap_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `store_node_bootstrap_tokens_storeId_expiresAt_idx`(`storeId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_revisions` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `checksum` VARCHAR(191) NULL,
    `publishedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sync_revisions_storeId_domain_createdAt_idx`(`storeId`, `domain`, `createdAt`),
    UNIQUE INDEX `sync_revisions_storeId_domain_revision_key`(`storeId`, `domain`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_commands` (
    `id` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NULL,
    `revisionId` VARCHAR(191) NULL,
    `domain` VARCHAR(191) NOT NULL,
    `commandType` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `appliedRevision` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorDetail` VARCHAR(191) NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,

    INDEX `sync_commands_storeId_status_issuedAt_idx`(`storeId`, `status`, `issuedAt`),
    INDEX `sync_commands_nodeId_status_issuedAt_idx`(`nodeId`, `status`, `issuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_command_logs` (
    `id` VARCHAR(191) NOT NULL,
    `commandId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorDetail` VARCHAR(191) NULL,
    `output` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sync_command_logs_commandId_createdAt_idx`(`commandId`, `createdAt`),
    INDEX `sync_command_logs_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_nodes` ADD CONSTRAINT `store_nodes_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_node_bootstrap_tokens` ADD CONSTRAINT `store_node_bootstrap_tokens_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_revisions` ADD CONSTRAINT `sync_revisions_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_commands` ADD CONSTRAINT `sync_commands_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_commands` ADD CONSTRAINT `sync_commands_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `store_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_commands` ADD CONSTRAINT `sync_commands_revisionId_fkey` FOREIGN KEY (`revisionId`) REFERENCES `sync_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_command_logs` ADD CONSTRAINT `sync_command_logs_commandId_fkey` FOREIGN KEY (`commandId`) REFERENCES `sync_commands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_command_logs` ADD CONSTRAINT `sync_command_logs_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_command_logs` ADD CONSTRAINT `sync_command_logs_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `store_nodes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
