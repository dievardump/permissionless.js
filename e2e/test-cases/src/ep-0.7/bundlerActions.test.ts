import {
    type BundlerClient,
    ENTRYPOINT_ADDRESS_V07,
    type UserOperation,
    WaitForUserOperationReceiptTimeoutError,
    getUserOperationHash
} from "permissionless"
import type { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/types"
import {
    type Account,
    type Chain,
    type Transport,
    type WalletClient,
    isHash
} from "viem"
import { foundry } from "viem/chains"
import {
    fund,
    getAnvilWalletClient,
    getBundlerClient,
    getPimlicoPaymasterClient,
    setupSmartAccount
} from "../utils"

describe("v0.7 Bundler Actions", () => {
    let bundlerClient: BundlerClient<ENTRYPOINT_ADDRESS_V07_TYPE, Chain>
    let walletClient: WalletClient<Transport, Chain, Account>

    beforeEach(async () => {
        walletClient = getAnvilWalletClient()
        bundlerClient = getBundlerClient(ENTRYPOINT_ADDRESS_V07)
    })

    test("supports eth_supportedEntryPoints", async () => {
        const supportedEntryPoints = await bundlerClient.supportedEntryPoints()

        expect(Array.isArray(supportedEntryPoints)).toBe(true)
        expect(supportedEntryPoints.length).toBeGreaterThan(0)
        expect(supportedEntryPoints.includes(ENTRYPOINT_ADDRESS_V07)).toBe(true)
    })

    test("supports eth_chainId", async () => {
        const chainId = await bundlerClient.chainId()

        expect(chainId).toBe(Number)
        expect(chainId).toBeGreaterThan(0)
        expect(chainId === foundry.id).toBe(true)
    })

    test("supports eth_estimateUserOperationGas", async () => {
        const smartAccountClient = await setupSmartAccount(
            ENTRYPOINT_ADDRESS_V07,
            getPimlicoPaymasterClient(ENTRYPOINT_ADDRESS_V07)
        )

        const userOperation =
            (await smartAccountClient.prepareUserOperationRequest({
                userOperation: {
                    callData: await smartAccountClient.account.encodeCallData({
                        to: "0x5af0d9827e0c53e4799bb226655a1de152a425a5",
                        data: "0x",
                        value: 0n
                    })
                }
            })) as UserOperation<"v0.7">

        const {
            preVerificationGas,
            verificationGasLimit,
            callGasLimit,
            paymasterVerificationGasLimit,
            paymasterPostOpGasLimit
        } = await bundlerClient.estimateUserOperationGas({
            userOperation
        })

        expect(preVerificationGas).toBeTruthy()
        expect(verificationGasLimit).toBeTruthy()
        expect(callGasLimit).toBeTruthy()
        expect(paymasterVerificationGasLimit).toBeTruthy()
        expect(paymasterPostOpGasLimit).toBeTruthy()
    }, 100000)

    test("supports eth_sendUserOperation", async () => {
        const smartAccountClient = await setupSmartAccount(
            ENTRYPOINT_ADDRESS_V07
        )

        fund(smartAccountClient.account.address, walletClient)

        const op = await smartAccountClient.prepareUserOperationRequest({
            userOperation: {
                callData: await smartAccountClient.account.encodeCallData({
                    to: "0x5af0d9827e0c53e4799bb226655a1de152a425a5",
                    data: "0x",
                    value: 0n
                })
            }
        })

        op.signature = await smartAccountClient.account.signUserOperation(op)

        const opHash = await bundlerClient.sendUserOperation({
            userOperation: op
        })

        expect(isHash(opHash)).toBe(true)

        const userOperationReceipt =
            await bundlerClient.waitForUserOperationReceipt({
                hash: opHash
            })

        expect(userOperationReceipt).not.toBeNull()
        expect(userOperationReceipt?.userOpHash).toBe(opHash)
        expect(userOperationReceipt?.receipt.transactionHash).toBeTruthy()

        const receipt = await bundlerClient.getUserOperationReceipt({
            hash: opHash
        })

        expect(receipt?.receipt.transactionHash).toBe(
            userOperationReceipt?.receipt.transactionHash
        )

        const userOperationFromUserOpHash =
            await bundlerClient.getUserOperationByHash({ hash: opHash })

        expect(userOperationFromUserOpHash).not.toBeNull()
        expect(userOperationFromUserOpHash?.entryPoint).toBe(
            ENTRYPOINT_ADDRESS_V07
        )
        expect(userOperationFromUserOpHash?.transactionHash).toBe(
            userOperationReceipt?.receipt.transactionHash
        )

        for (const key in userOperationFromUserOpHash?.userOperation) {
            expect(userOperationFromUserOpHash?.userOperation[key]).toBe(
                op[key]
            )
        }
    }, 100000)

    test("should handle eth_sendUserOperation failures", async () => {
        const smartAccountClient = await setupSmartAccount(
            ENTRYPOINT_ADDRESS_V07
        )

        const userOperation =
            await smartAccountClient.prepareUserOperationRequest({
                userOperation: {
                    callData: await smartAccountClient.account.encodeCallData({
                        to: "0x5af0d9827e0c53e4799bb226655a1de152a425a5",
                        data: "0x",
                        value: 0n
                    })
                }
            })

        const gasParameters = await bundlerClient.estimateUserOperationGas({
            userOperation
        })

        userOperation.callGasLimit = gasParameters.callGasLimit
        userOperation.verificationGasLimit = gasParameters.verificationGasLimit
        userOperation.preVerificationGas = gasParameters.preVerificationGas

        const userOpHash = getUserOperationHash({
            userOperation,
            entryPoint: ENTRYPOINT_ADDRESS_V07,
            chainId: foundry.id
        })

        await expect(
            bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
                timeout: 100
            })
        ).rejects.toThrow(WaitForUserOperationReceiptTimeoutError)
    })
})
