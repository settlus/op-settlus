/*
Copyright © 2024 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "op-settler",
	Short: "settler for op-settlus",
	Long:  `op-settler is calling settleAll() function in TenantFactory contract after new block is produced`,
	Run:   func(cmd *cobra.Command, args []string) {},
}

func Execute() error {
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}

	return nil
}
