import { expect } from 'chai'
import hre from 'hardhat'
import TenantManagerArtifact from '../artifacts/contracts/TenantManager.sol/TenantManager.json'
import {
  getAddress,
  encodeFunctionData,
} from 'viem'

export function mintableFixture() {
  return deployTenantManagerProxyFixture({ isMintable: true })
}

export function nonMintableFixture() {
  return deployTenantManagerProxyFixture({ isMintable: false })
}

async function deployTenantManagerProxyFixture({ isMintable }: { isMintable: boolean }) {
  const [deployer, tenantOwner, erc20Owner, nftOwner, newNftOwner] = await hre.viem.getWalletClients()
  const publicClient = await hre.viem.getPublicClient()

  const tenantManagerImplementation = await hre.viem.deployContract('TenantManager', [], {
    client: { wallet: deployer },
  })

  const initData = encodeFunctionData({
    abi: TenantManagerArtifact.abi,
    functionName: 'initialize',
    args: [deployer.account.address], // owner address
  })

  const tenantManagerProxy = await hre.viem.deployContract(
    'TenantManagerProxy',
    [tenantManagerImplementation.address, initData],
    {
      client: { wallet: deployer },
    }
  )

  // use proxy to interact with TenantManager
  const tenantManager = await hre.viem.getContractAt('TenantManager', tenantManagerProxy.address)

  // Deploy ERC20 and Mintable contracts
  const erc20 = await hre.viem.deployContract('BasicERC20', [tenantOwner.account.address, 'Test ERC20', 'TST'], {
    client: { wallet: tenantOwner },
  })
  const mintable = await hre.viem.deployContract(
    'ERC20NonTransferable',
    [
      tenantOwner.account.address,
      isMintable ? 'Test Mintable' : 'Test SBT',
      isMintable ? 'Mintable' : 'SBT'
    ],
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
    tenantManager,
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
