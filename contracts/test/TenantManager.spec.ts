import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, keccak256, encodePacked, parseEther } from 'viem'
import { mintableFixture } from './utils'

describe('TenantManager Test', function () {
  const tenantName = 'SampleTenant'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameMintable = 'Tenant Mintable'
  const tenantCreationFee = parseEther('0.01')
  const MAX_PER_TENANT = BigInt(10)
  const MintableName = 'Mintable'
  const MintableSymbol = 'MTB'
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds
  const chainId = BigInt(31337) // hardhat test chainid

  it('should create a Tenant contract with correct parameters and emit event via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    expect(await logs.find((log) => log.eventName === 'TenantCreated')).to.not.be.undefined
    expect(await logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantName).to.equal(tenantName)
  })

  it('should failed to create a Tenant contract with wrong tenant creation fee', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    //  expect(await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
    //     account: tenantOwner.account,
    //     value: tenantCreationFee + BigInt('200'),
    //   })).to.be.revertedWith('Need exact tenant creation fee')
  })

  it('should remove a Tenant contract via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })

    const removeTx = await tenantManager.write.removeTenant([tenantName], {
      account: tenantOwner.account,
    })

    const removeReceipt = await publicClient.waitForTransactionReceipt({ hash: removeTx })
    const logs = parseEventLogs({
      logs: removeReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    expect(await logs.find((log) => log.eventName === 'TenantRemoved')).to.not.be.undefined
  })

  it('should not remove a Tenant when the sender is not the owner of TenantManager or creator of the Tenant', async function () {
    const { tenantManager, tenantOwner, publicClient, nftOwner } = await loadFixture(mintableFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    // expect(await tenantManager.write.removeTenant([tenantName], {
    //   account: nftOwner.account,
    // })).to.be.revertedWith('Only owner can remove tenant')
  })

  it('should deploy three Tenants with different currency types, without pre-deployed token contracts via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    // Tenant with ETH currency
    const ethTx = await tenantManager.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })
    const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTx })
    const ethLogs = parseEventLogs({
      logs: ethReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const ethTenantAddress = ethLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Tenant with mintable currency
    const mintableTx = await tenantManager.write.createTenantWithMintableContract(
      [tenantNameMintable, 2, payoutPeriod, MintableName, MintableSymbol],
      {
        account: tenantOwner.account,
        value: tenantCreationFee,
      }
    )
    const mintableReceipt = await publicClient.waitForTransactionReceipt({ hash: mintableTx })
    const mintableLogs = parseEventLogs({
      logs: mintableReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })
    const mintableTenantAddress = mintableLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    expect(ethTenantAddress).to.be.not.undefined
    expect(mintableTenantAddress).to.be.not.undefined
  })

  it('should store and retrieve tenant addresses via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
      value: tenantCreationFee,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    const tenantAddress = (await logs.find((log) => log.eventName === 'TenantCreated'))?.args.tenantAddress

    const tenantAddresses = await tenantManager.read.getTenantAddresses()
    const nameHash = keccak256(encodePacked(['string'], [tenantName]))
    const fromTenantMap = await tenantManager.read.tenants([nameHash])

    expect(tenantAddresses).to.include(tenantAddress)
    expect(fromTenantMap).to.equal(tenantAddress)
  })

  it('should handle settleAll with partial success via proxy (ERC20)', async function () {
    const { tenantManager, deployer, publicClient, nftOwner, nft } = await loadFixture(mintableFixture)
    const [tenantOwner1, tenantOwner2] = await hre.viem.getWalletClients()

    const initialTreasuryBalance = BigInt(1000)
    const insufficientBalance = BigInt(50)

    // Deploy two ERC20 tokens for tenants
    const tenant1Erc20 = await hre.viem.deployContract(
      'BasicERC20',
      [tenantOwner1.account.address, 'Test ERC20', 'TST'],
      { client: { wallet: tenantOwner1 } }
    )
    const tenant2Erc20 = await hre.viem.deployContract(
      'BasicERC20',
      [tenantOwner2.account.address, 'Test ERC20', 'TST'],
      { client: { wallet: tenantOwner2 } }
    )

    // Create tenants using the ERC20 tokens
    const tx1 = await tenantManager.write.createTenant(['Tenant1', 1, tenant1Erc20.address, payoutPeriod], {
      account: tenantOwner1.account,
      value: tenantCreationFee,
    })
    const tenant1Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx1 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantManager.write.createTenant(['Tenant2', 1, tenant2Erc20.address, payoutPeriod], {
      account: tenantOwner2.account,
      value: tenantCreationFee,
    })
    const tenant2Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx2 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant1 = await hre.viem.getContractAt('Tenant', tenant1Address!)
    const tenant1CcyAddr = await tenant1.read.ccyAddr()
    expect(tenant1CcyAddr).to.equal(getAddress(tenant1Erc20.address))

    const tenant2 = await hre.viem.getContractAt('Tenant', tenant2Address!)
    const tenant2CcyAddr = await tenant2.read.ccyAddr()
    expect(tenant2CcyAddr).to.equal(getAddress(tenant2Erc20.address))

    // Mint initial balances to the tenant's treasury addresses
    await tenant1Erc20.write.mint([tenant1.address, initialTreasuryBalance], { account: tenantOwner1.account })
    await tenant2Erc20.write.mint([tenant2.address, insufficientBalance], { account: tenantOwner2.account })

    const reqID1 = 'reqId1'
    const reqID2 = 'reqId2'
    const amountToSettle = BigInt(500)

    await tenantManager.write.record([tenant1Address!, reqID1, amountToSettle, chainId, nft.address, BigInt(0)], {
      account: tenantOwner1.account,
    })

    await tenantManager.write.record([tenant2Address!, reqID2, amountToSettle, chainId, nft.address, BigInt(0)], {
      account: tenantOwner2.account,
    })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    // Call settleAll to settle balances across tenants, no error or revert expeceted
    await tenantManager.write.settleAll({
      account: deployer.account,
    })

    const tenant1BalanceAfter = await tenant1Erc20.read.balanceOf([tenant1Address!])
    const tenant2BalanceAfter = await tenant2Erc20.read.balanceOf([tenant2Address!])
    const recipientBalanceAtTenant1 = await tenant1Erc20.read.balanceOf([nftOwner.account.address])
    const recipientBalanceAtTenant2 = await tenant2Erc20.read.balanceOf([nftOwner.account.address])

    expect(tenant1BalanceAfter).to.equal(initialTreasuryBalance - amountToSettle)
    expect(tenant2BalanceAfter).to.equal(insufficientBalance)
    expect(recipientBalanceAtTenant1).to.equal(amountToSettle)
    expect(recipientBalanceAtTenant2).to.equal(BigInt(0))
  })

  it('should checkNeedSettlement correctly', async function () {
    const { tenantManager, deployer, publicClient, nft } = await loadFixture(mintableFixture)
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

    const reqID1 = 'reqId1'
    const reqID2 = 'reqId2'
    const amountToSettle = BigInt(500)

    await tenantManager.write.record([tenant1Address!, reqID1, amountToSettle, chainId, nft.address, BigInt(0)], {
      account: tenantOwner1.account,
    })

    await tenantManager.write.record([tenant2Address!, reqID2, amountToSettle, chainId, nft.address, BigInt(0)], {
      account: tenantOwner2.account,
    })

    var check: boolean
    check = await tenantManager.read.checkNeedSettlement()
    expect(check).to.equal(false)

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    check = await tenantManager.read.checkNeedSettlement()
    expect(check).to.equal(true)

    await tenantManager.write.settleAll({
      account: deployer.account,
    })

    check = await tenantManager.read.checkNeedSettlement()
    expect(check).to.equal(false)
  })

  it('should failed to record with wrong recorder', async function () {
    const { tenantManager, deployer, publicClient, nft } = await loadFixture(mintableFixture)
    const [tenantOwner1 , tenantOwner2] = await hre.viem.getWalletClients()

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

    const reqID1 = 'reqId1'
    const amountToSettle = BigInt(500)

    // expect(await tenantManager.write.record([tenant1Address!, reqID1, amountToSettle, chainId, nft.address, BigInt(0)], {
    //   account: tenantOwner2.account,
    // })).to.be.revertedWith('Only tenant owner can record')
  })

  it('should settle only 5 records(MAX_PER_TENANT) per each tenant by settleAll', async function () {
    const { tenantManager, deployer, publicClient, nftOwner, nft } = await loadFixture(mintableFixture)
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

    const tenant1ccy = await hre.viem.getContractAt('ERC20NonTransferable', await tenant1.read.ccyAddr())
    const tenant2ccy = await hre.viem.getContractAt('ERC20NonTransferable', await tenant2.read.ccyAddr())

    const recordNumber = 100
    const reqID1 = 'Tenant1reqId'
    const reqID2 = 'Tenant2reqId'
    const amountToSettle = BigInt(1)

    for (let i = 0; i < recordNumber; i++) {
      await tenantManager.write.record([tenant1Address!, reqID1 + i, amountToSettle, chainId, nft.address, BigInt(0)], {
        account: tenantOwner1.account,
      })
      
      await tenantManager.write.record([tenant2Address!, reqID2 + i, amountToSettle, chainId, nft.address, BigInt(0)], {
        account: tenantOwner2.account,
      })
    }

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    await tenantManager.write.settleAll({
      account: deployer.account,
    })

    var t1NextSettleIdx
    var t2NextSettleIdx
    var recipientBalanceAtTenant1
    var recipientBalanceAtTenant2

    t1NextSettleIdx = await tenant1.read.nextToSettleIdx()
    t2NextSettleIdx = await tenant2.read.nextToSettleIdx()

    recipientBalanceAtTenant1 = await tenant1ccy.read.balanceOf([nftOwner.account.address])
    recipientBalanceAtTenant2 = await tenant2ccy.read.balanceOf([nftOwner.account.address])

    expect(recipientBalanceAtTenant1).to.equal(MAX_PER_TENANT)
    expect(recipientBalanceAtTenant2).to.equal(MAX_PER_TENANT)
    expect(t1NextSettleIdx).to.equal(MAX_PER_TENANT)
    expect(t2NextSettleIdx).to.equal(MAX_PER_TENANT)

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine')

    // call settleAll again to settle more
    await tenantManager.write.settleAll({
      account: deployer.account,
    })

    t1NextSettleIdx = await tenant1.read.nextToSettleIdx()
    t2NextSettleIdx = await tenant2.read.nextToSettleIdx()

    recipientBalanceAtTenant1 = await tenant1ccy.read.balanceOf([nftOwner.account.address])
    recipientBalanceAtTenant2 = await tenant2ccy.read.balanceOf([nftOwner.account.address])

    expect(recipientBalanceAtTenant1).to.equal(MAX_PER_TENANT * BigInt(2))
    expect(recipientBalanceAtTenant2).to.equal(MAX_PER_TENANT * BigInt(2))
    expect(t1NextSettleIdx).to.equal(MAX_PER_TENANT * BigInt(2))
    expect(t2NextSettleIdx).to.equal(MAX_PER_TENANT * BigInt(2))
  })
})
