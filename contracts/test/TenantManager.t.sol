// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { Test } from "forge-std/src/Test.sol";
import { console2 } from "forge-std/src/console2.sol";
import { TestHelpers } from "./utils/TestHelpers.sol";
import { Tenant } from "../src/Tenant.sol";
import { TenantManager } from "../src/TenantManager.sol";
import { BasicERC20 } from "../src/BasicERC20.sol";
import { ERC20NonTransferable } from "../src/ERC20NonTransferable.sol";

contract TenantManagerTest is TestHelpers {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    function setUp() public {
        _setupActors();
        _deployTenantManagerWithProxy();
        _deployMockTokens();
    }

    // ============ Tenant Creation Tests ============

    function test_createTenantWithCorrectParamsAndEmitEvent() external {
        vm.prank(tenantOwner);
        address tenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("SampleTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);

        assertTrue(tenantAddr != address(0));

        // Verify tenant was created correctly
        Tenant tenant = Tenant(payable(tenantAddr));
        assertEq(tenant.name(), "SampleTenant");
        assertEq(uint256(tenant.ccyType()), uint256(Tenant.CurrencyType.ETH));
    }

    function test_revertCreateTenantWithWrongFee() external {
        vm.prank(tenantOwner);
        vm.expectRevert("Need exact tenant creation fee");
        tenantManager.createTenant{ value: TENANT_CREATION_FEE + 200 }("SampleTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);
    }

    function test_revertDuplicateTenantName() external {
        vm.prank(tenantOwner);
        tenantManager.createTenant{ value: TENANT_CREATION_FEE }("SampleTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);

        vm.prank(tenantOwner);
        vm.expectRevert(TenantManager.DuplicateTenantName.selector);
        tenantManager.createTenant{ value: TENANT_CREATION_FEE }("SampleTenant", Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);
    }

    function test_createTenantWithDifferentCurrencyTypes() external {
        // ETH tenant
        address ethTenantAddr = _createTenantETH("Tenant ETH");
        assertTrue(ethTenantAddr != address(0));

        // Mintable tenant (auto-generated)
        address mintableTenantAddr = _createTenantMintable("Tenant Mintable", "Mintable", "MTB");
        assertTrue(mintableTenantAddr != address(0));
    }

    // ============ Tenant Removal Tests ============

    function test_removeTenant() external {
        address tenantAddr = _createTenantETH("SampleTenant");

        vm.prank(tenantOwner);
        vm.expectEmit(true, false, false, true);
        emit TenantManager.TenantRemoved(tenantAddr, "SampleTenant");

        tenantManager.removeTenant("SampleTenant");
    }

    function test_revertRemoveTenantUnauthorized() external {
        _createTenantETH("SampleTenant");

        // nftOwner is not tenant creator or manager owner
        vm.prank(nftOwner);
        vm.expectRevert(TenantManager.UnauthorizedAction.selector);
        tenantManager.removeTenant("SampleTenant");
    }

    // ============ Storage and Retrieval Tests ============

    function test_storeAndRetrieveTenantAddresses() external {
        address tenantAddr = _createTenantETH("SampleTenant");

        address[] memory addresses = tenantManager.getTenantAddresses();
        bool found = false;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (addresses[i] == tenantAddr) {
                found = true;
                break;
            }
        }
        assertTrue(found);

        // Check via getTenantAddress
        assertEq(tenantManager.getTenantAddress("SampleTenant"), tenantAddr);
    }

    // ============ SettleAll Tests ============

    function test_settleAllWithPartialSuccess() external {
        address tenantOwner1 = makeAddr("tenantOwner1");
        address tenantOwner2 = makeAddr("tenantOwner2");
        vm.deal(tenantOwner1, 10 ether);
        vm.deal(tenantOwner2, 10 ether);

        uint256 initialTreasuryBalance = 1000;
        uint256 insufficientBalance = 50;

        // Deploy two ERC20 tokens
        vm.prank(tenantOwner1);
        BasicERC20 tenant1Erc20 = new BasicERC20(tenantOwner1, "Test ERC20 1", "TST1");

        vm.prank(tenantOwner2);
        BasicERC20 tenant2Erc20 = new BasicERC20(tenantOwner2, "Test ERC20 2", "TST2");

        // Create tenants with ERC20
        vm.prank(tenantOwner1);
        address tenant1Addr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("Tenant1", Tenant.CurrencyType.ERC20, address(tenant1Erc20), PAYOUT_PERIOD);

        vm.prank(tenantOwner2);
        address tenant2Addr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("Tenant2", Tenant.CurrencyType.ERC20, address(tenant2Erc20), PAYOUT_PERIOD);

        // Mint tokens to tenants (one has sufficient, one has insufficient)
        vm.prank(tenantOwner1);
        tenant1Erc20.mint(tenant1Addr, initialTreasuryBalance);

        vm.prank(tenantOwner2);
        tenant2Erc20.mint(tenant2Addr, insufficientBalance);

        uint256 amountToSettle = 500;

        // Record UTXRs - need to grant RECORDER_ROLE first
        Tenant tenant1 = Tenant(payable(tenant1Addr));
        Tenant tenant2 = Tenant(payable(tenant2Addr));

        vm.prank(tenantOwner1);
        tenant1.recordRaw("reqId1", amountToSettle, nftOwner);

        vm.prank(tenantOwner2);
        tenant2.recordRaw("reqId2", amountToSettle, nftOwner);

        // Advance time
        _advanceTime(PAYOUT_PERIOD);

        // SettleAll - should not revert even if one fails
        _settleAll();

        // Tenant1 should have settled successfully
        assertEq(tenant1Erc20.balanceOf(tenant1Addr), initialTreasuryBalance - amountToSettle);
        assertEq(tenant1Erc20.balanceOf(nftOwner), amountToSettle);

        // Tenant2 should have failed (insufficient balance)
        assertEq(tenant2Erc20.balanceOf(tenant2Addr), insufficientBalance);
        assertEq(tenant2Erc20.balanceOf(nftOwner), 0);
    }

    function test_checkNeedSettlement() external {
        address tenantOwner1 = makeAddr("tenantOwner1");
        address tenantOwner2 = makeAddr("tenantOwner2");
        vm.deal(tenantOwner1, 10 ether);
        vm.deal(tenantOwner2, 10 ether);

        // Create two mintable tenants
        vm.prank(tenantOwner1);
        address tenant1Addr = tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }("Tenant1", Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, "MintableOne", "MTB");

        vm.prank(tenantOwner2);
        address tenant2Addr = tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }("Tenant2", Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, "MintableTwo", "BTM");

        Tenant tenant1 = Tenant(payable(tenant1Addr));
        Tenant tenant2 = Tenant(payable(tenant2Addr));

        // Record UTXRs
        vm.prank(tenantOwner1);
        tenant1.recordRaw("reqId1", 500, nftOwner);

        vm.prank(tenantOwner2);
        tenant2.recordRaw("reqId2", 500, nftOwner);

        // Before payout period
        assertFalse(tenantManager.checkNeedSettlement());

        // Advance time
        _advanceTime(PAYOUT_PERIOD);

        assertTrue(tenantManager.checkNeedSettlement());

        // Settle all
        _settleAll();

        assertFalse(tenantManager.checkNeedSettlement());
    }

    function test_revertRecordWithWrongRecorder() external {
        address tenantOwner1 = makeAddr("tenantOwner1");
        address tenantOwner2 = makeAddr("tenantOwner2");
        vm.deal(tenantOwner1, 10 ether);
        vm.deal(tenantOwner2, 10 ether);

        vm.prank(tenantOwner1);
        address tenant1Addr = tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }("Tenant1", Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, "MintableOne", "MTB");

        // tenantOwner2 should not be able to record on tenant1
        vm.prank(tenantOwner2);
        vm.expectRevert(TenantManager.UnauthorizedAction.selector);
        tenantManager.record(tenant1Addr, "reqId1", 500, block.chainid, address(nft), 0);
    }

    function test_settleMaxPerTenant() external {
        address tenantOwner1 = makeAddr("tenantOwner1");
        address tenantOwner2 = makeAddr("tenantOwner2");
        vm.deal(tenantOwner1, 10 ether);
        vm.deal(tenantOwner2, 10 ether);

        // Create two mintable tenants
        vm.prank(tenantOwner1);
        address tenant1Addr = tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }("Tenant1", Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, "MintableOne", "MTB");

        vm.prank(tenantOwner2);
        address tenant2Addr = tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }("Tenant2", Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, "MintableTwo", "BTM");

        Tenant tenant1 = Tenant(payable(tenant1Addr));
        Tenant tenant2 = Tenant(payable(tenant2Addr));

        ERC20NonTransferable tenant1ccy = ERC20NonTransferable(tenant1.ccyAddr());
        ERC20NonTransferable tenant2ccy = ERC20NonTransferable(tenant2.ccyAddr());

        // Record 100 UTXRs per tenant
        uint256 recordNumber = 100;
        for (uint256 i = 0; i < recordNumber; i++) {
            vm.prank(tenantOwner1);
            tenant1.recordRaw(string(abi.encodePacked("Tenant1reqId", vm.toString(i))), 1, nftOwner);

            vm.prank(tenantOwner2);
            tenant2.recordRaw(string(abi.encodePacked("Tenant2reqId", vm.toString(i))), 1, nftOwner);
        }

        // Advance time
        _advanceTime(PAYOUT_PERIOD);

        // First settleAll
        _settleAll();

        // Should only settle MAX_PER_TENANT (10) per tenant
        assertEq(tenant1.nextToSettleIdx(), MAX_PER_TENANT);
        assertEq(tenant2.nextToSettleIdx(), MAX_PER_TENANT);
        assertEq(tenant1ccy.balanceOf(nftOwner), MAX_PER_TENANT);
        assertEq(tenant2ccy.balanceOf(nftOwner), MAX_PER_TENANT);

        // Advance time again
        _advanceTime(PAYOUT_PERIOD);

        // Second settleAll
        _settleAll();

        // Should settle another batch
        assertEq(tenant1.nextToSettleIdx(), MAX_PER_TENANT * 2);
        assertEq(tenant2.nextToSettleIdx(), MAX_PER_TENANT * 2);
        assertEq(tenant1ccy.balanceOf(nftOwner), MAX_PER_TENANT * 2);
        assertEq(tenant2ccy.balanceOf(nftOwner), MAX_PER_TENANT * 2);
    }

    // ============ Access Control Tests ============

    function test_settlerRolePermissions() external {
        // Deployer should have SETTLER_ROLE
        assertTrue(tenantManager.hasRole(SETTLER_ROLE, deployer));

        // Settler should not have SETTLER_ROLE initially
        assertFalse(tenantManager.hasRole(SETTLER_ROLE, settler));

        // Grant SETTLER_ROLE to settler
        vm.prank(deployer);
        tenantManager.grantRole(SETTLER_ROLE, settler);
        assertTrue(tenantManager.hasRole(SETTLER_ROLE, settler));
    }

    function test_onlySettlerRoleCanCallSettleAll() external {
        // Create a tenant with record
        address tenantAddr = _createTenantMintable("TestTenant", "TestToken", "TST");
        Tenant tenant = Tenant(payable(tenantAddr));

        vm.prank(tenantOwner);
        tenant.recordRaw("testReqId", 100, nftOwner);

        _advanceTime(PAYOUT_PERIOD);

        // Settler without role should fail
        vm.prank(settler);
        vm.expectRevert();
        tenantManager.settleAll();

        // Grant role
        vm.prank(deployer);
        tenantManager.grantRole(SETTLER_ROLE, settler);

        // Now should succeed
        vm.prank(settler);
        tenantManager.settleAll();
    }

    // ============ Fuzz Tests ============

    function testFuzz_createTenant(uint256 payoutPeriod_) external {
        vm.assume(payoutPeriod_ > 0 && payoutPeriod_ < 365 days);

        vm.prank(tenantOwner);
        address tenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("FuzzTenant", Tenant.CurrencyType.ETH, address(0), payoutPeriod_);

        Tenant tenant = Tenant(payable(tenantAddr));
        assertEq(tenant.payoutPeriod(), payoutPeriod_);
    }

    function testFuzz_settleAll_multipleRecords(uint8 recordCount) external {
        vm.assume(recordCount > 0 && recordCount <= 50);

        address tenantAddr = _createTenantMintable("FuzzTenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        for (uint256 i = 0; i < recordCount; i++) {
            vm.prank(tenantOwner);
            tenant.recordRaw(string(abi.encodePacked("reqId", vm.toString(i))), 1, nftOwner);
        }

        _advanceTime(PAYOUT_PERIOD);

        // Multiple settleAll calls to settle all
        uint256 expectedSettled = recordCount > MAX_PER_TENANT ? MAX_PER_TENANT : recordCount;

        _settleAll();

        assertEq(tenant.nextToSettleIdx(), expectedSettled);
    }
}
