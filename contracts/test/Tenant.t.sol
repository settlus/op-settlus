// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { Test } from "forge-std/src/Test.sol";
import { console2 } from "forge-std/src/console2.sol";
import { TestHelpers } from "./utils/TestHelpers.sol";
import { Tenant } from "../src/Tenant.sol";
import { TenantManager } from "../src/TenantManager.sol";
import { BasicERC20 } from "../src/BasicERC20.sol";
import { ERC20NonTransferable } from "../src/ERC20NonTransferable.sol";

contract TenantTest is TestHelpers {
    bytes32 public constant ADMIN_ROLE = 0x00;
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    function setUp() public {
        _setupActors();
        _deployTenantManagerWithProxy();
        _deployMockTokens();
    }

    // ============ Access Control Tests ============

    function test_addRecorder() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Adding recorder from random address should fail
        vm.prank(randomUser);
        vm.expectRevert();
        tenant.addRecorder(randomUser);

        // Using tenant owner should succeed
        vm.prank(tenantOwner);
        tenant.addRecorder(randomUser);
        assertTrue(tenant.hasRole(RECORDER_ROLE, randomUser));
    }

    function test_removeRecorder() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Removing recorder from random address should fail
        vm.prank(randomUser);
        vm.expectRevert();
        tenant.removeRecorder(settler);

        // Add recorder first
        vm.prank(tenantOwner);
        tenant.addRecorder(settler);
        assertTrue(tenant.hasRole(RECORDER_ROLE, settler));

        // Removing from random address should fail
        vm.prank(randomUser);
        vm.expectRevert();
        tenant.removeRecorder(settler);

        // Using tenant owner should succeed
        vm.prank(tenantOwner);
        tenant.removeRecorder(settler);
        assertFalse(tenant.hasRole(RECORDER_ROLE, settler));
    }

    function test_setCurrencyAddress() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Setting from random address should fail
        vm.prank(randomUser);
        vm.expectRevert("Not authorized");
        tenant.setCurrencyAddress(address(0x123));

        // Using tenant owner should succeed
        vm.prank(tenantOwner);
        tenant.setCurrencyAddress(address(0x123));
        assertEq(tenant.ccyAddr(), address(0x123));
    }

    function test_assignMasterRoleAndRecorderRole() external {
        address tenantAddr = _createTenantMintable("Tenant Controlled Mintable", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Tenant owner should have ADMIN_ROLE
        assertTrue(tenant.hasRole(ADMIN_ROLE, tenantOwner));

        // Grant recorder to another account
        vm.prank(tenantOwner);
        tenant.addRecorder(settler);
        assertTrue(tenant.hasRole(RECORDER_ROLE, settler));

        // Revoke recorder
        vm.prank(tenantOwner);
        tenant.removeRecorder(settler);
        assertFalse(tenant.hasRole(RECORDER_ROLE, settler));
    }

    // ============ Currency Type Tests ============

    function test_verifyCurrencyAddresses() external {
        // ETH tenant
        address ethTenantAddr = _createTenantETH("Tenant ETH");
        Tenant ethTenant = Tenant(payable(ethTenantAddr));
        assertEq(ethTenant.ccyAddr(), address(0));

        // ERC20 tenant
        address erc20TenantAddr = _createTenantERC20("Tenant ERC20", address(erc20));
        Tenant erc20Tenant = Tenant(payable(erc20TenantAddr));
        assertEq(erc20Tenant.ccyAddr(), address(erc20));

        // Mintable tenant (pre-deployed)
        vm.prank(tenantOwner);
        address mintableTenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("Tenant SBT", Tenant.CurrencyType.MINTABLES, address(mintable), PAYOUT_PERIOD);
        Tenant mintableTenant = Tenant(payable(mintableTenantAddr));
        assertEq(mintableTenant.ccyAddr(), address(mintable));
    }

    // ============ UTXR Recording Tests ============

    function test_recordUTXRWithNFTOwner() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Mintable", "MTB");
        Tenant tenant = Tenant(payable(tenantAddr));

        string memory reqID = "reqId1";
        uint256 amount = 100;

        _recordUTXR(tenantAddr, reqID, amount);

        (string memory storedReqID, uint256 storedAmount,, address recipient,,,,) = tenant.utxrs(0);

        assertEq(storedReqID, reqID);
        assertEq(storedAmount, amount);
        assertEq(recipient, nftOwner);
    }

    function test_recordUTXRWithUpdatedNFTOwner() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Mintable", "MTB");
        Tenant tenant = Tenant(payable(tenantAddr));

        // First record with original NFT owner
        _recordUTXR(tenantAddr, "reqId1", 100);

        (,,, address recipient1,,,,) = tenant.utxrs(0);
        assertEq(recipient1, nftOwner);

        // Transfer NFT to new owner
        vm.prank(nftOwner);
        nft.transferFrom(nftOwner, newNftOwner, 0);

        // Record again - should show new owner
        _recordUTXR(tenantAddr, "reqId2", 200);

        (,,, address recipient2,,,,) = tenant.utxrs(1);
        assertEq(recipient2, newNftOwner);
    }

    function test_recordRaw() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        string memory reqID = "reqId1";
        uint256 amount = 100;

        vm.prank(tenantOwner);
        tenant.recordRaw(reqID, amount, nftOwner);

        (string memory storedReqID, uint256 storedAmount,, address recipient, uint256 chainID, address contractAddr, uint256 tokenID,) = tenant.utxrs(0);

        assertEq(storedReqID, reqID);
        assertEq(storedAmount, amount);
        assertEq(recipient, nftOwner);
        assertEq(chainID, 0);
        assertEq(contractAddr, address(0));
        assertEq(tokenID, 0);
    }

    function test_getUtxrByReqID() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        string memory reqID = "reqId1";
        uint256 amount = 100;

        _recordUTXR(tenantAddr, reqID, amount);

        assertEq(tenant.getUtxrsLength(), 1);
        assertTrue(tenant.reqIDExists(reqID));

        Tenant.UTXR memory utxr = tenant.getUtxrByReqID(reqID);
        assertEq(utxr.reqID, reqID);
        assertEq(utxr.amount, amount);
        assertEq(utxr.recipient, nftOwner);
    }

    // ============ Settlement Tests ============

    function test_settleWithETH() external {
        address tenantAddr = _createTenantETH("Settle Tenant");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Fund tenant with ETH
        vm.deal(tenantAddr, 1 ether);
        uint256 initialNftOwnerBalance = nftOwner.balance;

        // Record UTXR
        _recordUTXR(tenantAddr, "reqId1", 100);

        // Advance time past payout period
        _advanceTime(PAYOUT_PERIOD + 100);

        // Settle
        vm.prank(tenantOwner);
        tenant.settle(5);

        assertEq(tenantAddr.balance, 1 ether - 100);
        assertEq(nftOwner.balance, initialNftOwnerBalance + 100);
    }

    function test_settleWithERC20() external {
        address tenantAddr = _createTenantERC20("Settle Tenant", address(erc20));
        Tenant tenant = Tenant(payable(tenantAddr));

        uint256 initialTreasury = 100_000;

        // Mint tokens to tenant
        vm.prank(tenantOwner);
        erc20.mint(tenantAddr, initialTreasury);

        uint256 initialNftOwnerBalance = erc20.balanceOf(nftOwner);

        // Record UTXR
        _recordUTXR(tenantAddr, "reqId1", 100);

        // Advance time
        _advanceTime(PAYOUT_PERIOD + 100);

        // Settle
        vm.prank(tenantOwner);
        tenant.settle(5);

        assertEq(erc20.balanceOf(tenantAddr), initialTreasury - 100);
        assertEq(erc20.balanceOf(nftOwner), initialNftOwnerBalance + 100);
    }

    function test_settleWithMintable() external {
        address tenantAddr = _createTenantMintable("Settle Tenant", "Mintable", "MTB");
        Tenant tenant = Tenant(payable(tenantAddr));

        address mintableAddr = tenant.ccyAddr();
        ERC20NonTransferable tenantMintable = ERC20NonTransferable(mintableAddr);

        assertEq(tenantMintable.balanceOf(nftOwner), 0);

        // Record UTXR
        _recordUTXR(tenantAddr, "reqId1", 100);

        // Advance time
        _advanceTime(PAYOUT_PERIOD + 100);

        // Settle
        vm.prank(tenantOwner);
        tenant.settle(5);

        assertEq(tenantMintable.balanceOf(tenantAddr), 0);
        assertEq(tenantMintable.balanceOf(nftOwner), 100);
    }

    function test_settleWithPreDeployedMintable() external {
        // Create tenant with pre-deployed mintable
        vm.prank(tenantOwner);
        address tenantAddr = tenantManager.createTenant{ value: TENANT_CREATION_FEE }("Settle Tenant", Tenant.CurrencyType.MINTABLES, address(mintable), PAYOUT_PERIOD);

        // Grant admin role to tenant so it can mint
        vm.prank(tenantOwner);
        mintable.grantRole(ADMIN_ROLE, tenantAddr);

        uint256 initialBalance = mintable.balanceOf(nftOwner);

        // Record UTXR
        _recordUTXR(tenantAddr, "reqId1", 100);

        // Advance time
        _advanceTime(PAYOUT_PERIOD);

        // Settle via settleAll
        _settleAll();

        assertEq(mintable.balanceOf(nftOwner), initialBalance + 100);
    }

    function test_settleMultipleAndSkipCanceled() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        address mintableAddr = tenant.ccyAddr();
        ERC20NonTransferable tenantMintable = ERC20NonTransferable(mintableAddr);

        // Record 3 UTXRs
        _recordUTXR(tenantAddr, "reqId1", 100);
        _recordUTXR(tenantAddr, "reqId2", 150);
        _recordUTXR(tenantAddr, "reqId3", 200);

        // Cancel second one
        vm.prank(tenantOwner);
        tenant.cancel("reqId2");

        // Advance time
        _advanceTime(PAYOUT_PERIOD);

        // Settle
        vm.prank(tenantOwner);
        tenant.settle(5);

        // Check statuses: 0=Pending, 1=Settled, 2=Cancelled
        (,,,,,,, Tenant.RecordStatus status1) = tenant.utxrs(0);
        (,,,,,,, Tenant.RecordStatus status2) = tenant.utxrs(1);
        (,,,,,,, Tenant.RecordStatus status3) = tenant.utxrs(2);

        assertEq(uint256(status1), 1); // Settled
        assertEq(uint256(status2), 2); // Cancelled
        assertEq(uint256(status3), 1); // Settled

        // Only reqId1 and reqId3 amounts should be minted
        assertEq(tenantMintable.balanceOf(nftOwner), 100 + 200);
        assertEq(tenant.nextToSettleIdx(), 3);
    }

    function test_settleEligibleOnly() external {
        address tenantAddr = _createTenantMintable("Settle Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        address mintableAddr = tenant.ccyAddr();
        ERC20NonTransferable tenantMintable = ERC20NonTransferable(mintableAddr);

        // Record first UTXR
        _recordUTXR(tenantAddr, "reqId1", 100);

        // Half payout period
        _advanceTime(PAYOUT_PERIOD / 2);

        // Record second UTXR
        _recordUTXR(tenantAddr, "reqId2", 200);

        // Another half period (reqId1 now eligible, reqId2 not yet)
        _advanceTime(PAYOUT_PERIOD / 2);

        // Record third UTXR
        _recordUTXR(tenantAddr, "reqId3", 150);

        // Another half period (reqId1, reqId2 eligible, reqId3 not yet)
        _advanceTime(PAYOUT_PERIOD / 2);

        // Settle - should only settle reqId1 and reqId2
        vm.prank(tenantOwner);
        tenant.settle(5);

        assertEq(tenantMintable.balanceOf(nftOwner), 100 + 200);

        // reqId3 should remain
        (string memory remainingReqID, uint256 remainingAmount,,,,,,) = tenant.utxrs(tenant.nextToSettleIdx());
        assertEq(remainingReqID, "reqId3");
        assertEq(remainingAmount, 150);
    }

    // ============ Cancel Tests ============

    function test_revertCancelAfterPayoutPeriod() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        _recordUTXR(tenantAddr, "reqId1", 100);

        // Advance time past payout period
        _advanceTime(PAYOUT_PERIOD);

        // Should revert
        vm.prank(tenantOwner);
        vm.expectRevert("Cannot cancel, UTXR past payout period");
        tenant.cancel("reqId1");

        // Status should still be Pending
        (,,,,,,, Tenant.RecordStatus status) = tenant.utxrs(0);
        assertEq(uint256(status), 0);
    }

    // ============ Payout Period Tests ============

    function test_setPayoutPeriod() external {
        address tenantAddr = _createTenantETH("Test Tenant");
        Tenant tenant = Tenant(payable(tenantAddr));

        vm.prank(tenantOwner);
        tenant.setPayoutPeriod(86_400);

        assertEq(tenant.payoutPeriod(), 86_400);
    }

    // ============ NeedSettlement Tests ============

    function test_needSettlement() external {
        address tenant1Addr = _createTenantMintable("Tenant1", "MintableOne", "MTB");
        address tenant2Addr = _createTenantMintable("Tenant2", "MintableTwo", "BTM");

        Tenant tenant1 = Tenant(payable(tenant1Addr));
        Tenant tenant2 = Tenant(payable(tenant2Addr));

        // Record on tenant1
        _recordUTXR(tenant1Addr, "reqId1", 200);

        // Half period
        _advanceTime(PAYOUT_PERIOD / 2);

        // Record on tenant2
        vm.prank(tenantOwner);
        tenantManager.record(tenant2Addr, "reqId2", 100, block.chainid, address(nft), 0);

        // Another half period - tenant1's UTXR is now eligible
        _advanceTime(PAYOUT_PERIOD / 2);

        assertTrue(tenant1.needSettlement());
        assertFalse(tenant2.needSettlement());
    }

    // ============ Treasury Control Tests ============

    function test_onlyOwnerControlsTreasury() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        vm.prank(nftOwner);
        vm.expectRevert("Not authorized");
        tenant.setCurrencyAddress(address(0));
    }

    // ============ Fuzz Tests ============

    function testFuzz_record(uint256 amount) external {
        vm.assume(amount > 0 && amount < type(uint128).max);

        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        _recordUTXR(tenantAddr, "reqId1", amount);

        (, uint256 storedAmount,,,,,,) = tenant.utxrs(0);
        assertEq(storedAmount, amount);
    }

    function testFuzz_settleBatch(uint8 batchSize) external {
        vm.assume(batchSize > 0 && batchSize <= 20);

        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        // Record multiple UTXRs
        for (uint256 i = 0; i < batchSize; i++) {
            _recordUTXR(tenantAddr, string(abi.encodePacked("reqId", vm.toString(i))), 10);
        }

        _advanceTime(PAYOUT_PERIOD);

        vm.prank(tenantOwner);
        tenant.settle(batchSize);

        assertEq(tenant.nextToSettleIdx(), batchSize);
    }

    // ============ Event Tests ============

    function test_emitSettledEvent() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        _recordUTXR(tenantAddr, "reqId1", 100);
        _advanceTime(PAYOUT_PERIOD);

        vm.expectEmit(true, true, true, true);
        emit Tenant.Settled("reqId1", 100, nftOwner);

        vm.prank(tenantOwner);
        tenant.settle(1);
    }

    function test_emitCancelledEvent() external {
        address tenantAddr = _createTenantMintable("Test Tenant", "Token", "TKN");
        Tenant tenant = Tenant(payable(tenantAddr));

        _recordUTXR(tenantAddr, "reqId1", 100);

        vm.expectEmit(true, true, true, true);
        emit Tenant.Cancelled("reqId1");

        vm.prank(tenantOwner);
        tenant.cancel("reqId1");
    }
}
