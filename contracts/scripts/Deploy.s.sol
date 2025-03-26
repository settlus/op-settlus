// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console2} from "forge-std/src/Script.sol";
import {TenantManager} from "../src/TenantManager.sol";
import {TenantManagerProxy} from "../src/TenantManagerProxy.sol";
import {BasicERC721} from "../src/BasicERC721.sol";

contract Deploy is Script {
    // 환경 변수 키
    string constant PRIVATE_KEY = "PRIVATE_KEY";
    string constant SETTLER_ADDRESS = "SETTLER_ADDRESS";
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint(PRIVATE_KEY);
        address settlerAddress = vm.envAddress(SETTLER_ADDRESS);
        
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        console2.log("Deploying contracts with deployer:", deployer);
        
        console2.log("Deploying TenantManager implementation...");
        TenantManager tenantManagerImplementation = new TenantManager();
        address implAddress = address(tenantManagerImplementation);
        console2.log("TenantManager implementation deployed at:", implAddress);
        
        bytes memory initData = abi.encodeWithSelector(
            TenantManager.initialize.selector,
            deployer
        );
        
        console2.log("Deploying TenantManagerProxy...");
        TenantManagerProxy tenantManagerProxy = new TenantManagerProxy(
            implAddress,
            initData
        );
        address proxyAddress = address(tenantManagerProxy);
        console2.log("TenantManagerProxy deployed at:", proxyAddress);
        
        TenantManager tenantManager = TenantManager(proxyAddress);
        
        bytes32 SETTLER_ROLE = keccak256("SETTLER_ROLE");
        if (settlerAddress != deployer) {
            console2.log("Granting SETTLER_ROLE to:", settlerAddress);
            tenantManager.grantRole(SETTLER_ROLE, settlerAddress);
        }
        
        vm.stopBroadcast();
        
        console2.log("\nDeployed contract addresses:");
        console2.log("TenantManager Implementation:", implAddress);
        console2.log("TenantManager Proxy:", proxyAddress);
        
        string memory jsonContent = string(
            abi.encodePacked(
                "{\n",
                "  \"tenantManagerImplementation\": \"", vm.toString(implAddress), "\",\n",
                "  \"tenantManagerProxy\": \"", vm.toString(proxyAddress), "\"\n",
                "}"
            )
        );
        
        string memory filePath = "./scripts/contract-addresses.json";
        
        vm.writeFile(filePath, jsonContent);
        console2.log("\nContract addresses saved to:", filePath);
    }
}
