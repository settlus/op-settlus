import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, keccak256, encodePacked } from 'viem'

describe('TenantFactory', function () {
  const tenantName = 'SampleTenant'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameMintable = 'Tenant Mintable'
  const MintableName = 'Mintable'
  const MintableSymbol = 'MTB'
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
    const mintable = await hre.viem.deployContract(
      'ERC20NonTransferable',
      [tenantOwner.account.address, 'Test Mintable', 'Mintable'],
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
      mintable,
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

    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
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
    const ethTx = await tenantFactory.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
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

    // Tenant with mintable currency, with new default contract
    const mintableTx = await tenantFactory.write.createTenantWithMintableContract(
      [tenantNameMintable, 2, payoutPeriod, MintableName, MintableSymbol],
      {
        account: tenantOwner.account,
      }
    )
    const mintableReceipt = await publicClient.waitForTransactionReceipt({
      hash: mintableTx,
    })
    const mintableLogs = parseEventLogs({
      logs: mintableReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const mintableTenantAddress = mintableLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    expect(ethTenantAddress).to.be.not.undefined
    expect(mintableTenantAddress).to.be.not.undefined

    //TODO: add some tenant function check after creation?
  })

  it('should verify compatibility with reused ERC20 and Mintable contracts', async function () {
    const { tenantFactory, tenantOwner, publicClient, erc20 } = await loadFixture(deployTenantFactoryFixture)

    const tx = await tenantFactory.write.createTenant(['Reused ERC20 Tenant', 1, erc20.address, payoutPeriod], {
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

    const tx = await tenantFactory.write.createTenant([tenantName, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })

    const tenantAddress = (await logs.find((log) => log.eventName === 'TenantCreated'))?.args.tenantAddress

    const tenantAddresses = await tenantFactory.read.getTenantAddresses()
    const nameHash = keccak256(encodePacked(['string'], [tenantName]))
    const fromTenantMap = await tenantFactory.read.tenants([nameHash])

    expect(tenantAddresses).to.include(tenantAddress)
    expect(fromTenantMap).to.equal(tenantAddress)
  })

  it('settleAll should proceed even if one tenant fails', async function () {
    const { tenantFactory, tenantOwner, deployer, publicClient, nftOwner, nft } =
      await loadFixture(deployTenantFactoryFixture)
    const [tenantOwner1, tenantOwner2] = await hre.viem.getWalletClients()

    const initialTreasuryBalance = BigInt(1000)
    const insufficientBalance = BigInt(50)

    const tenant1Erc20 = await hre.viem.deployContract(
      'BasicERC20',
      [tenantOwner.account.address, 'Test ERC20', 'TST'],
      {
        client: { wallet: tenantOwner1 },
      }
    )

    const tenant2Erc20 = await hre.viem.deployContract(
      'BasicERC20',
      [tenantOwner.account.address, 'Test ERC20', 'TST'],
      {
        client: { wallet: tenantOwner2 },
      }
    )

    // Deploy two tenants, ccy type as ERC20: one with enough balance, one without
    const tx1 = await tenantFactory.write.createTenant(['Tenant1', 1, tenant1Erc20.address, payoutPeriod], {
      account: tenantOwner1.account,
    })
    const receipt1 = await publicClient.waitForTransactionReceipt({
      hash: tx1,
    })
    const tenant1Address = parseEventLogs({
      logs: receipt1.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantFactory.write.createTenant(['Tenant2', 1, tenant2Erc20.address, payoutPeriod], {
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
    const tenant1CcyAddr = await tenant1.read.ccyAddr()
    expect(tenant1CcyAddr).to.equal(getAddress(tenant1Erc20.address))

    const tenant2 = await hre.viem.getContractAt('Tenant', tenant2Address!)
    const tenant2CcyAddr = await tenant2.read.ccyAddr()
    expect(tenant2CcyAddr).to.equal(getAddress(tenant2Erc20.address))

    await tenant1Erc20.write.mint([tenant1.address, initialTreasuryBalance], {
      account: tenantOwner.account,
    })
    await tenant2Erc20.write.mint([tenant2.address, insufficientBalance], {
      account: tenantOwner.account,
    })

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
    expect(recipientBalanceAtTenant1).to.equal(amountToSettle)
    expect(recipientBalanceAtTenant2).to.equal(BigInt(0)) // nothing is settled to recipient for tenant2
  })
})
