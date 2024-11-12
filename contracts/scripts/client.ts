import '../env'
import { createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const pvKey = (process.env.PRIVATE_KEY! as `0x${string}`) || `0x`

export const settlusChain = defineChain({
  id: 42069,
  name: 'settlus',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['http://3.38.207.140:8545'],
    },
  },
})

export const walletClient = createWalletClient({
  chain: settlusChain,
  transport: http(),
})

export const deployer = privateKeyToAccount(pvKey)
