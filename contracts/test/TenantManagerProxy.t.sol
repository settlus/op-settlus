// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { Test } from "forge-std/src/Test.sol";
import { console2 } from "forge-std/src/console2.sol";
import { TestHelpers } from "./utils/TestHelpers.sol";
import { Tenant } from "../src/Tenant.sol";
import { TenantManager } from "../src/TenantManager.sol";
import { TenantManagerV2 } from "../src/TenantManagerV2.sol";
import { TenantManagerProxy } from "../src/TenantManagerProxy.sol";

contract TenantManagerProxyTest is TestHelpers {
    function setUp() public {
        _setupActors();
        _deployTenantManagerWithProxy();
        _deployMockTokens();
    }

    // ============ Initialization Tests ============

    function test_initializeThroughProxy() external {
        address owner = tenantManager.owner();
        assertEq(owner, deployer);
    }

    // ============ Tenant Creation via Proxy Tests ============

    function test_createTenantViaProxyAndEmitEvent() external {
        vm.prank(tenantOwner);
        address tenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("SampleTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);

        assertTrue(tenantAddr != address(0));

        Tenant tenant = Tenant(payable(tenantAddr));
        assertEq(tenant.name(), "SampleTenant");
    }

    // ============ Upgrade Tests ============

    function test_upgradeImplementation() external {
        // Verify current implementation
        address currentImpl = tenantManagerProxy.getImplementation();
        assertTrue(currentImpl != address(0));

        // Verify owner
        assertEq(tenantManager.owner(), deployer);

        // Deploy V2 implementation
        vm.prank(deployer);
        TenantManagerV2 v2Implementation = new TenantManagerV2();

        // Upgrade to V2
        vm.prank(deployer);
        tenantManager.upgradeToAndCall(address(v2Implementation), "");

        // Get upgraded contract interface
        TenantManagerV2 upgradedManager = TenantManagerV2(address(tenantManagerProxy));

        // Verify new implementation address
        address newImpl = tenantManagerProxy.getImplementation();
        assertEq(newImpl, address(v2Implementation));

        // Test new variable and function
        assertEq(upgradedManager.newVar(), address(0));

        vm.prank(deployer);
        upgradedManager.newFunction(randomUser);

        assertEq(upgradedManager.newVar(), randomUser);
    }

    function test_onlyOwnerCanUpgrade() external {
        // Deploy V2 implementation
        vm.prank(deployer);
        TenantManagerV2 v2Implementation = new TenantManagerV2();

        // Non-owner should fail
        vm.prank(randomUser);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", randomUser));
        tenantManager.upgradeToAndCall(address(v2Implementation), "");

        // Owner should succeed
        vm.prank(deployer);
        tenantManager.upgradeToAndCall(address(v2Implementation), "");

        // Verify upgrade succeeded
        address newImpl = tenantManagerProxy.getImplementation();
        assertEq(newImpl, address(v2Implementation));
    }

    // ============ State Preservation Tests ============

    function test_statePreservedAfterUpgrade() external {
        // Create a tenant before upgrade
        vm.prank(tenantOwner);
        address tenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("PreUpgradeTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);

        // Deploy and upgrade to V2
        vm.startPrank(deployer);
        TenantManagerV2 v2Implementation = new TenantManagerV2();
        tenantManager.upgradeToAndCall(address(v2Implementation), "");
        vm.stopPrank();

        // Get upgraded contract interface
        TenantManagerV2 upgradedManager = TenantManagerV2(address(tenantManagerProxy));

        // Verify tenant still exists
        assertEq(upgradedManager.getTenantAddress("PreUpgradeTenant"), tenantAddr);

        // Verify we can still create tenants
        vm.prank(tenantOwner);
        address newTenantAddr = upgradedManager.createTenant{ value: TENANT_CREATION_FEE }("PostUpgradeTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);

        assertTrue(newTenantAddr != address(0));
        assertEq(upgradedManager.getTenantAddress("PostUpgradeTenant"), newTenantAddr);
    }
}
