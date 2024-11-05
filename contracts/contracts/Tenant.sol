// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts/access/AccessControl.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';

interface IERC721 {
  function ownerOf(uint256 tokenId) external view returns (address);
}

contract Tenant is AccessControl {
  bytes32 public constant RECORDER_ROLE = keccak256('RECORDER_ROLE');

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

  event Settled(string indexed reqID, uint256 amount, address recipient);
  event RecorderAdded(address indexed recorder);
  event RecorderRemoved(address indexed recorder);

  struct UTXR {
    string reqID;
    uint256 amount;
    uint256 timestamp;
    address recipient;
    uint256 chainID;
    address contractAddr;
    uint256 tokenID;
    RecordStatus status;
  }

  address public factory;
  address public creator;
  string public name;
  CurrencyType public ccyType;
  address public ccyAddr;
  uint256 public payoutPeriod;

  UTXR[] public utxrs;
  uint256 public lastSettledIdx;

  mapping(string => uint256) public reqIDToIdx;

  constructor(
    address _factory,
    address _admin,
    string memory _name,
    CurrencyType _ccyType,
    address _ccyAddr,
    uint256 _payoutPeriod
  ) {
    factory = _factory;
    creator = _admin;
    name = _name;
    ccyType = _ccyType;
    payoutPeriod = _payoutPeriod;
    lastSettledIdx = 0;

    if (ccyType == CurrencyType.ETH) {
      ccyAddr = address(0);
    } else {
      ccyAddr = _ccyAddr;
    }

    _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    _grantRole(RECORDER_ROLE, _admin);
  }

  modifier onlyFactoryOrAdmin() {
    require(msg.sender == factory || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), 'Not authorized');
    _;
  }

  function addRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(RECORDER_ROLE, recorder);
    emit RecorderAdded(recorder);
  }

  function removeRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(!hasRole(DEFAULT_ADMIN_ROLE, recorder), 'Cannot remove RECORDER_ROLE from master');
    revokeRole(RECORDER_ROLE, recorder);
    emit RecorderRemoved(recorder);
  }

  function setCurrencyAddress(address _currencyAddress) external onlyFactoryOrAdmin {
    currencyAddress = _currencyAddress;
  }

  function record(
    string memory reqID,
    uint256 amount,
    uint256 chainID,
    address contractAddr,
    uint256 tokenID
  ) public onlyRole(RECORDER_ROLE) {
    require(bytes(reqID).length > 0, 'reqID cannot be an empty string');
    require(reqIDToIdx[reqID] == 0, 'Record with the same reqID already exists');

    address nftOwner = IERC721(contractAddr).ownerOf(tokenID);

    UTXR memory newUTXR = UTXR({
      reqID: reqID,
      amount: amount,
      timestamp: block.timestamp,
      recipient: nftOwner,
      chainID: chainID,
      contractAddr: contractAddr,
      tokenID: tokenID,
      status: RecordStatus.Pending
    });

    utxrs.push(newUTXR);
    reqIDToIdx[reqID] = utxrs.length - 1;
  }

  function cancel(string memory reqID) external onlyRole(RECORDER_ROLE) {
    require(bytes(reqID).length > 0, 'reqID cannot be an empty string');

    uint256 index = reqIDToIdx[reqID];
    UTXR storage utxr = utxrs[index];

    require(block.timestamp < utxr.timestamp + payoutPeriod, 'Cannot cancel, UTXR past payout period');

    utxr.status = RecordStatus.Cancelled;
    delete reqIdToIndex[reqID];
  }

  function setPayoutPeriod(uint256 _payoutPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(_payoutPeriod > 0, 'Payout period must be greater than zero');
    payoutPeriod = _payoutPeriod;
  }

  function settle() public onlyFactoryOrAdmin {
    if (lastSettledIndex >= utxrs.length) {
      return;
    }
    uint256 currentLength = utxrs.length;
    for (uint256 i = lastSettledIdx; i < currentLength; i++) {
      UTXR storage utxr = utxrs[i];
      if (block.timestamp < utxr.timestamp + payoutPeriod) {
        break;
      }

      count += 1;
      if (utxr.status == RecordStatus.Cancelled) {
        continue;
      }

      if (block.timestamp >= utxr.timestamp + payoutPeriod) {
        if (currencyType == CurrencyType.ETH) {
          payable(utxr.recipient).transfer(utxr.amount);
        } else if (currencyType == CurrencyType.ERC20) {
          BasicERC20(currencyAddress).transfer(utxr.recipient, utxr.amount);
        } else if (currencyType == CurrencyType.SBT) {
          ERC20NonTransferable(currencyAddress).mint(utxr.recipient, utxr.amount);
        }

        utxr.status = RecordStatus.Settled;
        lastSettledIndex = i + 1;
      } else {
        break;
      }
      utxr.status = RecordStatus.Settled;
      //need settled event
    }
    lastSettledIdx += count;
  }

  function hasPendingSettlements() public view returns (bool) {
    uint256 currentLength = utxrs.length;
    for (uint256 i = lastSettledIdx; i < currentLength; i++) {
      if (utxrs[i].status == RecordStatus.Pending && block.timestamp >= utxrs[i].timestamp + payoutPeriod) {
        return true;
      }
    }
    
    return false;
  }

  // TODO: need this?
  function mint(uint256 amount) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(currencyType == CurrencyType.ERC20, 'Not ERC20');
    BasicERC20(currencyAddress).mint(address(this), amount);
  }

  receive() external payable {}
}
