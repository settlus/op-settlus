// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';

contract ERC20NonTransferable is ERC20, AccessControl {
  constructor(address defaultAdmin, string memory name, string memory symbol) ERC20(name, symbol) {
    _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
  }

  function mint(address to, uint256 amount) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'must have admin role to mint');
    _mint(to, amount);
  }

  function transfer(address, uint256) public pure override returns (bool) {
    revert('non-transferable');
  }

  function transferFrom(address, address, uint256) public pure override returns (bool) {
    revert('non-transferable');
  }

  function burn(uint256 amount) public {
    _burn(_msgSender(), amount);
  }

  function burnFrom(address from, uint256 amount) public {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), 'must have admin role to burn');
    _burn(from, amount);
  }
}
