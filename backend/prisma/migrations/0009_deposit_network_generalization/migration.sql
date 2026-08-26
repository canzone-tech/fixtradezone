-- DEP-01 hardening — make receiving accounts network-aware without rewriting applied 0008 history.

ALTER TABLE `deposit_accounts`
  DROP CHECK `deposit_accounts_asset_check`,
  DROP CHECK `deposit_accounts_network_check`,
  DROP INDEX `deposit_accounts_walletAddress_key`,
  ADD UNIQUE INDEX `deposit_accounts_asset_network_walletAddress_key` (`asset`, `network`, `walletAddress`),
  ADD INDEX `deposit_accounts_asset_network_isActive_idx` (`asset`, `network`, `isActive`);

ALTER TABLE `deposits`
  DROP CHECK `deposits_currency_check`,
  DROP CHECK `deposits_network_check`,
  DROP INDEX `deposits_txid_key`,
  MODIFY `txid` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `deposits_assignedNetwork_txid_key` (`assignedNetwork`, `txid`);
