import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, parseEther, keccak256, toBytes, zeroHash, zeroAddress, encodePacked } from 'viem'
import { nonMintableFixture, mintableFixture } from './utils'

describe('Tenant', function () {
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameERC20 = 'Tenant ERC20'
  const tenantNameSBT = 'Tenant SBT'
  const tenantCreationFee = parseEther('0.01')
  const TokenName = 'BaseToken'
  const TokenSymbol = 'BT'
  const MintableName = 'Mintable'
  const MintableSymbol = 'MTB'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds
  const chainId = BigInt(31337) // hardhat test chainid

  it('should verify each tenant has a existing currency address(ERC20, SBT)', async function () {
    const { tenantManager, tenantOwner, publicClient, erc20, mintable } = await loadFixture(nonMintableFixture)

    // Deploy Tenant with ETH currency
    const ethTx = await tenantManager.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })
    const ethReceipt = await publicClient.waitForTransactionReceipt({
      hash: ethTx,
    })
    const ethLogs = parseEventLogs({
      logs: ethReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const ethTenantAddress = ethLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const ethTenant = await hre.viem.getContractAt('Tenant', ethTenantAddress!)
    expect(await ethTenant.read.ccyAddr()).to.equal(defaultAddress)

    // Deploy Tenant with ERC20 currency
    const erc20Tx = await tenantManager.write.createTenant([tenantNameERC20, 1, erc20.address, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })
    const erc20Receipt = await publicClient.waitForTransactionReceipt({
      hash: erc20Tx,
    })
    const erc20Logs = parseEventLogs({
      logs: erc20Receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const erc20TenantAddress = erc20Logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const erc20Tenant = await hre.viem.getContractAt('Tenant', erc20TenantAddress!)
    expect(await erc20Tenant.read.ccyAddr()).to.equal(getAddress(erc20.address))

    // Deploy Tenant with Mintable currency
    const mintableTx = await tenantManager.write.createTenant([tenantNameSBT, 2, mintable.address, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })
    const mintableReceipt = await publicClient.waitForTransactionReceipt({
      hash: mintableTx,
    })
    const mintableLogs = parseEventLogs({
      logs: mintableReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const mintableTenantAddress = mintableLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const mintableTenant = await hre.viem.getContractAt('Tenant', mintableTenantAddress!)
    expect(await mintableTenant.read.ccyAddr()).to.equal(getAddress(mintable.address))
  })

  it('should assign MASTER_ROLE to tenant creator on deployment and give RECORDER_ROLE to other account', async function () {
    const { tenantManager, tenantOwner, publicClient, erc20Owner } = await loadFixture(nonMintableFixture)

    const ADMIN_ROLE = zeroHash
    const RECORDER_ROLE = keccak256(toBytes('RECORDER_ROLE'))
    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant Controlled Mintable', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    expect(await tenant.read.hasRole([ADMIN_ROLE, getAddress(tenantOwner.account.address)])).to.be.true

    // test grant recorder to other account
    await tenant.write.addRecorder([erc20Owner.account.address], { account: tenantOwner.account })
    expect(await tenant.read.hasRole([RECORDER_ROLE, getAddress(erc20Owner.account.address)])).to.be.true

    // test revoke recorder from other account
    await tenant.write.removeRecorder([erc20Owner.account.address], { account: tenantOwner.account })
    expect(await tenant.read.hasRole([RECORDER_ROLE, getAddress(erc20Owner.account.address)])).to.be.false
  })

  it('should record UTXR with updated NFT owner after NFT is tranferred', async function () {
    const { tenantManager, tenantOwner, nftOwner, newNftOwner, publicClient, nft } =
      await loadFixture(nonMintableFixture)

    // Deploy a Tenant that uses the Mintable currency
    const mintableTx = await tenantManager.write.createTenantWithMintableContract(
      [tenantNameSBT, 2, payoutPeriod, MintableName, MintableSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const mintableReceipt = await publicClient.waitForTransactionReceipt({
      hash: mintableTx,
    })
    const mintableLogs = parseEventLogs({
      logs: mintableReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const mintableTenantAddress = mintableLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const mintableTenant = await hre.viem.getContractAt('Tenant', mintableTenantAddress!)

    const reqID1 = 'reqId1'
    const amount1 = BigInt(100)
    const tokenID = BigInt(0)

    await tenantManager.write.record([mintableTenantAddress!, reqID1, amount1, chainId, nft.address, tokenID], {
      account: tenantOwner.account,
    })

    const initialUtxr = await mintableTenant.read.utxrs([BigInt(0)])
    expect(initialUtxr[3]).to.equal(getAddress(nftOwner.account.address))
    expect(initialUtxr[0]).to.equal(reqID1)
    expect(initialUtxr[1]).to.equal(amount1)

    await nft.write.transferFrom([nftOwner.account.address, newNftOwner.account.address, tokenID], {
      account: nftOwner.account,
    })

    // Mine a few blocks to simulate time passing
    await hre.network.provider.send('evm_mine', [])
    await hre.network.provider.send('evm_mine', [])

    const reqID2 = 'reqId2'
    const amount2 = BigInt(200)


    await tenantManager.write.record([mintableTenantAddress!, reqID2, amount2, chainId, nft.address, tokenID], {
      account: tenantOwner.account,
    })

    const updatedUtxr = await mintableTenant.read.utxrs([BigInt(1)])
    expect(updatedUtxr[3]).to.equal(getAddress(newNftOwner.account.address))
    expect(updatedUtxr[0]).to.equal(reqID2)
    expect(updatedUtxr[1]).to.equal(amount2)
  })

  it('should recordRaw on custom record requset', async function () {
    const { tenantManager, tenantOwner, publicClient, nftOwner } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant Controlled ERC20', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = 'reqId1'
    const amount = BigInt(100)
    const recipient = nftOwner.account.address

    await tenant.write.recordRaw([reqID, amount, recipient], {
      account: tenantOwner.account,
    })

    const utxr = await tenant.read.utxrs([BigInt(0)])
    expect(utxr[0]).to.equal(reqID)
    expect(utxr[1]).to.equal(amount)
    expect(utxr[3]).to.equal(getAddress(recipient))
    expect(utxr[4]).to.equal(BigInt(0))
    expect(utxr[5]).to.equal(zeroAddress)
    expect(utxr[6]).to.equal(BigInt(0))
  })

  it('should get UTXR by reqID', async function () {
    const { tenantManager, tenantOwner, publicClient, nftOwner, nft } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant Controlled ERC20', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    const utxr = await tenant.read.getUtxrByReqID([reqID])

    expect(await tenant.read.getUtxrsLength()).to.equal(1)
    expect(await tenant.read.reqIDExists([reqID])).to.be.true
    expect(utxr.reqID).to.equal(reqID)
    expect(utxr.amount).to.equal(amount)
    expect(utxr.recipient).to.equal(getAddress(nftOwner.account.address))
  })

  it('should only allow owner to control treasury funds', async function () {
    const { tenantManager, tenantOwner, publicClient, nftOwner } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant Controlled ERC20', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    await expect(tenant.write.setCurrencyAddress([defaultAddress], {
      account: nftOwner.account,
    })).to.be.rejectedWith('Not authorized')
  })

  it('should set payout period', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    await tenant.write.setPayoutPeriod([BigInt(86400)], {
      account: tenantOwner.account,
    })
    expect(await tenant.read.payoutPeriod()).to.equal(BigInt(86400))
  })

  it('should revert cancel if UTXR is past payout period', async function () {
    const { tenantManager, tenantOwner, publicClient, nft } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Test Tenant', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const tenantAddress = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    await expect(tenant.write.cancel([reqID], { account: tenantOwner.account })).to.be.rejectedWith(
      'Cannot cancel, UTXR past payout period'
    )

    const utxr = await tenant.read.utxrs([BigInt(0)])
    expect(utxr[7]).to.equal(0) // 7th index is RecordStatus
  })

  it('should correctly settle multiple UTXRs and skip canceled ones', async function () {
    const { tenantManager, tenantOwner, publicClient, nft, nftOwner } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Test Tenant', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const tenantAddress = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)
    const tenantMintableAddress = await tenant.read.ccyAddr()
    const tenantMintable = await hre.viem.getContractAt('BasicERC20', tenantMintableAddress)

    const reqID1 = 'reqId1'
    const reqID2 = 'reqId2'
    const reqID3 = 'reqId3'
    const amount1 = BigInt(100)
    const amount2 = BigInt(150)
    const amount3 = BigInt(200)

    await tenantManager.write.record([tenantAddress!, reqID1, amount1, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })
    await tenantManager.write.record([tenantAddress!, reqID2, amount2, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })
    await tenantManager.write.record([tenantAddress!, reqID3, amount3, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    await tenant.write.cancel([reqID2], { account: tenantOwner.account })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle([BigInt(5)], { account: tenantOwner.account })

    const utxr1 = await tenant.read.utxrs([BigInt(0)])
    const utxr2 = await tenant.read.utxrs([BigInt(1)])
    const utxr3 = await tenant.read.utxrs([BigInt(2)])
    expect(utxr1[7]).to.equal(1)
    expect(utxr2[7]).to.equal(2)
    expect(utxr3[7]).to.equal(1)

    expect(await tenantMintable.read.balanceOf([nftOwner.account.address])).to.equal(amount1 + amount3)
    expect(await tenant.read.nextToSettleIdx()).to.equal(BigInt(3))
  })

  it('should settle UTXRs (Tenant with ETH currency)', async function () {
    const {
      tenantManager: tenantManager,
      tenantOwner,
      publicClient,
      nftOwner,
      nft,
    } = await loadFixture(nonMintableFixture)

    const initialTreasuryBalance = parseEther('1')
    const initialNftOwnerBalance = await publicClient.getBalance({
      address: nftOwner.account.address,
    })

    const tx = await tenantManager.write.createTenant(['Settle Tenant', 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Send 1 ETH to tenant for treasury
    await tenantOwner.sendTransaction({
      to: tenantAddress!,
      value: initialTreasuryBalance,
    })

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle([BigInt(5)], { account: tenantOwner.account })

    expect(await tenant.read.utxrs.length).to.equal(0)

    expect(await publicClient.getBalance({ address: tenantAddress! })).to.equal(initialTreasuryBalance - amount)
    expect(await publicClient.getBalance({ address: nftOwner.account.address })).to.equal(
      initialNftOwnerBalance + amount
    )
  })

  it('should settle UTXRs (Tenant with ERC20 currency), with pre-deployed ERC20 contract', async function () {
    const { tenantManager, tenantOwner, publicClient, erc20, nftOwner, nft } = await loadFixture(nonMintableFixture)

    const initialTreasuryBalance = BigInt(100000)
    const initialNftOwnerBalance = await erc20.read.balanceOf([nftOwner.account.address])

    const tx = await tenantManager.write.createTenant(['Settle Tenant', 1, erc20.address, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    // Pre-deployed ERC20 need to mint token for tenant address before it starts writing record and settle
    await erc20.write.mint([tenantAddress!, initialTreasuryBalance], {
      account: tenantOwner.account,
    })

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle([BigInt(5)], { account: tenantOwner.account })

    expect(await erc20.read.balanceOf([tenantAddress!])).to.equal(initialTreasuryBalance - amount)
    expect(await erc20.read.balanceOf([nftOwner.account.address])).to.equal(initialNftOwnerBalance + amount)
  })

  it('should settle UTXRs (Tenant with Mintable currency)', async function () {
    const { tenantManager, tenantOwner, publicClient, nftOwner, nft } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Settle Tenant', 2, payoutPeriod, MintableName, MintableSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)

    const tenantMintableAddress = await tenant.read.ccyAddr()
    const tenantMintable = await hre.viem.getContractAt('ERC20NonTransferable', tenantMintableAddress)

    expect(await tenantMintable.read.balanceOf([nftOwner.account.address])).to.equal(BigInt(0))

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    // Increase time by payoutPeriod to make the UTXR eligible for settlement
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod + BigInt(100))])
    await hre.network.provider.send('evm_mine', [])

    await tenant.write.settle([BigInt(5)], { account: tenantOwner.account })

    expect(await tenantMintable.read.balanceOf([tenantAddress!])).to.equal(BigInt(0))
    expect(await tenantMintable.read.balanceOf([nftOwner.account.address])).to.equal(amount)
  })

  it('should settle UTXRs (Tenant with Mintable currency), with pre-deployed Mintable contract', async function () {
    const { tenantManager, deployer, tenantOwner, publicClient, mintable, nftOwner, nft } = await loadFixture(mintableFixture)

    const initialNftOwnerBalance = await mintable.read.balanceOf([nftOwner.account.address])

    const tx = await tenantManager.write.createTenant(
      ['Settle Tenant', 2, mintable.address, payoutPeriod],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    await mintable.write.grantRole([
      zeroHash, 
      tenantAddress!
    ], {
      account: tenantOwner.account,
    })

    const reqID = 'reqId1'
    const amount = BigInt(100)

    await tenantManager.write.record([tenantAddress!, reqID, amount, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    const SETTLER_ROLE = keccak256(encodePacked(['string'], ['SETTLER_ROLE']))
    expect(await tenantManager.read.hasRole([SETTLER_ROLE, deployer.account.address])).to.be.true

    await tenantManager.write.settleAll({
      account: deployer.account,
    })

    expect(await mintable.read.balanceOf([nftOwner.account.address])).to.equal(initialNftOwnerBalance + amount)
  })

  it('should settle eligible UTXRs and leave ineligible ones (Tenant with Mintable contract)', async function () {
    const {
      tenantManager: tenantManager,
      tenantOwner,
      publicClient,
      nftOwner,
      nft,
    } = await loadFixture(nonMintableFixture)

    const tx = await tenantManager.write.createTenantWithMintableContract(
      ['Settle Tenant', 2, payoutPeriod, TokenName, TokenSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const tenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant = await hre.viem.getContractAt('Tenant', tenantAddress!)
    const tenantMintableAddress = await tenant.read.ccyAddr()
    const tenantMintable = await hre.viem.getContractAt('ERC20NonTransferable', tenantMintableAddress)

    const initialNftOwnerBalance = await tenantMintable.read.balanceOf([nftOwner.account.address])

    const reqID1 = 'reqId1'
    const amount1 = BigInt(100)

    const reqID2 = 'reqId2'
    const amount2 = BigInt(200)

    const reqID3 = 'reqId3'
    const amount3 = BigInt(150)

    // Record three UTXRs with different timestamps
    await tenantManager.write.record([tenantAddress!, reqID1, amount1, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))])
    await hre.network.provider.send('evm_mine', []) // Half of payoutPeriod

    await tenantManager.write.record([tenantAddress!, reqID2, amount2, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))])
    await hre.network.provider.send('evm_mine', []) // Full payoutPeriod for reqID1

    await tenantManager.write.record([tenantAddress!, reqID3, amount3, chainId, nft.address, BigInt(0)], {
      account: tenantOwner.account,
    })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))])
    await hre.network.provider.send('evm_mine', []) // Full payoutPeriod for reqID2

    // Only reqID1 and reqID2 should be eligible for settlement, reqID3 should remain
    await tenant.write.settle([BigInt(5)], { account: tenantOwner.account })

    const expectedNftOwnerBalance = initialNftOwnerBalance + amount1 + amount2 // nftOwner received amounts from reqID1 and reqID2
    expect(await tenantMintable.read.balanceOf([nftOwner.account.address])).to.equal(expectedNftOwnerBalance)

    const remainingUtxrs = await tenant.read.utxrs([await tenant.read.nextToSettleIdx()])
    expect(remainingUtxrs[0]).to.equal(reqID3)
    expect(remainingUtxrs[1]).to.equal(amount3)
  })

  it('should correctly return needSettlement for UTXRs', async function () {
    const { tenantManager, publicClient, nft } = await loadFixture(nonMintableFixture)
    const [tenantOwner1, tenantOwner2] = await hre.viem.getWalletClients()

    // Create tenants using the Mintables
    const tx1 = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant1', 2, payoutPeriod, 'MintableOne', 'MTB'],
      {
        account: tenantOwner1.account,
        value: tenantCreationFee,
      }
    )
    const tenant1Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx1 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantManager.write.createTenantWithMintableContract(
      ['Tenant2', 2, payoutPeriod, 'MintableTwo', 'BTM'],
      {
        account: tenantOwner2.account,
        value: tenantCreationFee,
      }
    )
    const tenant2Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx2 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant1 = await hre.viem.getContractAt('Tenant', tenant1Address!)
    const tenant2 = await hre.viem.getContractAt('Tenant', tenant2Address!)

    const reqID1 = 'reqId1'
    const amount1 = BigInt(100)

    const reqID2 = 'reqId2'
    const amount2 = BigInt(200)

    await tenantManager.write.record([tenant1Address!, reqID2, amount2, chainId, nft.address, BigInt(0)], {
      account: tenantOwner1.account,
    })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))])
    await hre.network.provider.send('evm_mine', [])

    await tenantManager.write.record([tenant2Address!, reqID1, amount1, chainId, nft.address, BigInt(0)], {
      account: tenantOwner2.account,
    })
    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod / BigInt(2))])
    await hre.network.provider.send('evm_mine', [])

    const tenant1need = await tenant1.read.needSettlement()
    const tenant2need = await tenant2.read.needSettlement()
    expect(tenant1need).to.equal(true)
    expect(tenant2need).to.equal(false)
  })
})
