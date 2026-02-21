-- Create reseller table
CREATE TABLE `resellers` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `contactName` VARCHAR(191) NULL,
  `contactEmail` VARCHAR(191) NULL,
  `contactPhone` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `resellers_code_key`(`code`),
  INDEX `resellers_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Extend tenants for reseller assignment
ALTER TABLE `tenants`
  ADD COLUMN `resellerId` VARCHAR(191) NULL,
  ADD COLUMN `metadata` JSON NULL;

CREATE INDEX `tenants_resellerId_idx` ON `tenants`(`resellerId`);

-- Create cloud accounts for owner/reseller/tenant-admin control plane users
CREATE TABLE `cloud_accounts` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NULL,
  `accountType` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `resellerId` VARCHAR(191) NULL,
  `tenantId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `lastLoginAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `cloud_accounts_email_key`(`email`),
  INDEX `cloud_accounts_accountType_status_idx`(`accountType`, `status`),
  INDEX `cloud_accounts_resellerId_idx`(`resellerId`),
  INDEX `cloud_accounts_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `tenants`
  ADD CONSTRAINT `tenants_resellerId_fkey`
  FOREIGN KEY (`resellerId`) REFERENCES `resellers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `cloud_accounts`
  ADD CONSTRAINT `cloud_accounts_resellerId_fkey`
  FOREIGN KEY (`resellerId`) REFERENCES `resellers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `cloud_accounts`
  ADD CONSTRAINT `cloud_accounts_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
