import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress } from 'viem'

describe('TenantFactory', function () {
  const tenantName = 'SampleTenant'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameERC20 = 'Tenant ERC20'
  const tenantNameSBT = 'Tenant SBT'
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds

  async function deployTenantFactoryFixture() {
    const [deployer, tenantOwner, erc20Owner, nftOwner, newNftOwner] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    const tenantFactory = await hre.viem.deployContract('TenantFactory', [], {
      client: { wallet: deployer },
    })

    // Deploy ERC20 and SBT contracts from tenantOwner, assuming tenantOwner pre-deployed these contracts
    const erc20 = await hre.viem.deployContract('BasicERC20', [tenantOwner.account.address, 'Test ERC20', 'TST'], {
      client: { wallet: tenantOwner },
    })
    const sbt = await hre.viem.deployContract(
      'ERC20NonTransferable',
      [tenantOwner.account.address, 'Test SBT', 'SBT'],
      { client: { wallet: tenantOwner } }
    )

    // Deploy NFT contract and mint nft to nftOwner
    const nft = await hre.viem.deployContract('BasicERC721', [nftOwner.account.address], {
      client: { wallet: nftOwner },
    })
    await nft.write.safeMint([nftOwner.account.address], {
      account: nftOwner.account,
    })

    expect(await nft.read.balanceOf([nftOwner.account.address])).to.equal(BigInt(1))
    expect(await nft.read.ownerOf([BigInt(0)])).to.equal(getAddress(nftOwner.account.address))

    return {
      deployer,
      tenantFactory,
      tenantOwner,
      nftOwner,
      newNftOwner,
      publicClient,
      erc20,
      sbt,
      nft,
      erc20Owner,
    }
  }

  it('should deploy the TenantFactory contract as a deployer', async function () {
    const { tenantFactory, deployer } = await loadFixture(deployTenantFactoryFixture)

    expect(await tenantFactory.read.owner()).to.equal(getAddress(deployer.account.address))
  })

  it('should create a Tenant contract with correct parameters and emit event', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture)

    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })

    expect(await logs.find((log) => log.eventName === 'TenantCreated')).to.not.be.undefined
    expect(await logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantName).to.equal(tenantName)
  })

  it('should deploy three Tenants with different currency types, without pre-deployed token contracts', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture)

    // Tenant with ETH currency
    const ethTx = await tenantFactory.write.createTenant([tenantNameEth, 0, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })
    const ethReceipt = await publicClient.waitForTransactionReceipt({
      hash: ethTx,
    })
    const ethLogs = parseEventLogs({
      logs: ethReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const ethTenantAddress = ethLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Tenant with ERC20 currency, with default ERC20 contract
    const erc20Tx = await tenantFactory.write.createTenant([tenantNameERC20, 1, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })
    const erc20Receipt = await publicClient.waitForTransactionReceipt({
      hash: erc20Tx,
    })
    const erc20Logs = parseEventLogs({
      logs: erc20Receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const erc20TenantAddress = erc20Logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Tenant with SBT currency, with new default contract
    const sbtTx = await tenantFactory.write.createTenant([tenantNameSBT, 2, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })
    const sbtReceipt = await publicClient.waitForTransactionReceipt({
      hash: sbtTx,
    })
    const sbtLogs = parseEventLogs({
      logs: sbtReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const sbtTenantAddress = sbtLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    expect(ethTenantAddress).to.be.not.undefined
    expect(erc20TenantAddress).to.be.not.undefined
    expect(sbtTenantAddress).to.be.not.undefined

    //TODO: add some tenant function check after creation?
  })

  it('should verify compatibility with reused ERC20 and SBT contracts', async function () {
    const { tenantFactory, tenantOwner, publicClient, erc20 } = await loadFixture(deployTenantFactoryFixture)

    const tx = await tenantFactory.write.createTenant(['Reused ERC20 Tenant', 1, erc20.address, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const reusedTenantAddress = logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    expect(reusedTenantAddress).to.be.a('string')
  })

  it('should store the Tenant address in the tenants array and mapping', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryFixture)

    const payoutPeriod = 60 * 60 * 24 // 1 day in seconds
    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, BigInt(payoutPeriod)], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })

    const tenantAddress = (await logs.find((log) => log.eventName === 'TenantCreated'))?.args.tenantAddress

    const tenantAddresses = await tenantFactory.read.getTenantAddresses()
    const fromTenantMap = await tenantFactory.read.tenants([tenantName])

    expect(tenantAddresses).to.include(tenantAddress)
    expect(fromTenantMap).to.equal(tenantAddress)
  })

  it('settleAll should proceed even if one tenant fails', async function () {
    const { tenantFactory, deployer, publicClient, erc20, nftOwner, nft } =
      await loadFixture(deployTenantFactoryFixture)
    const [tenantOwner1, tenantOwner2] = await hre.viem.getWalletClients()

    const initialTreasuryBalance = BigInt(1000) // Sufficient for tenant1
    const insufficientBalance = BigInt(50) // Insufficient for tenant2

    // Deploy two tenants: one with enough balance, one without
    const tx1 = await tenantFactory.write.createTenant(['Tenant1', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner1.account,
    })
    const receipt1 = await publicClient.waitForTransactionReceipt({
      hash: tx1,
    })
    const tenant1Address = parseEventLogs({
      logs: receipt1.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantFactory.write.createTenant(['Tenant2', 1, defaultAddress, payoutPeriod], {
      account: tenantOwner2.account,
    })
    const receipt2 = await publicClient.waitForTransactionReceipt({
      hash: tx2,
    })
    const tenant2Address = parseEventLogs({
      logs: receipt2.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant1 = await hre.viem.getContractAt('Tenant', tenant1Address!)
    const tenant1Erc20Address = await tenant1.read.currencyAddress()

    const tenant2 = await hre.viem.getContractAt('Tenant', tenant2Address!)
    const tenant2Erc20Address = await tenant2.read.currencyAddress()

    const tenant1Erc20 = await hre.viem.getContractAt('BasicERC20', tenant1Erc20Address)
    const tenant2Erc20 = await hre.viem.getContractAt('BasicERC20', tenant2Erc20Address)

    await tenant1.write.mint([initialTreasuryBalance], {
      account: tenantOwner1.account,
    })
    await tenant2.write.mint([insufficientBalance], {
      account: tenantOwner2.account,
    })

    // Record UTXRs in each tenant
    const reqID1 = 'reqId1'
    const reqID2 = 'reqId2'
    const amountToSettle = BigInt(500) // Higher than tenant2's balance

    await tenant1.write.record([reqID1, amountToSettle, BigInt(1), nft.address, BigInt(0)], {
      account: tenantOwner1.account,
    })
    await tenant2.write.record([reqID2, amountToSettle, BigInt(1), nft.address, BigInt(0)], {
      account: tenantOwner2.account,
    })

    await hre.network.provider.send('evm_increaseTime', [Number(payoutPeriod)])
    await hre.network.provider.send('evm_mine', [])

    await tenantFactory.write.settleAll({ account: deployer.account })

    const tenant1BalanceAfter = await tenant1Erc20.read.balanceOf([tenant1Address!])
    const tenant2BalanceAfter = await tenant2Erc20.read.balanceOf([tenant2Address!])
    const recipientBalanceAtTenant1 = await tenant1Erc20.read.balanceOf([nftOwner.account.address])
    const recipientBalanceAtTenant2 = await tenant2Erc20.read.balanceOf([nftOwner.account.address])

    expect(tenant1BalanceAfter).to.equal(initialTreasuryBalance - amountToSettle) // tenant1 settles successfully
    expect(tenant2BalanceAfter).to.equal(insufficientBalance) // tenant2 fails to settle due to insufficient funds
    expect(recipientBalanceAtTenant1).to.equal(amountToSettle) // recipient balance reflects only tenant1's successful settlement
    expect(recipientBalanceAtTenant2).to.equal(BigInt(0)) // recipient balance reflects only tenant1's successful settlement
  })
})
