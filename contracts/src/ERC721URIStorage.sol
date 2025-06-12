// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BaseNFT is ERC721URIStorage, Ownable {
  uint256 private _nextTokenId;

  constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}

  function safeMint(address to, string memory uri) public onlyOwner returns (uint256) {
    uint256 tokenId = _nextTokenId;
    _mint(to, tokenId);
    _setTokenURI(tokenId, uri);

    _nextTokenId++;
    return tokenId;
  }

  function tokenURI(
    uint256 tokenId
  ) public view override(ERC721URIStorage) returns (string memory) {
    return super.tokenURI(tokenId);
  }
}
