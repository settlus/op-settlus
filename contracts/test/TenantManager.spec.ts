import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, keccak256, encodePacked } from 'viem'
import {mintableFixture} from "./utils";

describe('TenantManager Test', function () {
  const tenantName = 'SampleTenant'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameMintable = 'Tenant Mintable'
  const MintableName = 'Mintable'
  const MintableSymbol = 'MTB'
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds

  it('should create a Tenant contract with correct parameters and emit event via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    expect(await logs.find((log) => log.eventName === 'TenantCreated')).to.not.be.undefined
    expect(await logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantName).to.equal(tenantName)
  })

  it('should deploy three Tenants with different currency types, without pre-deployed token contracts via proxy', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(mintableFixture)

    // Tenant with ETH currency
    const ethTx = await tenantManager.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
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

  it('should handle settleAll with partial success via proxy', async function () {
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
    })
    const tenant1Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx1 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantManager.write.createTenant(['Tenant2', 1, tenant2Erc20.address, payoutPeriod], {
      account: tenantOwner2.account,
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

    await tenant1.write.record([reqID1, amountToSettle, BigInt(1), nft.address, BigInt(0)], {
      account: tenantOwner1.account,
    })

    await tenant2.write.record([reqID2, amountToSettle, BigInt(1), nft.address, BigInt(0)], {
      account: tenantOwner2.account,
    })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])

    // Call settleAll to settle balances across tenants, no error or revert expeceted
    await tenantManager.write.settleAll({ account: deployer.account })

    const tenant1BalanceAfter = await tenant1Erc20.read.balanceOf([tenant1Address!])
    const tenant2BalanceAfter = await tenant2Erc20.read.balanceOf([tenant2Address!])
    const recipientBalanceAtTenant1 = await tenant1Erc20.read.balanceOf([nftOwner.account.address])
    const recipientBalanceAtTenant2 = await tenant2Erc20.read.balanceOf([nftOwner.account.address])

    expect(tenant1BalanceAfter).to.equal(initialTreasuryBalance - amountToSettle)
    expect(tenant2BalanceAfter).to.equal(insufficientBalance)
    expect(recipientBalanceAtTenant1).to.equal(amountToSettle)
    expect(recipientBalanceAtTenant2).to.equal(BigInt(0))
  })
})
