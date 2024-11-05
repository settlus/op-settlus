// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import '@openzeppelin/contracts/access/AccessControl.sol';
import './BasicERC20.sol';
import './ERC20NonTransferable.sol';

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract Tenant is AccessControl {
    bytes32 public constant MASTER_ROLE = keccak256("MASTER_ROLE");
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

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
    CurrencyType public currencyType;
    address public currencyAddress;
    uint256 public payoutPeriod;

    UTXR[] public utxrs;
    uint256 public lastSettledIndex;

    mapping(string => uint256) public reqIdToIndex;

    constructor(
        address _factory,
        address _master,
        string memory _name,
        CurrencyType _currencyType,
        address _currencyAddress,
        uint256 _payoutPeriod
    ) {
        factory = _factory;
        creator = _master;
        name = _name;
        currencyType = _currencyType;
        payoutPeriod = _payoutPeriod;
        lastSettledIndex = 0;

        if (currencyType == CurrencyType.ETH) {
            currencyAddress = address(0);
        } else {
            currencyAddress = _currencyAddress;
        }

        _grantRole(DEFAULT_ADMIN_ROLE, _master);
        _grantRole(MASTER_ROLE, _master);
        _grantRole(RECORDER_ROLE, _master);
    }

    modifier onlyFactoryOrMaster() {
        require(
            msg.sender == factory || hasRole(MASTER_ROLE, msg.sender),
            "Not authorized"
        );
        _;
    }

    // Role management functions
    function addRecorder(address recorder) external onlyRole(MASTER_ROLE) {
        grantRole(RECORDER_ROLE, recorder);
        emit RecorderAdded(recorder);
    }

    function removeRecorder(address recorder) external onlyRole(MASTER_ROLE) {
        require(
            !hasRole(MASTER_ROLE, recorder),
            "Cannot remove RECORDER_ROLE from master"
        );
        revokeRole(RECORDER_ROLE, recorder);
        emit RecorderRemoved(recorder);
    }

    function setCurrencyAddress(address _currencyAddress) external onlyFactoryOrMaster {
        currencyAddress = _currencyAddress;
    }

    function record(
        string memory reqID,
        uint256 amount,
        uint256 chainID,
        address contractAddr,
        uint256 tokenID
    ) public onlyRole(RECORDER_ROLE) {
        require(bytes(reqID).length > 0, "reqID cannot be an empty string");
        require(reqIdToIndex[reqID] == 0, "Record with the same reqID already exists");

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
        reqIdToIndex[reqID] = utxrs.length - 1;
    }

    function cancel(string memory reqID) external onlyRole(RECORDER_ROLE) {
        require(bytes(reqID).length > 0, "reqID cannot be an empty string");

        uint256 index = reqIdToIndex[reqID];
        UTXR storage utxr = utxrs[index];

        require(
            block.timestamp < utxr.timestamp + payoutPeriod,
            "Cannot cancel, UTXR past payout period"
        );

        utxr.status = RecordStatus.Cancelled;
        delete reqIdToIndex[reqID];
    }

    function setPayoutPeriod(uint256 _payoutPeriod) external onlyRole(MASTER_ROLE) {
        require(_payoutPeriod > 0, "Payout period must be greater than zero");
        payoutPeriod = _payoutPeriod;
    }

    function settle() public onlyFactoryOrMaster {
        if (lastSettledIndex >= utxrs.length) {
            return;
        }
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
                    ERC20NonTransferable(currencyAddress).mint(
                        utxr.recipient,
                        utxr.amount
                    );
                }

                utxr.status = RecordStatus.Settled;
                lastSettledIndex = i + 1;
            } else {
                break;
            }
        }
    }

    function hasPendingSettlements() public view returns (bool) {
        uint256 currentLength = utxrs.length;
        if (lastSettledIndex < currentLength) {
            for (uint256 i = lastSettledIndex; i < currentLength; i++) {
                if (
                    utxrs[i].status == RecordStatus.Pending &&
                    block.timestamp >= utxrs[i].timestamp + payoutPeriod
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    // TODO: need this?
    function mint(uint256 amount) public onlyRole(MASTER_ROLE) {
        require(currencyType == CurrencyType.ERC20, "Not ERC20");
        BasicERC20(currencyAddress).mint(address(this), amount);
    }

    receive() external payable {}
}