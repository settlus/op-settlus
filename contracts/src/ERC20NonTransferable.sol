// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract ERC20NonTransferable is ERC20, AccessControl {
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    constructor(address defaultAdmin, string memory name, string memory symbol) ERC20(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "must have admin role to mint");
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert("non-transferable");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("non-transferable");
    }

    function transferAdmin(address newAdmin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(!hasRole(DEFAULT_ADMIN_ROLE, newAdmin), "Account already has admin role");

        address previousAdmin = _msgSender();
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        renounceRole(DEFAULT_ADMIN_ROLE, previousAdmin);

        emit AdminTransferred(previousAdmin, newAdmin);
    }
}
