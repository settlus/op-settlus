// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { Test } from "forge-std/src/Test.sol";
import { TenantManager } from "../../src/TenantManager.sol";
import { TenantManagerProxy } from "../../src/TenantManagerProxy.sol";
import { Tenant } from "../../src/Tenant.sol";
import { BasicERC20 } from "../../src/BasicERC20.sol";
import { BasicERC721 } from "../../src/BasicERC721.sol";
import { ERC20NonTransferable } from "../../src/ERC20NonTransferable.sol";

abstract contract TestHelpers is Test {
    // Constants
    uint256 public constant TENANT_CREATION_FEE = 0.01 ether;
    uint256 public constant PAYOUT_PERIOD = 1 days;
    uint256 public constant MAX_PER_TENANT = 10;

    // Actors
    address public deployer;
    address public tenantOwner;
    address public nftOwner;
    address public newNftOwner;
    address public settler;
    address public randomUser;

    // Contracts
    TenantManager public tenantManager;
    TenantManagerProxy public tenantManagerProxy;
    BasicERC20 public erc20;
    ERC20NonTransferable public mintable;
    BasicERC721 public nft;

    function _setupActors() internal {
        deployer = makeAddr("deployer");
        tenantOwner = makeAddr("tenantOwner");
        nftOwner = makeAddr("nftOwner");
        newNftOwner = makeAddr("newNftOwner");
        settler = makeAddr("settler");
        randomUser = makeAddr("randomUser");

        // Fund actors
        vm.deal(deployer, 100 ether);
        vm.deal(tenantOwner, 100 ether);
        vm.deal(nftOwner, 100 ether);
        vm.deal(newNftOwner, 100 ether);
        vm.deal(settler, 100 ether);
        vm.deal(randomUser, 100 ether);
    }

    function _deployTenantManagerWithProxy() internal {
        vm.startPrank(deployer);

        // Deploy implementation
        TenantManager implementation = new TenantManager();

        // Encode initialize call
        bytes memory initData = abi.encodeCall(TenantManager.initialize, (deployer));

        // Deploy proxy
        tenantManagerProxy = new TenantManagerProxy(address(implementation), initData);

        // Get TenantManager interface at proxy address
        tenantManager = TenantManager(address(tenantManagerProxy));

        vm.stopPrank();
    }

    function _deployMockTokens() internal {
        // Deploy ERC20
        vm.prank(tenantOwner);
        erc20 = new BasicERC20(tenantOwner, "Test ERC20", "TST");

        // Deploy mintable (ERC20NonTransferable)
        vm.prank(tenantOwner);
        mintable = new ERC20NonTransferable(tenantOwner, "Test Mintable", "MTB");

        // Deploy NFT and mint to nftOwner
        vm.startPrank(nftOwner);
        nft = new BasicERC721(nftOwner);
        nft.safeMint(nftOwner);
        vm.stopPrank();
    }

    function _createTenantETH(string memory name) internal returns (address) {
        vm.prank(tenantOwner);
        return tenantManager.createTenant{ value: TENANT_CREATION_FEE }(name, Tenant.CurrencyType.ETH, address(0), PAYOUT_PERIOD);
    }

    function _createTenantERC20(string memory name, address tokenAddr) internal returns (address) {
        vm.prank(tenantOwner);
        return tenantManager.createTenant{ value: TENANT_CREATION_FEE }(name, Tenant.CurrencyType.ERC20, tokenAddr, PAYOUT_PERIOD);
    }

    function _createTenantMintable(string memory name, string memory tokenName, string memory tokenSymbol) internal returns (address) {
        vm.prank(tenantOwner);
        return tenantManager.createTenantWithMintableContract{ value: TENANT_CREATION_FEE }(name, Tenant.CurrencyType.MINTABLES, PAYOUT_PERIOD, tokenName, tokenSymbol);
    }

    function _recordUTXR(address tenantAddr, string memory reqID, uint256 amount) internal {
        vm.prank(tenantOwner);
        tenantManager.record(tenantAddr, reqID, amount, block.chainid, address(nft), 0);
    }

    function _advanceTime(uint256 seconds_) internal {
        skip(seconds_);
    }

    function _settleAll() internal {
        vm.prank(deployer);
        tenantManager.settleAll();
    }
}
