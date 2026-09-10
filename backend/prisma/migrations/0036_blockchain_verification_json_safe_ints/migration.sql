-- DEP-03 follow-up: Prisma raw SQL maps MySQL 32-bit UNSIGNED integers to
-- JavaScript BigInt. The blockchain verification service intentionally uses
-- bounded JSON-safe numbers for chain IDs and counters, so keep these columns
-- as signed INTs. Phase 1 supports BSC mainnet chain ID 56 only.
--
-- blockNumber remains BIGINT UNSIGNED and is explicitly CAST AS CHAR on reads.

ALTER TABLE `deposit_payment_rail_blockchain_configs`
  MODIFY `chainId` INT NULL,
  MODIFY `revision` INT NOT NULL DEFAULT 1;

ALTER TABLE `deposit_blockchain_verifications`
  MODIFY `chainId` INT NULL,
  MODIFY `observedConfirmations` INT NULL,
  MODIFY `attemptCount` INT NOT NULL DEFAULT 1;
