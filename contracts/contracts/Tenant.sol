// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts/access/Ownable.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';

interface IERC721 {
  function ownerOf(uint256 tokenId) external view returns (address);
}

contract Tenant is Ownable {
  enum CurrencyType {
    ETH,
    ERC20,
    SBT
  }

  enum RecordStatus {
    Pending,
    Settled,
    Cancelled
  }

  event Settled(uint256 indexed reqID, uint256 amount, address recipient);

  struct UTXR {
    uint256 reqID;
    uint256 amount;
    uint256 timestamp;
    address recipient;
    uint256 chainID;
    address contractAddr;
    uint256 tokenID;
    RecordStatus status;
  }

  // need reqId map for record to cancel

  address public factory;
  address public creator;
  string public name;
  CurrencyType public currencyType;
  address public currencyAddress;
  uint256 public payoutPeriod;

  UTXR[] public utxrs;
  uint256 public lastSettledIndex;
  mapping(uint256 => uint256) public reqIdToIndex;

  constructor(
    address _factory,
    address _owner,
    string memory _name,
    CurrencyType _currencyType,
    address _currencyAddress,
    uint256 _payoutPeriod
  ) Ownable(_owner) {
    factory = _factory;
    creator = _owner;
    name = _name;
    currencyType = _currencyType;
    payoutPeriod = _payoutPeriod;
    lastSettledIndex = 0;

    if (currencyType == CurrencyType.ETH) {
      currencyAddress = address(0);
    } else {
      currencyAddress = _currencyAddress;
    }
  }

  modifier onlyFactoryOrOwner() {
    require(msg.sender == factory || msg.sender == owner(), 'Not authorized');
    _;
  }

  function setCurrencyAddress(address _currencyAddress) external onlyFactoryOrOwner {
    currencyAddress = _currencyAddress;
  }

  function record(
    uint256 reqID,
    uint256 amount,
    uint256 chainID,
    address contractAddr,
    uint256 tokenID
  ) public onlyOwner {
    address nftOwner = IERC721(contractAddr).ownerOf(tokenID);

    UTXR memory newUTXR = UTXR({
      reqID: reqID,
      amount: amount,
      // TODO: receive timestamp from param?
      timestamp: block.timestamp,
      recipient: nftOwner,
      chainID: chainID,
      contractAddr: contractAddr,
      tokenID: tokenID,
      status: RecordStatus.Pending
    });

    utxrs.push(newUTXR);
    reqIdToIndex[reqID] = utxrs.length - 1;
  }

  function cancel(uint256 reqID) external onlyOwner {
    uint256 index = reqIdToIndex[reqID];
    UTXR storage utxr = utxrs[index];

    require(block.timestamp < utxr.timestamp + payoutPeriod, 'Cannot cancel, UTXR past payout period');

    utxr.status = RecordStatus.Cancelled; // Mark as canceled
    delete reqIdToIndex[reqID]; // Remove the mapping for the canceled UTXR if no longer needed
  }

  function getUTXR(
    uint256 index
  )
    public
    view
    returns (
      uint256 reqID,
      uint256 amount,
      uint256 timestamp,
      address recipient,
      uint256 chainID,
      address contractAddr,
      uint256 tokenID
    )
  {
    UTXR memory utxr = utxrs[index];
    return (utxr.reqID, utxr.amount, utxr.timestamp, utxr.recipient, utxr.chainID, utxr.contractAddr, utxr.tokenID);
  }

  function setPayoutPeriod(uint256 _payoutPeriod) external onlyOwner {
    require(_payoutPeriod > 0, 'Payout period must be greater than zero');
    payoutPeriod = _payoutPeriod;
  }

  function settle() public onlyFactoryOrOwner {
    uint256 currentLength = utxrs.length;

    for (uint256 i = lastSettledIndex; i < currentLength; i++) {
      UTXR storage utxr = utxrs[i];

      if (utxr.status == RecordStatus.Cancelled) {
        lastSettledIndex = i + 1;
        continue;
      }

      if (block.timestamp >= utxr.timestamp + payoutPeriod) {
        if (currencyType == CurrencyType.ETH) {
          payable(utxr.recipient).transfer(utxr.amount);
        } else if (currencyType == CurrencyType.ERC20) {
          BasicERC20(currencyAddress).transfer(utxr.recipient, utxr.amount);
        } else if (currencyType == CurrencyType.SBT) {
          // Assuming the SBT contract has a mint function
          ERC20NonTransferable(currencyAddress).mint(utxr.recipient, utxr.amount);
        }

        utxr.status = RecordStatus.Settled;
        lastSettledIndex = i + 1;
      } else {
        break;
      }
    }
  }

  // TODO: need this?
  function mint(uint256 amount) public onlyOwner {
    require(currencyType == CurrencyType.ERC20, 'Not ERC20');
    BasicERC20(currencyAddress).mint(address(this), amount);
  }

  receive() external payable {}
}
