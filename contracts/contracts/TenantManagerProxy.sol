// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';

contract TenantManagerProxy is ERC1967Proxy {
  constructor(address _implementation, bytes memory _data) ERC1967Proxy(_implementation, _data) {}

  function getImplementation() public view returns (address) {
    return _implementation();
  }

  receive() external payable {}
}
