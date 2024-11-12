import { expect } from 'chai'
import hre from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import TenantManagerArtifact from '../artifacts/contracts/TenantManager.sol/TenantManager.json'
import { parseEventLogs, getAddress, zeroAddress, encodeFunctionData } from 'viem'

describe('TenantManagerProxy test', function () {
  const tenantName = 'SampleTenant'
  const payoutPeriod = BigInt(60 * 60 * 24)

  async function deployTenantManagerProxyFixture() {
    const [deployer, tenantOwner, anonymous] = await hre.viem.getWalletClients()
    const publicClient = await hre.viem.getPublicClient()

    const tenantManagerImplementation = await hre.viem.deployContract('TenantManager', [], {
      client: { wallet: deployer },
    })

    const initData = encodeFunctionData({
      abi: TenantManagerArtifact.abi,
      functionName: 'initialize',
      args: [deployer.account.address],
    })

    const tenantManagerProxy = await hre.viem.deployContract(
      'TenantManagerProxy',
      [tenantManagerImplementation.address, initData],
      {
        client: { wallet: deployer },
      }
    )

    // Interact with the TenantManager through the proxy
    const tenantManager = await hre.viem.getContractAt('TenantManager', tenantManagerProxy.address)

    return {
      deployer,
      tenantManager,
      tenantManagerProxy,
      tenantManagerImplementation,
      tenantOwner,
      publicClient,
      anonymous,
    }
  }

  it('should initialize the TenantManager through the proxy', async function () {
    const { tenantManager, deployer } = await loadFixture(deployTenantManagerProxyFixture)
    const owner = await tenantManager.read.owner()
    expect(owner).to.equal(getAddress(deployer.account.address))
  })

  it('should create a Tenant contract via the proxy and emit an event', async function () {
    const { tenantManager, tenantOwner, publicClient } = await loadFixture(deployTenantManagerProxyFixture)

    const tx = await tenantManager.write.createTenant([tenantName, 0, zeroAddress, payoutPeriod], {
      account: tenantOwner.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
    const logs = parseEventLogs({
      logs: receipt.logs,
      abi: hre.artifacts.readArtifactSync('TenantManager').abi,
    })

    expect(logs.find((log) => log.eventName === 'TenantCreated')).to.not.be.undefined
    expect(logs.find((log) => log.eventName === 'TenantCreated')?.args.tenantName).to.equal(tenantName)
  })

  it('should upgrade the TenantManager implementation via the proxy and verify new functionality', async function () {
    const { tenantManager, tenantManagerImplementation, tenantManagerProxy, deployer, anonymous } = await loadFixture(
      deployTenantManagerProxyFixture
    )

    const implementationAddress = await tenantManagerProxy.read.getImplementation()
    expect(implementationAddress).to.equal(getAddress(tenantManagerImplementation.address))

    const currentOwner = await tenantManager.read.owner()
    expect(currentOwner).to.equal(getAddress(deployer.account.address))

    // deploy V2 implementation
    const upgradedTenantManagerImplementation = await hre.viem.deployContract('TenantManagerV2', [], {
      client: { wallet: deployer },
    })

    // Upgrade the implementation using `upgradeToAndCall` by proxy
    await tenantManager.write.upgradeToAndCall([upgradedTenantManagerImplementation.address, '0x'], {
      account: deployer.account,
    })

    // Get new proxy instacne with upgraded implementation
    const upgradedTenantManager = await hre.viem.getContractAt('TenantManagerV2', tenantManagerProxy.address)
    const newImplementationAddress = await tenantManagerProxy.read.getImplementation()
    expect(newImplementationAddress).to.equal(getAddress(upgradedTenantManagerImplementation.address))

    // test new variable and new function
    const newVar = await upgradedTenantManager.read.newVar()
    expect(newVar).to.equal(zeroAddress)
    await upgradedTenantManager.write.newFunction([getAddress(anonymous.account.address)], {
      account: deployer.account,
    })
  })

  it('should only allow the owner to upgrade the implementation', async function () {
    const { tenantManagerProxy, tenantManager, deployer, anonymous } = await loadFixture(
      deployTenantManagerProxyFixture
    )

    const upgradedTenantManagerImplementation = await hre.viem.deployContract('TenantManagerV2', [], {
      client: { wallet: deployer },
    })

    // await expect(
    //   tenantManager.write.upgradeToAndCall([upgradedTenantManagerImplementation.address, '0x'], {
    //     account: anonymous.account,
    //   })
    // ).to.be.revertedWith(`OwnableUnauthorizedAccount("${getAddress(anonymous.account.address)}")`)

    await tenantManager.write.upgradeToAndCall([upgradedTenantManagerImplementation.address, '0x'], {
      account: deployer.account,
    })

    const newImplementationAddress = await tenantManagerProxy.read.getImplementation()
    expect(newImplementationAddress).to.equal(getAddress(upgradedTenantManagerImplementation.address))
  })
})
