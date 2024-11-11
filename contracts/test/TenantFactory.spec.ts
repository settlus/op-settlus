import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { parseEventLogs, getAddress, keccak256, encodePacked } from 'viem'

describe('TenantFactory Test', function () {
  const tenantName = 'SampleTenant'
  const tenantNameEth = 'Tenant ETH'
  const tenantNameMintable = 'Tenant Mintable'
  const MintableName = 'Mintable'
  const MintableSymbol = 'MTB'
  const defaultAddress = '0x0000000000000000000000000000000000000000'
  const payoutPeriod = BigInt(60 * 60 * 24) // 1 day in seconds

  async function deployTenantFactoryProxyFixture() {
    const [deployer, tenantOwner, erc20Owner, nftOwner, newNftOwner] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    const tenantFactoryImplementation = await hre.viem.deployContract('TenantFactory', [], {
      client: { wallet: deployer },
    })

    const tenantFactoryProxy = await hre.viem.deployContract(
      'TenantFactoryProxy',
      [tenantFactoryImplementation.address, deployer.account.address, '0x'],
      {
        client: { wallet: deployer },
      }
    )

    // Interact with the TenantFactory through the proxy
    const tenantFactory = await hre.viem.getContractAt('TenantFactory', tenantFactoryProxy.address)
    await tenantFactory.write.initialize([deployer.account.address], { account: deployer.account })

    // Deploy ERC20 and Mintable contracts
    const erc20 = await hre.viem.deployContract('BasicERC20', [tenantOwner.account.address, 'Test ERC20', 'TST'], {
      client: { wallet: tenantOwner },
    })
    const mintable = await hre.viem.deployContract(
      'ERC20NonTransferable',
      [tenantOwner.account.address, 'Test Mintable', 'Mintable'],
      { client: { wallet: tenantOwner } }
    )

    // Deploy NFT contract and mint to nftOwner
    const nft = await hre.viem.deployContract('BasicERC721', [nftOwner.account.address], {
      client: { wallet: nftOwner },
    })
    await nft.write.safeMint([nftOwner.account.address], { account: nftOwner.account })

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

  it('should initialize and set the owner through proxy', async function () {
    const { tenantFactory, deployer } = await loadFixture(deployTenantFactoryProxyFixture)
    const owner = await tenantFactory.read.owner()
    expect(owner).to.equal(getAddress(deployer.account.address))
  })

  it('should create a Tenant contract with correct parameters and emit event via proxy', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryProxyFixture)

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

  it('should deploy three Tenants with different currency types, without pre-deployed token contracts via proxy', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryProxyFixture)

    // Tenant with ETH currency
    const ethTx = await tenantFactory.write.createTenant([tenantNameEth, 0, defaultAddress, payoutPeriod], {
      account: tenantOwner.account,
    })
    const ethReceipt = await publicClient.waitForTransactionReceipt({ hash: ethTx })
    const ethLogs = parseEventLogs({
      logs: ethReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const ethTenantAddress = ethLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    // Tenant with mintable currency
    const mintableTx = await tenantFactory.write.createTenantWithMintableContract(
      [tenantNameMintable, 2, payoutPeriod, MintableName, MintableSymbol],
      {
        account: tenantOwner.account,
      }
    )
    const mintableReceipt = await publicClient.waitForTransactionReceipt({ hash: mintableTx })
    const mintableLogs = parseEventLogs({
      logs: mintableReceipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    })
    const mintableTenantAddress = mintableLogs.find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    expect(ethTenantAddress).to.be.not.undefined
    expect(mintableTenantAddress).to.be.not.undefined
  })

  it('should store and retrieve tenant addresses via proxy', async function () {
    const { tenantFactory, tenantOwner, publicClient } = await loadFixture(deployTenantFactoryProxyFixture)

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

  it('should handle settleAll with partial success via proxy', async function () {
    const { tenantFactory, tenantOwner, deployer, publicClient, nftOwner, nft } = await loadFixture(
      deployTenantFactoryProxyFixture
    )
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

    const tx1 = await tenantFactory.write.createTenant(['Tenant1', 1, tenant1Erc20.address, payoutPeriod], {
      account: tenantOwner1.account,
    })
    const tenant1Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx1 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tx2 = await tenantFactory.write.createTenant(['Tenant2', 1, tenant2Erc20.address, payoutPeriod], {
      account: tenantOwner2.account,
    })
    const tenant2Address = parseEventLogs({
      logs: (await publicClient.waitForTransactionReceipt({ hash: tx2 })).logs,
      abi: hre.artifacts.readArtifactSync('TenantFactory').abi,
    }).find((log) => log.eventName === 'TenantCreated')?.args.tenantAddress

    const tenant1 = await hre.viem.getContractAt('Tenant', tenant1Address!)
    const tenant2 = await hre.viem.getContractAt('Tenant', tenant2Address!)

    await tenant1Erc20.write.mint([tenant1.address, initialTreasuryBalance], { account: tenantOwner.account })
    await tenant2Erc20.write.mint([tenant2.address, insufficientBalance], { account: tenantOwner.account })

    await tenantFactory.write.settleAll({ account: deployer.account })
    // Check post-settlement balances to confirm only tenant1 succeeded
  })
})
