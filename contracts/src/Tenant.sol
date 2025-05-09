// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./BasicERC20.sol";
import "./ERC20NonTransferable.sol";

interface IERC721 {
  function ownerOf(uint256 tokenId) external view returns (address);
}

interface IMintable {
  function mint(address to, uint256 amount) external;
}

contract Tenant is AccessControl {
  bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

  enum CurrencyType {
    ETH,
    ERC20,
    MINTABLES
  }

  enum RecordStatus {
    Pending,
    Settled,
    Cancelled
  }

  event Settled(string indexed reqID, uint256 amount, address recipient);
  event Cancelled(string indexed reqID);
  event RecorderAdded(address indexed recorder);
  event RecorderRemoved(address indexed recorder);
  event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
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

  address public manager;
  address public creator;
  string public name;
  CurrencyType public ccyType;
  address public ccyAddr;
  uint256 public payoutPeriod;

  UTXR[] public utxrs;
  uint256 public nextToSettleIdx;

  mapping(string => uint256) public reqIDToIdx;
  mapping(string => bool) public reqIDExists;

  constructor(
    address _manager,
    address _admin,
    string memory _name,
    CurrencyType _ccyType,
    address _ccyAddr,
    uint256 _payoutPeriod
  ) {
    manager = _manager;
    creator = _admin;
    name = _name;
    ccyType = _ccyType;
    payoutPeriod = _payoutPeriod;

    if (ccyType == CurrencyType.ETH) {
      ccyAddr = address(0);
    } else {
      ccyAddr = _ccyAddr;
    }

    _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    _grantRole(RECORDER_ROLE, _admin);
    _grantRole(RECORDER_ROLE, _manager);
  }

  modifier onlyManagerOrAdmin() {
    require(msg.sender == manager || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not authorized");
    _;
  }

  function addRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(RECORDER_ROLE, recorder);
    emit RecorderAdded(recorder);
  }

  function removeRecorder(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(!hasRole(DEFAULT_ADMIN_ROLE, recorder), "Cannot remove RECORDER_ROLE from master");
    revokeRole(RECORDER_ROLE, recorder);
    emit RecorderRemoved(recorder);
  }

  function transferAdmin(address newAdmin) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(newAdmin != address(0), "New admin cannot be zero address");
    require(!hasRole(DEFAULT_ADMIN_ROLE, newAdmin), "Account already has admin role");

    address previousAdmin = _msgSender();
    grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
    renounceRole(DEFAULT_ADMIN_ROLE, previousAdmin);

    emit AdminTransferred(previousAdmin, newAdmin);
  }

  function setCurrencyAddress(address _currencyAddress) external onlyManagerOrAdmin {
    ccyAddr = _currencyAddress;
  }

  function record(
    string memory reqID,
    uint256 amount,
    uint256 chainID,
    address contractAddr,
    uint256 tokenID,
    address recipient
  ) external onlyRole(RECORDER_ROLE) {
    require(bytes(reqID).length > 0, "reqID cannot be empty");
    require(reqIDToIdx[reqID] == 0, "Duplicate reqID");

    UTXR memory newUTXR = UTXR({
      reqID: reqID,
      amount: amount,
      timestamp: block.timestamp + payoutPeriod,
      recipient: recipient,
      chainID: chainID,
      contractAddr: contractAddr,
      tokenID: tokenID,
      status: RecordStatus.Pending
    });

    utxrs.push(newUTXR);
    reqIDToIdx[reqID] = utxrs.length - 1;
    reqIDExists[reqID] = true;
  }

  // recordRaw is for recording UTXRs that are not NFTs or custom use of Tenants
  function recordRaw(string memory reqID, uint256 amount, address recipient) public onlyRole(RECORDER_ROLE) {
    require(bytes(reqID).length > 0, "reqID cannot be an empty string");
    require(reqIDToIdx[reqID] == 0, "Duplicate reqID");

    uint256 payoutTimestamp = block.timestamp + payoutPeriod;

    UTXR memory newUTXR = UTXR({
      reqID: reqID,
      amount: amount,
      timestamp: payoutTimestamp,
      recipient: recipient,
      chainID: 0,
      contractAddr: address(0),
      tokenID: 0,
      status: RecordStatus.Pending
    });

    utxrs.push(newUTXR);
    reqIDToIdx[reqID] = utxrs.length - 1;
    reqIDExists[reqID] = true;
  }

  function getUtxrsLength() public view returns (uint256) {
    return utxrs.length;
  }

  function getUtxrByReqID(string memory reqID) public view returns (UTXR memory) {
    require(bytes(reqID).length > 0, "reqID cannot be an empty string");
    require(reqIDExists[reqID], "reqID not found");

    return utxrs[reqIDToIdx[reqID]];
  }

  function cancel(string memory reqID) external onlyRole(RECORDER_ROLE) {
    require(bytes(reqID).length > 0, "reqID cannot be an empty string");

    uint256 index = reqIDToIdx[reqID];
    UTXR storage utxr = utxrs[index];

    require(block.timestamp < utxr.timestamp, "Cannot cancel, UTXR past payout period");

    utxr.status = RecordStatus.Cancelled;
    delete reqIDToIdx[reqID];

    emit Cancelled(reqID);
  }

  function setPayoutPeriod(uint256 _payoutPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(_payoutPeriod > 0, "Payout period must be greater than zero");
    // need to settle all pending UTXRs before changing payout period, otherwise utxr array is no more FIFO
    require(getRemainingUTXRCount() == 0, "Cannot change payout period with pending UTXRs");
    payoutPeriod = _payoutPeriod;
  }

  function settle(uint256 batchSize) public onlyManagerOrAdmin {
    if (nextToSettleIdx == utxrs.length) return;
    uint256 currentLength = utxrs.length;
    uint256 count = 0;

    for (uint256 i = nextToSettleIdx; i < currentLength; i++) {
      if (count >= batchSize) {
        break;
      }

      UTXR storage utxr = utxrs[i];
      if (block.timestamp < utxr.timestamp) {
        break;
      }

      count += 1;
      if (utxr.status == RecordStatus.Cancelled) {
        continue;
      }

      if (ccyType == CurrencyType.ETH) {
        payable(utxr.recipient).transfer(utxr.amount);
      } else if (ccyType == CurrencyType.ERC20) {
        IERC20(ccyAddr).transfer(utxr.recipient, utxr.amount);
      } else if (ccyType == CurrencyType.MINTABLES) {
        IMintable(ccyAddr).mint(utxr.recipient, utxr.amount);
      }

      utxr.status = RecordStatus.Settled;
      //TODO: emitting event per settle can be expensive?
      emit Settled(utxr.reqID, utxr.amount, utxr.recipient);
    }
    nextToSettleIdx += count;
  }

  function needSettlement() public view returns (bool) {
    if (nextToSettleIdx == utxrs.length) return false;
    return block.timestamp >= utxrs[nextToSettleIdx].timestamp;
  }

  function getRemainingUTXRCount() public view returns (uint256) {
    return utxrs.length - nextToSettleIdx;
  }

  receive() external payable {}
}
