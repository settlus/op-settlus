pragma solidity >=0.8.25 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { console2 } from "forge-std/src/console2.sol";

import { Tenant } from "../src/Tenant.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

contract TenantTest is Test {
    Tenant internal testTenant;
    address internal manager;

    /// set up the test environment
    function setUp() public virtual {
        manager = address(1);
        testTenant = new Tenant(manager, manager, "Test Tenant", Tenant.CurrencyType.ERC20, address(0x123), 1);
        console2.log("Test Tenant created");
    }

    /// test if the recorder is added successfully
    function test_addRecorder() external {
        // adding the recorder from a random address should fail
        address recorder = address(2);
        vm.expectRevert();
        testTenant.addRecorder(recorder);

        // using the manager address as sender should succeed
        vm.prank(manager);
        testTenant.addRecorder(recorder);
        assert(testTenant.hasRole(testTenant.RECORDER_ROLE(), recorder));
    }
}
