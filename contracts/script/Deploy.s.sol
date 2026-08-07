// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "v4-periphery/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {VladFeeSplit, IUERC20BeneficiaryVault, IPoolsFeeSplitter, IPosm} from "../src/VladFeeSplit.sol";
import {VladStrategy, IVladFeeSplit, IUERC20BeneficiaryVault as IVaultForStrategy} from "../src/VladStrategy.sol";
import {VladLaunchRouter, ILiquidityLauncher} from "../src/VladLaunchRouter.sol";

/// Deploys the three VladLaunch contracts to Robinhood Chain.
///
///   export TREASURY=0x...            # where the protocol's 25% goes; immutable after this
///   forge script contracts/script/Deploy.s.sol:Deploy \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com \
///     --broadcast --legacy --gas-estimate-multiplier 300 \
///     --interactive            # prompts for the key; nothing is written to disk
///
/// `--interactive` on purpose. A key in an env var ends up in shell history, in a
/// process list, and eventually in a screenshot.
///
/// RHC needs --legacy and a fat gas multiplier or the deploy runs out of gas.
contract Deploy is Script {
    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x58daec3116aae6D93017bAAea7749052E8a04fA7;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant BENEFICIARY_VAULT = 0x587D2fDDDF14F6f84022b51e8c3a473eB88C4544;
    address constant POOLS_FEE_SPLITTER = 0x7198C32a497c09497e04C86cf8F77A244A9E4b8F;
    address constant LAUNCHER = 0x00004c4ccc709Ef590F7C81102C0689F0263D4e9;

    function run() external {
        address treasury = vm.envAddress("TREASURY");

        vm.startBroadcast();
        address deployer = msg.sender;

        // The splitter and the strategy reference each other, so the strategy's address
        // is computed from the next nonce and checked after the fact rather than trusted.
        address predictedStrategy = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);

        VladFeeSplit feeSplit = new VladFeeSplit(
            IUERC20BeneficiaryVault(BENEFICIARY_VAULT),
            IPoolsFeeSplitter(POOLS_FEE_SPLITTER),
            IPosm(POSITION_MANAGER),
            predictedStrategy,
            treasury
        );

        VladStrategy strategy = new VladStrategy(
            IPoolManager(POOL_MANAGER),
            IPositionManager(POSITION_MANAGER),
            IAllowanceTransfer(PERMIT2),
            IVaultForStrategy(BENEFICIARY_VAULT),
            POOLS_FEE_SPLITTER,
            IVladFeeSplit(address(feeSplit))
        );

        require(address(strategy) == predictedStrategy, "nonce moved: redeploy, do not patch");

        VladLaunchRouter router =
            new VladLaunchRouter(ILiquidityLauncher(LAUNCHER), IPoolManager(POOL_MANAGER));

        vm.stopBroadcast();

        console.log("VladFeeSplit      ", address(feeSplit));
        console.log("VladStrategy      ", address(strategy));
        console.log("VladLaunchRouter  ", address(router));
        console.log("treasury          ", treasury);
        console.log("");
        console.log("Put the strategy in web/.env.local as NEXT_PUBLIC_STRATEGY.");
        console.log("This strategy address IS the launchpad registry. Never change it.");
    }
}
